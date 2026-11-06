import { ui } from './i18n/index.js';
import { escapeHtml } from './dialog.js';

export function uiHelpModalHtml() {
  const u = ui();
  const sections = u.helpSections
    .map(
      (e) => `
      <section class="ui-help-item" data-help-id="${e.id}">
        <div class="ui-help-head">
          <h3>${escapeHtml(e.title)}</h3>
          <button type="button" class="btn ui-help-focus" data-focus-id="${e.id}">${escapeHtml(u.highlightThis)}</button>
        </div>
        <div class="ui-help-what">${escapeHtml(e.what)}</div>
        <div class="ui-help-how"><strong>${escapeHtml(u.useIt)}</strong> ${escapeHtml(e.how)}</div>
      </section>
    `
    )
    .join('');
  return `<div class="ui-help">${sections}</div>`;
}

/**
 * Temporarily highlights regions to orient the learner.
 * @param {ParentNode} root
 * @param {string} [focusId]
 * @param {number} [durationMs]
 * @returns {() => void}
 */
export function startUiTour(root, focusId, durationMs = 5000) {
  root.querySelectorAll('.ui-tour-on').forEach((el) => el.classList.remove('ui-tour-on'));
  const u = ui();
  const elements = u.helpSections.filter((e) => !focusId || e.id === focusId);
  const nodes = elements
    .map((e) => root.querySelector(e.selector))
    .filter(Boolean);

  nodes.forEach((n) => n.classList.add('ui-tour-on'));

  const stop = () => {
    nodes.forEach((n) => n.classList.remove('ui-tour-on'));
  };

  window.setTimeout(stop, durationMs);
  return stop;
}
