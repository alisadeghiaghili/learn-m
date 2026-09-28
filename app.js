/**
 * learn-m — Power Query M interactive tutor.
 * Terminal + Applied Steps pipeline + live table preview.
 * Patterned after learnGitBranching's sandbox/levels loop.
 */

import {
  createStdlib,
  envDefine,
  envLookup,
  evalM,
  formatValue,
  isTable,
  makeEnv,
  mEquals,
  parseStepBinding,
  sampleDatasets,
  typeName,
  MError,
} from './m-engine.js';
import { LEVELS, getLevel, tabs } from './levels.js';

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

/** @type {State} */
const state = {
  steps: /** @type {any[]} */ ([]),
  history: /** @type {any[]} */ ([]),
  commands: /** @type {string[]} */ ([]),
  level: null,
  solved: false,
  golf: 0,
  selectedStep: -1,
  result: null,
  error: null,
  env: null,
  introSeen: false,
  solvedLevels: loadSolved(),
};

/**
 * @typedef {Object} State
 * @property {any[]} steps
 * @property {any[]} history
 * @property {string[]} commands
 * @property {any} level
 * @property {boolean} solved
 * @property {number} golf
 * @property {number} selectedStep
 * @property {any} result
 * @property {string|null} error
 * @property {any} env
 * @property {boolean} introSeen
 * @property {Record<string, number>} solvedLevels
 */

function loadSolved() {
  try {
    return JSON.parse(localStorage.getItem('learn-m-solved') || '{}');
  } catch {
    return {};
  }
}

function saveSolved() {
  localStorage.setItem('learn-m-solved', JSON.stringify(state.solvedLevels));
}

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------

const $ = (sel) => document.querySelector(sel);
const el = {
  levelTitle: $('#level-title'),
  levelBlurb: $('#level-blurb'),
  goalText: $('#goal-text'),
  golf: $('#golf-score'),
  steps: $('#steps'),
  terminalLog: $('#terminal-log'),
  terminalInput: $('#terminal-input'),
  tableWrap: $('#table-wrap'),
  resultType: $('#result-type'),
  statusBar: $('#status-bar'),
  modal: $('#modal'),
  modalBody: $('#modal-body'),
  modalTitle: $('#modal-title'),
  codeOut: $('#code-out'),
  winBanner: $('#win-banner'),
};

// ---------------------------------------------------------------------------
// Query engine glue
// ---------------------------------------------------------------------------

function freshEnv() {
  const env = createStdlib();
  const data = sampleDatasets();
  for (const [name, table] of Object.entries(data)) {
    envDefine(env, name, table);
  }
  return env;
}

/**
 * Snapshot for undo.
 */
function pushHistory() {
  state.history.push({
    steps: state.steps.map((s) => ({ ...s })),
    commands: [...state.commands],
    golf: state.golf,
    level: state.level,
    solved: state.solved,
  });
  if (state.history.length > 50) state.history.shift();
}

function rebuildResult() {
  state.error = null;
  if (state.steps.length === 0) {
    state.result = state.level && state.level.startTables
      ? envLookup(state.env, Object.keys(state.level.startTables)[0] || 'Sales')
      : envLookup(state.env, 'Sales');
    // Prefer last named source if any start tables
    if (state.level && state.level.startTables) {
      const keys = Object.keys(state.level.startTables);
      state.result = envLookup(state.env, keys[keys.length - 1]);
    }
    renderAll();
    return;
  }
  const last = state.steps[state.steps.length - 1];
  state.result = last.result;
  state.selectedStep = state.steps.length - 1;
  renderAll();
  checkWin();
}

function resetQuery(keepLevel = true) {
  pushHistory();
  state.steps = [];
  state.commands = [];
  state.golf = 0;
  state.solved = false;
  state.selectedStep = -1;
  state.error = null;
  state.env = freshEnv();
  if (keepLevel && state.level) {
    applyLevelSetup(state.level);
  }
  state.result = state.level?.startTables
    ? envLookup(state.env, Object.keys(state.level.startTables).slice(-1)[0])
    : envLookup(state.env, 'Sales');
  renderAll();
}

