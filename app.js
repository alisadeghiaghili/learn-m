/**
 * learn-m — Power Query M interactive tutor.
 * Terminal + Applied Steps pipeline + live table preview + Learning Guide.
 */

import {
  createStdlib,
  envDefine,
  envLookup,
  evalM,
  formatValue,
  isTable,
  makeEnv,
  parseStepBinding,
  sampleDatasets,
  typeName,
  MError,
} from './m-engine.js';
import { LEVELS, getLevel, tabs } from './levels.js';
import { renderStepsHtml, renderPreviewHtml, buildMCode } from './board.js';
import { renderDockHtml } from './dock.js';
import { getAvailableTables } from './schema.js';
import { TerminalView } from './terminal.js';
import { renderMarkdown, showModal, escapeHtml } from './dialog.js';
import { launchConfetti, playFanfare } from './confetti.js';
import { loadProgress, saveProgress, summarizeCurriculum } from './progress.js';
import { buildShareTargets, copySharePayload, openShareWindow, REPO_URL, COFFEE_URL } from './share.js';
import { uiHelpModalHtml, startUiTour } from './ui-help.js';
import { getCachedVisitorCount, getVisitorCount } from './visitor-counter.js';
import { getLocale, setLocale, ui, initLocale, LOCALES } from './i18n/index.js';

function renderDiffDots(difficulty) {
  const n = Math.max(0, Math.min(5, difficulty));
  return Array.from({ length: 5 }, (_, i) => `<i class="diff-dot${i < n ? ' on' : ''}"></i>`).join('');
}

export class App {
  /**
   * @param {HTMLElement} root
   */
  constructor(root) {
    this.root = root;
    this.progress = loadProgress();
    this.steps = [];
    this.history = [];
    this.golfCommands = [];
    this.level = null;
    this.solved = false;
    this.selectedStep = -1;
    this.result = null;
    this.error = null;
    this.env = this.freshEnv();
    this.offeredCelebration = false;
    this.peekedTable = null;
    this.dockView = 'both';

    initLocale();
    this.mount();
    this.gotoSandbox(false);
    this.initVisitorCounter();
    this.checkInitialModal();
  }

  freshEnv() {
    const env = createStdlib();
    const data = sampleDatasets();
    for (const [name, table] of Object.entries(data)) {
      envDefine(env, name, table);
    }
    return env;
  }

