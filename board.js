import { escapeHtml } from './dialog.js';
import { isTable, typeName, formatValue } from './m-engine.js';
import { ui } from './i18n/index.js';

/**
 * Formats table cell values for preview display.
 * @param {any} v
 * @returns {string}
 */
export function formatCell(v) {
  if (v === null || v === undefined) return 'null';
  if (isTable(v)) return '«table»';
  if (Array.isArray(v)) return formatValue(v);
  if (typeof v === 'object') return formatValue(v);
  return String(v);
}

/**
 * Builds the Applied Steps HTML graph.
 * @param {any[]} steps
 * @param {number} selectedIndex
 * @param {any} initialSource
 * @returns {string}
 */
export function renderStepsHtml(steps, selectedIndex, initialSource) {
  const u = ui();
  const items = [
    {
      name: 'Source',
      exprSrc: initialSource?.label || 'Sales · Employees · Orders',
      result: initialSource?.result,
      fixed: true,
      index: -1,
    },
    ...steps.map((s, i) => ({ ...s, fixed: false, index: i })),
  ];

  const html = items
    .map((item, i) => {
      const isSelected = item.fixed ? selectedIndex === -1 : selectedIndex === item.index;
      const isLatest = !item.fixed && item.index === steps.length - 1;
      const res = item.result;
      const isTab = isTable(res);
      const meta = isTab
        ? `${res.rows.length}r × ${res.columns.length}c`
        : res !== undefined
          ? typeName(res)
          : '';

      const node = `
        <button
          type="button"
          class="step-node${item.fixed ? ' is-source' : ''}${isSelected ? ' is-selected' : ''}${isLatest ? ' is-latest' : ''}"
          data-step-index="${item.index}"
          title="${escapeHtml(item.name)}: ${escapeHtml(item.exprSrc)}"
        >
          <span class="step-badge">${item.fixed ? 'S' : item.index + 1}</span>
          <span class="step-info">
            <span class="step-name">${escapeHtml(item.name)}</span>
            <span class="step-expr">${escapeHtml(item.exprSrc)}</span>
            ${meta ? `<span class="step-meta">${escapeHtml(meta)}</span>` : ''}
          </span>
        </button>
      `;

      const arrow = i < items.length - 1
        ? `<div class="step-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg></div>`
        : '';

      return node + arrow;
    })
    .join('');

  return `
    <div class="steps-toolbar">
      <div class="steps-title">
        <span class="steps-icon" aria-hidden="true">☷</span>
        <span>${escapeHtml(u.appliedStepsTitle)}</span>
      </div>
      <span class="steps-count">${steps.length + 1} steps</span>
    </div>
    <div class="steps-rail">${html}</div>
  `;
}

/**
 * Builds the Preview Data Grid or Scalar Value HTML.
 * @param {any} val
 * @returns {string}
 */
export function renderPreviewHtml(val) {
  const u = ui();

  if (val === undefined || val === null) {
    return `<div class="empty-preview"><p>${escapeHtml(u.noValueYet)}</p></div>`;
  }

  if (!isTable(val)) {
    return `
      <div class="scalar-result">
        <div class="scalar-header">
          <span class="scalar-type">${escapeHtml(typeName(val))}</span>
        </div>
        <pre class="scalar-value">${escapeHtml(formatValue(val))}</pre>
      </div>
    `;
  }

  const cols = val.columns || [];
  const rows = val.rows || [];
  const headHtml = cols
    .map((c) => `<th><span class="th-name">${escapeHtml(c.name)}</span><span class="th-type">${escapeHtml(c.type || 'any')}</span></th>`)
    .join('');

  const bodyHtml = rows
    .map((r, rowIdx) => {
      const cells = cols
        .map((c) => `<td>${escapeHtml(formatCell(r[c.name]))}</td>`)
        .join('');
      return `<tr><td class="td-num">${rowIdx + 1}</td>${cells}</tr>`;
    })
    .join('');

  return `
    <div class="grid-header">
      <div class="grid-title">
        <span>${escapeHtml(u.dataPreviewTitle)}</span>
      </div>
      <span class="grid-meta">${rows.length} rows × ${cols.length} columns</span>
    </div>
    <div class="grid-scroll">
      <table class="data-grid">
        <thead>
          <tr>
            <th class="th-num">#</th>
            ${headHtml}
          </tr>
        </thead>
        <tbody>
          ${bodyHtml || `<tr><td colspan="${cols.length + 1}" class="empty-cell">${escapeHtml(u.noRows)}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Builds the Generated M Code let...in script.
 * @param {any[]} steps
 * @returns {string}
 */
export function buildMCode(steps) {
  if (!steps || !steps.length) {
    return `let\n    Source = Sales\nin\n    Source`;
  }

  const body = steps
    .map((s) => {
      const name = /^[A-Za-z_][A-Za-z0-9_]*$/.test(s.name) ? s.name : `#"${s.name}"`;
      return `    ${name} = ${s.exprSrc}`;
    })
    .join(',\n');

  const last = steps[steps.length - 1];
  const lastEscaped = /^[A-Za-z_][A-Za-z0-9_]*$/.test(last.name) ? last.name : `#"${last.name}"`;

  return `let\n${body}\nin\n    ${lastEscaped}`;
}