function applyLevelSetup(level) {
  state.env = freshEnv();
  state.steps = [];
  state.golf = 0;
  state.solved = false;
  state.commands = [];
  if (level.startTables) {
    // bind each named table from samples
    const data = sampleDatasets();
    for (const [bindName, dataKey] of Object.entries(level.startTables)) {
      envDefine(state.env, bindName, data[dataKey] || data.Sales);
    }
  }
  // Also expose Prev alias empty
  envDefine(state.env, 'Prev', envLookup(state.env, 'Sales'));
}

/**
 * Evaluate one user line as a step or expression.
 *
 * @param {string} raw
 */
function runLine(raw) {
  const src = raw.trim();
  if (!src) return;
  pushHistory();
  state.golf += 1;
  state.commands.push(src);
  state.error = null;

  try {
    const step = parseStepBinding(src);
    if (step) {
      // Evaluate step expression in env that includes prior step names + Prev
      const local = makeEnv(state.env);
      if (state.steps.length) {
        envDefine(local, 'Prev', state.steps[state.steps.length - 1].result);
      }
      const result = evalM(step.exprSrc, local);
      envDefine(state.env, step.name, result);
      envDefine(state.env, 'Prev', result);
      state.steps.push({
        name: step.name,
        exprSrc: step.exprSrc,
        fullSrc: src,
        result,
      });
      state.result = result;
      state.selectedStep = state.steps.length - 1;
    } else {
      const local = makeEnv(state.env);
      if (state.steps.length) {
        envDefine(local, 'Prev', state.steps[state.steps.length - 1].result);
      }
      state.result = evalM(src, local);
    }
  } catch (err) {
    state.error = err instanceof MError || err instanceof Error ? err.message : String(err);
    state.golf = Math.max(0, state.golf - 1); // failed attempts don't count against golf
  }

  renderAll();
  if (!state.error) checkWin();
}

function undo() {
  const prev = state.history.pop();
  if (!prev) {
    termPrint('Nothing to undo', 'muted');
    return;
  }
  state.steps = prev.steps;
  state.commands = prev.commands;
  state.golf = prev.golf;
  state.level = prev.level;
  state.solved = prev.solved;
  state.error = null;
  if (state.steps.length) {
    state.result = state.steps[state.steps.length - 1].result;
    state.selectedStep = state.steps.length - 1;
  }
  renderAll();
  termPrint('Undid last command', 'muted');
}

function checkWin() {
  if (!state.level || state.solved) return;
  const ctx = {
    env: state.env,
    result: state.result,
    steps: state.steps,
    source: state.steps.map((s) => s.fullSrc).join('\n'),
    commands: state.commands,
  };
  let ok = false;
  try {
    ok = !!state.level.check(ctx);
  } catch {
    ok = false;
  }
  if (ok) {
    state.solved = true;
    const prevBest = state.solvedLevels[state.level.id];
    if (prevBest === undefined || state.golf < prevBest) {
      state.solvedLevels[state.level.id] = state.golf;
      saveSolved();
    }
    showWin();
  }
}

function showWin() {
  el.winBanner.hidden = false;
  el.winBanner.innerHTML = `
    <strong>Solved</strong>
    <span>${escapeHtml(state.level.title)} — ${state.golf} command${state.golf === 1 ? '' : 's'} ${state.golf <= state.level.par ? '(at or under par)' : `(par ${state.level.par})`}</span>
    <button type="button" id="win-next">Next level</button>
    <button type="button" id="win-hide">Keep exploring</button>
  `;
  $('#win-next')?.addEventListener('click', () => {
    el.winBanner.hidden = true;
    gotoNextLevel();
  });
  $('#win-hide')?.addEventListener('click', () => {
    el.winBanner.hidden = true;
  });
  renderAll();
}