  mount() {
    const u = ui();
    const currentLang = getLocale();
    const langItems = LOCALES.map(
      (loc) => `<button type="button" class="lang-option${currentLang === loc ? ' on' : ''}" data-lang="${loc}" role="menuitem">${loc.toUpperCase()}</button>`
    ).join('');

    this.root.innerHTML = `
      <div class="app-main">
        <header class="toolbar">
          <div class="brand" data-help-id="brand">Learn<span>M</span></div>
          <div class="level-title" id="level-title" data-help-id="level-title"></div>
          <div class="toolbar-actions" data-help-id="toolbar">
            <div class="lang-menu">
              <button type="button" class="lang-btn" data-action="lang-toggle" aria-haspopup="menu" aria-expanded="false" aria-label="${escapeHtml(u.language)}">
                <span data-lang-label>${currentLang.toUpperCase()}</span>
                <span class="lang-caret" aria-hidden="true"></span>
              </button>
              <div class="lang-dropdown" id="lang-dropdown" role="menu" hidden>
                ${langItems}
              </div>
            </div>

            <button type="button" class="nav-toggle" data-action="nav-toggle" aria-label="${escapeHtml(u.menuLabel)}" aria-expanded="false" aria-controls="nav-drawer">
              <span class="nav-bars" aria-hidden="true"></span>
            </button>

            <div class="nav-drawer" id="nav-drawer" hidden>
              <button type="button" data-action="levels">${escapeHtml(u.levels)}</button>
              <button type="button" data-action="intro" title="${escapeHtml(u.lessonTitle)}">${escapeHtml(u.lesson)}</button>
              <button type="button" data-action="goal">${escapeHtml(u.guide)}</button>
              <button type="button" data-action="hint">${escapeHtml(u.hint)}</button>
              <button type="button" data-action="solution">${escapeHtml(u.solution)}</button>
              <button type="button" data-action="undo">${escapeHtml(u.undo)}</button>
              <button type="button" data-action="reset">${escapeHtml(u.reset)}</button>
              <button type="button" data-action="sandbox" class="ghost">${escapeHtml(u.sandboxBtn)}</button>
              <button type="button" class="help-btn" data-action="help" title="${escapeHtml(u.uiGuideTitle)}" aria-label="${escapeHtml(u.help)}">?</button>
            </div>

            <span class="tb-stat visitors" id="visitor-stat" data-help-id="links" title="${escapeHtml(u.visitorsTitle)}" hidden>
              <svg class="visitor-icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0-2.21-2.69-4-6-4s-6 1.79-6 4v1h12v-1zm-1.07 0H3.07C3.56 11.83 5.48 11 8 11s4.44.83 4.93 2z"/></svg>
              <span class="visitor-count" id="visitor-count"></span>
            </span>

            <a class="tb-link gh" data-help-id="links" href="${REPO_URL}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(u.githubTitle)}" aria-label="GitHub repository">
              <svg class="gh-mark" viewBox="0 0 16 16" aria-hidden="true" width="18" height="18"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
            </a>

            <a class="tb-link support" data-help-id="links" href="${COFFEE_URL}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(u.supportTitle)}">
              ${escapeHtml(u.support)}
            </a>
          </div>
        </header>

        <div id="win-banner" hidden></div>

        <div class="workbench" id="board-wrap">
          <div class="steps-container" id="board-steps"></div>
          <div class="workbench-main">
            <div class="preview-container" id="table-wrap"></div>
            <div class="code-container" id="board-code">
              <div class="code-header">
                <span class="code-title">${escapeHtml(u.generatedMTitle)}</span>
                <button type="button" class="btn btn-sm btn-copy-code" id="btn-copy-m">${escapeHtml(u.copyMCode)}</button>
              </div>
              <pre class="code-pre"><code id="code-out"></code></pre>
            </div>
          </div>
        </div>

        <div class="terminal" id="terminal" data-help-id="term-log"></div>
      </div>

      <aside class="dock" id="dock" data-help-id="dock" aria-label="${escapeHtml(u.guidePanel)}"></aside>
    `;

    this.boardStepsEl = this.root.querySelector('#board-steps');
    this.boardTableEl = this.root.querySelector('#table-wrap');
    this.codeOutEl = this.root.querySelector('#code-out');
    this.dockEl = this.root.querySelector('#dock');
    this.titleEl = this.root.querySelector('#level-title');

    this.terminal = new TerminalView(this.root.querySelector('#terminal'), (cmd) => this.handleCommand(cmd));

    this.bindEvents();
  }

  bindEvents() {
    // Brand click returns to sandbox
    this.root.querySelector('.brand')?.addEventListener('click', () => this.gotoSandbox(true));

    // Toolbar buttons
    this.root.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'nav-toggle') {
          this.toggleNav();
          return;
        }
        if (action === 'lang-toggle') {
          this.toggleLang();
          return;
        }
        this.closeNav();
        this.closeLang();

