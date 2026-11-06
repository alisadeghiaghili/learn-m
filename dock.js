import { escapeHtml, renderMarkdown } from './dialog.js';
import { ui } from './i18n/index.js';
import { renderSchemaHtml } from './schema.js';

/**
 * Builds the HTML for the Learning Guide dock (Goal + Source Tables Schema).
 * @param {Object} opts
 * @param {any | null} opts.level
 * @param {boolean} opts.solved
 * @param {number} opts.golfCount
 * @param {any} [opts.progress]
 * @param {Array<any>} [opts.tables]
 * @param {'both' | 'goal' | 'tables'} [opts.dockView]
 * @param {string | null} [opts.peekedTable]
 * @returns {string}
 */
export function renderDockHtml(opts) {
  const u = ui();
  const level = opts.level;
  const tables = opts.tables || [];
  const dockView = opts.dockView || 'both';

  const switcherHtml = `
    <div class="dock-tabs-bar" role="tablist" aria-label="Dock views">
      <button
        type="button"
        class="dock-tab-btn${dockView === 'both' ? ' on' : ''}"
        data-dock-view="both"
        role="tab"
        aria-selected="${dockView === 'both'}"
      >
        <span>${escapeHtml(u.dockViewBoth)}</span>
      </button>
      <button
        type="button"
        class="dock-tab-btn${dockView === 'goal' ? ' on' : ''}"
        data-dock-view="goal"
        role="tab"
        aria-selected="${dockView === 'goal'}"
      >
        <span>${escapeHtml(u.dockViewGoal)}</span>
      </button>
      <button
        type="button"
        class="dock-tab-btn${dockView === 'tables' ? ' on' : ''}"
        data-dock-view="tables"
        role="tab"
        aria-selected="${dockView === 'tables'}"
      >
        <span>${escapeHtml(u.dockViewTables)}</span>
        <span class="tab-count-badge">${tables.length}</span>
      </button>
    </div>
  `;

  let goalBodyHtml = '';

  if (!level) {
    goalBodyHtml = `
      <div class="dock-scroll-content">
        <div class="dock-header">
          <h2>${escapeHtml(u.learningGuide)}</h2>
        </div>
        <p class="objective">${escapeHtml(u.guideAlwaysOn)}</p>

        <div class="learning-box">
          <div class="next-title">${escapeHtml(u.startHere)}</div>
          <ul>
            ${u.startHereItems.map((item) => `<li>${renderMarkdown(item)}</li>`).join('')}
          </ul>
        </div>

        <div class="learning-box">
          <div class="next-title">${escapeHtml(u.sandboxTip)}</div>
          <ul>
            ${u.sandboxTipItems.map((item) => `<li>${renderMarkdown(item)}</li>`).join('')}
          </ul>
        </div>

        <ul class="goal-list">
          <li class="met">
            <div class="g-label">${escapeHtml(u.noActiveLevel)}</div>
            <div class="g-detail">${escapeHtml(u.noActiveLevelDetail)}</div>
          </li>
        </ul>
        <div class="par-note">${escapeHtml(u.guideFlashNote)}</div>
      </div>
    `;
  } else {
    const p = opts.progress?.[level.id];
    const golfNote = p?.bestCommands !== undefined
      ? u.bestSoFar(p.bestCommands, level.par)
      : u.idealSolution(level.par);

    const isSolved = opts.solved || Boolean(p?.solved);

    const nextBlock = isSolved
      ? `<div class="next-box met">${escapeHtml(u.allSolutionMet)}</div>`
      : `
        <div class="next-box">
          <div class="next-title">${escapeHtml(u.typeNextTitle)}</div>
          <div class="next-row">
            <span class="g-label">${escapeHtml(u.remainingLabel)}</span>
            <code class="g-cmd" dir="ltr">${escapeHtml(level.hint || level.solution)}</code>
          </div>
          <div class="par-note">${escapeHtml(u.wrongCommandNote)}</div>
        </div>
      `;

    goalBodyHtml = `
      <div class="dock-scroll-content">
        <div class="dock-header">
          <span class="series-chip">${escapeHtml(level.tab)}</span>
          <h2>${escapeHtml(level.title)}</h2>
        </div>

        <p class="objective">${escapeHtml(level.blurb)}</p>

        <div class="par-note">${escapeHtml(golfNote)}</div>

        ${nextBlock}

        <div class="goal-section">
          <div class="goal-section-title">Goal</div>
          <ul class="goal-list">
            <li class="${isSolved ? 'met' : 'current'}">
              <div class="g-label">${isSolved ? '✓' : '▶'} <span>${escapeHtml(level.goalText)}</span></div>
            </li>
          </ul>
        </div>

        <div class="dock-actions">
          <button type="button" class="btn btn-sm" data-action="hint">💡 ${escapeHtml(u.hint)}</button>
          <button type="button" class="btn btn-sm" data-action="solution">🔑 ${escapeHtml(u.solution)}</button>
        </div>
      </div>
    `;
  }

  const schemaHtml = renderSchemaHtml(tables, { peekedTable: opts.peekedTable });

  return `
    <div class="dock-shell view-${dockView}">
      ${switcherHtml}
      <div class="dock-panes-area">
        <section class="dock-pane goal-pane${dockView === 'tables' ? ' hidden' : ''}" aria-label="Goal & Guide">
          ${goalBodyHtml}
        </section>
        <section class="dock-pane schema-pane${dockView === 'goal' ? ' hidden' : ''}" aria-label="Source Tables">
          ${schemaHtml}
        </section>
      </div>
    </div>
  `;
}