function gotoNextLevel() {
  const idx = LEVELS.findIndex((l) => l.id === state.level?.id);
  const next = LEVELS[(idx + 1) % LEVELS.length];
  loadLevel(next.id);
}

/**
 * @param {string} id
 */
function loadLevel(id) {
  const level = getLevel(id);
  if (!level) {
    termPrint(`Unknown level '${id}'`, 'error');
    return;
  }
  pushHistory();
  state.level = level;
  applyLevelSetup(level);
  state.result = level.startTables
    ? envLookup(state.env, Object.keys(level.startTables).slice(-1)[0])
    : null;
  el.winBanner.hidden = true;
  termPrint(`— Level ${level.id}: ${level.title} —`, 'accent');
  termPrint(level.blurb, 'muted');
  termPrint(`Goal: ${level.goalText}`, 'info');
  termPrint(`Par: ${level.par}  ·  type 'hint' if stuck, 'solution' to peek, 'sandbox' to leave`, 'muted');
  renderAll();
}

function gotoSandbox() {
  pushHistory();
  state.level = null;
  state.solved = false;
  state.golf = 0;
  state.commands = [];
  state.steps = [];
  state.env = freshEnv();
  state.result = envLookup(state.env, 'Sales');
  el.winBanner.hidden = true;
  termPrint('Sandbox mode — sample tables: Sales, Employees, Orders', 'accent');
  termPrint('Try: Table.SelectRows(Sales, each [Region] = "West")', 'muted');
  renderAll();
}

// ---------------------------------------------------------------------------
// Meta commands
// ---------------------------------------------------------------------------

/**
 * @param {string} line
 * @returns {boolean} true if handled as meta
 */
function tryMeta(line) {
  const parts = line.trim().split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase();
  const arg = parts.slice(1).join(' ');

  switch (cmd) {
    case 'help':
      termPrint(`Commands:
  levels            list tutorial levels
  level <id>        open a level
  sandbox           free play with Sales / Employees / Orders
  goal              show current goal
  hint              one nudge
  solution          peek at one solution shape
  steps              list applied steps
  code              emit Power Query M script
  undo              undo last command
  reset             clear applied steps
  clear             clear terminal
  help              this text

M expressions:
  1 + 2
  {1, 2, 3}
  let x = 21, y = 2 in x * y
  Name = Table.SelectRows(Sales, each [Region] = "West")   # creates a step

Share: ?level=filter-1&NODEMO&command=WestOnly=Table.SelectRows(Sales,each[Region]="West")`, 'info');
      return true;
    case 'levels': {
      const byTab = new Map();
      for (const l of LEVELS) {
        if (!byTab.has(l.tab)) byTab.set(l.tab, []);
        byTab.get(l.tab).push(l);
      }
      termPrint('Levels', 'accent');
      for (const [tab, list] of byTab) {
        termPrint(`  ${tab}`, 'info');
        for (const l of list) {
          const best = state.solvedLevels[l.id];
          const mark = best === undefined ? ' ' : '✓';
          const score = best === undefined ? '' : `  best ${best} / par ${l.par}`;
          termPrint(`  ${mark} ${l.id.padEnd(14)} ${l.title}${score}`, 'muted');
        }
      }
      openLevelsModal();
      return true;
    }
    case 'level':
      if (!arg) {
        termPrint('Usage: level <id>', 'error');
        return true;
      }
      loadLevel(arg);
      return true;
    case 'sandbox':
      gotoSandbox();
      return true;
    case 'goal':
      if (!state.level) {
        termPrint('Sandbox has no goal. Type levels to pick a lesson.', 'muted');
      } else {
        termPrint(state.level.goalText, 'info');
      }
      return true;
    case 'hint':
      if (!state.level) {
        termPrint('No level active.', 'muted');
      } else {
        termPrint(state.level.hint, 'info');
      }
      return true;
    case 'solution':
      if (!state.level) {
        termPrint('No level active.', 'muted');
      } else {
        termPrint(state.level.solution, 'accent');
      }
      return true;
    case 'steps':
      if (!state.steps.length) termPrint('(no applied steps)', 'muted');
      state.steps.forEach((s, i) => {
        termPrint(`${i + 1}. ${s.name} = ${s.exprSrc}`, 'info');
      });
      return true;
    case 'code':
      termPrint(buildMCode(), 'code');
      return true;
    case 'undo':
      undo();
      return true;
    case 'reset':
      resetQuery(true);
      termPrint('Steps cleared', 'muted');
      return true;
    case 'clear':
      el.terminalLog.innerHTML = '';
      return true;
    default:
      return false;
  }
}

