const { QueryError } = require('./parser');

// Compiles a parsed query into a parameterised SQL WHERE clause over this FROM:
//
//   tasks t JOIN projects p ON p.id = t.project_id
//   LEFT JOIN statuses st ON st.id = t.status_id
//   LEFT JOIN sprints sp ON sp.id = t.sprint_id
//   LEFT JOIN releases rl ON rl.id = t.release_id
//   LEFT JOIN tasks ep ON ep.id = t.epic_id
//   LEFT JOIN users rep ON rep.id = t.created_by
//
// Field names and operators come from the whitelist below; user values are only ever bound
// as named replacements, never concatenated into SQL.

const FROM_SQL = `
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
  LEFT JOIN statuses st ON st.id = t.status_id
  LEFT JOIN sprints sp ON sp.id = t.sprint_id
  LEFT JOIN releases rl ON rl.id = t.release_id
  LEFT JOIN tasks ep ON ep.id = t.epic_id
  LEFT JOIN users rep ON rep.id = t.created_by`;

const DONE_NAMES = ['done', 'closed', 'completed', 'resolved'];
const PRIORITY_RANK = { low: 1, medium: 2, high: 3, urgent: 4 };
const PRIORITY_CASE = "(CASE t.priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 END)";

const ALIASES = {
  summary: 'title', issuetype: 'type', fixversion: 'release', version: 'release', 'fix-version': 'release',
  assigned: 'assignee', creator: 'reporter', labels: 'label', storypoints: 'points', story_points: 'points',
  duedate: 'due', due_date: 'due', startdate: 'start', created_at: 'created', updated_at: 'updated',
  resolved: 'statuscategory', category: 'statuscategory', issue: 'key', id: 'key',
};

const FIELD_KINDS = {
  key: 'string', project: 'string', type: 'enum', status: 'string', statuscategory: 'enum', priority: 'priority',
  assignee: 'person', reporter: 'person', sprint: 'sprint', epic: 'string', release: 'string', label: 'label',
  severity: 'enum', points: 'number', progress: 'number', title: 'string', description: 'string',
  created: 'date', updated: 'date', due: 'date', start: 'date',
};

const SEVERITIES = ['critical', 'major', 'minor', 'trivial'];
const TYPES = ['task', 'bug', 'story', 'epic'];

const ORDER_SQL = {
  created: 't.created_at', updated: 't.updated_at', due: 't.due_date', start: 't.start_date',
  key: 't.task_number', title: 'lower(t.title)', priority: PRIORITY_CASE, status: 'lower(st.name)',
  points: 't.story_points', project: 'lower(p.name)', type: 't.issue_type', severity: 't.severity',
};

const canonical = (f) => ALIASES[f] || f;
const escapeLike = (s) => String(s).replace(/[\\%_]/g, (m) => `\\${m}`);

