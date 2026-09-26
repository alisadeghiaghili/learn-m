/**
 * learn-m — simplified Power Query M interpreter for teaching.
 *
 * Supports a practical subset of M used in Power BI / Power Query:
 * literals, lists, records, tables, let/in, if/then/else, each,
 * field access, function application, and a core stdlib (Table/List/Text/Number/Record).
 *
 * Not a full M runtime: no lazy streaming, no full type system, no extensions.
 * Values are plain JS with a `__mtype` tag for tables/functions/dates.
 */

// ---------------------------------------------------------------------------
// Tokens / Lexer
// ---------------------------------------------------------------------------

const KEYWORDS = new Set([
  'and', 'or', 'not', 'if', 'then', 'else', 'each', 'let', 'in', 'true', 'false', 'null', 'error', 'try', 'otherwise',
]);

/**
 * @typedef {{type: string, value: any, pos: number}} Token
 */

/**
 * Tokenize M source text.
 *
 * @param {string} src
 * @returns {Token[]}
 */
export function tokenize(src) {
  /** @type {Token[]} */
  const tokens = [];
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i];

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i += 1;
      continue;
    }

    // comments
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i = Math.min(n, i + 2);
      continue;
    }

    // string
    if (c === '"') {
      let j = i + 1;
      let out = '';
      while (j < n) {
        if (src[j] === '"' && src[j + 1] === '"') {
          out += '"';
          j += 2;
          continue;
        }
        // character escape: #(10), #(cr), #(lf), #(tab)
        if (src[j] === '#' && src[j + 1] === '(') {
          const end = src.indexOf(')', j + 2);
          if (end !== -1) {
            const code = src.slice(j + 2, end).trim().toLowerCase();
            if (code === 'lf') out += '\n';
            else if (code === 'cr') out += '\r';
            else if (code === 'tab') out += '\t';
            else if (/^\d+$/.test(code)) out += String.fromCharCode(Number(code));
            else out += src.slice(j, end + 1);
            j = end + 1;
            continue;
          }
        }
        if (src[j] === '"') break;
        out += src[j];
        j += 1;
      }
      tokens.push({ type: 'string', value: out, pos: i });
      i = j + 1;
      continue;
    }

    // identifiers / keywords / #section / #"quoted name"
    if (c === '#' || /[A-Za-z_]/.test(c)) {
      if (c === '#' && src[i + 1] === '"') {
        let j = i + 2;
        let out = '';
        while (j < n && src[j] !== '"') {
          out += src[j];
          j += 1;
        }
        tokens.push({ type: 'ident', value: out, pos: i });
        i = j + 1;
        continue;
      }
      let j = i;
      let name = '';
      if (c === '#') {
        name += '#';
        j += 1;
      }
      // dots are NOT part of identifiers — Table.SelectRows is field access
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) {
        name += src[j];
        j += 1;
      }
      const lower = name.toLowerCase();
      if (KEYWORDS.has(lower) && !name.startsWith('#')) {
        tokens.push({ type: lower, value: lower, pos: i });
      } else {
        tokens.push({ type: 'ident', value: name, pos: i });
      }
      i = j;
      continue;
    }

    // numbers
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      while (j < n && /[0-9._eE+-]/.test(src[j])) {
        // stop trailing + / - that are not exponents
        if ((src[j] === '+' || src[j] === '-') && !/[eE]/.test(src[j - 1] || '')) break;
        j += 1;
      }
      const raw = src.slice(i, j).replace(/_/g, '');
      tokens.push({ type: 'number', value: Number(raw), pos: i });
      i = j;
      continue;
    }

    // multi-char operators
    const two = src.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>' || two === '=>') {
      tokens.push({ type: two, value: two, pos: i });
      i += 2;
      continue;
    }

    const singles = '()+-*/=<>&{}[],.';
    if (singles.includes(c)) {
      tokens.push({ type: c, value: c, pos: i });
      i += 1;
      continue;
    }

    throw new MError(`Unexpected character '${c}' at ${i}`, i);
  }

  tokens.push({ type: 'eof', value: null, pos: n });
  return tokens;
}

// ---------------------------------------------------------------------------
// AST / Parser
// ---------------------------------------------------------------------------

export class MError extends Error {
  /**
   * @param {string} message
   * @param {number} [pos]
   */
  constructor(message, pos) {
    super(message);
    this.name = 'MError';
    this.pos = pos;
  }
}

/**
 * Recursive-descent parser for the teaching subset of M.
 */
export class Parser {
  /**
   * @param {Token[]} tokens
   */
  constructor(tokens) {
    this.tokens = tokens;
    this.i = 0;
  }

  peek() {
    return this.tokens[this.i];
  }

  next() {
    const t = this.tokens[this.i];
    this.i += 1;
    return t;
  }

  /**
   * @param {string} type
   */
  expect(type) {
    const t = this.next();
    if (t.type !== type) {
      throw new MError(`Expected ${type} but found ${t.type}`, t.pos);
    }
    return t;
  }

  /**
   * @param {string} type
   */
  match(type) {
    if (this.peek().type === type) {
      this.next();
      return true;
    }
    return false;
  }

  parseProgram() {
    const expr = this.parseExpr();
    if (this.peek().type !== 'eof') {
      throw new MError(`Unexpected token ${this.peek().type}`, this.peek().pos);
    }
    return expr;
  }

  parseExpr() {
    return this.parseIf();
  }

  parseIf() {
    if (this.match('if')) {
      const cond = this.parseExpr();
      this.expect('then');
      const then = this.parseExpr();
      this.expect('else');
      const alt = this.parseExpr();
      return { kind: 'if', cond, then, alt };
    }
    if (this.match('let')) {
      /** @type {{name: string, expr: any}[]} */
      const bindings = [];
      do {
        const nameTok = this.next();
        if (nameTok.type !== 'ident' && nameTok.type !== 'string') {
          throw new MError('Expected binding name', nameTok.pos);
        }
        this.expect('=');
        const expr = this.parseExpr();
        bindings.push({ name: String(nameTok.value), expr });
      } while (this.match(','));
      this.expect('in');
      const body = this.parseExpr();
      return { kind: 'let', bindings, body };
    }
    return this.parseOr();
  }

  parseOr() {
    let left = this.parseAnd();
    while (this.match('or')) {
      left = { kind: 'or', left, right: this.parseAnd() };
    }
    return left;
  }

  parseAnd() {
    let left = this.parseNot();
    while (this.match('and')) {
      left = { kind: 'and', left, right: this.parseNot() };
    }
    return left;
  }

  parseNot() {
    if (this.match('not')) {
      return { kind: 'not', expr: this.parseNot() };
    }
    return this.parseCompare();
  }

  parseCompare() {
    let left = this.parseAdd();
    const t = this.peek().type;
    if (t === '=' || t === '<>' || t === '<' || t === '>' || t === '<=' || t === '>=') {
      this.next();
      left = { kind: 'compare', op: t, left, right: this.parseAdd() };
    }
    return left;
  }

  parseAdd() {
    let left = this.parseMul();
    for (;;) {
      const t = this.peek().type;
      if (t === '+' || t === '-' || t === '&') {
        this.next();
        left = { kind: 'binary', op: t, left, right: this.parseMul() };
      } else {
        return left;
      }
    }
  }