function buildMCode() {
  const body = state.steps
    .map((s) => `    ${quoteStepName(s.name)} = ${s.exprSrc}`)
    .join(',\n');
  if (!state.steps.length) {
    return `let\n    // no steps yet\nin\n    Sales`;
  }
  const last = quoteStepName(state.steps[state.steps.length - 1].name);
  return `let\n${body}\nin\n    ${last}`;
}

/**
 * @param {string} name
 */
function quoteStepName(name) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `#"${name}"`;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * @param {string} text
 * @param {string} [cls]
 */
function termPrint(text, cls = '') {
  const line = document.createElement('div');
  line.className = `term-line ${cls}`;
  line.textContent = text;
  el.terminalLog.appendChild(line);
  el.terminalLog.scrollTop = el.terminalLog.scrollHeight;
}

/**
 * @param {string} s
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderAll() {
  renderChrome();
  renderSteps();
  renderTable();
  renderCode();
}

function renderChrome() {
  const level = state.level;
  el.levelTitle.textContent = level ? level.title : 'Sandbox';
  el.levelBlurb.textContent = level ? level.blurb : 'Free play. Build steps, inspect the table, emit M.';
  el.goalText.textContent = level ? level.goalText : 'No goal — experiment freely.';
  el.golf.textContent = level
    ? `commands ${state.golf} · par ${level.par}`
    : `commands ${state.golf}`;
  el.resultType.textContent = typeName(state.result);
  el.statusBar.textContent = state.error
    ? state.error
    : state.steps.length
      ? `${state.steps.length} step${state.steps.length === 1 ? '' : 's'} · last: ${state.steps[state.steps.length - 1].name}`
      : 'ready · try a table function';
  el.statusBar.classList.toggle('is-error', !!state.error);
}

function renderSteps() {
  const root = el.steps;
  root.innerHTML = '';
  const items = [
    {
      name: 'Source',
      exprSrc: state.level?.startTables
        ? Object.entries(state.level.startTables)
            .map(([a, b]) => `${a} (${b})`)
            .join(', ')
        : 'Sales · Employees · Orders',
      result: state.level?.startTables
        ? envLookup(state.env, Object.keys(state.level.startTables).slice(-1)[0])
        : envLookup(state.env, 'Sales'),
      fixed: true,
    },
    ...state.steps.map((s, i) => ({ ...s, index: i })),
  ];

  items.forEach((item, i) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'step-node';
    if (item.fixed) node.classList.add('is-source');
    if (!item.fixed && item.index === state.selectedStep) node.classList.add('is-selected');
    if (!item.fixed && item.index === state.steps.length - 1) node.classList.add('is-latest');
    node.innerHTML = `
      <span class="step-index">${item.fixed ? 'S' : String(item.index + 1)}</span>
      <span class="step-body">
        <span class="step-name">${escapeHtml(item.name)}</span>
        <span class="step-expr">${escapeHtml(item.exprSrc)}</span>
        <span class="step-meta">${escapeHtml(typeName(item.result))}${isTable(item.result) ? ` · ${item.result.rows.length}×${item.result.columns.length}` : ''}</span>
      </span>
    `;
    node.addEventListener('click', () => {
      state.selectedStep = item.fixed ? -1 : item.index;
      state.result = item.result;
      renderAll();
    });
    root.appendChild(node);

    if (i < items.length - 1) {
      const arrow = document.createElement('div');
      arrow.className = 'step-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      root.appendChild(arrow);
    }
  });
}

function renderTable() {
  const wrap = el.tableWrap;
  const v = state.selectedStep >= 0 && state.steps[state.selectedStep]
    ? state.steps[state.selectedStep].result
    : state.result;

  if (v === undefined || v === null) {
    wrap.innerHTML = '<p class="empty">No value yet. Evaluate an expression.</p>';
    return;
  }

  if (!isTable(v)) {
    wrap.innerHTML = `
      <div class="scalar-result">
        <div class="scalar-type">${escapeHtml(typeName(v))}</div>
        <pre class="scalar-value">${escapeHtml(formatValue(v))}</pre>
      </div>`;
    return;
  }

  const cols = v.columns.map((c) => c.name);
  const head = v.columns
    .map((c) => `<th><span class="th-name">${escapeHtml(c.name)}</span><span class="th-type">${escapeHtml(c.type || 'any')}</span></th>`)
    .join('');
  const body = v.rows
    .map(
      (r) =>
        `<tr>${cols
          .map((c) => `<td>${escapeHtml(formatCell(r[c]))}</td>`)
          .join('')}</tr>`
    )
    .join('');
  wrap.innerHTML = `
    <div class="grid-meta">${v.rows.length} rows × ${v.columns.length} columns</div>
    <div class="grid-scroll">
      <table class="data-grid">
        <thead><tr>${head}</tr></thead>
        <tbody>${body || `<tr><td colspan="${cols.length}" class="empty">0 rows</td></tr>`}</tbody>
      </table>
    </div>`;
}

/**
 * @param {any} v
 */
