// Parser for the issue query language (Jira-style, "JQL-lite"):
//
//   project = SCH AND type = bug AND status IN ("In Progress", Reopened)
//     AND assignee = me AND priority >= high AND created >= -7d ORDER BY updated DESC
//
// Grammar
//   query     := [expr] [ORDER BY order (, order)*]
//   expr      := and (OR and)*
//   and       := not (AND not)*
//   not       := NOT not | primary
//   primary   := '(' expr ')' | text | condition
//   condition := FIELD ( IS [NOT] EMPTY | [NOT] IN '(' value (, value)* ')' | OP value )
//   OP        := = != ~ !~ > >= < <=
//   value     := "quoted string" | bare-word | number | func()
//
// The parser only builds a tree; the compiler decides which fields/operators are allowed.

class QueryError extends Error {
  constructor(message, position) {
    super(message);
    this.name = 'QueryError';
    this.position = position;
  }
}

const KEYWORDS = new Set(['and', 'or', 'not', 'in', 'is', 'empty', 'null', 'order', 'by', 'asc', 'desc']);

const isWordChar = (c) => /[A-Za-z0-9_.@:+\-/#]/.test(c);

const tokenize = (input) => {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) { i++; continue; }

    if (c === '(' || c === ')' || c === ',') {
      tokens.push({ type: c, pos: i });
      i++;
      continue;
    }

    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let value = '';
      while (j < input.length && input[j] !== quote) {
        if (input[j] === '\\' && j + 1 < input.length) { value += input[j + 1]; j += 2; continue; }
        value += input[j++];
      }
      if (j >= input.length) throw new QueryError('Unterminated quoted string', i);
      tokens.push({ type: 'string', value, pos: i });
      i = j + 1;
      continue;
    }

    const two = input.slice(i, i + 2);
    if (['!=', '!~', '>=', '<='].includes(two)) { tokens.push({ type: 'op', value: two, pos: i }); i += 2; continue; }
    if (['=', '~', '>', '<'].includes(c)) { tokens.push({ type: 'op', value: c, pos: i }); i++; continue; }

    if (isWordChar(c)) {
      let j = i;
      while (j < input.length && isWordChar(input[j])) j++;
      const word = input.slice(i, j);
      const lower = word.toLowerCase();
      if (KEYWORDS.has(lower)) tokens.push({ type: 'kw', value: lower, pos: i });
      else tokens.push({ type: 'word', value: word, pos: i });
      i = j;
      continue;
    }

    throw new QueryError(`Unexpected character "${c}"`, i);
  }
  tokens.push({ type: 'eof', pos: input.length });
  return tokens;
};

const parse = (input) => {
  const tokens = tokenize(String(input || ''));
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const isKw = (v) => peek().type === 'kw' && peek().value === v;
  const expect = (type, what) => {
    if (peek().type !== type) throw new QueryError(`Expected ${what}`, peek().pos);
    return next();
  };

  const parseValue = () => {
    const t = next();
    if (t.type === 'string') return { kind: 'str', value: t.value, pos: t.pos };
    if (t.type === 'word' || (t.type === 'kw' && ['empty', 'null'].includes(t.value))) {
      // function call: name()
      if (peek().type === '(' && tokens[p + 1] && tokens[p + 1].type === ')') {
        next(); next();
        return { kind: 'func', value: t.value.toLowerCase(), pos: t.pos };
      }
      if (/^[-+]?\d+(\.\d+)?$/.test(t.value)) return { kind: 'num', value: Number(t.value), raw: t.value, pos: t.pos };
      return { kind: 'str', value: t.value, bare: true, pos: t.pos };
    }
    throw new QueryError('Expected a value', t.pos);
  };

  const parseCondition = () => {
    const first = next();
    // A lone quoted string is a free-text search
    if (first.type === 'string') return { type: 'text', value: first.value, pos: first.pos };
    if (first.type !== 'word') throw new QueryError('Expected a field name', first.pos);

    const field = first.value.toLowerCase();

    if (isKw('is')) {
      next();
      let negate = false;
      if (isKw('not')) { next(); negate = true; }
      if (!(isKw('empty') || isKw('null'))) throw new QueryError('Expected EMPTY after IS', peek().pos);
      next();
      return { type: 'empty', field, negate, pos: first.pos };
    }

    let negate = false;
    if (isKw('not')) { next(); negate = true; if (!isKw('in')) throw new QueryError('Expected IN after NOT', peek().pos); }
    if (isKw('in')) {
      next();
      expect('(', '"(" after IN');
      const values = [parseValue()];
      while (peek().type === ',') { next(); values.push(parseValue()); }
      expect(')', '")" to close the list');
      return { type: 'in', field, negate, values, pos: first.pos };
    }

    if (peek().type === 'op') {
      const op = next().value;
      return { type: 'cmp', field, op, value: parseValue(), pos: first.pos };
    }

    // A bare word that is not a field — treat as free text
    if (peek().type === 'eof' || isKw('and') || isKw('or') || isKw('order') || peek().type === ')') {
      return { type: 'text', value: first.value, pos: first.pos };
    }
    throw new QueryError(`Expected an operator after "${first.value}"`, peek().pos);
  };

  let parseExpr;
  const parsePrimary = () => {
    if (peek().type === '(') {
      next();
      const e = parseExpr();
      expect(')', '")"');
      return e;
    }
    return parseCondition();
  };
  const parseNot = () => {
    if (isKw('not')) { next(); return { type: 'not', expr: parseNot() }; }
    return parsePrimary();
  };
  const parseAnd = () => {
    let left = parseNot();
    while (isKw('and')) { next(); left = { type: 'and', left, right: parseNot() }; }
    return left;
  };
  parseExpr = () => {
    let left = parseAnd();
    while (isKw('or')) { next(); left = { type: 'or', left, right: parseAnd() }; }
    return left;
  };

  let where = null;
  if (peek().type !== 'eof' && !isKw('order')) where = parseExpr();

  const order = [];
  if (isKw('order')) {
    next();
    if (!isKw('by')) throw new QueryError('Expected BY after ORDER', peek().pos);
    next();
    do {
      if (peek().type === ',') next();
      const f = next();
      if (f.type !== 'word') throw new QueryError('Expected a field to order by', f.pos);
      let dir = 'asc';
      if (isKw('asc')) { next(); dir = 'asc'; } else if (isKw('desc')) { next(); dir = 'desc'; }
      order.push({ field: f.value.toLowerCase(), dir, pos: f.pos });
    } while (peek().type === ',');
  }

  if (peek().type !== 'eof') throw new QueryError(`Unexpected "${peek().value || peek().type}"`, peek().pos);
  return { where, order };
};

module.exports = { parse, tokenize, QueryError };