  parseMul() {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek().type;
      if (t === '*' || t === '/') {
        this.next();
        left = { kind: 'binary', op: t, left, right: this.parseUnary() };
      } else {
        return left;
      }
    }
  }

  parseUnary() {
    if (this.match('-')) {
      return { kind: 'neg', expr: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let node = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (t.type === '[') {
        this.next();
        const nameTok = this.next();
        if (nameTok.type !== 'ident' && nameTok.type !== 'string') {
          throw new MError('Expected field name', nameTok.pos);
        }
        this.expect(']');
        node = { kind: 'field', object: node, name: String(nameTok.value) };
      } else if (t.type === '.') {
        this.next();
        const nameTok = this.next();
        if (nameTok.type !== 'ident') {
          throw new MError('Expected name after .', nameTok.pos);
        }
        node = { kind: 'field', object: node, name: String(nameTok.value) };
      } else if (t.type === '{') {
        this.next();
        const index = this.parseExpr();
        this.expect('}');
        node = { kind: 'index', object: node, index };
      } else if (t.type === '(') {
        this.next();
        /** @type {any[]} */
        const args = [];
        if (!this.match(')')) {
          do {
            args.push(this.parseExpr());
          } while (this.match(','));
          this.expect(')');
        }
        node = { kind: 'call', fn: node, args };
      } else {
        return node;
      }
    }
  }

  /**
   * Lookahead without consuming: true when `(` starts `(params) =>`.
   * @returns {boolean}
   */
  isArrowFunctionStart() {
    let j = this.i + 1;
    let depth = 1;
    while (j < this.tokens.length && depth > 0) {
      const tok = this.tokens[j];
      if (tok.type === '(') depth += 1;
      else if (tok.type === ')') {
        depth -= 1;
        if (depth === 0) {
          return this.tokens[j + 1]?.type === '=>';
        }
      }
      j += 1;
    }
    return false;
  }

  /**
   * Parse `(a, b) => expr`.
   */
  parseArrowFunction() {
    this.expect('(');
    /** @type {string[]} */
    const params = [];
    if (!this.match(')')) {
      do {
        const p = this.next();
        if (p.type !== 'ident') throw new MError('Expected parameter name', p.pos);
        params.push(String(p.value));
      } while (this.match(','));
      this.expect(')');
    }
    this.expect('=>');
    const body = this.parseExpr();
    return { kind: 'fn', params, body };
  }

  /**
   * type any | type number | type nullable text | type table [...] | type list type number
   * Called after the `type` keyword has been consumed.
   */
  parseTypeExpr() {
    const t = this.peek();
    if (t.type === 'ident') {
      const name = String(t.value).toLowerCase();
      this.next();
      if (name === 'nullable') {
        const inner = this.parseTypeExpr();
        return { kind: 'type', type: { kind: 'nullable', inner: inner.type || inner } };
      }
      if (name === 'table' || name === 'record') {
        /** @type {Record<string, any>} */
        const fields = {};
        if (this.match('[')) {
          if (!this.match(']')) {
            do {
              const fname = this.next();
              if (fname.type !== 'ident' && fname.type !== 'string') {
                throw new MError('Expected type field name', fname.pos);
              }
              this.expect('=');
              const ftype = this.parseTypeExpr();
              fields[String(fname.value)] = ftype.type || ftype;
            } while (this.match(','));
            this.expect(']');
          }
        }
        return { kind: 'type', type: { kind: name, fields } };
      }
      if (name === 'list') {
        const inner = this.parseTypeExpr();
        return { kind: 'type', type: { kind: 'list', inner: inner.type || inner } };
      }
      return { kind: 'type', type: { kind: 'primitive', name } };
    }
    if (t.type === '{') {
      this.next();
      const inner = this.parseTypeExpr();
      this.expect('}');
      return { kind: 'type', type: { kind: 'list', inner: inner.type || inner } };
    }
    throw new MError('Expected type name', t.pos);
  }

  parsePrimary() {
    const t = this.peek();

    if (t.type === 'number') {
      this.next();
      return { kind: 'literal', value: t.value };
    }
    if (t.type === 'string') {
      this.next();
      return { kind: 'literal', value: t.value };
    }
    if (t.type === 'true') {
      this.next();
      return { kind: 'literal', value: true };
    }
    if (t.type === 'false') {
      this.next();
      return { kind: 'literal', value: false };
    }
    if (t.type === 'null') {
      this.next();
      return { kind: 'literal', value: null };
    }
    if (t.type === 'error') {
      this.next();
      this.expect('(');
      const msg = this.parseExpr();
      this.expect(')');
      return { kind: 'error', msg };
    }
    if (t.type === 'try') {
      this.next();
      const body = this.parseExpr();
      this.expect('otherwise');
      const alt = this.parseExpr();
      return { kind: 'try', body, alt };
    }
    if (t.type === 'each') {
      this.next();
      const body = this.parseExpr();
      return { kind: 'each', body };
    }
    // arrow functions: x => expr  |  (x) => expr  |  (x, y) => expr  |  () => expr
    if (t.type === '(' && this.isArrowFunctionStart()) {
      return this.parseArrowFunction();
    }
    if (t.type === 'ident') {
      const name = String(t.value);
      this.next();
      if (name.toLowerCase() === 'type') {
        return this.parseTypeExpr();
      }
      if (this.peek().type === '=>') {
        this.next();
        const body = this.parseExpr();
        return { kind: 'fn', params: [name], body };
      }
      return { kind: 'ident', name };
    }
    if (t.type === '(') {
      this.next();
      const expr = this.parseExpr();
      this.expect(')');
      return expr;
    }
    if (t.type === '{') {
      this.next();
      /** @type {any[]} */
      const items = [];
      if (!this.match('}')) {
        do {
          items.push(this.parseExpr());
        } while (this.match(','));
        this.expect('}');
      }
      return { kind: 'list', items };
    }
    if (t.type === '[') {
      this.next();
      /** @type {{name: string, expr: any}[]} */
      const fields = [];
      if (this.match(']')) {
        return { kind: 'record', fields };
      }
      const nameTok = this.next();
      if (nameTok.type !== 'ident' && nameTok.type !== 'string') {
        throw new MError('Expected record field name', nameTok.pos);
      }
      // [Name] is field access on implicit _ (each-row sugar);
      // [Name = expr] starts a record literal.
      if (this.peek().type !== '=') {
        this.expect(']');
        return {
          kind: 'field',
          object: { kind: 'ident', name: '_' },
          name: String(nameTok.value),
        };
      }
      this.expect('=');
      fields.push({ name: String(nameTok.value), expr: this.parseExpr() });
      while (this.match(',')) {
        const fieldNameTok = this.next();
        if (fieldNameTok.type !== 'ident' && fieldNameTok.type !== 'string') {
          throw new MError('Expected record field name', fieldNameTok.pos);
        }
        this.expect('=');
        fields.push({ name: String(fieldNameTok.value), expr: this.parseExpr() });
      }
      this.expect(']');
      return { kind: 'record', fields };
    }

    throw new MError(`Unexpected token ${t.type}`, t.pos);
  }
}

/**
 * Parse M source into an AST.
 *
 * @param {string} src
 * @returns {any}
 */
export function parse(src) {
  return new Parser(tokenize(src)).parseProgram();
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/**
 * @param {string} type
 * @param {object} props
 */
function tagged(type, props) {
  return { __mtype: type, ...props };
}

export function makeTable(columns, rows) {
  const cols = columns.map((c) => (typeof c === 'string' ? { name: c, type: 'any' } : c));
  return tagged('table', {
    columns: cols,
    rows: rows.map((r) => normalizeRow(cols, r)),
  });
}

function normalizeRow(cols, row) {
  if (Array.isArray(row)) {
    /** @type {Record<string, any>} */
    const obj = {};
    cols.forEach((c, i) => {
      obj[c.name] = row[i] === undefined ? null : row[i];
    });
    return obj;
  }
  /** @type {Record<string, any>} */
  const obj = {};
  for (const c of cols) {
    obj[c.name] = row[c.name] === undefined ? null : row[c.name];
  }
  return obj;
}

export function makeDate(y, m, d) {
  return tagged('date', { y, m, d });
}

export function isTable(v) {
  return v && typeof v === 'object' && v.__mtype === 'table';
}

export function isRecord(v) {
  return (
    v !== null &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    v.__mtype === undefined
  );
}

export function isList(v) {
  return Array.isArray(v);
}

export function isFunction(v) {
  return typeof v === 'function' || (v && v.__mtype === 'fn');
}

export function isDate(v) {
  return v && typeof v === 'object' && v.__mtype === 'date';
}

/**
 * Structural equality for M values (tables compared by schema + rows).
 *
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
export function mEquals(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (isDate(a) && isDate(b)) return a.y === b.y && a.m === b.m && a.d === b.d;
  if (isList(a) && isList(b)) {
    return a.length === b.length && a.every((x, i) => mEquals(x, b[i]));
  }
  if (isTable(a) && isTable(b)) {
    const ca = a.columns.map((c) => c.name).join('|');
    const cb = b.columns.map((c) => c.name).join('|');
    if (ca !== cb) return false;
    if (a.rows.length !== b.rows.length) return false;
    return a.rows.every((r, i) => {
      const s = b.rows[i];
      return a.columns.every((c) => mEquals(r[c.name], s[c.name]));
    });
  }
  if (isRecord(a) && isRecord(b)) {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.length !== kb.length) return false;
    return ka.every((k, i) => k === kb[i] && mEquals(a[k], b[k]));
  }
  return false;
}

/**
 * Human-readable type name.
 *
 * @param {any} v
 * @returns {string}
 */
export function typeName(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return 'logical';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'text';
  if (typeof v === 'function' || (v && v.__mtype === 'fn')) return 'function';
  if (v && v.__mtype === 'type') return 'type';
  if (v && v.__mtype === 'duration') return 'duration';
  if (v && v.__mtype === 'binary') return 'binary';
  if (isList(v)) return 'list';
  if (isTable(v)) return 'table';
  if (isDate(v)) return 'date';
  if (isRecord(v)) return 'record';
  return 'any';
}

/**
 * Compact display of a value (for terminal / previews).
 *
 * @param {any} v
 * @param {number} [depth]
 * @returns {string}
 */
export function formatValue(v, depth = 0) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'function' || (v && v.__mtype === 'fn')) return `«function${v.__name ? ` ${v.__name}` : ''}»`;
  if (v && v.__mtype === 'type') return `type ${typeLabel(v.type)}`;
  if (v && v.__mtype === 'duration') return `#duration(${v.days} days)`;
  if (v && v.__mtype === 'binary') return `binary(${v.url || v.text || ''})`;
  if (isDate(v)) return `#date(${v.y}, ${v.m}, ${v.d})`;
  if (isList(v)) {
    if (depth > 2) return '{…}';
    return `{${v.map((x) => formatValue(x, depth + 1)).join(', ')}}`;
  }
  if (isTable(v)) {
    return `#table(${v.columns.length} cols × ${v.rows.length} rows)`;
  }
  if (isRecord(v)) {
    if (depth > 2) return '[…]';
    const parts = Object.keys(v).map((k) => `${k}=${formatValue(v[k], depth + 1)}`);
    return `[${parts.join(', ')}]`;
  }
  return String(v);
}

// ---------------------------------------------------------------------------
// Environment + Evaluation
// ---------------------------------------------------------------------------

/**
 * @typedef {{vars: Map<string, any>, parent?: Env}} Env
 */

/**
 * @param {Env} [parent]
 * @returns {Env}
 */
export function makeEnv(parent) {
  return { vars: new Map(), parent };
}

/**
 * @param {Env} env
 * @param {string} name
 * @param {any} value
 */
export function envDefine(env, name, value) {
  env.vars.set(name, value);
}

/**
 * @param {Env} env
 * @param {string} name
 * @returns {any}
 */
export function envLookup(env, name) {
  let e = env;
  while (e) {
    if (e.vars.has(name)) return e.vars.get(name);
    e = e.parent;
  }
  throw new MError(`Name '${name}' is not recognized`);
}

/**
 * Wrap a JS function as an M function value.
 *
 * @param {string} name
 * @param {(args: any[]) => any} impl
 * @param {number} arity
 */
export function mFn(name, impl, arity) {
  const fn = (...args) => impl(args);
  fn.__mtype = 'fn';
  fn.__name = name;
  fn.__arity = arity;
  return fn;
}

/**
 * Evaluate an AST node in an environment.
 *
 * @param {any} node
 * @param {Env} env
 * @returns {any}
 */
