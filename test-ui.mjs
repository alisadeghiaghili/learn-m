import assert from 'node:assert';
import { ui, getLocale, setLocale, LOCALES } from './i18n/index.js';
import { renderMarkdown, escapeHtml } from './dialog.js';
import { renderStepsHtml, renderPreviewHtml, buildMCode } from './board.js';
import { renderDockHtml } from './dock.js';
import { inspectTableSchema, getAvailableTables, renderSchemaHtml } from './schema.js';
import { createStdlib, sampleDatasets, envDefine } from './m-engine.js';
import { buildShareTargets } from './share.js';
import { loadProgress, saveProgress, summarizeCurriculum } from './progress.js';
import { LEVELS } from './levels.js';

console.log('Testing learn-m modules...');

// 1. i18n
assert.strictEqual(getLocale(), 'en');
assert.ok(ui().appWelcome);
assert.ok(ui().levelsTitle);
setLocale('fa');
assert.strictEqual(getLocale(), 'fa');
assert.ok(ui().appWelcome.includes('خوش آمدید'));
setLocale('en');

// 2. Markdown renderer
const md = renderMarkdown(`
### Header
Here is **bold** text and \`code\`.
- Item 1
- Item 2
`);
assert.ok(md.includes('<h3>Header</h3>'));
assert.ok(md.includes('<strong>bold</strong>'));
assert.ok(md.includes('<code>code</code>'));
assert.ok(md.includes('<li>Item 1</li>'));

// 3. Board rendering
const stepsHtml = renderStepsHtml(
  [{ name: 'Step1', exprSrc: '1 + 1', result: 2 }],
  0,
  { label: 'Sales', result: null }
);
assert.ok(stepsHtml.includes('Step1'));
assert.ok(stepsHtml.includes('is-selected'));

const code = buildMCode([{ name: 'West', exprSrc: 'Table.SelectRows(Sales, each [Region] = "West")' }]);
assert.ok(code.includes('let'));
assert.ok(code.includes('West = Table.SelectRows'));
assert.ok(code.includes('in\n    West'));

// 4. Dock and Schema rendering
const testEnv = createStdlib();
const testData = sampleDatasets();
for (const [name, table] of Object.entries(testData)) {
  envDefine(testEnv, name, table);
}
const availTables = getAvailableTables(testEnv, LEVELS[0]);
assert.ok(availTables.length >= 1);
assert.strictEqual(availTables[0].name, 'Sales');
assert.ok(availTables[0].columns.length >= 3);

const schemaHtml = renderSchemaHtml(availTables);
assert.ok(schemaHtml.includes('Sales'));
assert.ok(schemaHtml.includes('data-insert-table="Sales"'));
assert.ok(schemaHtml.includes('data-peek-table="Sales"'));

const dockHtml = renderDockHtml({
  level: LEVELS[0],
  solved: false,
  golfCount: 1,
  progress: {},
  tables: availTables,
  dockView: 'both',
});
assert.ok(dockHtml.includes(LEVELS[0].title));
assert.ok(dockHtml.includes('Goal'));
assert.ok(dockHtml.includes('Sales'));
assert.ok(dockHtml.includes('data-dock-view="both"'));

// 5. Progress summary
const summary = summarizeCurriculum({ 'intro-1': { solved: true, bestCommands: 1 } });
assert.strictEqual(summary.solvedCount, 1);
assert.ok(summary.percent >= 1);

// 6. Share targets
const share = buildShareTargets({
  levelName: LEVELS[0].title,
  levelId: LEVELS[0].id,
  commands: 1,
  par: LEVELS[0].par,
  curriculum: summary,
});
assert.ok(share.linkedin.includes('linkedin.com'));
assert.ok(share.x.includes('twitter.com'));
assert.ok(share.text.includes(LEVELS[0].title));

console.log('All module tests passed successfully!');