const compile = (ast, ctx) => {
  const replacements = {};
  let n = 0;
  const bind = (v) => { const k = `q${n++}`; replacements[k] = v; return `:${k}`; };

  const ident = (v) => String(v.value).toLowerCase();

  // Resolves a value node to a plain JS value
  const resolve = (v, kind, field) => {
    if (v.kind === 'func') {
      if (v.value === 'currentuser' || v.value === 'me') return { special: 'me' };
      if (v.value === 'now') return { date: new Date() };
      if (v.value === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); return { date: d }; }
      if (v.value === 'empty' || v.value === 'null') return { special: 'empty' };
      throw new QueryError(`Unknown function ${v.value}()`, v.pos);
    }
    if (v.kind === 'str' && v.bare && ['me', 'currentuser'].includes(v.value.toLowerCase())) return { special: 'me' };
    if (kind === 'date') return { date: parseDate(v) };
    if (kind === 'number') {
      const num = v.kind === 'num' ? v.value : Number(v.value);
      if (!Number.isFinite(num)) throw new QueryError(`"${v.value}" is not a number (field ${field})`, v.pos);
      return { num };
    }
    return { str: String(v.value) };
  };

  const parseDate = (v) => {
    const raw = String(v.value).trim().toLowerCase();
    if (raw === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
    if (raw === 'tomorrow') { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d; }
    if (raw === 'yesterday') { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 1); return d; }
    if (raw === 'now') return new Date();
    const rel = raw.match(/^([-+])(\d+)([hdwmy])$/);
    if (rel) {
      const amount = Number(rel[2]) * (rel[1] === '-' ? -1 : 1);
      const d = new Date();
      if (rel[3] === 'h') d.setHours(d.getHours() + amount);
      else if (rel[3] === 'd') d.setDate(d.getDate() + amount);
      else if (rel[3] === 'w') d.setDate(d.getDate() + amount * 7);
      else if (rel[3] === 'm') d.setMonth(d.getMonth() + amount);
      else d.setFullYear(d.getFullYear() + amount);
      return d;
    }
    const abs = new Date(v.value);
    if (Number.isNaN(abs.getTime())) throw new QueryError(`"${v.value}" is not a valid date (use 2026-10-31, -7d, today ...)`, v.pos);
    return abs;
  };

  const fieldOf = (node) => {
    const f = canonical(node.field);
    if (!FIELD_KINDS[f]) {
      throw new QueryError(`Unknown field "${node.field}". Try: ${Object.keys(FIELD_KINDS).join(', ')}`, node.pos);
    }
    return f;
  };

  const okOps = (kind) => {
    if (kind === 'string') return ['=', '!=', '~', '!~'];
    if (kind === 'enum' || kind === 'person' || kind === 'sprint' || kind === 'label') return ['=', '!='];
    return ['=', '!=', '>', '>=', '<', '<='];
  };

  // ---- SQL for "field = <single value>" (equality) per field kind ----------------------------
  const equalsSql = (f, val, node) => {
    switch (f) {
      case 'key': return `lower(t.task_key) = ${bind(String(val.str).toLowerCase())}`;
      case 'project': { const p = bind(String(val.str).toLowerCase()); return `(lower(p.key) = ${p} OR lower(p.name) = ${p})`; }
      case 'type': return `t.issue_type = ${bind(String(val.str).toLowerCase())}`;
      case 'status': return `lower(st.name) = ${bind(String(val.str).toLowerCase())}`;
      case 'statuscategory': {
        const v = String(val.str).toLowerCase();
        const inDone = `lower(COALESCE(st.name, '')) IN (${DONE_NAMES.map((d) => bind(d)).join(', ')})`;
        if (['done', 'resolved', 'closed', 'completed', 'true', 'yes'].includes(v)) return `(${inDone})`;
        if (['open', 'todo', 'unresolved', 'unfinished', 'false', 'no'].includes(v)) return `(NOT ${inDone})`;
        throw new QueryError('statuscategory must be done or open', node.pos);
      }
      case 'priority': {
        const r = PRIORITY_RANK[String(val.str).toLowerCase()];
        if (!r) throw new QueryError('priority must be one of: low, medium, high, urgent', node.pos);
        return `t.priority = ${bind(String(val.str).toLowerCase())}`;
      }
      case 'severity': {
        if (!SEVERITIES.includes(String(val.str).toLowerCase())) throw new QueryError(`severity must be one of: ${SEVERITIES.join(', ')}`, node.pos);
        return `t.severity = ${bind(String(val.str).toLowerCase())}`;
      }
      case 'assignee': case 'reporter': {
        const isAssignee = f === 'assignee';
        if (val.special === 'me') {
          return isAssignee
            ? `EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ${bind(ctx.userId)})`
            : `t.created_by = ${bind(ctx.userId)}`;
        }
        const v = bind(String(val.str).toLowerCase());
        const match = (alias) => `(lower(${alias}.email) = ${v} OR lower(${alias}.first_name || ' ' || ${alias}.last_name) = ${v} OR lower(${alias}.first_name) = ${v})`;
        return isAssignee
          ? `EXISTS (SELECT 1 FROM task_assignees ta JOIN users au ON au.id = ta.user_id WHERE ta.task_id = t.id AND ${match('au')})`
          : match('rep');
      }
      case 'sprint': {
        const v = String(val.str).toLowerCase();
        if (v === 'active' || v === 'current') return `sp.status = 'active'`;
        if (v === 'backlog' || v === 'none') return `t.sprint_id IS NULL`;
        if (v === 'planned' || v === 'future') return `sp.status = 'planned'`;
        if (v === 'completed' || v === 'closed') return `sp.status = 'completed'`;
        return `lower(sp.name) = ${bind(v)}`;
      }
      case 'epic': { const v = bind(String(val.str).toLowerCase()); return `(lower(ep.task_key) = ${v} OR lower(ep.title) = ${v})`; }
      case 'release': return `lower(rl.name) = ${bind(String(val.str).toLowerCase())}`;
      case 'label': {
        const v = bind(String(val.str).toLowerCase());
        return `EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(t.labels, '[]'::jsonb)) lb WHERE lower(CASE WHEN jsonb_typeof(lb) = 'string' THEN lb #>> '{}' ELSE lb->>'text' END) = ${v})`;
      }
      case 'title': return `lower(t.title) = ${bind(String(val.str).toLowerCase())}`;
      case 'description': return `lower(COALESCE(t.description, '')) = ${bind(String(val.str).toLowerCase())}`;
      default: throw new QueryError(`Operator not supported for ${f}`, node.pos);
    }
  };

  const containsSql = (f, val) => {
    const like = bind(`%${escapeLike(String(val.str).toLowerCase())}%`);
    switch (f) {
      case 'title': return `lower(t.title) LIKE ${like}`;
      case 'description': return `lower(COALESCE(t.description, '')) LIKE ${like}`;
      case 'key': return `lower(t.task_key) LIKE ${like}`;
      case 'project': return `(lower(p.name) LIKE ${like} OR lower(p.key) LIKE ${like})`;
      case 'status': return `lower(st.name) LIKE ${like}`;
      case 'epic': return `(lower(ep.title) LIKE ${like} OR lower(ep.task_key) LIKE ${like})`;
      case 'release': return `lower(rl.name) LIKE ${like}`;
      default: throw new QueryError(`"~" (contains) is not supported for ${f}`, 0);
    }
  };

  const numericSql = (col, op, num) => `${col} ${op} ${bind(num)}`;
  const dateSql = (col, op, date) => {
    if (op === '=') {
      const start = new Date(date); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(end.getDate() + 1);
      return `(${col} >= ${bind(start)} AND ${col} < ${bind(end)})`;
    }
    if (op === '!=') {
      const start = new Date(date); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(end.getDate() + 1);
      return `(${col} IS NULL OR ${col} < ${bind(start)} OR ${col} >= ${bind(end)})`;
    }
    return `${col} ${op} ${bind(date)}`;
  };

  const emptySql = (f, node) => {
    switch (f) {
      case 'assignee': return `NOT EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id)`;
      case 'sprint': return `t.sprint_id IS NULL`;
      case 'epic': return `t.epic_id IS NULL`;
      case 'release': return `t.release_id IS NULL`;
      case 'label': return `jsonb_array_length(COALESCE(t.labels, '[]'::jsonb)) = 0`;
      case 'status': return `t.status_id IS NULL`;
      case 'severity': return `t.severity IS NULL`;
      case 'points': return `t.story_points IS NULL`;
      case 'due': return `t.due_date IS NULL`;
      case 'start': return `t.start_date IS NULL`;
      case 'description': return `(t.description IS NULL OR t.description = '')`;
      default: throw new QueryError(`IS EMPTY is not supported for ${f}`, node.pos);
    }
  };

  const columnFor = (f) => ({ points: 't.story_points', progress: 't.progress', created: 't.created_at', updated: 't.updated_at', due: 't.due_date', start: 't.start_date' }[f]);

  const visit = (node) => {
    switch (node.type) {
      case 'and': return `(${visit(node.left)} AND ${visit(node.right)})`;
      case 'or': return `(${visit(node.left)} OR ${visit(node.right)})`;
      case 'not': return `(NOT ${visit(node.expr)})`;
      case 'text': {
        const like = bind(`%${escapeLike(String(node.value).toLowerCase())}%`);
        return `(lower(t.title) LIKE ${like} OR lower(COALESCE(t.description, '')) LIKE ${like} OR lower(COALESCE(t.task_key, '')) LIKE ${like})`;
      }
      case 'empty': {
        const f = fieldOf(node);
        const sql = emptySql(f, node);
        return node.negate ? `(NOT (${sql}))` : `(${sql})`;
      }
      case 'in': {
        const f = fieldOf(node);
        const kind = FIELD_KINDS[f];
        const parts = node.values.map((v) => {
          const val = resolve(v, kind, f);
          if (kind === 'date' || kind === 'number') throw new QueryError(`IN is not supported for ${f}`, node.pos);
          if (kind === 'priority') return equalsSql(f, val, node);
          return equalsSql(f, val, node);
        });
        const joined = `(${parts.join(' OR ')})`;
        return node.negate ? `(NOT ${joined})` : joined;
      }
      case 'cmp': {
        const f = fieldOf(node);
        const kind = FIELD_KINDS[f];
        const op = node.op;
        if (op === '~' || op === '!~') {
          if (kind !== 'string') throw new QueryError(`"${op}" (contains) is not supported for ${f}`, node.pos);
          const sql = containsSql(f, resolve(node.value, 'string', f));
          return op === '!~' ? `(NOT ${sql})` : `(${sql})`;
        }
        if (!okOps(kind).includes(op)) throw new QueryError(`Operator ${op} is not supported for ${f}`, node.pos);
        const val = resolve(node.value, kind, f);

        if (val.special === 'empty') {
          const sql = emptySql(f, node);
          return op === '!=' ? `(NOT (${sql}))` : `(${sql})`;
        }
        if (kind === 'date') return dateSql(columnFor(f), op, val.date);
        if (kind === 'number') return numericSql(columnFor(f), op === '!=' ? '<>' : op, val.num);
        if (kind === 'priority') {
          const r = PRIORITY_RANK[String(val.str).toLowerCase()];
          if (!r) throw new QueryError('priority must be one of: low, medium, high, urgent', node.pos);
          if (op === '=') return `t.priority = ${bind(String(val.str).toLowerCase())}`;
          if (op === '!=') return `t.priority <> ${bind(String(val.str).toLowerCase())}`;
          return `${PRIORITY_CASE} ${op} ${bind(r)}`;
        }
        if (kind === 'enum' && f === 'type' && !TYPES.includes(String(val.str).toLowerCase())) {
          throw new QueryError(`type must be one of: ${TYPES.join(', ')}`, node.pos);
        }
        const eq = equalsSql(f, val, node);
        return op === '!=' ? `(NOT COALESCE((${eq}), false))` : `(${eq})`;
      }
      default: throw new QueryError('Unsupported expression', 0);
    }
  };

  const whereSql = ast.where ? visit(ast.where) : 'TRUE';

  const orderParts = (ast.order || []).map((o) => {
    const col = ORDER_SQL[canonical(o.field)];
    if (!col) throw new QueryError(`Cannot order by "${o.field}". Try: ${Object.keys(ORDER_SQL).join(', ')}`, o.pos);
    return `${col} ${o.dir === 'desc' ? 'DESC' : 'ASC'} NULLS LAST`;
  });
  const orderSql = [...orderParts, 't.created_at DESC', 't.id ASC'].join(', ');

  return { whereSql, replacements, orderSql };
};

module.exports = { compile, FROM_SQL, FIELD_KINDS, ORDER_SQL };