export function evaluate(node, env) {
  switch (node.kind) {
    case 'literal':
      return node.value;
    case 'ident': {
      if (node.name === '_') {
        return envLookup(env, '_');
      }
      // allow Table.Foo style already tokenized as ident with dots
      return envLookup(env, node.name);
    }
    case 'list':
      return node.items.map((item) => evaluate(item, env));
    case 'record': {
      /** @type {Record<string, any>} */
      const obj = {};
      for (const f of node.fields) {
        obj[f.name] = evaluate(f.expr, env);
      }
      return obj;
    }
    case 'field': {
      const obj = evaluate(node.object, env);
      return getField(obj, node.name);
    }
    case 'index': {
      const obj = evaluate(node.object, env);
      const idx = evaluate(node.index, env);
      if (isList(obj)) {
        if (typeof idx !== 'number') throw new MError('List index must be a number');
        if (idx < 0 || idx >= obj.length) return null;
        return obj[idx];
      }
      if (isTable(obj)) {
        // t{[Field=value]} row lookup by key (Power Query item access)
        if (isRecord(idx)) {
          const row = obj.rows.find((r) =>
            Object.keys(idx).every((k) => mEquals(r[k], idx[k]))
          );
          return row === undefined ? null : row;
        }
        if (typeof idx !== 'number') throw new MError('Table row index must be a number');
        if (idx < 0 || idx >= obj.rows.length) return null;
        return obj.rows[idx];
      }
      if (isRecord(obj) && typeof idx === 'string') {
        return idx in obj ? obj[idx] : null;
      }
      throw new MError('Index operator expects a list or table');
    }
    case 'call': {
      const fn = evaluate(node.fn, env);
      const args = node.args.map((a) => evaluate(a, env));
      return applyFunction(fn, args, node);
    }
    case 'each': {
      const body = node.body;
      return mFn(
        'each',
        (args) => {
          const local = makeEnv(env);
          envDefine(local, '_', args[0]);
          return evaluate(body, local);
        },
        1
      );
    }
    case 'fn': {
      const params = node.params;
      const body = node.body;
      return mFn(
        'fn',
        (args) => {
          const local = makeEnv(env);
          params.forEach((p, i) => envDefine(local, p, i < args.length ? args[i] : null));
          return evaluate(body, local);
        },
        params.length
      );
    }
    case 'type': {
      return { __mtype: 'type', type: node.type };
    }
    case 'neg': {
      const v = evaluate(node.expr, env);
      if (typeof v !== 'number') throw new MError('Unary minus expects a number');
      return -v;
    }
    case 'not': {
      const v = evaluate(node.expr, env);
      return !truthy(v);
    }
    case 'and': {
      const l = evaluate(node.left, env);
      if (!truthy(l)) return false;
      return truthy(evaluate(node.right, env));
    }
    case 'or': {
      const l = evaluate(node.left, env);
      if (truthy(l)) return true;
      return truthy(evaluate(node.right, env));
    }
    case 'compare': {
      const l = evaluate(node.left, env);
      const r = evaluate(node.right, env);
      return compareValues(node.op, l, r);
    }
    case 'binary': {
      const l = evaluate(node.left, env);
      const r = evaluate(node.right, env);
      return binaryOp(node.op, l, r);
    }
    case 'if': {
      return truthy(evaluate(node.cond, env))
        ? evaluate(node.then, env)
        : evaluate(node.alt, env);
    }
    case 'let': {
      const local = makeEnv(env);
      for (const b of node.bindings) {
        envDefine(local, b.name, evaluate(b.expr, local));
      }
      return evaluate(node.body, local);
    }
    case 'error': {
      const msg = evaluate(node.msg, env);
      throw new MError(formatValue(msg));
    }
    case 'try': {
      try {
        return evaluate(node.body, env);
      } catch {
        return evaluate(node.alt, env);
      }
    }
    default:
      throw new MError(`Unknown node kind ${node.kind}`);
  }
}

/**
 * @param {any} v
 */
function truthy(v) {
  return v === true;
}

/**
 * @param {any} obj
 * @param {string} name
 */
function getField(obj, name) {
  if (obj === null || obj === undefined) {
    throw new MError(`Cannot access field '${name}' on null`);
  }
  if (isTable(obj)) {
    // Table[Column] returns a list of column values (M semantics for field access on tables)
    return obj.rows.map((r) => (name in r ? r[name] : null));
  }
  if (isRecord(obj)) {
    if (!(name in obj)) throw new MError(`Field '${name}' not found`);
    return obj[name];
  }
  if (isList(obj)) {
    // list of records → list of fields
    return obj.map((item) => getField(item, name));
  }
  throw new MError(`Cannot access field '${name}' on ${typeName(obj)}`);
}

/**
 * @param {string} op
 * @param {any} a
 * @param {any} b
 */
function compareValues(op, a, b) {
  if (op === '=') return mEquals(a, b);
  if (op === '<>') return !mEquals(a, b);
  if (a === null || b === null) return false;
  if (typeof a === 'number' && typeof b === 'number') {
    if (op === '<') return a < b;
    if (op === '>') return a > b;
    if (op === '<=') return a <= b;
    if (op === '>=') return a >= b;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    if (op === '<') return a < b;
    if (op === '>') return a > b;
    if (op === '<=') return a <= b;
    if (op === '>=') return a >= b;
  }
  if (isDate(a) && isDate(b)) {
    const ka = a.y * 10000 + a.m * 100 + a.d;
    const kb = b.y * 10000 + b.m * 100 + b.d;
    if (op === '<') return ka < kb;
    if (op === '>') return ka > kb;
    if (op === '<=') return ka <= kb;
    if (op === '>=') return ka >= kb;
  }
  throw new MError(`Cannot compare ${typeName(a)} with ${typeName(b)} using ${op}`);
}

/**
 * @param {string} op
 * @param {any} a
 * @param {any} b
 */
function binaryOp(op, a, b) {
  if (op === '&') {
    return toText(a) + toText(b);
  }
  if (op === '+') {
    if (typeof a === 'number' && typeof b === 'number') return a + b;
    if (a === null) return b;
    if (b === null) return a;
    throw new MError(`Cannot add ${typeName(a)} and ${typeName(b)}`);
  }
  if (op === '-') {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    throw new MError(`Cannot subtract ${typeName(b)} from ${typeName(a)}`);
  }
  if (op === '*') {
    if (typeof a === 'number' && typeof b === 'number') return a * b;
    throw new MError(`Cannot multiply ${typeName(a)} and ${typeName(b)}`);
  }
  if (op === '/') {
    if (typeof a === 'number' && typeof b === 'number') {
      if (b === 0) throw new MError('Division by zero');
      return a / b;
    }
    throw new MError(`Cannot divide ${typeName(a)} by ${typeName(b)}`);
  }
  throw new MError(`Unknown operator ${op}`);
}

/**
 * @param {any} v
 */
function toText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return formatValue(v);
}

/**
 * Apply an M function value.
 *
 * @param {any} fn
 * @param {any[]} args
 * @param {any} [node]
 */
export function applyFunction(fn, args, node) {
  if (typeof fn === 'function') {
    return fn(...args);
  }
  throw new MError(`Value is not a function${node ? ' in call' : ''}`);
}

// ---------------------------------------------------------------------------
// Stdlib
// ---------------------------------------------------------------------------

/**
 * Build the base standard library environment.
 *
 * @returns {Env}
 */