function formatCell(v) {
  if (v === null || v === undefined) return 'null';
  if (isTable(v)) return '«table»';
  if (Array.isArray(v)) return formatValue(v);
  if (typeof v === 'object') return formatValue(v);
  return String(v);
}

function renderCode() {
  el.codeOut.textContent = buildMCode();
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

function openModal(title, html) {
  el.modalTitle.textContent = title;
  el.modalBody.innerHTML = html;
  el.modal.hidden = false;
  el.modal.querySelector('[data-close]')?.addEventListener('click', closeModal);
}

function closeModal() {
  el.modal.hidden = true;
}

function openLevelsModal() {
  const byTab = new Map();
  for (const l of LEVELS) {
    if (!byTab.has(l.tab)) byTab.set(l.tab, []);
    byTab.get(l.tab).push(l);
  }
  let html = '<div class="levels-grid">';
  for (const [tab, list] of byTab) {
    html += `<section class="level-tab"><h3>${escapeHtml(tab)}</h3>`;
    for (const l of list) {
      const best = state.solvedLevels[l.id];
      html += `<button type="button" class="level-card" data-level="${escapeHtml(l.id)}">
        <span class="level-card-title">${escapeHtml(l.title)}</span>
        <span class="level-card-blurb">${escapeHtml(l.blurb)}</span>
        <span class="level-card-meta">par ${l.par}${best === undefined ? '' : ` · best ${best}`}${best === undefined ? '' : ' · solved'}</span>
      </button>`;
    }
    html += '</section>';
  }
  html += '</div><button type="button" data-close>Close</button>';
  openModal('Levels', html);
  el.modalBody.querySelectorAll('[data-level]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeModal();
      loadLevel(btn.getAttribute('data-level'));
    });
  });
}

