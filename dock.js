import { escapeHtml, renderMarkdown } from './dialog.js';
import { ui } from './i18n/index.js';

/**
 * Builds the HTML for the Learning Guide dock.
 * @param {Object} opts
 * @param {any | null} opts.level
 * @param {boolean} opts.solved
 * @param {number} opts.golfCount
 * @param {any} [opts.progress]
 * @returns {string}
 */
export function renderDockHtml(opts) {
  const u = ui();
  const level = opts.level;

  if (!level) {
    return `
      <div class="dock-content">
        <h2>${escapeHtml(u.learningGuide)}</h2>
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
  }

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

  return `
    <div class="dock-content">
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