        if (action === 'levels') this.openLevels();
        if (action === 'lesson' || action === 'intro') this.replayLesson();
        if (action === 'goal') this.focusGuide();
        if (action === 'hint') this.handleCommand('hint');
        if (action === 'solution') this.handleCommand('solution');
        if (action === 'undo') this.handleCommand('undo');
        if (action === 'reset') this.handleCommand('reset');
        if (action === 'sandbox') this.handleCommand('sandbox');
        if (action === 'help') this.openUiHelp();
        this.terminal.focus();
      });
    });

    // Language switcher options
    this.root.querySelectorAll('[data-lang]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const loc = btn.dataset.lang;
        if (loc && loc !== getLocale()) {
          setLocale(loc);
          this.remountAfterLocale();
        }
        this.closeLang();
      });
    });

    // Copy M Code button
    this.root.querySelector('#btn-copy-m')?.addEventListener('click', async () => {
      const code = buildMCode(this.steps);
      const ok = await copySharePayload(code);
      const btn = this.root.querySelector('#btn-copy-m');
      if (btn) {
        btn.textContent = ok ? ui().mCopied : 'Error';
        setTimeout(() => {
          btn.textContent = ui().copyMCode;
        }, 1800);
      }
    });

    // Dock dynamic clicks (tabs, peek, insert, hint, solution)
    this.dockEl.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('[data-dock-view]');
      if (tabBtn) {
        this.dockView = tabBtn.dataset.dockView || 'both';
        this.renderDock();
        return;
      }

      const peekBtn = e.target.closest('[data-peek-table]');
      if (peekBtn) {
        const tName = peekBtn.dataset.peekTable;
        this.peekedTable = this.peekedTable === tName ? null : tName;
        this.renderBoard();
        this.renderDock();
        return;
      }

      const insertTableBtn = e.target.closest('[data-insert-table]');
      if (insertTableBtn) {
        const tName = insertTableBtn.dataset.insertTable;
        this.terminal.insertText(tName);
        return;
      }

      const insertColBtn = e.target.closest('[data-insert-col]');
      if (insertColBtn) {
        const colName = insertColBtn.dataset.insertCol;
        this.terminal.insertText(`[${colName}]`);
        return;
      }

      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'hint') this.handleCommand('hint');
      if (action === 'solution') this.handleCommand('solution');
    });

    // Board table clicks (exit peek mode)
    this.boardTableEl.addEventListener('click', (e) => {
      const exitBtn = e.target.closest('[data-action="exit-peek"]');
      if (exitBtn) {
        this.peekedTable = null;
        this.renderBoard();
        this.renderDock();
      }
    });

    // Step node click to view historical step
    this.boardStepsEl.addEventListener('click', (e) => {
      const node = e.target.closest('[data-step-index]');
      if (!node) return;
      this.peekedTable = null;
      const idx = Number(node.dataset.stepIndex);
      this.selectedStep = idx;
      if (idx === -1) {
        this.result = this.level?.startTables
          ? envLookup(this.env, Object.keys(this.level.startTables).slice(-1)[0])
          : envLookup(this.env, 'Sales');
      } else if (this.steps[idx]) {
        this.result = this.steps[idx].result;
      }
      this.renderAll();
    });

    // Close menus on outside click or Escape
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.lang-menu')) this.closeLang();
      if (!e.target.closest('.toolbar-actions')) this.closeNav();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeLang();
        this.closeNav();
      }
    });
  }

  toggleNav() {
    const drawer = this.root.querySelector('#nav-drawer');
    const btn = this.root.querySelector('[data-action="nav-toggle"]');
    if (!drawer || !btn) return;
    const open = drawer.classList.toggle('is-open');
    drawer.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) this.closeLang();
  }

  closeNav() {
    const drawer = this.root.querySelector('#nav-drawer');
    const btn = this.root.querySelector('[data-action="nav-toggle"]');
    if (!drawer || !btn) return;
    drawer.classList.remove('is-open');
    drawer.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }

  toggleLang() {
    const menu = this.root.querySelector('#lang-dropdown');
    const btn = this.root.querySelector('[data-action="lang-toggle"]');
    if (!menu || !btn) return;
    const open = menu.classList.toggle('is-open');
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) this.closeNav();
  }

  closeLang() {
    const menu = this.root.querySelector('#lang-dropdown');
    const btn = this.root.querySelector('[data-action="lang-toggle"]');
    if (!menu || !btn) return;
    menu.classList.remove('is-open');
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }

  remountAfterLocale() {
    const currentLevelId = this.level?.id;
    this.mount();
    if (currentLevelId) {
      this.loadLevel(currentLevelId, false);
    } else {
      this.renderAll();
    }
    this.initVisitorCounter();
  }

  focusGuide() {
    this.dockEl.scrollIntoView({ behavior: 'smooth' });
    this.dockEl.classList.add('dock-pulse');
    setTimeout(() => this.dockEl.classList.remove('dock-pulse'), 1200);
  }

  async initVisitorCounter() {
    const statEl = this.root.querySelector('#visitor-stat');
    const countEl = this.root.querySelector('#visitor-count');
    if (!statEl || !countEl) return;

    const cached = getCachedVisitorCount();
    if (cached) {
      countEl.textContent = Number(cached).toLocaleString();
      statEl.hidden = false;
    }

    try {
      const fresh = await getVisitorCount();
      if (fresh && fresh > 0) {
        countEl.textContent = Number(fresh).toLocaleString();
        statEl.hidden = false;
      }
    } catch {
      // offline
    }
  }

  checkInitialModal() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('NODEMO')) {
      this.replayLesson();
    }
  }

  pushHistory() {
    this.history.push({
      steps: this.steps.map((s) => ({ ...s })),
      golfCommands: [...this.golfCommands],
      level: this.level,
      solved: this.solved,
      selectedStep: this.selectedStep,
      result: this.result,
    });
    if (this.history.length > 50) this.history.shift();
  }

  undo() {
    const prev = this.history.pop();
    if (!prev) {
      this.terminal.pushMeta('Nothing to undo.');
      return;
    }
    this.steps = prev.steps;
    this.golfCommands = prev.golfCommands;
    this.level = prev.level;
    this.solved = prev.solved;
    this.selectedStep = prev.selectedStep;
    this.result = prev.result;
    this.error = null;
    this.renderAll();
    this.terminal.pushMeta('Undid last command.');
  }

  resetCurrent(keepLevel = true) {
    this.pushHistory();
    this.steps = [];
    this.golfCommands = [];
    this.solved = false;
    this.selectedStep = -1;
    this.error = null;
    this.env = this.freshEnv();

    if (keepLevel && this.level) {
      this.applyLevelSetup(this.level);
    } else {
      this.result = envLookup(this.env, 'Sales');
    }
    this.renderAll();
    this.terminal.pushMeta('Reset to initial state.');
  }

  applyLevelSetup(level) {
    this.env = this.freshEnv();
    this.steps = [];
    this.golfCommands = [];
    this.solved = false;
    this.selectedStep = -1;
    this.offeredCelebration = false;
    this.peekedTable = null;
    this.dockView = 'both';

    if (level.startTables) {
      const data = sampleDatasets();
      for (const [bindName, dataKey] of Object.entries(level.startTables)) {
        envDefine(this.env, bindName, data[dataKey] || data.Sales);
      }
      const keys = Object.keys(level.startTables);
      this.result = envLookup(this.env, keys[keys.length - 1]);
    } else {
      this.result = envLookup(this.env, 'Sales');
    }
    envDefine(this.env, 'Prev', this.result);
  }

  gotoSandbox(printMessage = true) {
    this.pushHistory();
    this.level = null;
    this.solved = false;
    this.golfCommands = [];
    this.steps = [];
    this.selectedStep = -1;
    this.env = this.freshEnv();
    this.result = envLookup(this.env, 'Sales');
    this.error = null;
    this.offeredCelebration = false;
    this.peekedTable = null;
    this.dockView = 'both';
    const winBanner = this.root.querySelector('#win-banner');
    if (winBanner) winBanner.hidden = true;

    this.renderAll();
    if (printMessage) {
      this.terminal.pushMeta(ui().appWelcome);
      this.terminal.pushMeta(ui().sandboxSeeded);
    }
    this.terminal.setHint('Table.SelectRows(Sales, each [Region] = "West")');
  }

  loadLevel(id, showDialog = true) {
    const level = getLevel(id);
    if (!level) {
      this.terminal.pushErr(`Unknown level '${id}'. Type 'levels' to see the curriculum.`);
      return;
    }
    this.pushHistory();
    this.level = level;
    this.applyLevelSetup(level);
    this.renderAll();

    this.terminal.pushMeta(`— Level ${level.id}: ${level.title} —`);
    this.terminal.pushOut(level.blurb);
    this.terminal.pushOk(`Goal: ${level.goalText}`);
    this.terminal.pushMeta(`Par: ${level.par} command${level.par === 1 ? '' : 's'} · Type 'hint' or 'solution' if needed.`);

    this.terminal.setHint(level.hint || level.solution || null);

    if (showDialog) {
      this.showLevelBrief(level);
    }
  }

  showLevelBrief(level) {
    showModal({
      title: `${level.tab}: ${level.title}`,
      bodyHtml: renderMarkdown(`
### ${level.title}
${level.blurb}

**Goal:** ${level.goalText}
**Par:** ${level.par} command${level.par === 1 ? '' : 's'}

\`\`\`m
// Hint:
${level.hint}
\`\`\`
      `),
      actions: [{ label: 'Start Level', className: 'primary', onClick: () => this.terminal.focus() }],
    });
  }

  handleCommand(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return;

    this.peekedTable = null;
    this.terminal.pushCmd(trimmed);

    // Check meta commands
    if (this.handleMeta(trimmed)) {
      this.terminal.focus();
      return;
    }

    // Execute as Power Query M expression or step assignment
    this.executeM(trimmed);
    this.terminal.focus();
  }

  handleMeta(line) {
    const parts = line.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ');

    switch (cmd) {
      case 'help':
        this.terminal.pushOut(`Commands:
  levels            open curriculum level selector
  level <id>        load specific level by ID
  sandbox           switch to free play sandbox
  goal              display current level objective
  hint              get a nudge for the current level
  solution          peek at the solution
  steps             list applied transformation steps
  code              display generated let…in code
  undo              undo the last command
  reset             reset current level or sandbox
  clear             clear the terminal log
  tour              start interactive UI highlight tour
  help              show this help message`);
        return true;

      case 'levels':
        this.openLevels();
        return true;

      case 'level':
        if (!arg) {
          this.terminal.pushErr('Usage: level <id> (e.g. level intro-1)');
        } else {
          this.loadLevel(arg);
        }
        return true;

      case 'sandbox':
        this.gotoSandbox(true);
        return true;

      case 'goal':
        if (!this.level) {
          this.terminal.pushMeta('Sandbox mode has no goal. Type "levels" to pick a level.');
        } else {
          this.terminal.pushOk(`Goal: ${this.level.goalText}`);
        }
        return true;

      case 'hint':
        if (!this.level) {
          this.terminal.pushMeta('No active level. Type "levels" to pick a lesson.');
        } else {
          this.terminal.pushOut(`💡 Hint: ${this.level.hint}`);
        }
        return true;

      case 'solution':
        if (!this.level) {
          this.terminal.pushMeta('No active level.');
        } else {
          this.terminal.pushOk(`🔑 Solution: ${this.level.solution}`);
        }
        return true;

      case 'steps':
        if (!this.steps.length) {
          this.terminal.pushOut('(No applied steps yet)');
        } else {
          this.steps.forEach((s, i) => {
            this.terminal.pushOut(`${i + 1}. ${s.name} = ${s.exprSrc}`);
          });
        }
        return true;

      case 'code':
        this.terminal.pushOut(buildMCode(this.steps));
        return true;

      case 'undo':
        this.undo();
        return true;

      case 'reset':
        this.resetCurrent(true);
        return true;

      case 'clear':
        this.terminal.clear();
        return true;

      case 'tour':
        this.openUiHelp();
        return true;

      default:
        return false;
    }
  }

  executeM(src) {
    this.pushHistory();
    this.golfCommands.push(src);
    this.error = null;

    try {
      const step = parseStepBinding(src);
      if (step) {
        const local = makeEnv(this.env);
        if (this.steps.length) {
          envDefine(local, 'Prev', this.steps[this.steps.length - 1].result);
        }
        const evaluated = evalM(step.exprSrc, local);
        envDefine(this.env, step.name, evaluated);
        envDefine(this.env, 'Prev', evaluated);

        this.steps.push({
          name: step.name,
          exprSrc: step.exprSrc,
          fullSrc: src,
          result: evaluated,
        });
        this.result = evaluated;
        this.selectedStep = this.steps.length - 1;

        const info = isTable(evaluated)
          ? `[Table: ${evaluated.rows.length} rows × ${evaluated.columns.length} columns]`
          : formatValue(evaluated);
        this.terminal.pushOut(`Step "${step.name}" applied. Result: ${info}`);
      } else {
        const local = makeEnv(this.env);
        if (this.steps.length) {
          envDefine(local, 'Prev', this.steps[this.steps.length - 1].result);
        }
        const evaluated = evalM(src, local);
        this.result = evaluated;
        this.selectedStep = -1;

        const info = isTable(evaluated)
          ? `[Table: ${evaluated.rows.length} rows × ${evaluated.columns.length} columns]`
          : formatValue(evaluated);
        this.terminal.pushOut(info);
      }
    } catch (err) {
      this.error = err instanceof MError || err instanceof Error ? err.message : String(err);
      this.terminal.pushErr(`Error: ${this.error}`);
      // Remove failed attempts from command golf
      this.golfCommands.pop();
    }

    this.renderAll();
    if (!this.error) {
      this.checkWin();
    }
  }

  checkWin() {
    if (!this.level || this.solved) return;

    const ctx = {
      env: this.env,
      result: this.result,
      steps: this.steps,
      source: this.steps.map((s) => s.fullSrc).join('\n'),
      commands: this.golfCommands,
    };

    let ok = false;
    try {
      ok = Boolean(this.level.check(ctx));
    } catch {
      ok = false;
    }

    if (ok) {
      this.solved = true;
      const num = this.golfCommands.length;
      const prev = this.progress[this.level.id];
      const best = prev?.bestCommands === undefined ? num : Math.min(prev.bestCommands, num);

      this.progress[this.level.id] = { solved: true, bestCommands: best };
      saveProgress(this.progress);

      this.terminal.pushOk(`✓ LEVEL CLEARED: ${this.level.title}!`);
      this.terminal.pushMeta(ui().commandsUsed(num, this.level.par));

      this.renderAll();
      this.celebrateWin();
    }
  }

  celebrateWin() {
    const winBanner = this.root.querySelector('#win-banner');
    if (winBanner) winBanner.hidden = false;

    if (this.offeredCelebration) return;
    this.offeredCelebration = true;

    const level = this.level;
    const cmds = this.golfCommands.length;
    const curriculum = summarizeCurriculum(this.progress);
    const total = LEVELS.length;
    const idx = LEVELS.findIndex((l) => l.id === level.id);
    const next = idx >= 0 && idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;

    const underPar = cmds <= level.par;
    const golfLine = underPar
      ? `**${cmds}** ${ui().idealForLevelShort(level.par)} — Outstanding!`
      : `**${cmds}** commands. Par target is ${level.par}. Solved and recorded!`;

    const shareTargets = buildShareTargets({
      levelName: level.title,
      levelId: level.id,
      commands: cmds,
      par: level.par,
      curriculum,
    });

    const bodyHtml = `
      <div class="celebrate" aria-live="polite">
        <div class="celebrate-visual" aria-hidden="true">
          <div class="celebrate-ring"></div>
          <div class="celebrate-star">★</div>
        </div>
        <div class="celebrate-badge">LEVEL CLEARED</div>
        <h3 class="celebrate-title">${escapeHtml(level.title)}</h3>
        <p class="celebrate-sub">${escapeHtml(level.tab)} · <code>${escapeHtml(level.id)}</code></p>
        <div class="celebrate-stats">${renderMarkdown(golfLine)}</div>
        <div class="celebrate-progress">
          <div class="prog-track"><div class="prog-fill" style="width:${curriculum.percent}%"></div></div>
          <div class="par-note">${curriculum.solvedCount} / ${total} levels solved (${curriculum.percent}%)</div>
        </div>
        <div class="share-block">
          <div class="next-title">${escapeHtml(ui().shareTitle)}</div>
          <div class="share-row" role="group" aria-label="${escapeHtml(ui().shareGroupLabel)}">
            <button type="button" class="btn btn-share linkedin" data-share="linkedin">${escapeHtml(ui().linkedin)}</button>
            <button type="button" class="btn btn-share x" data-share="x">${escapeHtml(ui().xTwitter)}</button>
            <button type="button" class="btn btn-share whatsapp" data-share="whatsapp">${escapeHtml(ui().whatsapp)}</button>
            <button type="button" class="btn btn-share telegram" data-share="telegram">${escapeHtml(ui().telegram)}</button>
            <button type="button" class="btn btn-share copy" data-share="copy">${escapeHtml(ui().copyPost)}</button>
          </div>
          <div class="share-status" data-share-status hidden></div>
        </div>
        ${
          next
            ? `<div class="celebrate-next">${renderMarkdown(ui().nextCelebration(next.id, next.title))}</div>`
            : `<div class="celebrate-next">${renderMarkdown(ui().lastInPack)}</div>`
        }
      </div>
    `;

    const confetti = launchConfetti(4500);
    playFanfare();

    const actions = [
      {
        label: ui().baskInIt,
        className: 'ghost',
        onClick: () => {
          this.offeredCelebration = false;
    this.peekedTable = null;
    this.dockView = 'both';
          this.terminal.focus();
        },
      },
    ];

    if (next) {
      actions.push({
        label: ui().celebrateOn(next.id),
        className: 'primary',
        onClick: () => {
          this.offeredCelebration = false;
    this.peekedTable = null;
    this.dockView = 'both';
          this.loadLevel(next.id);
        },
      });
    } else {
      actions.push({
        label: ui().browseLevels,
        className: 'primary',
        onClick: () => {
          this.offeredCelebration = false;
    this.peekedTable = null;
    this.dockView = 'both';
          this.openLevels();
        },
      });
    }

    const modal = showModal({
      title: ui().levelComplete,
      bodyHtml,
      variant: 'celebrate',
      actions: actions.map((a) => ({
        ...a,
        onClick: () => {
          confetti?.stop();
          modal.close();
          a.onClick();
        },
      })),
    });

    // Wire up share buttons inside celebration modal
    modal.el.querySelectorAll('[data-share]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const type = btn.dataset.share;
        const statusEl = modal.el.querySelector('[data-share-status]');
        if (type === 'copy') {
          const ok = await copySharePayload(shareTargets.text);
          if (statusEl) {
            statusEl.textContent = ok ? ui().copied : 'Error copying';
            statusEl.hidden = false;
          }
          return;
        }
        if (shareTargets[type]) {
          openShareWindow(shareTargets[type]);
        }
      });
    });
  }

  openLevels() {
    const byTab = new Map();
    for (const l of LEVELS) {
      if (!byTab.has(l.tab)) byTab.set(l.tab, []);
      byTab.get(l.tab).push(l);
    }

    let bodyHtml = `
      <p>${escapeHtml(ui().pickChallenge)}</p>
      <div class="legend-box">
        <div class="next-title">${escapeHtml(ui().howToRead)}</div>
        <ul class="legend-list">
          <li>
            <span class="diff-dots" aria-hidden="true">${renderDiffDots(3)}</span>
            ${renderMarkdown(ui().difficultyLegend)}
          </li>
          <li><span class="par-note">ideal 2 cmds</span> ${renderMarkdown(ui().idealLegend)}</li>
          <li><span class="chip ok">${escapeHtml(ui().solvedLabel)} 2</span> ${renderMarkdown(ui().solvedLegend)}</li>
        </ul>
      </div>
    `;

    for (const [tab, list] of byTab) {
      const rows = list
        .map((l) => {
          const p = this.progress[l.id];
          const diff = l.difficulty || Math.min(5, Math.max(1, Math.ceil(l.par * 1.5)));
          const diffLabel = ui().difficultyOf ? ui().difficultyOf(diff) : `Difficulty: ${diff}`;
          return `
            <button type="button" class="level-row${p?.solved ? ' solved' : ''}" data-level="${escapeHtml(l.id)}">
              <span class="id">${escapeHtml(l.id)}</span>
              <span class="name">${escapeHtml(l.title)}</span>
              <span class="par-note">ideal ${l.par} cmd${l.par === 1 ? '' : 's'}</span>
              <span class="chip${p?.solved ? ' ok' : ''}" title="${escapeHtml(diffLabel)}">
                ${p?.solved ? `${escapeHtml(ui().solvedLabel)} ${p.bestCommands ?? ''}` : `<span class="diff-dots" aria-label="${escapeHtml(diffLabel)}">${renderDiffDots(diff)}</span>`}
              </span>
            </button>
          `;
        })
        .join('');

      bodyHtml += `<div class="series-block"><h3>${escapeHtml(tab)}</h3><div class="level-list">${rows}</div></div>`;
    }

    const modal = showModal({
      title: ui().levelsTitle,
      bodyHtml,
      actions: [{ label: ui().close, className: 'ghost', onClick: () => modal.close() }],
    });

    modal.el.querySelectorAll('[data-level]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.level;
        modal.close();
        if (id) this.loadLevel(id);
      });
    });
  }

  replayLesson() {
    if (this.level) {
      this.showLevelBrief(this.level);
      return;
    }

    const levelCount = LEVELS.length;
    const bodyHtml = `
      <p class="intro-lead">Interactive <strong>Power Query M</strong> tutor — sandbox + guided levels.</p>
      <p class="intro-lead">The board shows <strong>Applied Steps → Preview Table</strong>. That is the material flow M manages.</p>
      <ul class="intro-list">
        <li><strong>Basics</strong>: <code>let…in</code> expressions, <code>if then else</code>, lists, records</li>
        <li><strong>Tables</strong>: <code>Table.SelectRows</code>, <code>Table.AddColumn</code>, <code>Table.Sort</code></li>
        <li><strong>Shaping</strong>: <code>Table.UnpivotOtherColumns</code>, <code>Table.Pivot</code>, <code>Table.SplitColumn</code></li>
        <li><strong>Blending</strong>: <code>Table.NestedJoin</code>, <code>Table.Group</code>, <code>Table.Combine</code></li>
      </ul>
      <p class="intro-meta">Meta commands: <code>levels</code>, <code>goal</code>, <code>hint</code>, <code>solution</code>, <code>steps</code>, <code>code</code>, <code>undo</code>, <code>reset</code>.</p>
      <p class="intro-count"><strong>${levelCount}</strong> interactive levels included.</p>

      <h3 class="intro-h">Publisher</h3>
      <p class="intro-body">Published and maintained by <strong>Ali Sadeghi Aghili</strong> — programmer, data scientist &amp; ML engineer.<br/>
        <a href="https://linktr.ee/aliaghili" target="_blank" rel="noopener noreferrer">linktr.ee/aliaghili</a> ·
        <a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">GitHub Repository</a>
      </p>
    `;

    const modal = showModal({
      title: ui().aboutTitle,
      bodyHtml,
      actions: [
        { label: 'Sandbox', id: 'intro-sandbox', className: 'ghost', onClick: () => this.gotoSandbox(true) },
        { label: 'Open levels', id: 'intro-levels', className: 'primary', onClick: () => this.openLevels() },
      ],
    });
  }

  openUiHelp() {
    const modal = showModal({
      title: ui().uiGuideTitle,
      bodyHtml: uiHelpModalHtml(),
      actions: [{ label: ui().close, className: 'primary', onClick: () => modal.close() }],
    });

    modal.el.querySelectorAll('[data-focus-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.focusId;
        startUiTour(this.root, id, 4000);
      });
    });
  }

  renderAll() {
    this.renderToolbar();
    this.renderBoard();
    this.renderDock();
  }

  renderToolbar() {
    if (!this.titleEl) return;
    if (this.level) {
      this.titleEl.innerHTML = `<span class="level-badge">${escapeHtml(this.level.id)}</span> <span class="level-name">${escapeHtml(this.level.title)}</span>`;
    } else {
      this.titleEl.innerHTML = `<span class="level-badge">SANDBOX</span> <span class="level-name">${escapeHtml(ui().sandboxTitle)}</span>`;
    }
  }

  renderBoard() {
    const initialSource = {
      label: this.level?.startTables
        ? Object.entries(this.level.startTables).map(([a, b]) => `${a} (${b})`).join(', ')
        : 'Sales · Employees · Orders',
      result: this.level?.startTables
        ? envLookup(this.env, Object.keys(this.level.startTables).slice(-1)[0])
        : envLookup(this.env, 'Sales'),
    };

    if (this.boardStepsEl) {
      this.boardStepsEl.innerHTML = renderStepsHtml(this.steps, this.selectedStep, initialSource);
    }

    let currentVal;
    let peekedTable = null;

    if (this.peekedTable) {
      const peekObj = envLookup(this.env, this.peekedTable);
      if (peekObj) {
        currentVal = peekObj;
        peekedTable = this.peekedTable;
      }
    }

    if (!peekedTable) {
      currentVal = this.selectedStep >= 0 && this.steps[this.selectedStep]
        ? this.steps[this.selectedStep].result
        : this.result;
    }

    if (this.boardTableEl) {
      this.boardTableEl.innerHTML = renderPreviewHtml(currentVal, { peekedTable });
    }

    if (this.codeOutEl) {
      this.codeOutEl.textContent = buildMCode(this.steps);
    }
  }

  renderDock() {
    if (!this.dockEl) return;
    const tables = getAvailableTables(this.env, this.level);

    // Sync extra completions in terminal
    const tableNames = tables.map((t) => t.name);
    const colNames = tables.flatMap((t) => t.columns.map((c) => `[${c.name}]`));
    this.terminal.setExtraCompletions([...tableNames, ...colNames]);

    this.dockEl.innerHTML = renderDockHtml({
      level: this.level,
      solved: this.solved,
      golfCount: this.golfCommands.length,
      progress: this.progress,
      tables,
      dockView: this.dockView,
      peekedTable: this.peekedTable,
    });
  }
}

// Bootstrap
function bootstrap() {
  const root = document.querySelector('#app');
  if (root && !window.__app) {
    window.__app = new App(root);
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