function openIntro() {
  const levelCount = LEVELS.length;
  openModal(
    'learn-m',
    `<p class="intro-lead">Interactive <strong>Power Query M</strong> tutor — sandbox + guided levels.</p>
     <p class="intro-lead">The board shows <strong>Applied Steps → Preview</strong>. That is the material flow M manages.</p>
     <ul class="intro-list">
       <li>Basics: <code>let</code>, <code>if</code>, lists, records</li>
       <li>Tables: <code>Table.SelectRows</code>, <code>AddColumn</code>, <code>Sort</code></li>
       <li>Shape: <code>Unpivot</code>, <code>Pivot</code>, <code>SplitColumn</code>, types</li>
       <li>Blend: <code>JoinKind</code>, <code>NestedJoin</code>, <code>Table.Group</code></li>
       <li>Sources: <code>Csv.Document</code>, <code>Excel.CurrentWorkbook</code></li>
     </ul>
     <p class="intro-meta">Meta: <code>levels</code>, <code>goal</code>, <code>hint</code>, <code>solution</code>, <code>steps</code>, <code>code</code>, <code>undo</code>, <code>reset</code>.</p>
     <p class="intro-count"><strong>${levelCount}</strong> levels included. Open Levels to begin, or stay in sandbox.</p>

     <h3 class="intro-h">What is learn-m?</h3>
     <p class="intro-body">A browser lab bench for Power Query M: you type real-shaped <code>M</code> expressions and watch applied steps, tables, and generated <code>let…in</code> code update. No Power BI install required for the tutorial core.</p>

     <h3 class="intro-h">Publisher</h3>
     <p class="intro-body">Published and maintained by <strong>Ali Sadeghi Aghili</strong> — programmer, data engineer / scientist, ML engineer.
       <a href="https://linktr.ee/aliaghili" target="_blank" rel="noopener noreferrer">linktr.ee/aliaghili</a>
     </p>
     <ul class="intro-list">
       <li><a href="https://github.com/alisadeghiaghili/learn-m" target="_blank" rel="noopener noreferrer">GitHub — source &amp; issues</a></li>
     </ul>
     <p class="intro-body">Support the publisher: <a href="https://linktr.ee/aliaghili" target="_blank" rel="noopener noreferrer">linktr.ee/aliaghili</a></p>

     <div class="intro-actions">
       <button type="button" class="btn" id="intro-sandbox">Sandbox</button>
       <button type="button" class="btn btn-primary" id="intro-levels">Open levels</button>
     </div>`
  );
  $('#intro-levels')?.addEventListener('click', () => {
    closeModal();
    openLevelsModal();
  });
  $('#intro-sandbox')?.addEventListener('click', () => {
    closeModal();
    gotoSandbox();
    el.terminalInput.focus();
  });
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function bindUi() {
  el.terminalInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const raw = el.terminalInput.value;
    el.terminalInput.value = '';
    termPrint(`» ${raw}`, 'echo');
    const line = raw.trim();
    if (!line) return;
    if (!tryMeta(line)) runLine(line);
  });

  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      if (action === 'levels') openLevelsModal();
      if (action === 'undo') undo();
      if (action === 'reset') {
        resetQuery(true);
        termPrint('Steps cleared', 'muted');
      }
      if (action === 'sandbox') gotoSandbox();
      if (action === 'intro') openIntro();
    });
  });

  el.modal.addEventListener('click', (e) => {
    if (e.target === el.modal) closeModal();
  });

  // URL ?level=basics-1&NODEMO&command=help
  const params = new URLSearchParams(location.search);
  const levelParam = params.get('level');
  const noDemo = params.get('NODEMO') !== null;
  const commandParam = params.get('command');
  if (levelParam) {
    loadLevel(levelParam);
    if (!noDemo && !commandParam) openIntro();
  } else if (!noDemo && !state.introSeen && !commandParam) {
    gotoSandbox();
    openIntro();
    state.introSeen = true;
  } else {
    gotoSandbox();
  }

  if (commandParam) {
    for (const raw of commandParam.split(';')) {
      const line = raw.trim();
      if (!line) continue;
      termPrint(`» ${line}`, 'echo');
      if (!tryMeta(line)) runLine(line);
    }
  }

  el.terminalInput.focus();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

state.env = freshEnv();
bindUi();

// expose for debugging / tests
globalThis.learnM = {
  state,
  runLine,
  loadLevel,
  evalM,
  LEVELS,
  mEquals,
  buildMCode,
};