export function createStdlib() {
  const env = makeEnv();

  // --- constructors / literals ---
  envDefine(
    env,
    '#table',
    mFn('#table', (args) => {
      const [colsArg, rowsArg] = args;
      if (!isList(colsArg) || !isList(rowsArg)) {
        throw new MError('#table expects (columns, rows)');
      }
      const columns = colsArg.map((c) => String(c));
      return makeTable(columns, rowsArg);
    }, 2)
  );

  envDefine(
    env,
    '#date',
    mFn('#date', (args) => {
      const [y, m, d] = args;
      return makeDate(Number(y), Number(m), Number(d));
    }, 3)
  );

  // --- Table ---
  const T = makeEnv(env);
  envDefine(env, 'Table', /** @type {any} */ (null));

  const tableNs = {
    FromRows: mFn('Table.FromRows', (args) => {
      const [rows, colsArg] = args;
      if (!isList(rows)) throw new MError('Table.FromRows expects a list of rows');
      let columns;
      if (colsArg === undefined) {
        const first = rows[0];
        if (isRecord(first)) columns = Object.keys(first);
        else if (isList(first)) columns = first.map((_, i) => `Column${i + 1}`);
        else columns = ['Column1'];
      } else if (isList(colsArg)) {
        columns = colsArg.map((c) => String(c));
      } else {
        throw new MError('Table.FromRows columns must be a list of names');
      }
      return makeTable(columns, rows);
    }, 2),
    FromRecords: mFn('Table.FromRecords', (args) => {
      const [records, colsArg] = args;
      if (!isList(records)) throw new MError('Table.FromRecords expects a list');
      let columns;
      if (colsArg === undefined) {
        const keys = new Set();
        for (const r of records) {
          if (isRecord(r)) Object.keys(r).forEach((k) => keys.add(k));
        }
        columns = [...keys];
      } else {
        columns = colsArg.map((c) => String(c));
      }
      return makeTable(columns, records);
    }, 2),
    RowCount: mFn('Table.RowCount', (args) => {
      const t = expectTable(args[0], 'Table.RowCount');
      return t.rows.length;
    }, 1),
    ColumnNames: mFn('Table.ColumnNames', (args) => {
      const t = expectTable(args[0], 'Table.ColumnNames');
      return t.columns.map((c) => c.name);
    }, 1),
    SelectRows: mFn('Table.SelectRows', (args) => {
      const t = expectTable(args[0], 'Table.SelectRows');
      const pred = args[1];
      const rows = t.rows.filter((r) => truthy(applyFunction(pred, [r])));
      return { ...t, rows };
    }, 2),
    SelectColumns: mFn('Table.SelectColumns', (args) => {
      const t = expectTable(args[0], 'Table.SelectColumns');
      const cols = toNameList(args[1], 'Table.SelectColumns');
      const columns = cols.map((name) => {
        const existing = t.columns.find((c) => c.name === name);
        return existing || { name, type: 'any' };
      });
      const rows = t.rows.map((r) => {
        /** @type {Record<string, any>} */
        const o = {};
        for (const name of cols) o[name] = name in r ? r[name] : null;
        return o;
      });
      return { __mtype: 'table', columns, rows };
    }, 2),
    RemoveColumns: mFn('Table.RemoveColumns', (args) => {
      const t = expectTable(args[0], 'Table.RemoveColumns');
      const drop = new Set(toNameList(args[1], 'Table.RemoveColumns'));
      const columns = t.columns.filter((c) => !drop.has(c.name));
      const rows = t.rows.map((r) => {
        /** @type {Record<string, any>} */
        const o = {};
        for (const c of columns) o[c.name] = r[c.name];
        return o;
      });
      return { __mtype: 'table', columns, rows };
    }, 2),
    AddColumn: mFn('Table.AddColumn', (args) => {
      const t = expectTable(args[0], 'Table.AddColumn');
      const name = String(args[1]);
      const fn = args[2];
      const columns = [...t.columns, { name, type: 'any' }];
      const rows = t.rows.map((r) => ({
        ...r,
        [name]: applyFunction(fn, [r]),
      }));
      return { __mtype: 'table', columns, rows };
    }, 3),
    RenameColumns: mFn('Table.RenameColumns', (args) => {
      const t = expectTable(args[0], 'Table.RenameColumns');
      const renames = args[1];
      if (!isList(renames)) throw new MError('Table.RenameColumns expects a list of pairs');
      /** @type {Record<string, string>} */
      const map = {};
      for (const pair of renames) {
        if (!isList(pair) || pair.length !== 2) throw new MError('Rename pair must be {old, new}');
        map[String(pair[0])] = String(pair[1]);
      }
      const columns = t.columns.map((c) =>
        map[c.name] ? { ...c, name: map[c.name] } : c
      );
      const rows = t.rows.map((r) => {
        /** @type {Record<string, any>} */
        const o = {};
        for (const c of columns) {
          const oldName = t.columns.find((oc) => map[oc.name] === c.name)?.name ?? c.name;
          o[c.name] = r[oldName];
        }
        return o;
      });
      return { __mtype: 'table', columns, rows };
    }, 2),
    Sort: mFn('Table.Sort', (args) => {
      const t = expectTable(args[0], 'Table.Sort');
      const order = args[1];
      if (!isList(order)) throw new MError('Table.Sort expects a list of order specs');
      /** @type {{col: string, desc: boolean}[]} */
      const keys = order.map((o) => {
        if (isList(o) && o.length === 2) return { col: String(o[0]), desc: o[1] === 'Order.Descending' };
        return { col: String(o), desc: false };
      });
      const rows = [...t.rows].sort((a, b) => {
        for (const k of keys) {
          const cmp = compareForSort(a[k.col], b[k.col]);
          if (cmp !== 0) return k.desc ? -cmp : cmp;
        }
        return 0;
      });
      return { ...t, rows };
    }, 2),
    FirstN: mFn('Table.FirstN', (args) => {
      const t = expectTable(args[0], 'Table.FirstN');
      const n = Number(args[1]);
      return { ...t, rows: t.rows.slice(0, Math.max(0, n)) };
    }, 2),
    Skip: mFn('Table.Skip', (args) => {
      const t = expectTable(args[0], 'Table.Skip');
      const n = Number(args[1] ?? 1);
      return { ...t, rows: t.rows.slice(Math.max(0, n)) };
    }, 2),
    Distinct: mFn('Table.Distinct', (args) => {
      const t = expectTable(args[0], 'Table.Distinct');
      /** @type {string[] | null} */
      let cols = null;
      if (args[1] !== undefined) cols = toNameList(args[1], 'Table.Distinct');
      const seen = new Set();
      const rows = [];
      for (const r of t.rows) {
        const keyObj = cols ? cols.map((c) => r[c]) : t.columns.map((c) => r[c.name]);
        const key = JSON.stringify(keyObj);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(r);
      }
      return { ...t, rows };
    }, 2),
    Group: mFn('Table.Group', (args) => {
      const t = expectTable(args[0], 'Table.Group');
      const keyCols = toNameList(args[1], 'Table.Group');
      const aggs = args[2];
      if (!isList(aggs)) throw new MError('Table.Group expects aggregation specs');
      /** @type {Map<string, any[]>} */
      const groups = new Map();
      for (const r of t.rows) {
        const key = JSON.stringify(keyCols.map((c) => r[c]));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
      }
      const outCols = [
        ...keyCols.map((c) => ({ name: c, type: 'any' })),
        ...aggs.map((a) => ({ name: String(a[0]), type: 'any' })),
      ];
      const rows = [];
      for (const bucket of groups.values()) {
        /** @type {Record<string, any>} */
        const o = {};
        for (const c of keyCols) o[c] = bucket[0][c];
        for (const a of aggs) {
          const outName = String(a[0]);
          const fn = a[1];
          o[outName] = applyFunction(fn, [bucket]);
        }
        rows.push(o);
      }
      return { __mtype: 'table', columns: outCols, rows };
    }, 3),
    Join: mFn('Table.Join', (args) => {
      const t1 = expectTable(args[0], 'Table.Join');
      const k1 = toNameList(args[1], 'Table.Join');
      const t2 = expectTable(args[2], 'Table.Join');
      const k2 = args[3] !== undefined ? toNameList(args[3], 'Table.Join') : k1;
      const rows = [];
      for (const r1 of t1.rows) {
        for (const r2 of t2.rows) {
          const match = k1.every((c, i) => mEquals(r1[c], r2[k2[i]]));
          if (match) rows.push({ ...r2, ...r1 });
        }
      }
      // preserve t2 non-key cols first then t1
      const colNames = [];
      const seen = new Set();
      for (const c of t2.columns) {
        if (!seen.has(c.name)) {
          seen.add(c.name);
          colNames.push(c.name);
        }
      }
      for (const c of t1.columns) {
        if (!seen.has(c.name)) {
          seen.add(c.name);
          colNames.push(c.name);
        }
      }
      return makeTable(colNames, rows);
    }, 4),
    Combine: mFn('Table.Combine', (args) => {
      const list = args[0];
      if (!isList(list)) throw new MError('Table.Combine expects a list of tables');
      const tables = list.map((t) => expectTable(t, 'Table.Combine'));
      if (tables.length === 0) return makeTable([], []);
      const columns = tables[0].columns;
      const names = columns.map((c) => c.name);
      const rows = [];
      for (const t of tables) {
        for (const r of t.rows) {
          /** @type {Record<string, any>} */
          const o = {};
          for (const n of names) o[n] = r[n] ?? null;
          rows.push(o);
        }
      }
      return makeTable(names, rows);
    }, 1),
    TransformColumns: mFn('Table.TransformColumns', (args) => {
      const t = expectTable(args[0], 'Table.TransformColumns');
      const transforms = args[1];
      if (!isList(transforms)) throw new MError('Table.TransformColumns expects a list');
      let rows = t.rows;
      for (const spec of transforms) {
        const col = String(spec[0]);
        const fn = spec[1];
        rows = rows.map((r) => ({ ...r, [col]: applyFunction(fn, [r[col]]) }));
      }
      return { ...t, rows };
    }, 2),
    ExpandTableColumn: mFn('Table.ExpandTableColumn', (args) => {
      const t = expectTable(args[0], 'Table.ExpandTableColumn');
      const col = String(args[1]);
      const fields = toNameList(args[2], 'Table.ExpandTableColumn');
      const rows = [];
      for (const r of t.rows) {
        const inner = r[col];
        if (isTable(inner)) {
          for (const ir of inner.rows) {
            /** @type {Record<string, any>} */
            const o = {};
            for (const k of Object.keys(r)) if (k !== col) o[k] = r[k];
            for (const f of fields) o[f] = ir[f];
            rows.push(o);
          }
        } else if (inner === null) {
          continue;
        } else {
          throw new MError('Table.ExpandTableColumn expects a table column');
        }
      }
      const names = t.columns.filter((c) => c.name !== col).map((c) => c.name).concat(fields);
      return makeTable(names, rows);
    }, 3),
  };
  // Order markers used in Table.Sort({{"Qty", Order.Descending}})
  envDefine(env, 'Order', {
    Ascending: 'Order.Ascending',
    Descending: 'Order.Descending',
  });
  envDefine(env, 'Table', tableNs);

  // --- List ---
  envDefine(env, 'List', {
    Sum: mFn('List.Sum', (args) => {
      const xs = toNumberList(args[0], 'List.Sum');
      return xs.reduce((a, b) => a + b, 0);
    }, 1),
    Average: mFn('List.Average', (args) => {
      const xs = toNumberList(args[0], 'List.Average');
      if (xs.length === 0) throw new MError('List.Average of empty list');
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    }, 1),
    Count: mFn('List.Count', (args) => {
      const xs = args[0];
      if (!isList(xs)) throw new MError('List.Count expects a list');
      return xs.length;
    }, 1),
    Min: mFn('List.Min', (args) => {
      const xs = args[0];
      if (!isList(xs) || xs.length === 0) throw new MError('List.Min expects a non-empty list');
      return xs.reduce((a, b) => (compareForSort(b, a) < 0 ? b : a));
    }, 1),
    Max: mFn('List.Max', (args) => {
      const xs = args[0];
      if (!isList(xs) || xs.length === 0) throw new MError('List.Max expects a non-empty list');
      return xs.reduce((a, b) => (compareForSort(b, a) > 0 ? b : a));
    }, 1),
    First: mFn('List.First', (args) => {
      const xs = args[0];
      return isList(xs) && xs.length ? xs[0] : null;
    }, 1),
    Last: mFn('List.Last', (args) => {
      const xs = args[0];
      return isList(xs) && xs.length ? xs[xs.length - 1] : null;
    }, 1),
    Distinct: mFn('List.Distinct', (args) => {
      const xs = args[0];
      if (!isList(xs)) throw new MError('List.Distinct expects a list');
      const out = [];
      const seen = new Set();
      for (const x of xs) {
        const k = JSON.stringify(x ?? null);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(x);
      }
      return out;
    }, 1),
    Sort: mFn('List.Sort', (args) => {
      const xs = args[0];
      if (!isList(xs)) throw new MError('List.Sort expects a list');
      return [...xs].sort(compareForSort);
    }, 1),
    Transform: mFn('List.Transform', (args) => {
      const xs = args[0];
      const fn = args[1];
      if (!isList(xs)) throw new MError('List.Transform expects a list');
      return xs.map((x) => applyFunction(fn, [x]));
    }, 2),
    Select: mFn('List.Select', (args) => {
      const xs = args[0];
      const fn = args[1];
      if (!isList(xs)) throw new MError('List.Select expects a list');
      return xs.filter((x) => truthy(applyFunction(fn, [x])));
    }, 2),
    Contains: mFn('List.Contains', (args) => {
      const xs = args[0];
      if (!isList(xs)) throw new MError('List.Contains expects a list');
      return xs.some((x) => mEquals(x, args[1]));
    }, 2),
  });

  // --- Text ---
  envDefine(env, 'Text', {
    Length: mFn('Text.Length', (args) => toText(args[0]).length, 1),
    Upper: mFn('Text.Upper', (args) => toText(args[0]).toUpperCase(), 1),
    Lower: mFn('Text.Lower', (args) => toText(args[0]).toLowerCase(), 1),
    Trim: mFn('Text.Trim', (args) => toText(args[0]).trim(), 1),
    Combine: mFn('Text.Combine', (args) => {
      const xs = args[0];
      const sep = args[1] !== undefined ? toText(args[1]) : '';
      if (!isList(xs)) return toText(xs);
      return xs.map(toText).join(sep);
    }, 2),
    Split: mFn('Text.Split', (args) => toText(args[0]).split(toText(args[1])), 2),
    StartsWith: mFn('Text.StartsWith', (args) => toText(args[0]).startsWith(toText(args[1])), 2),
    EndsWith: mFn('Text.EndsWith', (args) => toText(args[0]).endsWith(toText(args[1])), 2),
    Contains: mFn('Text.Contains', (args) => toText(args[0]).includes(toText(args[1])), 2),
    Replace: mFn('Text.Replace', (args) => toText(args[0]).split(toText(args[1])).join(toText(args[2])), 3),
    From: mFn('Text.From', (args) => toText(args[0]), 1),
  });

  // --- Number ---
  envDefine(env, 'Number', {
    Abs: mFn('Number.Abs', (args) => Math.abs(Number(args[0])), 1),
    Round: mFn('Number.Round', (args) => {
      const v = Number(args[0]);
      const digits = args[1] !== undefined ? Number(args[1]) : 0;
      const p = 10 ** digits;
      return Math.round(v * p) / p;
    }, 2),
    IntegerDivide: mFn('Number.IntegerDivide', (args) => {
      const a = Number(args[0]);
      const b = Number(args[1]);
      if (b === 0) throw new MError('Division by zero');
      return Math.trunc(a / b);
    }, 2),
    Mod: mFn('Number.Mod', (args) => {
      const a = Number(args[0]);
      const b = Number(args[1]);
      if (b === 0) throw new MError('Division by zero');
      return a % b;
    }, 2),
    From: mFn('Number.From', (args) => {
      const v = args[0];
      if (typeof v === 'number') return v;
      const n = Number(v);
      if (Number.isNaN(n)) throw new MError('Cannot convert value to number');
      return n;
    }, 1),
  });

  // --- Record ---
  envDefine(env, 'Record', {
    Field: mFn('Record.Field', (args) => getField(args[0], String(args[1])), 2),
    FieldNames: mFn('Record.FieldNames', (args) => Object.keys(args[0] || {}), 1),
    AddField: mFn('Record.AddField', (args) => ({
      ...args[0],
      [String(args[1])]: args[2],
    }), 3),
    RemoveFields: mFn('Record.RemoveFields', (args) => {
      const drop = new Set(toNameList(args[1], 'Record.RemoveFields'));
      /** @type {Record<string, any>} */
      const o = {};
      for (const k of Object.keys(args[0] || {})) if (!drop.has(k)) o[k] = args[0][k];
      return o;
    }, 2),
  });

  // --- misc ---
  envDefine(env, 'Value', {
    Type: mFn('Value.Type', (args) => typeName(args[0]), 1),
    Is: mFn('Value.Is', (args) => typeName(args[0]) === String(args[1]), 2),
    ReplaceType: mFn('Value.ReplaceType', (args) => {
      const v = args[0];
      const t = args[1];
      if (isTable(v)) return { ...v, __mtype: 'table', declaredType: t };
      return v;
    }, 2),
    NativeToText: mFn('Value.NativeToText', (args) => toText(args[0]), 1),
  });

  // --- JoinKind / Order markers (first-class M enums) ---
  envDefine(env, 'JoinKind', {
    Inner: 'JoinKind.Inner',
    LeftOuter: 'JoinKind.LeftOuter',
    RightOuter: 'JoinKind.RightOuter',
    FullOuter: 'JoinKind.FullOuter',
    LeftAnti: 'JoinKind.LeftAnti',
    RightAnti: 'JoinKind.RightAnti',
  });

  envDefine(env, 'JoinAlgorithm', {
    Dynamic: 'JoinAlgorithm.Dynamic',
    Hash: 'JoinAlgorithm.Hash',
  });

  // --- Date / Time / Duration ---
  envDefine(env, 'Date', {
    From: mFn('Date.From', (args) => coerceToDate(args[0]), 1),
    Year: mFn('Date.Year', (args) => coerceToDate(args[0]).y, 1),
    Month: mFn('Date.Month', (args) => coerceToDate(args[0]).m, 1),
    Day: mFn('Date.Day', (args) => coerceToDate(args[0]).d, 1),
    AddDays: mFn('Date.AddDays', (args) => addDays(coerceToDate(args[0]), Number(args[1])), 2),
    AddMonths: mFn('Date.AddMonths', (args) => addMonths(coerceToDate(args[0]), Number(args[1])), 2),
    AddYears: mFn('Date.AddYears', (args) => addYears(coerceToDate(args[0]), Number(args[1])), 2),
    SubtractDays: mFn('Date.SubtractDays', (args) => addDays(coerceToDate(args[0]), -Number(args[1])), 2),
    StartOfMonth: mFn('Date.StartOfMonth', (args) => {
      const d = coerceToDate(args[0]);
      return makeDate(d.y, d.m, 1);
    }, 1),
    EndOfMonth: mFn('Date.EndOfMonth', (args) => {
      const d = coerceToDate(args[0]);
      return makeDate(d.y, d.m, daysInMonth(d.y, d.m));
    }, 1),
    StartOfWeek: mFn('Date.StartOfWeek', (args) => {
      const d = coerceToDate(args[0]);
      const dow = dayOfWeek(d); // 0=Sun in our approx? use Mon=0 style Power Query StartOfWeek default Sunday
      return addDays(d, -dow);
    }, 1),
    ToText: mFn('Date.ToText', (args) => {
      const d = coerceToDate(args[0]);
      return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    }, 1),
  });

  envDefine(env, 'DateTime', {
    From: mFn('DateTime.From', (args) => coerceToDate(args[0]), 1),
    Date: mFn('DateTime.Date', (args) => coerceToDate(args[0]), 1),
  });

  envDefine(env, 'Duration', {
    From: mFn('Duration.From', (args) => {
      const v = args[0];
      if (typeof v === 'number') return tagged('duration', { days: v });
      throw new MError('Duration.From expects days as number');
    }, 1),
    Days: mFn('Duration.Days', (args) => {
      const v = args[0];
      return v && v.__mtype === 'duration' ? v.days : Number(v);
    }, 1),
    TotalDays: mFn('Duration.TotalDays', (args) => {
      const v = args[0];
      return v && v.__mtype === 'duration' ? v.days : Number(v);
    }, 1),
  });

  // --- richer Text / Number conversions ---
  Object.assign(envLookup(env, 'Text'), {
    FromNumber: mFn('Text.FromNumber', (args) => String(Number(args[0])), 1),
    FromDate: mFn('Text.FromDate', (args) => {
      const d = coerceToDate(args[0]);
      return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    }, 1),
    PadStart: mFn('Text.PadStart', (args) => {
      const s = toText(args[0]);
      const n = Number(args[1]);
      const pad = args[2] !== undefined ? toText(args[2]) : ' ';
      return s.padStart(n, pad);
    }, 3),
    PadEnd: mFn('Text.PadEnd', (args) => {
      const s = toText(args[0]);
      const n = Number(args[1]);
      const pad = args[2] !== undefined ? toText(args[2]) : ' ';
      return s.padEnd(n, pad);
    }, 3),
    Sub: mFn('Text.Sub', (args) => toText(args[0]).substr(Number(args[1]), args[2] !== undefined ? Number(args[2]) : undefined), 3),
    Repeat: mFn('Text.Repeat', (args) => toText(args[0]).repeat(Number(args[1])), 2),
    Reverse: mFn('Text.Reverse', (args) => [...toText(args[0])].reverse().join(''), 1),
  });

  Object.assign(envLookup(env, 'Number'), {
    FromText: mFn('Number.FromText', (args) => {
      const n = Number(String(args[0]).replace(/,/g, ''));
      if (Number.isNaN(n)) throw new MError(`Cannot convert '${args[0]}' to number`);
      return n;
    }, 1),
    IsNaN: mFn('Number.IsNaN', (args) => Number.isNaN(Number(args[0])), 1),
  });

  // --- List depth ---
  Object.assign(envLookup(env, 'List'), {
    Accumulate: mFn('List.Accumulate', (args) => {
      const xs = args[0];
      if (!isList(xs)) throw new MError('List.Accumulate expects a list');
      const seed = args[1];
      const fn = args[2];
      return xs.reduce((acc, x) => applyFunction(fn, [acc, x]), seed);
    }, 3),
    Generate: mFn('List.Generate', (args) => {
      const initial = args[0];
      const cond = args[1];
      const next = args[2];
      const selector = args[3] || ((x) => x);
      const out = [];
      let state = typeof initial === 'function' ? applyFunction(initial, []) : initial;
      let guard = 0;
      while (truthy(applyFunction(cond, [state]))) {
        out.push(applyFunction(selector, [state]));
        state = applyFunction(next, [state]);
        guard += 1;
        if (guard > 10000) throw new MError('List.Generate exceeded 10000 iterations');
      }
      return out;
    }, 4),
    Zip: mFn('List.Zip', (args) => {
      const lists = args[0];
      if (!isList(lists)) throw new MError('List.Zip expects a list of lists');
      const width = Math.max(0, ...lists.map((l) => (isList(l) ? l.length : 0)));
      const out = [];
      for (let i = 0; i < width; i += 1) {
        out.push(lists.map((l) => (isList(l) ? (i < l.length ? l[i] : null) : null)));
      }
      return out;
    }, 1),
    Reverse: mFn('List.Reverse', (args) => {
      const xs = args[0];
      if (!isList(xs)) throw new MError('List.Reverse expects a list');
      return [...xs].reverse();
    }, 1),
    Repeat: mFn('List.Repeat', (args) => {
      const xs = args[0];
      const n = Number(args[1]);
      const out = [];
      for (let i = 0; i < n; i += 1) out.push(...xs);
      return out;
    }, 2),
    Union: mFn('List.Union', (args) => {
      const lists = args[0];
      const out = [];
      const seen = new Set();
      for (const xs of lists) {
        for (const x of xs) {
          const k = JSON.stringify(x ?? null);
          if (seen.has(k)) continue;
          seen.add(k);
          out.push(x);
        }
      }
      return out;
    }, 1),
    Difference: mFn('List.Difference', (args) => {
      const xs = args[0];
      const ys = new Set(args[1].map((y) => JSON.stringify(y ?? null)));
      return xs.filter((x) => !ys.has(JSON.stringify(x ?? null)));
    }, 2),
    Positions: mFn('List.Positions', (args) => {
      const xs = args[0];
      return xs.map((_, i) => i);
    }, 1),
    Numbers: mFn('List.Numbers', (args) => {
      const start = Number(args[0]);
      const count = Number(args[1]);
      const step = args[2] !== undefined ? Number(args[2]) : 1;
      const out = [];
      for (let i = 0; i < count; i += 1) out.push(start + i * step);
      return out;
    }, 3),
    Intersperse: mFn('List.Intersperse', (args) => {
      const xs = args[0];
      const sep = args[1];
      const out = [];
      xs.forEach((x, i) => {
        if (i > 0) out.push(sep);
        out.push(x);
      });
      return out;
    }, 2),
    Buffer: mFn('List.Buffer', (args) => args[0], 1),
    Average: mFn('List.Average', (args) => {
      const xs = toNumberList(args[0], 'List.Average');
      if (xs.length === 0) throw new MError('List.Average of empty list');
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    }, 1),
  });

  // --- Record depth ---
  Object.assign(envLookup(env, 'Record'), {
    ToList: mFn('Record.ToList', (args) => {
      const r = args[0];
      return Object.keys(r || {}).map((k) => r[k]);
    }, 1),
    FromList: mFn('Record.FromList', (args) => {
      const xs = args[0];
      const fields = args[1];
      if (!isList(xs)) throw new MError('Record.FromList expects a list');
      if (fields === undefined) {
        /** @type {Record<string, any>} */
        const o = {};
        xs.forEach((x, i) => {
          o[`Field${i + 1}`] = x;
        });
        return o;
      }
      /** @type {Record<string, any>} */
      const o = {};
      toNameList(fields, 'Record.FromList').forEach((name, i) => {
        o[name] = xs[i];
      });
      return o;
    }, 2),
    SelectFields: mFn('Record.SelectFields', (args) => {
      const keys = toNameList(args[1], 'Record.SelectFields');
      /** @type {Record<string, any>} */
      const o = {};
      for (const k of keys) o[k] = args[0][k];
      return o;
    }, 2),
    Combine: mFn('Record.Combine', (args) => {
      /** @type {Record<string, any>} */
      const o = {};
      for (const r of args[0]) Object.assign(o, r);
      return o;
    }, 1),
  });

  // --- Table shaping / types / joins (critical curriculum) ---
  tableNs.TransformColumnTypes = mFn('Table.TransformColumnTypes', (args) => {
    const t = expectTable(args[0], 'Table.TransformColumnTypes');
    const specs = args[1];
    const culture = args[2];
    if (!isList(specs)) throw new MError('Table.TransformColumnTypes expects a list of {col, type}');
    /** @type {Record<string, any>} */
    const typeMap = {};
    for (const spec of specs) {
      typeMap[String(spec[0])] = spec[1];
    }
    const columns = t.columns.map((c) =>
      typeMap[c.name] ? { ...c, type: typeLabel(typeMap[c.name]) } : c
    );
    const rows = t.rows.map((r) => {
      /** @type {Record<string, any>} */
      const o = { ...r };
      for (const [col, ty] of Object.entries(typeMap)) {
        o[col] = coerceToType(o[col], ty);
      }
      return o;
    });
    return { __mtype: 'table', columns, rows };
  }, 3);

  tableNs.Unpivot = mFn('Table.Unpivot', (args) => {
    const t = expectTable(args[0], 'Table.Unpivot');
    const valueCols = toNameList(args[1], 'Table.Unpivot');
    const attrCol = String(args[2] ?? 'Attribute');
    const valCol = String(args[3] ?? 'Value');
    const pivotSet = new Set(valueCols);
    const idCols = t.columns.map((c) => c.name).filter((n) => !pivotSet.has(n));
    const rows = [];
    for (const r of t.rows) {
      for (const vc of valueCols) {
        /** @type {Record<string, any>} */
        const o = {};
        for (const id of idCols) o[id] = r[id];
        o[attrCol] = vc;
        o[valCol] = r[vc];
        rows.push(o);
      }
    }
    return makeTable([...idCols, attrCol, valCol], rows);
  }, 4);

  tableNs.UnpivotOtherColumns = mFn('Table.UnpivotOtherColumns', (args) => {
    const t = expectTable(args[0], 'Table.UnpivotOtherColumns');
    const idCols = toNameList(args[1], 'Table.UnpivotOtherColumns');
    const idSet = new Set(idCols);
    const valueCols = t.columns.map((c) => c.name).filter((n) => !idSet.has(n));
    return applyFunction(tableNs.Unpivot, [t, valueCols, String(args[2] ?? 'Attribute'), String(args[3] ?? 'Value')]);
  }, 4);

  tableNs.Pivot = mFn('Table.Pivot', (args) => {
    const t = expectTable(args[0], 'Table.Pivot');
    const attrValues = toNameList(args[1], 'Table.Pivot');
    const attrCol = String(args[2] ?? 'Attribute');
    const valCol = String(args[3] ?? 'Value');
    const idCols = t.columns.map((c) => c.name).filter((n) => n !== attrCol && n !== valCol);
    /** @type {Map<string, Record<string, any>>} */
    const groups = new Map();
    for (const r of t.rows) {
      const key = JSON.stringify(idCols.map((c) => r[c]));
      if (!groups.has(key)) {
        /** @type {Record<string, any>} */
        const o = {};
        for (const c of idCols) o[c] = r[c];
        groups.set(key, o);
      }
      const g = groups.get(key);
      const colName = String(r[attrCol]);
      if (attrValues.length === 0 || attrValues.includes(colName)) {
        g[colName] = r[valCol];
      }
    }
    const pivotNames = attrValues.length
      ? attrValues
      : [...new Set(t.rows.map((r) => String(r[attrCol])))];
    return makeTable([...idCols, ...pivotNames], [...groups.values()]);
  }, 4);

  tableNs.FillDown = mFn('Table.FillDown', (args) => {
    const t = expectTable(args[0], 'Table.FillDown');
    const cols = args[1] === undefined ? t.columns.map((c) => c.name) : toNameList(args[1], 'Table.FillDown');
    /** @type {Record<string, any>} */
    const last = {};
    const rows = t.rows.map((r) => {
      const o = { ...r };
      for (const c of cols) {
        if (o[c] === null || o[c] === undefined) o[c] = last[c] ?? null;
        else last[c] = o[c];
      }
      return o;
    });
    return { ...t, rows };
  }, 2);

  tableNs.FillUp = mFn('Table.FillUp', (args) => {
    const t = expectTable(args[0], 'Table.FillUp');
    const cols = args[1] === undefined ? t.columns.map((c) => c.name) : toNameList(args[1], 'Table.FillUp');
    /** @type {Record<string, any>} */
    const last = {};
    for (let i = t.rows.length - 1; i >= 0; i -= 1) {
      const r = t.rows[i];
      for (const c of cols) {
        if (r[c] === null || r[c] === undefined) r[c] = last[c] ?? null;
        else last[c] = r[c];
      }
    }
    return { ...t, rows: t.rows.map((r) => ({ ...r })) };
  }, 2);

  tableNs.Transpose = mFn('Table.Transpose', (args) => {
    const t = expectTable(args[0], 'Table.Transpose');
    const matrix = t.rows.map((r) => t.columns.map((c) => r[c.name]));
    const width = Math.max(0, ...matrix.map((row) => row.length));
    /** @type {any[][]} */
    const out = [];
    for (let c = 0; c < width; c += 1) {
      out.push(matrix.map((row) => (row[c] === undefined ? null : row[c])));
    }
    return makeTable(out.map((_, i) => `Column${i + 1}`), out);
  }, 1);

  tableNs.DemoteHeaders = mFn('Table.DemoteHeaders', (args) => {
    const t = expectTable(args[0], 'Table.DemoteHeaders');
    const headerRow = t.columns.map((c) => c.name);
    const rows = [headerRow, ...t.rows.map((r) => t.columns.map((c) => r[c.name]))];
    return makeTable(t.columns.map((_, i) => `Column${i + 1}`), rows);
  }, 1);

  tableNs.PromoteHeaders = mFn('Table.PromoteHeaders', (args) => {
    const t = expectTable(args[0], 'Table.PromoteHeaders');
    if (t.rows.length === 0) return t;
    const first = t.rows[0];
    const names = t.columns.map((c) => first[c.name]);
    const rest = t.rows.slice(1).map((r) => {
      /** @type {Record<string, any>} */
      const o = {};
      t.columns.forEach((c, i) => {
        o[String(names[i])] = r[c.name];
      });
      return o;
    });
    return makeTable(names.map((n) => String(n)), rest);
  }, 1);

  tableNs.AddIndexColumn = mFn('Table.AddIndexColumn', (args) => {
    const t = expectTable(args[0], 'Table.AddIndexColumn');
    const name = String(args[1]);
    const start = args[2] !== undefined ? Number(args[2]) : 0;
    const step = args[3] !== undefined ? Number(args[3]) : 1;
    const rows = t.rows.map((r, i) => ({ ...r, [name]: start + i * step }));
    return { __mtype: 'table', columns: [...t.columns, { name, type: 'number' }], rows };
  }, 4);

  tableNs.DuplicateColumn = mFn('Table.DuplicateColumn', (args) => {
    const t = expectTable(args[0], 'Table.DuplicateColumn');
    const src = String(args[1]);
    const newName = String(args[2]);
    const rows = t.rows.map((r) => ({ ...r, [newName]: r[src] }));
    return { __mtype: 'table', columns: [...t.columns, { name: newName, type: 'any' }], rows };
  }, 3);

  tableNs.CombineColumns = mFn('Table.CombineColumns', (args) => {
    const t = expectTable(args[0], 'Table.CombineColumns');
    const cols = toNameList(args[1], 'Table.CombineColumns');
    const combo = args[2];
    const outName = String(args[3] ?? 'Combined');
    const sep = combo && typeof combo === 'object' && 'Separator' in combo ? toText(combo.Separator) : ', ';
    const combiner = combo && typeof combo === 'object' && typeof combo.Combiner === 'function'
      ? combo.Combiner
      : null;
    const drop = new Set(cols);
    const rows = t.rows.map((r) => {
      const parts = cols.map((c) => toText(r[c]));
      /** @type {Record<string, any>} */
      const o = {};
      for (const c of t.columns) if (!drop.has(c.name)) o[c.name] = r[c.name];
      o[outName] = combiner ? applyFunction(combiner, [parts]) : parts.join(sep);
      return o;
    });
    const columns = t.columns.filter((c) => !drop.has(c.name)).map((c) => ({ ...c }));
    columns.push({ name: outName, type: 'text' });
    return { __mtype: 'table', columns, rows };
  }, 4);

  tableNs.ReorderColumns = mFn('Table.ReorderColumns', (args) => {
    const t = expectTable(args[0], 'Table.ReorderColumns');
    const order = toNameList(args[1], 'Table.ReorderColumns');
    const remaining = t.columns.map((c) => c.name).filter((n) => !order.includes(n));
    const names = [...order, ...remaining];
    return makeTable(names, t.rows);
  }, 2);

  tableNs.SplitColumn = mFn('Table.SplitColumn', (args) => {
    const t = expectTable(args[0], 'Table.SplitColumn');
    const col = String(args[1]);
    const splitter = args[2];
    /** @type {(s: string) => any[]} */
    let splitFn;
    if (typeof splitter === 'string') {
      const delim = splitter;
      splitFn = (s) => s.split(delim);
    } else if (typeof splitter === 'function') {
      if (splitter.__delimiter !== undefined) {
        const delim = splitter.__delimiter;
        splitFn = (s) => s.split(delim);
      } else {
        splitFn = (s) => {
          const out = applyFunction(splitter, [s]);
          return isList(out) ? out : [out];
        };
      }
    } else if (isRecord(splitter) && splitter.Delimiter !== undefined) {
      const delim = toText(splitter.Delimiter);
      splitFn = (s) => s.split(delim);
    } else {
      throw new MError('Table.SplitColumn splitter not recognized');
    }
    const outNames = toNameList(args[3], 'Table.SplitColumn');
    const drop = new Set([col]);
    const rows = t.rows.map((r) => {
      const parts = splitFn(toText(r[col] ?? ''));
      /** @type {Record<string, any>} */
      const o = {};
      for (const c of t.columns) if (!drop.has(c.name)) o[c.name] = r[c.name];
      outNames.forEach((n, i) => {
        o[n] = i < parts.length ? parts[i] : null;
      });
      return o;
    });
    const columns = t.columns.filter((c) => !drop.has(c.name)).map((c) => ({ ...c }));
    for (const n of outNames) columns.push({ name: n, type: 'text' });
    return { __mtype: 'table', columns, rows };
  }, 4);

  tableNs.Buffer = mFn('Table.Buffer', (args) => {
    const t = expectTable(args[0], 'Table.Buffer');
    return { ...t, __buffered: true };
  }, 1);

  tableNs.ExpandRecordColumn = mFn('Table.ExpandRecordColumn', (args) => {
    const t = expectTable(args[0], 'Table.ExpandRecordColumn');
    const col = String(args[1]);
    const fields = toNameList(args[2], 'Table.ExpandRecordColumn');
    const rows = t.rows.map((r) => {
      const inner = r[col] || {};
      /** @type {Record<string, any>} */
      const o = {};
      for (const k of Object.keys(r)) if (k !== col) o[k] = r[k];
      for (const f of fields) o[f] = inner[f];
      return o;
    });
    const names = t.columns.filter((c) => c.name !== col).map((c) => c.name).concat(fields);
    return makeTable(names, rows);
  }, 3);

  tableNs.NestedJoin = mFn('Table.NestedJoin', (args) => {
    const t1 = expectTable(args[0], 'Table.NestedJoin');
    const k1 = toNameList(args[1], 'Table.NestedJoin');
    const t2 = expectTable(args[2], 'Table.NestedJoin');
    const k2 = toNameList(args[3], 'Table.NestedJoin');
    const newName = String(args[4] ?? 'Join');
    const kind = String(args[5] ?? 'JoinKind.Inner');
    const matched = innerJoinRows(t1, k1, t2, k2, kind);
    const rows = t1.rows.map((r1, idx) => {
      const innerRows = matched[idx];
      return {
        ...r1,
        [newName]: {
          __mtype: 'table',
          columns: t2.columns,
          rows: innerRows,
        },
      };
    });
    return {
      __mtype: 'table',
      columns: [...t1.columns, { name: newName, type: 'table' }],
      rows,
    };
  }, 6);

  tableNs.Join = mFn('Table.Join', (args) => {
    const t1 = expectTable(args[0], 'Table.Join');
    const k1 = toNameList(args[1], 'Table.Join');
    const t2 = expectTable(args[2], 'Table.Join');
    const k2 = args[3] !== undefined ? toNameList(args[3], 'Table.Join') : k1;
    const kind = String(args[4] ?? 'JoinKind.Inner');
    return flattenJoin(t1, k1, t2, k2, kind);
  }, 5);

  tableNs.Append = mFn('Table.Append', (args) => {
    const t = expectTable(args[0], 'Table.Append');
    const list = args[1];
    const tables = [t, ...list.map((x) => expectTable(x, 'Table.Append'))];
    return applyFunction(tableNs.Combine, [tables]);
  }, 2);

  tableNs.First = mFn('Table.First', (args) => {
    const t = expectTable(args[0], 'Table.First');
    return t.rows[0] ?? null;
  }, 1);

  tableNs.Last = mFn('Table.Last', (args) => {
    const t = expectTable(args[0], 'Table.Last');
    return t.rows.length ? t.rows[t.rows.length - 1] : null;
  }, 1);

  tableNs.Range = mFn('Table.Range', (args) => {
    const t = expectTable(args[0], 'Table.Range');
    const offset = Number(args[1]);
    const count = args[2] !== undefined ? Number(args[2]) : undefined;
    return { ...t, rows: t.rows.slice(offset, count === undefined ? undefined : offset + count) };
  }, 3);

  tableNs.Schema = mFn('Table.Schema', (args) => {
    const t = expectTable(args[0], 'Table.Schema');
    return makeTable(['Name', 'Type'], t.columns.map((c) => [c.name, c.type || 'any']));
  }, 1);

  tableNs.ReplaceRows = mFn('Table.ReplaceRows', (args) => {
    const t = expectTable(args[0], 'Table.ReplaceRows');
    const offset = Number(args[1]);
    const count = Number(args[2]);
    const newRows = args[3];
    const rows = [...t.rows];
    rows.splice(offset, count, ...newRows);
    return { ...t, rows };
  }, 4);

  // Splitter factory used in Table.SplitColumn lessons
  envDefine(env, 'Splitter', {
    SplitTextByDelimiter: mFn('Splitter.SplitTextByDelimiter', (args) => {
      const delim = toText(args[0]);
      const fn = mFn('splitter', (a) => toText(a[0] ?? '').split(delim), 1);
      fn.__delimiter = delim;
      return fn;
    }, 1),
    SplitTextByPositions: mFn('Splitter.SplitTextByPositions', (args) => {
      const positions = args[0];
      const fn = mFn('splitter', (a) => {
        const s = toText(a[0] ?? '');
        const out = [];
        let prev = 0;
        for (const p of positions) {
          out.push(s.slice(prev, p));
          prev = p;
        }
        out.push(s.slice(prev));
        return out;
      }, 1);
      return fn;
    }, 1),
  });

  // Combiner for Table.CombineColumns
  envDefine(env, 'Combiner', {
    CombineTextByDelimiter: mFn('Combiner.CombineTextByDelimiter', (args) => {
      const delim = toText(args[0]);
      return mFn('combiner', (a) => {
        const xs = a[0];
        return isList(xs) ? xs.map(toText).join(delim) : toText(xs);
      }, 1);
    }, 1),
  });

  // --- Connectors (simulated sources for teaching) ---
  const workbookTables = sampleDatasets();

  envDefine(env, 'Excel', {
    CurrentWorkbook: mFn('Excel.CurrentWorkbook', () => {
      const rows = Object.entries(workbookTables).map(([name, table]) => ({
        Name: name,
        Content: table,
        Item: name,
        Kind: 'Table',
      }));
      return makeTable(['Name', 'Content', 'Item', 'Kind'], rows);
    }, 0),
  });

  envDefine(env, 'Csv', {
    Document: mFn('Csv.Document', (args) => {
      const text = toText(args[0]);
      const opts = args[1] || {};
      const delim = isRecord(opts) && opts.Delimiter !== undefined ? toText(opts.Delimiter) : ',';
      const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
      if (lines.length === 0) return makeTable([], []);
      const headers = splitCsvLine(lines[0], delim);
      const rows = lines.slice(1).map((l) => splitCsvLine(l, delim));
      return makeTable(headers, rows);
    }, 2),
  });

  envDefine(env, 'Json', {
    Document: mFn('Json.Document', (args) => {
      const text = toText(args[0]);
      try {
        return JSON.parse(text);
      } catch {
        throw new MError('Invalid JSON text');
      }
    }, 1),
  });

  envDefine(env, 'Web', {
    Contents: mFn('Web.Contents', (args) => {
      const url = toText(args[0]);
      return tagged('binary', { url, note: 'simulated; no network in learn-m' });
    }, 1),
  });

  envDefine(env, 'Binary', {
    FromText: mFn('Binary.FromText', (args) => tagged('binary', { text: toText(args[0]) }), 1),
    ToText: mFn('Binary.ToText', (args) => (args[0] && args[0].text) || '', 1),
  });

  return env;
}

