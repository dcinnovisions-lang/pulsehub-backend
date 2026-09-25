/**
 * Issue query language — parser + SQL compiler (pure functions, no database)
 */
const { parse, QueryError } = require('../utils/issueQuery/parser');
const { compile } = require('../utils/issueQuery/compiler');

const sql = (q, ctx = { userId: 'user-1' }) => compile(parse(q), ctx);

describe('parser', () => {
  it('parses simple comparisons joined by AND / OR with precedence', () => {
    const { where } = parse('type = bug AND status = open OR priority = high');
    expect(where.type).toBe('or');
    expect(where.left.type).toBe('and');
  });

  it('honours parentheses', () => {
    const { where } = parse('type = bug AND (status = open OR status = reopened)');
    expect(where.type).toBe('and');
    expect(where.right.type).toBe('or');
  });

  it('parses IN / NOT IN lists with quoted values', () => {
    const { where } = parse('status IN ("In Progress", Reopened)');
    expect(where).toMatchObject({ type: 'in', field: 'status', negate: false });
    expect(where.values.map((v) => v.value)).toEqual(['In Progress', 'Reopened']);
    expect(parse('type NOT IN (bug, epic)').where.negate).toBe(true);
  });

  it('parses IS EMPTY / IS NOT EMPTY', () => {
    expect(parse('assignee IS EMPTY').where).toMatchObject({ type: 'empty', negate: false });
    expect(parse('sprint is not empty').where).toMatchObject({ type: 'empty', negate: true });
  });

  it('parses ORDER BY with directions', () => {
    const { order } = parse('type = bug ORDER BY priority DESC, created');
    expect(order).toEqual([
      expect.objectContaining({ field: 'priority', dir: 'desc' }),
      expect.objectContaining({ field: 'created', dir: 'asc' }),
    ]);
  });

  it('treats a lone quoted string as free-text search', () => {
    expect(parse('"login page"').where).toMatchObject({ type: 'text', value: 'login page' });
  });

  it('allows an empty query', () => {
    expect(parse('').where).toBeNull();
    expect(parse('ORDER BY created DESC').where).toBeNull();
  });

  it('reports errors with a position', () => {
    expect(() => parse('type = ')).toThrow(QueryError);
    expect(() => parse('type = bug AND')).toThrow(QueryError);
    expect(() => parse('status IN (a, b')).toThrow(QueryError);
    expect(() => parse('"unterminated')).toThrow(/Unterminated/);
    try { parse('type = bug )'); } catch (e) { expect(e.position).toBe(11); }
  });
});

describe('compiler', () => {
  it('compiles equality on issue type and status (case-insensitive)', () => {
    const c = sql('type = Bug AND status = "In Progress"');
    expect(c.whereSql).toContain('t.issue_type =');
    expect(c.whereSql).toContain('lower(st.name) =');
    expect(Object.values(c.replacements)).toEqual(expect.arrayContaining(['bug', 'in progress']));
  });

  it('resolves assignee = me to the caller', () => {
    const c = sql('assignee = me', { userId: 'abc-123' });
    expect(c.whereSql).toContain('task_assignees');
    expect(Object.values(c.replacements)).toContain('abc-123');
    expect(sql('reporter = currentUser()', { userId: 'abc-123' }).whereSql).toContain('t.created_by =');
  });

  it('supports priority ordering comparisons', () => {
    const c = sql('priority >= high');
    expect(c.whereSql).toContain("CASE t.priority");
    expect(Object.values(c.replacements)).toContain(3);
  });

  it('supports relative dates and numeric comparisons', () => {
    const c = sql('created >= -7d AND points > 3');
    expect(c.whereSql).toContain('t.created_at >=');
    expect(c.whereSql).toContain('t.story_points >');
    const date = Object.values(c.replacements).find((v) => v instanceof Date);
    expect(date.getTime()).toBeLessThan(Date.now());
  });

  it('maps sprint keywords', () => {
    expect(sql('sprint = active').whereSql).toContain("sp.status = 'active'");
    expect(sql('sprint = backlog').whereSql).toContain('t.sprint_id IS NULL');
    expect(sql('sprint IS EMPTY').whereSql).toContain('t.sprint_id IS NULL');
  });

  it('supports contains and negated contains on text fields', () => {
    const c = sql('title ~ login AND description !~ "won\'t fix"');
    expect(c.whereSql).toContain('LIKE');
    expect(c.whereSql).toContain('NOT');
  });

  it('builds ORDER BY from whitelisted columns and always adds a stable tiebreaker', () => {
    const c = sql('type = bug ORDER BY priority DESC');
    expect(c.orderSql).toMatch(/CASE t\.priority/);
    expect(c.orderSql).toMatch(/t\.id ASC$/);
  });

  it('rejects unknown fields, bad operators and bad values', () => {
    expect(() => sql('banana = 1')).toThrow(/Unknown field/);
    expect(() => sql('type > bug')).toThrow(/not supported/);
    expect(() => sql('type = dragon')).toThrow(/type must be one of/);
    expect(() => sql('priority = enormous')).toThrow(/priority must be/);
    expect(() => sql('points = many')).toThrow(/not a number/);
    expect(() => sql('created >= yesterdayish')).toThrow(/valid date/);
    expect(() => sql('type = bug ORDER BY nonsense')).toThrow(/Cannot order by/);
  });

  it('never places user input in the SQL text (injection safe)', () => {
    const evil = "x'; DROP TABLE tasks; --";
    const c = sql(`title = "${evil}" AND assignee = "${evil}" AND status IN ("${evil}")`);
    expect(c.whereSql).not.toContain('DROP');
    expect(c.whereSql).not.toContain(evil);
    expect(Object.values(c.replacements).some((v) => String(v).includes('drop table'))).toBe(true);
  });
});
