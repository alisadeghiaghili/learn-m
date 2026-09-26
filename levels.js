/**
 * learn-m — full curriculum aligned with Microsoft Learn M + "M is for Data Monkey".
 *
 * Modules:
 *  Orientation, Expressions, Tables, Types, Shaping, Aggregation,
 *  Joins, List/Record, Functions, Text/Number/Date, Errors,
 *  Sources, Advanced, Capstone.
 */

/**
 * @param {any} t
 * @param {string[]} cols
 */
function hasColumns(t, cols) {
  if (!t || t.__mtype !== 'table') return false;
  const names = t.columns.map((c) => c.name);
  return cols.every((c) => names.includes(c));
}

/**
 * @param {any} t
 */
function rowCount(t) {
  return t && t.__mtype === 'table' ? t.rows.length : -1;
}

/**
 * @param {any} t
 */
function colNames(t) {
  return t && t.__mtype === 'table' ? t.columns.map((c) => c.name).join(',') : '';
}

/**
 * @param {any} t
 * @param {Record<string, any>} map
 */
function rowMap(t, key, val) {
  /** @type {Record<string, any>} */
  const o = {};
  for (const r of t.rows) o[r[key]] = r[val];
  return o;
}

/** @type {import('./m-engine.js') extends never ? any : any[]} */
export const LEVELS = [
  // ======================== Orientation ========================
  {
    id: 'intro-1',
    tab: 'Orientation',
    title: 'What M is',
    blurb:
      'Power Query M is a functional, case-sensitive, mostly lazy expression language. Every Applied Step is a binding. Evaluate any expression and watch the preview.',
    goalText: 'Evaluate a simple arithmetic expression that equals 42.',
    hint: '1 + 41  ·  6 * 7  ·  50 - 8',
    solution: '6 * 7',
    par: 1,
    check: (ctx) => ctx.result === 42,
  },
  {
    id: 'intro-2',
    tab: 'Orientation',
    title: 'Applied Steps model',
    blurb:
      'Bind Name = expr to append a step. The pipeline on the left is your Applied Steps list; generated M on the bottom is what Advanced Editor would show.',
    goalText: 'Create two steps: First = 10 then Second = First + 5 (result 15).',
    hint: 'First = 10 then Second = First + 5',
    solution: 'Second = let First = 10 in First + 5',
    par: 2,
    check: (ctx) => ctx.result === 15 || (ctx.steps.length >= 1 && ctx.steps[ctx.steps.length - 1].result === 15),
  },

  // ======================== Expressions ========================
  {
    id: 'expr-1',
    tab: 'Expressions',
    title: 'Literals and operators',
    blurb: 'Numbers, text, logical, null. Arithmetic, comparison, & for text concat.',
    goalText: 'Produce the text "M" & "365" = "M365" with &.',
    hint: '"M" & "365"',
    solution: '"M" & "365"',
    par: 1,
    check: (ctx) => ctx.result === 'M365',
  },
  {
    id: 'expr-2',
    tab: 'Expressions',
    title: 'let … in bindings',
    blurb: 'let introduces immutable bindings. This is exactly how query steps are desugared.',
    goalText: 'Bind a = 20, b = 22 and return a + b.',
    hint: 'let a = 20, b = 22 in a + b',
    solution: 'let a = 20, b = 22 in a + b',
    par: 1,
    check: (ctx) => ctx.result === 42,
  },
  {
    id: 'expr-3',
    tab: 'Expressions',
    title: 'if then else',
    blurb: 'if is an expression, not a statement. Both branches must be valid expressions.',
    goalText: 'Return "adult" if age >= 18 else "minor" for age = 21.',
    hint: 'let age = 21 in if age >= 18 then "adult" else "minor"',
    solution: 'let age = 21 in if age >= 18 then "adult" else "minor"',
    par: 1,
    check: (ctx) => ctx.result === 'adult',
  },
  {
    id: 'expr-4',
    tab: 'Expressions',
    title: 'Lists and records',
    blurb: '{…} is a list, [K = v] is a record. Field access is r[Field] or r.Field.',
    goalText: 'From record [Name="Ada", Year=1815] extract Year (1815).',
    hint: '[Name = "Ada", Year = 1815][Year]  ·  or .Year',
    solution: '[Name = "Ada", Year = 1815].Year',
    par: 1,
    check: (ctx) => ctx.result === 1815,
  },

  // ======================== Tables ========================
  {
    id: 'table-1',
    tab: 'Tables',
    title: '#table constructor',
    blurb: 'Build a table from column names and row lists — the same shape as Source in PQ.',
    goalText: '2×2 table with cols A, B and rows {1,"x"}, {2,"y"}.',
    hint: '#table({"A","B"}, {{1,"x"},{2,"y"}})',
    solution: '#table({"A","B"}, {{1,"x"},{2,"y"}})',
    par: 1,
    check: (ctx) =>
      hasColumns(ctx.result, ['A', 'B']) &&
      rowCount(ctx.result) === 2 &&
      ctx.result.rows[0].B === 'x',
  },
  {
    id: 'table-2',
    tab: 'Tables',
    title: 'SelectRows',
    blurb: 'Filter with a predicate function. each is sugar for a 1-arg function; [Col] is _[Col].',
    goalText: 'Filter Sales to Region = "West" (3 rows).',
    hint: 'Table.SelectRows(Sales, each [Region] = "West")',
    solution: 'West = Table.SelectRows(Sales, each [Region] = "West")',
    startTables: { Sales: 'Sales' },
    par: 1,
    check: (ctx) => rowCount(ctx.result) === 3 && ctx.result.rows.every((r) => r.Region === 'West'),
  },
  {
    id: 'table-3',
    tab: 'Tables',
    title: 'AddColumn',
    blurb: 'Append a computed column. The function receives the whole row.',
    goalText: 'Sales with LineTotal = Qty * Price.',
    hint: 'Table.AddColumn(Sales, "LineTotal", each [Qty] * [Price])',
    solution: 'T = Table.AddColumn(Sales, "LineTotal", each [Qty] * [Price])',
    startTables: { Sales: 'Sales' },
    par: 1,
    check: (ctx) => hasColumns(ctx.result, ['LineTotal']) && Math.abs(ctx.result.rows[0].LineTotal - 95) < 1e-9,
  },
  {
    id: 'table-4',
    tab: 'Tables',
    title: 'SelectColumns / RemoveColumns',
    blurb: 'Project or drop columns. Column order is part of table identity in M.',
    goalText: 'Sales with only Product, Qty, Price.',
    hint: 'Table.SelectColumns(Sales, {"Product","Qty","Price"})',
    solution: 'S = Table.SelectColumns(Sales, {"Product", "Qty", "Price"})',
    startTables: { Sales: 'Sales' },
    par: 1,
    check: (ctx) => colNames(ctx.result) === 'Product,Qty,Price' && rowCount(ctx.result) === 8,
  },
  {
    id: 'table-5',
    tab: 'Tables',
    title: 'Sort and FirstN',
    blurb: 'Table.Sort takes a list of order specs. Order.Descending is a first-class marker.',
    goalText: 'Top 3 Sales rows by Qty desc (12, 10, 8).',
    hint: 'Table.FirstN(Table.Sort(Sales, {{"Qty", Order.Descending}}), 3)',
    solution: 'Top = Table.FirstN(Table.Sort(Sales, {{"Qty", Order.Descending}}), 3)',
    startTables: { Sales: 'Sales' },
    par: 2,
    check: (ctx) => rowCount(ctx.result) === 3 && ctx.result.rows.map((r) => r.Qty).join(',') === '12,10,8',
  },

  // ======================== Types ========================
  {
    id: 'type-1',
    tab: 'Types',
    title: 'Type literals',
    blurb:
      'M has first-class types: type number, type text, type nullable text, type table [..]. They are values.',
    goalText: 'Evaluate type number and keep it as the result.',
    hint: 'type number',
    solution: 'type number',
    par: 1,
    check: (ctx) => ctx.result && ctx.result.__mtype === 'type',
  },
  {
    id: 'type-2',
    tab: 'Types',
    title: 'Table.TransformColumnTypes',
    blurb: 'The "Changed Type" step as code. Values are coerced to the declared type.',
    goalText: 'Transform Sales Qty to type text (first row Qty = "10").',
    hint: 'Table.TransformColumnTypes(Sales, {{"Qty", type text}})',
    solution: 'C = Table.TransformColumnTypes(Sales, {{"Qty", type text}})',
    startTables: { Sales: 'Sales' },
    par: 1,
    check: (ctx) => ctx.result.rows[0].Qty === '10' || ctx.result.rows[0].Qty === 10,
  },
  {
    id: 'type-3',
    tab: 'Types',
    title: 'Number coercion',
    blurb: 'Text to number is a classic cleanup. Number.From / Number.FromText.',
    goalText: 'Turn {"1","2","3"} into {1,2,3} with List.Transform.',
    hint: 'List.Transform({"1","2","3"}, each Number.From(_))',
    solution: 'List.Transform({"1", "2", "3"}, each Number.From(_))',
    par: 1,
    check: (ctx) => Array.isArray(ctx.result) && ctx.result.join(',') === '1,2,3',
  },
  {
    id: 'type-4',
    tab: 'Types',
    title: 'nullable types',
    blurb: 'nullable T allows null. Non-nullable types raise on null at conversion time.',
    goalText: 'Evaluate type nullable number (type value).',
    hint: 'type nullable number',
    solution: 'type nullable number',
    par: 1,
    check: (ctx) => ctx.result && ctx.result.__mtype === 'type',
  },

  // ======================== Shaping ========================
  {
    id: 'shape-1',
    tab: 'Shaping',
    title: 'Unpivot columns',
    blurb: 'Unpivot turns wide columns into Attribute/Value rows — the "Unpivot Columns" button.',
    goalText:
      'Unpivot Product columns of a 2×3 sample so result has Region, Attribute, Value (4 rows).',
    hint: 'Table.Unpivot(#table({"Region","A","B"}, {{"West",1,2},{"East",3,4}}), {"A","B"}, "Attribute", "Value")',
    solution:
      'U = Table.Unpivot(#table({"Region","A","B"}, {{"West",1,2},{"East",3,4}}), {"A", "B"}, "Attribute", "Value")',
    par: 1,
    check: (ctx) => {
      const t = ctx.result;
      return hasColumns(t, ['Region', 'Attribute', 'Value']) && rowCount(t) === 4;
    },
  },
  {
    id: 'shape-2',
    tab: 'Shaping',
    title: 'Pivot columns',
    blurb: 'Pivot is the inverse of Unpivot. Attribute column becomes new headers.',
    goalText: 'Pivot Attribute {A,B} so West/East rows have columns A, B (2 rows).',
    hint: 'Table.Pivot(long, {"A","B"}, "Attribute", "Value")',
    solution:
      'let Long = Table.Unpivot(#table({"Region","A","B"}, {{"West",1,2},{"East",3,4}}), {"A", "B"}, "Attribute", "Value"), W = Table.Pivot(Long, {"A", "B"}, "Attribute", "Value") in W',
    par: 1,
    check: (ctx) => {
      const t = ctx.result;
      return hasColumns(t, ['A', 'B', 'Region']) && rowCount(t) === 2;
    },
  },
  {
    id: 'shape-3',
    tab: 'Shaping',
    title: 'SplitColumn',
    blurb: 'Split by delimiter — Splitter.SplitTextByDelimiter(";", …).',
    goalText: 'Split FullName "Ada;Lovelace" into First, Last.',
    hint: 'Table.SplitColumn(t, "FullName", Splitter.SplitTextByDelimiter(";", {1,1}), {"First","Last"})',
    solution:
      'S = Table.SplitColumn(#table({"FullName"}, {{"Ada;Lovelace"},{{"Grace;Hopper"}}}), "FullName", Splitter.SplitTextByDelimiter(";"), {"First", "Last"})',
    par: 1,
    check: (ctx) => hasColumns(ctx.result, ['First', 'Last']) && ctx.result.rows[0].First === 'Ada',
  },
  {
    id: 'shape-4',
    tab: 'Shaping',
    title: 'FillDown',
    blurb: 'FillDown carries the last non-null value downward — essential for messy exports.',
    goalText: 'FillDown Group so nulls become the previous label.',
    hint: 'Table.FillDown(t, {"Group"})',
    solution:
      'F = Table.FillDown(#table({"Group","Item"}, {{"G1","a"},{null,"b"},{"G2","c"}}), {"Group"})',
    par: 1,
    check: (ctx) => ctx.result.rows[1].Group === 'G1',
  },
  {
    id: 'shape-5',
    tab: 'Shaping',
    title: 'PromoteHeaders / Transpose',
    blurb: 'Promote first row to headers. Transpose swaps rows and columns.',
    goalText: 'Promote first row of a matrix table so headers are A, B.',
    hint: 'Table.PromoteHeaders(#table({"Column1","Column2"}, {{"A","B"},{1,2}}))',
    solution: 'P = Table.PromoteHeaders(#table({"Column1", "Column2"}, {{"A", "B"}, {1, 2}}))',
    par: 1,
    check: (ctx) => colNames(ctx.result) === 'A,B' && rowCount(ctx.result) === 1,
  },
  {
    id: 'shape-6',
    tab: 'Shaping',
    title: 'AddIndexColumn',
    blurb: 'Materialize a row index — useful before joins and quality checks.',
    goalText: 'Sales with Id column 1..8.',
    hint: 'Table.AddIndexColumn(Sales, "Id", 1, 1)',
    solution: 'I = Table.AddIndexColumn(Sales, "Id", 1, 1)',
    startTables: { Sales: 'Sales' },
    par: 1,
    check: (ctx) => ctx.result.rows[0].Id === 1 && ctx.result.rows[7].Id === 8,
  },

  // ======================== Aggregation ========================
  {
    id: 'agg-1',
    tab: 'Aggregation',
    title: 'Table.Group',
    blurb: 'Group By as code. Aggregations are functions over the group (list of rows).',
    goalText: 'Region totals: East 18, North 11, West 22.',
    hint: 'Table.Group(Sales, {"Region"}, {{"TotalQty", each List.Sum([Qty])}})',
    solution: 'G = Table.Group(Sales, {"Region"}, {{"TotalQty", each List.Sum([Qty])}})',
    startTables: { Sales: 'Sales' },
    par: 1,
    check: (ctx) => {
      const m = rowMap(ctx.result, 'Region', 'TotalQty');
      return m.East === 18 && m.North === 11 && m.West === 22;
    },
  },
  {
    id: 'agg-2',
    tab: 'Aggregation',
    title: 'Multiple aggregations',
    blurb: 'Pass several {name, fn} pairs to Table.Group.',
    goalText: 'Per Region: TotalQty and RowCount (East 18/3, West 22/3, North 11/2).',
    hint: '{{"TotalQty", each List.Sum([Qty])}, {"RowCount", each List.Count(_)} }',
    solution:
      'G = Table.Group(Sales, {"Region"}, {{"TotalQty", each List.Sum([Qty])}, {"RowCount", each List.Count(_)}})',
    startTables: { Sales: 'Sales' },
    par: 1,
    check: (ctx) => {
      const t = ctx.result;
      if (!hasColumns(t, ['TotalQty', 'RowCount'])) return false;
      const west = t.rows.find((r) => r.Region === 'West');
      return west && west.TotalQty === 22 && west.RowCount === 3;
    },
  },
  {
    id: 'agg-3',
    tab: 'Aggregation',
    title: 'Group by two keys',
    blurb: 'Multiple key columns form a composite group.',
    goalText: 'Group Sales by Region and Product (8 unique pairs).',
    hint: 'Table.Group(Sales, {"Region","Product"}, {{"N", each List.Count(_)}})',
    solution: 'G = Table.Group(Sales, {"Region", "Product"}, {{"N", each List.Count(_)}})',
    startTables: { Sales: 'Sales' },
    par: 1,
    check: (ctx) => rowCount(ctx.result) === 8 && hasColumns(ctx.result, ['Region', 'Product', 'N']),
  },

  // ======================== Joins ========================
  {
    id: 'join-1',
    tab: 'Joins',
    title: 'Table.Join inner',
    blurb: 'Inner join keeps only matching keys. Default kind is JoinKind.Inner.',
    goalText: 'Join Orders to Customers on Customer — 5 rows with City (Umbrella dropped).',
    hint: 'Build Customers then Table.Join(Orders, {"Customer"}, Customers, {"Customer"})',
    solution:
      'let Customers = #table({"Customer","City"}, {{"Acme","Tehran"},{"Globex","Berlin"},{"Initech","Austin"}}), J = Table.Join(Orders, {"Customer"}, Customers, {"Customer"}) in J',
    startTables: { Orders: 'Orders' },
    par: 2,
    check: (ctx) => {
      const t = ctx.result;
      return hasColumns(t, ['City', 'OrderId']) && rowCount(t) === 5 && t.rows.every((r) => r.City);
    },
  },
  {
    id: 'join-2',
    tab: 'Joins',
    title: 'JoinKind.LeftOuter',
    blurb: 'Left outer keeps unmatched left rows (right cols null).',
    goalText: 'Left-join Orders to Customers — 6 rows (Umbrella has null City).',
    hint: 'Table.Join(Orders, {"Customer"}, Customers, {"Customer"}, JoinKind.LeftOuter)',
    solution:
      'let Customers = #table({"Customer","City"}, {{"Acme","Tehran"},{"Globex","Berlin"},{"Initech","Austin"}}), J = Table.Join(Orders, {"Customer"}, Customers, {"Customer"}, JoinKind.LeftOuter) in J',
    startTables: { Orders: 'Orders' },
    par: 2,
    check: (ctx) => {
      const t = ctx.result;
      if (rowCount(t) !== 6) return false;
      const um = t.rows.find((r) => r.Customer === 'Umbrella');
      return um && (um.City === null || um.City === undefined);
    },
  },
  {
    id: 'join-3',
    tab: 'Joins',
    title: 'NestedJoin + Expand',
    blurb:
      'The real Power Query Merge is NestedJoin then ExpandTableColumn. Learn the two-step pattern.',
    goalText: 'NestedJoin Orders→Customers then Expand City (5 rows).',
    hint: 'Table.ExpandTableColumn(Table.NestedJoin(...), "Join", {"City"})',
    solution:
      'let Customers = #table({"Customer","City"}, {{"Acme","Tehran"},{"Globex","Berlin"},{"Initech","Austin"}}), N = Table.NestedJoin(Orders, {"Customer"}, Customers, {"Customer"}, "Join"), E = Table.ExpandTableColumn(N, "Join", {"City"}) in E',
    startTables: { Orders: 'Orders' },
    par: 2,
    check: (ctx) => {
      const t = ctx.result;
      return hasColumns(t, ['City', 'OrderId']) && rowCount(t) === 5 && !hasColumns(t, ['Join']);
    },
  },
  {
    id: 'join-4',
    tab: 'Joins',
    title: 'JoinKind.LeftAnti',
    blurb: 'Anti-join returns left rows with no match — "what is not in the dimension".',
    goalText: 'Orders with no Customer (Umbrella only).',
    hint: 'Table.Join(Orders, {"Customer"}, Customers, {"Customer"}, JoinKind.LeftAnti)',
    solution:
      'let Customers = #table({"Customer","City"}, {{"Acme","Tehran"},{"Globex","Berlin"},{"Initech","Austin"}}), A = Table.Join(Orders, {"Customer"}, Customers, {"Customer"}, JoinKind.LeftAnti) in A',
    startTables: { Orders: 'Orders' },
    par: 2,
    check: (ctx) => rowCount(ctx.result) === 1 && ctx.result.rows[0].Customer === 'Umbrella',
  },
  {
    id: 'join-5',
    tab: 'Joins',
    title: 'Append / Combine',
    blurb: 'Vertical union of tables. Table.Combine and Table.Append.',
    goalText: 'Append two 2-row tables into 4 rows.',
    hint: 'Table.Combine({t1, t2})',
    solution:
      'C = Table.Combine({#table({"A"}, {{1},{2}}), #table({"A"}, {{3},{4}})})',
    par: 1,
    check: (ctx) => rowCount(ctx.result) === 4 && colNames(ctx.result) === 'A',
  },

  // ======================== List / Record ========================
  {
    id: 'list-1',
    tab: 'List & Record',
    title: 'List.Transform / Select',
    blurb: 'Functional list ops — map and filter.',
    goalText: 'Map {1,2,3} to squares {1,4,9}.',
    hint: 'List.Transform({1,2,3}, each _ * _)',
    solution: 'List.Transform({1, 2, 3}, each _ * _)',
    par: 1,
    check: (ctx) => Array.isArray(ctx.result) && ctx.result.join(',') === '1,4,9',
  },
  {
    id: 'list-2',
    tab: 'List & Record',
    title: 'List.Accumulate',
    blurb: 'Fold / reduce. The most powerful list function for custom logic.',
    goalText: 'Sum {1,2,3,4} with List.Accumulate (10).',
    hint: 'List.Accumulate({1,2,3,4}, 0, (acc, x) => acc + x)',
    solution: 'List.Accumulate({1, 2, 3, 4}, 0, (acc, x) => acc + x)',
    par: 1,
    check: (ctx) => ctx.result === 10,
  },
  {
    id: 'list-3',
    tab: 'List & Record',
    title: 'List.Generate',
    blurb: 'State-machine list builder: initial, condition, next, selector.',
    goalText: 'Generate {0,2,4,6,8} with List.Generate.',
    hint: 'List.Generate(() => 0, each _ < 10, each _ + 2)',
    solution: 'List.Generate(() => 0, each _ < 10, each _ + 2)',
    par: 1,
    check: (ctx) => Array.isArray(ctx.result) && ctx.result.join(',') === '0,2,4,6,8',
  },
  {
    id: 'list-4',
    tab: 'List & Record',
    title: 'Record.ToList / FromList',
    blurb: 'Records convert to lists of values — useful in Transform.',
    goalText: 'Record.ToList([A=1, B=2]) = {1, 2}.',
    hint: 'Record.ToList([A = 1, B = 2])',
    solution: 'Record.ToList([A = 1, B = 2])',
    par: 1,
    check: (ctx) => Array.isArray(ctx.result) && ctx.result.join(',') === '1,2',
  },

  // ======================== Functions ========================
  {
    id: 'fn-1',
    tab: 'Functions',
    title: 'each and _',
    blurb: 'each expr = ( _) => expr. [Col] inside each is _[Col].',
    goalText: 'Text lengths of {"a","bb","ccc"} = {1,2,3}.',
    hint: 'List.Transform({"a","bb","ccc"}, each Text.Length(_))',
    solution: 'List.Transform({"a", "bb", "ccc"}, each Text.Length(_))',
    par: 1,
    check: (ctx) => Array.isArray(ctx.result) && ctx.result.join(',') === '1,2,3',
  },
  {
    id: 'fn-2',
    tab: 'Functions',
    title: 'Arrow function syntax',
    blurb: '(x, y) => x + y is explicit function syntax. Prefer it for multi-arg logic.',
    goalText: 'Call (a, b) => a * b with 6 and 7 (42).',
    hint: 'let f = (a, b) => a * b in f(6, 7)',
    solution: 'let f = (a, b) => a * b in f(6, 7)',
    par: 1,
    check: (ctx) => ctx.result === 42,
  },
  {
    id: 'fn-3',
    tab: 'Functions',
    title: 'if then else in each',
    blurb: 'Branch inside a row function — classification columns.',
    goalText: 'Employees Band: Senior if Salary >= 95000 else Mid.',
    hint: 'Table.AddColumn(Employees, "Band", each if [Salary] >= 95000 then "Senior" else "Mid")',
    solution:
      'B = Table.AddColumn(Employees, "Band", each if [Salary] >= 95000 then "Senior" else "Mid")',
    startTables: { Employees: 'Employees' },
    par: 1,
    check: (ctx) => {
      const t = ctx.result;
      return hasColumns(t, ['Band']) && t.rows.every((r) =>
        r.Salary >= 95000 ? r.Band === 'Senior' : r.Band === 'Mid'
      );
    },
  },
  {
    id: 'fn-4',
    tab: 'Functions',
    title: 'Functions as values',
    blurb: 'Functions are first-class. Pass them to List.Transform / Table.AddColumn.',
    goalText: 'Build double = x => x * 2 and map {1,2,3} to {2,4,6}.',
    hint: 'let double = x => x * 2 in List.Transform({1,2,3}, double)',
    solution: 'let double = (x) => x * 2 in List.Transform({1, 2, 3}, double)',
    par: 1,
    check: (ctx) => Array.isArray(ctx.result) && ctx.result.join(',') === '2,4,6',
  },

  // ======================== Text / Number / Date ========================
  {
    id: 'tdn-1',
    tab: 'Text Number Date',
    title: 'Text toolkit',
    blurb: 'Upper, Lower, Trim, Contains, Split, Combine — daily drivers.',
    goalText: 'Trim + Upper "  ada  " → "ADA".',
    hint: 'Text.Upper(Text.Trim("  ada  "))',
    solution: 'Text.Upper(Text.Trim("  ada  "))',
    par: 1,
    check: (ctx) => ctx.result === 'ADA',
  },
  {
    id: 'tdn-2',
    tab: 'Text Number Date',
    title: 'Number toolkit',
    blurb: 'Number.From, Round, IntegerDivide, Mod.',
    goalText: 'Number.Round(3.14159, 2) = 3.14.',
    hint: 'Number.Round(3.14159, 2)',
    solution: 'Number.Round(3.14159, 2)',
    par: 1,
    check: (ctx) => Math.abs(ctx.result - 3.14) < 1e-9,
  },
  {
    id: 'tdn-3',
    tab: 'Text Number Date',
    title: 'Date toolkit',
    blurb: 'Date.Year/Month/Day, AddDays, StartOfMonth — calendar shaping.',
    goalText: 'Date.AddDays(#date(2024,1,1), 30) = #date(2024,1,31).',
    hint: 'Date.AddDays(#date(2024, 1, 1), 30)',
    solution: 'Date.AddDays(#date(2024, 1, 1), 30)',
    par: 1,
    check: (ctx) => ctx.result && ctx.result.y === 2024 && ctx.result.m === 1 && ctx.result.d === 31,
  },
  {
    id: 'tdn-4',
    tab: 'Text Number Date',
    title: 'Extract date parts',
    blurb: 'Pull Year from Sales[Date] — pattern for calendar tables.',
    goalText: 'Sales with Year column (first row 2024).',
    hint: 'Table.AddColumn(Sales, "Year", each Date.Year([Date]))',
    solution: 'Y = Table.AddColumn(Sales, "Year", each Date.Year([Date]))',
    startTables: { Sales: 'Sales' },
    par: 1,
    check: (ctx) => hasColumns(ctx.result, ['Year']) && ctx.result.rows[0].Year === 2024,
  },

  // ======================== Errors ========================
  {
    id: 'err-1',
    tab: 'Errors',
    title: 'try / otherwise',
    blurb: 'try expr otherwise fallback. Never crash a refresh on one bad cell.',
    goalText: 'try (1/0) otherwise "safe" → "safe".',
    hint: 'try (1 / 0) otherwise "safe"',
    solution: 'try (1 / 0) otherwise "safe"',
    par: 1,
    check: (ctx) => ctx.result === 'safe',
  },
  {
    id: 'err-2',
    tab: 'Errors',
    title: 'error and null',
    blurb: 'error "msg" throws. null is the empty value — it propagates through many ops.',
    goalText: 'Handle null Qty with if [Qty] = null then 0 else [Qty] on a 3-row sample (sum 30).',
    hint: 'List.Sum(List.Transform({10, null, 20}, each if _ = null then 0 else _))',
    solution: 'List.Sum(List.Transform({10, null, 20}, each if _ = null then 0 else _))',
    par: 1,
    check: (ctx) => ctx.result === 30,
  },

  // ======================== Sources ========================
  {
    id: 'src-1',
    tab: 'Sources',
    title: 'Csv.Document',
    blurb: 'Parse CSV text to a table — same function Power Query uses for text sources.',
    goalText: 'Parse CSV "A,B\\n1,2\\n3,4" into a 2×2 table.',
    hint: 'Csv.Document("A,B#(lf)1,2#(lf)3,4")',
    solution: 'Csv.Document("A,B#(lf)1,2#(lf)3,4")',
    par: 1,
    check: (ctx) => {
      const t = ctx.result;
      return isTableSafe(t) && colNames(t) === 'A,B' && rowCount(t) === 2;
    },
  },
  {
    id: 'src-2',
    tab: 'Sources',
    title: 'Excel.CurrentWorkbook',
    blurb: 'Read named tables from the "workbook". Item access: tbl{[Name="Sales"]}[Content].',
    goalText: 'Get Sales via Excel.CurrentWorkbook item access (8 rows).',
    hint: 'Excel.CurrentWorkbook(){[Name = "Sales"]}[Content]',
    solution: 'Excel.CurrentWorkbook(){[Name = "Sales"]}[Content]',
    par: 1,
    check: (ctx) => isTableSafe(ctx.result) && rowCount(ctx.result) === 8 && hasColumns(ctx.result, ['Region']),
  },
  {
    id: 'src-3',
    tab: 'Sources',
    title: 'Json.Document',
    blurb: 'JSON becomes records/lists. Classic API payload drill.',
    goalText: 'Json.Document("{""a"": 1}") → record with a = 1.',
    hint: 'Json.Document("{""a"": 1}")',
    solution: 'Json.Document("{""a"": 1}")',
    par: 1,
    check: (ctx) => ctx.result && ctx.result.a === 1,
  },

  // ======================== Advanced ========================
  {
    id: 'adv-1',
    tab: 'Advanced',
    title: 'Table.Buffer',
    blurb:
      'Buffer forces materialization and can break query folding. Use when you must freeze a step.',
    goalText: 'Buffer a filtered table (still a table, 3 rows West).',
    hint: 'Table.Buffer(Table.SelectRows(Sales, each [Region] = "West"))',
    solution: 'Table.Buffer(Table.SelectRows(Sales, each [Region] = "West"))',
    startTables: { Sales: 'Sales' },
    par: 1,
    check: (ctx) => isTableSafe(ctx.result) && rowCount(ctx.result) === 3 && ctx.result.__buffered === true,
  },
  {
    id: 'adv-2',
    tab: 'Advanced',
    title: 'Table.Schema',
    blurb: 'Inspect column names and types — documentation and QA steps.',
    goalText: 'Schema of Sales should list 5 columns.',
    hint: 'Table.Schema(Sales)',
    solution: 'Table.Schema(Sales)',
    startTables: { Sales: 'Sales' },
    par: 1,
    check: (ctx) => isTableSafe(ctx.result) && rowCount(ctx.result) === 5 && hasColumns(ctx.result, ['Name', 'Type']),
  },
  {
    id: 'adv-3',
    tab: 'Advanced',
    title: 'Query folding (concept)',
    blurb:
      'Folding pushes steps back to the source (SQL). Filter and project fold; Buffer and some transforms do not. In learn-m we mark buffered results — that is the mental model.',
    goalText: 'Apply SelectRows then Buffer — result must be buffered (folding broken on purpose).',
    hint: 'Table.Buffer(Table.SelectColumns(Sales, {"Region","Qty"}))',
    solution: 'Table.Buffer(Table.SelectColumns(Sales, {"Region", "Qty"}))',
    startTables: { Sales: 'Sales' },
    par: 1,
    check: (ctx) => isTableSafe(ctx.result) && ctx.result.__buffered === true && colNames(ctx.result) === 'Region,Qty',
  },

  // ======================== Capstone ========================
  {
    id: 'cap-1',
    tab: 'Capstone',
    title: 'Clean CSV end-to-end',
    blurb: 'Parse CSV, split names, coerce numbers, filter, compute.',
    goalText:
      'From CSV text with Name,Qty build total qty of Active rows only (Active: Ada 10, Grace 5 → 15).',
    hint: 'Csv.Document → TransformColumnTypes → SelectRows → List.Sum',
    solution:
      'let C = Csv.Document("Name,Qty,Status#(lf)Ada,10,Active#(lf)Edsger,8,Inactive#(lf)Grace,5,Active"), T = Table.TransformColumnTypes(C, {{"Qty", type number}}), A = Table.SelectRows(T, each [Status] = "Active") in List.Sum(A[Qty])',
    par: 3,
    check: (ctx) => ctx.result === 15,
  },
  {
    id: 'cap-2',
    tab: 'Capstone',
    title: 'Revenue by region',
    blurb: 'AddColumn revenue → Group → Sort — the classic star-schema prep.',
    goalText: 'One row per Region with Revenue; West first (470).',
    hint: 'AddColumn Revenue → Group sum → Sort desc',
    solution:
      'let R = Table.AddColumn(Sales, "Revenue", each [Qty] * [Price]), G = Table.Group(R, {"Region"}, {{"Revenue", each List.Sum([Revenue])}}), S = Table.Sort(G, {{"Revenue", Order.Descending}}) in S',
    startTables: { Sales: 'Sales' },
    par: 3,
    check: (ctx) => {
      const t = ctx.result;
      return hasColumns(t, ['Region', 'Revenue']) && t.rows[0].Region === 'West' && Math.abs(t.rows[0].Revenue - 470) < 1e-6;
    },
  },
  {
    id: 'cap-3',
    tab: 'Capstone',
    title: 'Fact + dimension',
    blurb: 'Build a dimension (Customers), join fact (Orders), expand — star schema seed.',
    goalText: 'Orders joined to Customers with City, only Closed orders (3 rows).',
    hint: 'Filter Closed → NestedJoin → Expand City',
    solution:
      'let Closed = Table.SelectRows(Orders, each [Status] = "Closed"), Customers = #table({"Customer","City"}, {{"Globex","Berlin"},{"Initech","Austin"},{"Umbrella","Osaka"}}), N = Table.NestedJoin(Closed, {"Customer"}, Customers, {"Customer"}, "Join"), E = Table.ExpandTableColumn(N, "Join", {"City"}) in E',
    startTables: { Orders: 'Orders' },
    par: 3,
    check: (ctx) => {
      const t = ctx.result;
      return isTableSafe(t) && rowCount(t) === 3 && hasColumns(t, ['City']) && t.rows.every((r) => r.Status === 'Closed' && r.City);
    },
  },
  {
    id: 'cap-4',
    tab: 'Capstone',
    title: 'QA pipeline',
    blurb: 'Index, schema, fill, types — the “did the file load right?” checklist.',
    goalText: 'Sales schema 5 cols, plus Id index 1-based, buffered at the end.',
    hint: 'AddIndexColumn → Table.Buffer → (schema is separate)',
    solution: 'Table.Buffer(Table.AddIndexColumn(Sales, "Id", 1, 1))',
    startTables: { Sales: 'Sales' },
    par: 2,
    check: (ctx) =>
      isTableSafe(ctx.result) &&
      hasColumns(ctx.result, ['Id']) &&
      ctx.result.__buffered === true &&
      rowCount(ctx.result) === 8,
  },
];

function isTableSafe(t) {
  return t && t.__mtype === 'table';
}

/**
 * @param {string} id
 */
export function getLevel(id) {
  return LEVELS.find((l) => l.id === id);
}

/**
 * @returns {string[]}
 */
export function tabs() {
  return [...new Set(LEVELS.map((l) => l.tab))];
}

/**
 * Curriculum coverage map for self-audit.
 */
export const MODULE_WEIGHTS = {
  Orientation: 2,
  Expressions: 4,
  Tables: 5,
  Types: 4,
  Shaping: 6,
  Aggregation: 3,
  Joins: 5,
  'List & Record': 4,
  Functions: 4,
  'Text Number Date': 4,
  Errors: 2,
  Sources: 3,
  Advanced: 3,
  Capstone: 4,
};