/**
 * Split one CSV line (handles quoted fields).
 *
 * @param {string} line
 * @param {string} delim
 * @returns {any[]}
 */
function splitCsvLine(line, delim) {
  /** @type {any[]} */
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (line.startsWith(delim, i)) {
      out.push(parseCsvValue(cur));
      cur = '';
      i += delim.length - 1;
      continue;
    }
    cur += ch;
  }
  out.push(parseCsvValue(cur));
  return out;
}

/**
 * @param {string} raw
 */
function parseCsvValue(raw) {
  const s = raw.trim();
  if (s === '' || s.toLowerCase() === 'null') return null;
  if (s.toLowerCase() === 'true') return true;
  if (s.toLowerCase() === 'false') return false;
  if (/[0-9]/.test(s) && !Number.isNaN(Number(s)) && !/^0\d/.test(s)) return Number(s);
  return raw;
}

/**
 * @param {any} v
 */
function coerceToDate(v) {
  if (isDate(v)) return v;
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (m) return makeDate(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  throw new MError(`Cannot convert ${typeName(v)} to date`);
}

/**
 * @param {number} y
 * @param {number} m
 */
function daysInMonth(y, m) {
  return [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] || 31;
}

/**
 * @param {{y:number,m:number,d:number}} date
 * @param {number} n
 */
function addDays(date, n) {
  const base = Date.UTC(date.y, date.m - 1, date.d);
  const dt = new Date(base + n * 86400000);
  return makeDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * @param {{y:number,m:number,d:number}} date
 * @param {number} n
 */
function addMonths(date, n) {
  const total = date.y * 12 + (date.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return makeDate(y, m, Math.min(date.d, daysInMonth(y, m)));
}

/**
 * @param {{y:number,m:number,d:number}} date
 * @param {number} n
 */
function addYears(date, n) {
  return addMonths(date, n * 12);
}

/**
 * Monday=0 … Sunday=6 (Power Query Date.StartOfWeek default is Sunday; approximate)
 * @param {{y:number,m:number,d:number}} date
 */
function dayOfWeek(date) {
  const js = new Date(Date.UTC(date.y, date.m - 1, date.d));
  return js.getUTCDay(); // 0=Sun
}

/**
 * @param {any} t
 * @returns {string}
 */
function typeLabel(t) {
  if (!t) return 'any';
  if (t.__mtype === 'type') return typeLabel(t.type);
  if (t.kind === 'primitive') return t.name;
  if (t.kind === 'nullable') return `nullable ${typeLabel(t.inner)}`;
  if (t.kind === 'list') return `list ${typeLabel(t.inner)}`;
  if (t.kind === 'table') return 'table';
  if (t.kind === 'record') return 'record';
  return 'any';
}

/**
 * Coerce a value to a declared type (teaching subset).
 *
 * @param {any} v
 * @param {any} t
 */
function coerceToType(v, t) {
  const label = typeLabel(t);
  if (v === null || v === undefined) {
    if (label.startsWith('nullable') || label === 'any') return null;
    throw new MError(`Cannot convert null to ${label}`);
  }
  if (label === 'any') return v;
  if (label === 'number' || label === 'number') return typeof v === 'number' ? v : Number(v);
  if (label === 'text') return toText(v);
  if (label === 'logical') return truthy(v) ? v === true || v === 'true' || v === 1 : false;
  if (label === 'date') return coerceToDate(v);
  if (label.startsWith('nullable')) {
    return v === null ? null : coerceToType(v, t.inner || { kind: 'primitive', name: label.replace('nullable ', '') });
  }
  return v;
}

/**
 * @param {any} t1
 * @param {string[]} k1
 * @param {any} t2
 * @param {string[]} k2
 * @param {string} kind
 */
function innerJoinRows(t1, k1, t2, k2, kind) {
  return t1.rows.map((r1) => {
    const hits = t2.rows.filter((r2) => k1.every((c, i) => mEquals(r1[c], r2[k2[i]])));
    return hits;
  });
}

/**
 * @param {any} t1
 * @param {string[]} k1
 * @param {any} t2
 * @param {string[]} k2
 * @param {string} kind
 */
function flattenJoin(t1, k1, t2, k2, kind) {
  const k = kind;
  const rows = [];
  const usedT2 = new Set();
  for (const r1 of t1.rows) {
    const hits = [];
    t2.rows.forEach((r2, i) => {
      if (k1.every((c, i2) => mEquals(r1[c], r2[k2[i2]]))) {
        hits.push(r2);
        usedT2.add(i);
      }
    });
    if (hits.length === 0) {
      if (k === 'JoinKind.Inner') continue;
      if (k === 'JoinKind.LeftAnti') {
        rows.push({ ...r1 });
        continue;
      }
      if (k === 'JoinKind.LeftOuter' || k === 'JoinKind.FullOuter' || k === 'JoinKind.RightOuter') {
        /** @type {Record<string, any>} */
        const o = {};
        for (const c of t2.columns) o[c.name] = null;
        rows.push({ ...o, ...r1 });
        continue;
      }
    } else {
      if (k === 'JoinKind.LeftAnti' || k === 'JoinKind.RightAnti') continue;
      for (const r2 of hits) {
        /** @type {Record<string, any>} */
        const o = {};
        for (const c of t2.columns) if (!(c.name in r1)) o[c.name] = r2[c.name];
        // t2 keys may collide; prefer t1 values for key cols
        rows.push({ ...r2, ...r1, ...o });
      }
    }
  }
  if (k === 'JoinKind.RightOuter' || k === 'JoinKind.RightAnti' || k === 'JoinKind.FullOuter') {
    t2.rows.forEach((r2, i) => {
      if (usedT2.has(i)) return;
      if (k === 'JoinKind.RightAnti') {
        rows.push({ ...r2 });
        return;
      }
      if (k === 'JoinKind.RightOuter' || k === 'JoinKind.FullOuter') {
        /** @type {Record<string, any>} */
        const o = {};
        for (const c of t1.columns) o[c.name] = null;
        rows.push({ ...o, ...r2 });
      }
    });
  }
  const names = [];
  const seen = new Set();
  for (const c of t2.columns) {
    if (!seen.has(c.name)) {
      seen.add(c.name);
      names.push(c.name);
    }
  }
  for (const c of t1.columns) {
    if (!seen.has(c.name)) {
      seen.add(c.name);
      names.push(c.name);
    }
  }
  // For inner/left, prefer t1 col order first
  if (k === 'JoinKind.Inner' || k === 'JoinKind.LeftOuter' || k === 'JoinKind.LeftAnti') {
    names.length = 0;
    seen.clear();
    for (const c of t1.columns) {
      seen.add(c.name);
      names.push(c.name);
    }
    for (const c of t2.columns) {
      if (!seen.has(c.name)) {
        seen.add(c.name);
        names.push(c.name);
      }
    }
  }
  return makeTable(names, rows);
}

/**
 * @param {any} v
 * @param {string} fnName
 */
function expectTable(v, fnName) {
  if (!isTable(v)) throw new MError(`${fnName} expects a table, got ${typeName(v)}`);
  return v;
}

/**
 * @param {any} v
 * @param {string} fnName
 */
function toNameList(v, fnName) {
  if (typeof v === 'string') return [v];
  if (isList(v)) return v.map((x) => String(x));
  throw new MError(`${fnName} expects a column name or list of names`);
}

/**
 * @param {any} v
 * @param {string} fnName
 */
function toNumberList(v, fnName) {
  if (!isList(v)) throw new MError(`${fnName} expects a list`);
  return v.map((x) => {
    if (typeof x !== 'number') throw new MError(`${fnName} expects numbers`);
    return x;
  });
}

/**
 * @param {any} a
 * @param {any} b
 */
function compareForSort(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  const sa = toText(a);
  const sb = toText(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Sample datasets
// ---------------------------------------------------------------------------

export function sampleDatasets() {
  return {
    Sales: makeTable(
      ['Date', 'Region', 'Product', 'Qty', 'Price'],
      [
        [makeDate(2024, 1, 5), 'West', 'Widget', 10, 9.5],
        [makeDate(2024, 1, 8), 'East', 'Gadget', 4, 25],
        [makeDate(2024, 2, 2), 'West', 'Gadget', 7, 25],
        [makeDate(2024, 2, 11), 'North', 'Widget', 3, 9.5],
        [makeDate(2024, 3, 1), 'East', 'Widget', 12, 9.5],
        [makeDate(2024, 3, 15), 'West', 'Doohickey', 5, 40],
        [makeDate(2024, 3, 20), 'North', 'Gadget', 8, 25],
        [makeDate(2024, 4, 2), 'East', 'Doohickey', 2, 40],
      ]
    ),
    Employees: makeTable(
      ['Name', 'Dept', 'Salary'],
      [
        ['Ada', 'R&D', 92000],
        ['Grace', 'R&D', 98000],
        ['Edsger', 'Ops', 87000],
        ['Barbara', 'Ops', 91000],
        ['Alan', 'R&D', 105000],
        ['Donald', 'Sales', 76000],
        ['Radia', 'Ops', 99000],
      ]
    ),
    Orders: makeTable(
      ['OrderId', 'Customer', 'Amount', 'Status'],
      [
        [1001, 'Acme', 250, 'Open'],
        [1002, 'Globex', 480, 'Closed'],
        [1003, 'Acme', 120, 'Open'],
        [1004, 'Initech', 910, 'Closed'],
        [1005, 'Globex', 35, 'Open'],
        [1006, 'Umbrella', 640, 'Closed'],
      ]
    ),
  };
}

/**
 * Evaluate an M expression source string.
 *
 * @param {string} src
 * @param {Env} env
 * @returns {any}
 */
export function evalM(src, env) {
  return evaluate(parse(src), env);
}

/**
 * Try to parse `Name = expr` as a query step binding.
 *
 * @param {string} src
 * @returns {{name: string, exprSrc: string} | null}
 */
export function parseStepBinding(src) {
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith('let ')) return null;
  // match ident = expr  (not == which we don't have; single =)
  const m = /^((?:#\"[^\"]+\"|[A-Za-z_][A-Za-z0-9_.]*))\s*=\s*([\s\S]+)$/.exec(trimmed);
  if (!m) return null;
  // reject comparison-looking starts? keep simple: assignment only when left is identifier
  return { name: m[1].replace(/^#\"(.*)\"$/, '$1'), exprSrc: m[2].trim() };
}
