/**
 * learn-m engine + curriculum tests (Node).
 * Run: node tests.mjs
 */

import {
  evalM,
  createStdlib,
  sampleDatasets,
  envDefine,
  mEquals,
  parseStepBinding,
  makeTable,
  isTable,
  formatValue,
} from './m-engine.js';
import { LEVELS, MODULE_WEIGHTS } from './levels.js';

let passed = 0;
let failed = 0;

/**
 * @param {string} name
 * @param {() => void} fn
 */
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${err && err.message ? err.message : err}`);
  }
}

/**
 * @param {any} a
 * @param {any} b
 * @param {string} [msg]
 */
function assertEqual(a, b, msg = '') {
  if (!mEquals(a, b)) {
    throw new Error(`${msg} expected ${formatValue(b)}, got ${formatValue(a)}`);
  }
}

/**
 * @param {any} cond
 * @param {string} [msg]
 */
function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

function envWithData() {
  const env = createStdlib();
  const data = sampleDatasets();
  for (const [k, v] of Object.entries(data)) envDefine(env, k, v);
  return env;
}

console.log('m-engine core');

test('arithmetic and concat', () => {
  assertEqual(evalM('1 + 2 * 3', createStdlib()), 7);
  assertEqual(evalM('"a" & "b"', createStdlib()), 'ab');
});

test('list record let if', () => {
  assertEqual(evalM('{1, 2, 3}', createStdlib()), [1, 2, 3]);
  assertEqual(evalM('let x = 21, y = 2 in x * y', createStdlib()), 42);
  assertEqual(evalM('if 1 > 0 then "yes" else "no"', createStdlib()), 'yes');
});

test('#table and each', () => {
  const t = evalM(
    'Table.SelectRows(#table({"Region","Qty"}, {{"West",1},{"East",2}}), each [Region] = "West")',
    createStdlib()
  );
  assertEqual(t.rows.length, 1);
});

test('arrow functions', () => {
  assertEqual(evalM('let f = (a, b) => a * b in f(6, 7)', createStdlib()), 42);
  assertEqual(evalM('let d = x => x * 2 in List.Transform({1,2,3}, d)', createStdlib()), [2, 4, 6]);
});

test('types and TransformColumnTypes', () => {
  const env = createStdlib();
  const t = evalM(
    'Table.TransformColumnTypes(#table({"Qty"}, {{1},{2}}), {{"Qty", type text}})',
    env
  );
  assertEqual(t.rows[0].Qty, '1');
  const ty = evalM('type number', env);
  assert(ty && ty.__mtype === 'type');
  const nt = evalM('type nullable text', env);
  assert(nt && nt.__mtype === 'type');
});

test('Unpivot / Pivot', () => {
  const env = createStdlib();
  const u = evalM(
    'Table.Unpivot(#table({"Region","A","B"}, {{"West",1,2},{"East",3,4}}), {"A","B"}, "Attribute", "Value")',
    env
  );
  assertEqual(u.rows.length, 4);
  const p = evalM(
    'Table.Pivot(Table.Unpivot(#table({"Region","A","B"}, {{"West",1,2},{"East",3,4}}), {"A","B"}, "Attribute", "Value"), {"A","B"}, "Attribute", "Value")',
    env
  );
  assertEqual(p.rows.length, 2);
  assert(p.columns.some((c) => c.name === 'A'));
});

test('SplitColumn / FillDown / PromoteHeaders / Index', () => {
  const env = createStdlib();
  const s = evalM(
    'Table.SplitColumn(#table({"FullName"}, {{"Ada;Lovelace"}}), "FullName", Splitter.SplitTextByDelimiter(";"), {"First","Last"})',
    env
  );
  assertEqual(s.rows[0].First, 'Ada');
  assertEqual(s.rows[0].Last, 'Lovelace');
  const f = evalM(
    'Table.FillDown(#table({"G","I"}, {{"G1","a"},{null,"b"}}), {"G"})',
    env
  );
  assertEqual(f.rows[1].G, 'G1');
  const p = evalM('Table.PromoteHeaders(#table({"C1","C2"}, {{"A","B"},{1,2}}))', env);
  assertEqual(p.columns.map((c) => c.name).join(','), 'A,B');
  const idx = evalM('Table.AddIndexColumn(#table({"A"}, {{10}}), "Id", 1, 1)', env);
  assertEqual(idx.rows[0].Id, 1);
});

test('JoinKind Inner / LeftOuter / LeftAnti', () => {
  const env = envWithData();
  const customers =
    '#table({"Customer","City"}, {{"Acme","Tehran"},{"Globex","Berlin"},{"Initech","Austin"}})';
  const inner = evalM(`Table.Join(Orders, {"Customer"}, ${customers}, {"Customer"}, JoinKind.Inner)`, env);
  assertEqual(inner.rows.length, 5);
  const left = evalM(`Table.Join(Orders, {"Customer"}, ${customers}, {"Customer"}, JoinKind.LeftOuter)`, env);
  assertEqual(left.rows.length, 6);
  const anti = evalM(`Table.Join(Orders, {"Customer"}, ${customers}, {"Customer"}, JoinKind.LeftAnti)`, env);
  assertEqual(anti.rows.length, 1);
  assertEqual(anti.rows[0].Customer, 'Umbrella');
});

test('NestedJoin + Expand', () => {
  const env = envWithData();
  const t = evalM(
    'let Customers = #table({"Customer","City"}, {{"Acme","Tehran"}}), N = Table.NestedJoin(Orders, {"Customer"}, Customers, {"Customer"}, "Join") in Table.ExpandTableColumn(N, "Join", {"City"})',
    env
  );
  assert(t.rows.every((r) => r.Customer === 'Acme' ? r.City === 'Tehran' : true));
  assertEqual(t.rows.length, 2);
});

test('List.Accumulate / Generate / Record', () => {
  assertEqual(evalM('List.Accumulate({1,2,3,4}, 0, (acc, x) => acc + x)', createStdlib()), 10);
  assertEqual(evalM('List.Generate(() => 0, each _ < 10, each _ + 2)', createStdlib()), [0, 2, 4, 6, 8]);
  assertEqual(evalM('Record.ToList([A = 1, B = 2])', createStdlib()), [1, 2]);
});

test('Date and Text toolkit', () => {
  const d = evalM('Date.AddDays(#date(2024, 1, 1), 30)', createStdlib());
  assertEqual(d, { __mtype: 'date', y: 2024, m: 1, d: 31 });
  assertEqual(evalM('Text.Upper(Text.Trim("  ada  "))', createStdlib()), 'ADA');
  assertEqual(evalM('Number.Round(3.14159, 2)', createStdlib()), 3.14);
});

test('try / otherwise and # escapes', () => {
  assertEqual(evalM('try (1 / 0) otherwise "safe"', createStdlib()), 'safe');
  assertEqual(evalM('"a#(lf)b"', createStdlib()), 'a\nb');
});

test('Csv / Json / Excel item access', () => {
  const env = createStdlib();
  const csv = evalM('Csv.Document("A,B#(lf)1,2#(lf)3,4")', env);
  assertEqual(csv.rows.length, 2);
  assertEqual(csv.columns.map((c) => c.name).join(','), 'A,B');
  const j = evalM('Json.Document("{""a"": 1}")', env);
  assertEqual(j.a, 1);
  const sales = evalM('Excel.CurrentWorkbook(){[Name = "Sales"]}[Content]', env);
  assert(isTable(sales));
  assertEqual(sales.rows.length, 8);
});

test('Table.Buffer / Schema / Combine', () => {
  const env = envWithData();
  const b = evalM('Table.Buffer(Table.SelectRows(Sales, each [Region] = "West"))', env);
  assert(b.__buffered === true);
  const s = evalM('Table.Schema(Sales)', env);
  assertEqual(s.rows.length, 5);
  const c = evalM('Table.Combine({#table({"A"},{{1}}), #table({"A"},{{2}})})', env);
  assertEqual(c.rows.length, 2);
});

test('step binding parse', () => {
  const step = parseStepBinding('West = Table.SelectRows(Sales, each [Region] = "West")');
  assert(step && step.name === 'West');
});

console.log('curriculum');

test('module weights sum matches level count', () => {
  const sum = Object.values(MODULE_WEIGHTS).reduce((a, b) => a + b, 0);
  assertEqual(sum, LEVELS.length);
});

for (const level of LEVELS) {
  test(`level ${level.id} (${level.tab})`, () => {
    const env = createStdlib();
    const data = sampleDatasets();
    for (const [k, v] of Object.entries(data)) envDefine(env, k, v);
    if (level.startTables) {
      for (const [bindName, dataKey] of Object.entries(level.startTables)) {
        envDefine(env, bindName, data[dataKey] || data.Sales);
      }
    }
    let result = null;
    const steps = [];
    for (const line of level.solution.split('\n')) {
      const step = parseStepBinding(line.trim());
      if (step) {
        result = evalM(step.exprSrc, env);
        envDefine(env, step.name, result);
        envDefine(env, 'Prev', result);
        steps.push({ name: step.name, exprSrc: step.exprSrc, result });
      } else if (line.trim()) {
        result = evalM(line.trim(), env);
      }
    }
    const ok = level.check({ env, result, steps, source: level.solution, commands: [level.solution] });
    assert(ok, `goal not satisfied; result=${formatValue(result)}`);
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
