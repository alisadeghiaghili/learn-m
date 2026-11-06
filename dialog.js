/**
 * Modal dialog manager and lightweight Markdown parser.
 */

export function escapeHtml(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderInline(raw) {
  const slots = [];
  const parts = raw.split(/(<a\b[\s\S]*?<\/a>)/gi);
  const mapped = parts
    .map((part, i) => {
      if (i % 2 === 1) {
        slots.push(part);
        return '@@HTML' + (slots.length - 1) + '@@';
      }
      let t = escapeHtml(part);
      t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      t = t.replace(
        /\[([^\]]+)\]\(([^)\s]+)\)/g,
        (_m, label, href) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
      );
      return t;
    })
    .join('');
  return mapped.replace(/@@HTML(\d+)@@/g, (_m, i) => slots[Number(i)] || '');
}

function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function isTableRow(line) {
  const s = line.trim();
  if (!s.includes('|')) return false;
  return s.startsWith('|')
    ? s.endsWith('|') && splitTableRow(s).length >= 1
    : s.split('|').length >= 2;
}

function isTableSeparator(line) {
  const cells = splitTableRow(line);
  return cells.length >= 1 && cells.every((c) => /^:?-+:?$/.test(c.trim()) && c.includes('-'));
}

function renderTable(rows) {
  if (rows.length < 2) return '';
  const header = splitTableRow(rows[0]);
  const body = rows.slice(2);
  const headHtml = header.map((h) => `<th>${renderInline(h)}</th>`).join('');
  const bodyHtml = body
    .map((r) => `<tr>${splitTableRow(r).map((c) => `<td>${renderInline(c)}</td>`).join('')}</tr>`)
    .join('');
  return `<div class="md-table-wrap"><table class="md-table"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
}

function isListItem(line) {
  return /^\s*[-*+]\s+\S/.test(line) || /^\s*\d+\.\s+\S/.test(line);
}

function renderListItem(line) {
  const s = line.trim().replace(/^([-*+]|\d+\.)\s+/, '');
  return `<li>${renderInline(s)}</li>`;
}

function renderProse(text) {
  const lines = text.split('\n');
  const out = [];
  let para = [];
  let list = [];
  let tableRows = [];

  const flushPara = () => {
    if (!para.length) return;
    out.push(`<p>${para.map(renderInline).join('<br/>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (!list.length) return;
    out.push(`<ul>${list.join('')}</ul>`);
    list = [];
  };
  const flushTable = () => {
    if (!tableRows.length) return;
    out.push(renderTable(tableRows));
    tableRows = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushTable();
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const trimmed = line.trim();

    if (isTableRow(line)) {
      flushPara();
      flushList();
      tableRows.push(line);
      continue;
    }
    if (tableRows.length) flushTable();

    if (!trimmed) {
      flushAll();
      continue;
    }

    if (trimmed.startsWith('### ')) {
      flushAll();
      out.push(`<h3>${renderInline(trimmed.slice(4))}</h3>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      flushAll();
      out.push(`<h2>${renderInline(trimmed.slice(3))}</h2>`);
      continue;
    }
    if (trimmed.startsWith('# ')) {
      flushAll();
      out.push(`<h1>${renderInline(trimmed.slice(2))}</h1>`);
      continue;
    }

    if (isListItem(line)) {
      flushPara();
      list.push(renderListItem(line));
      continue;
    }
    if (list.length) flushList();

    para.push(trimmed);
  }
  flushAll();
  return out.join('');
}

/**
 * Parses markdown subset: headings, code fences, inline bold/code/links, lists, tables.
 * @param {string} md
 * @returns {string}
 */
export function renderMarkdown(md) {
  if (!md) return '';
  const blocks = md.split(/```/);
  let html = '';
  blocks.forEach((block, i) => {
    if (i % 2 === 1) {
      const firstLine = block.indexOf('\n');
      const code = firstLine >= 0 ? block.slice(firstLine + 1) : block;
      html += `<pre><code>${escapeHtml(code.trimEnd())}</code></pre>`;
      return;
    }
    html += renderProse(block);
  });
  return html;
}

/**
 * @typedef {Object} ModalAction
 * @property {string} label
 * @property {string} [className]
 * @property {() => void} onClick
 */

/**
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} [opts.titleHtml]
 * @param {string} opts.bodyHtml
 * @param {ModalAction[]} [opts.actions]
 * @param {() => void} [opts.onClose]
 * @param {'default' | 'celebrate'} [opts.variant]
 * @returns {{ close: () => void, el: HTMLElement }}
 */
export function showModal(opts) {
  const overlay = document.createElement('div');
  overlay.id = 'modal';
  overlay.className = `overlay${opts.variant === 'celebrate' ? ' overlay-celebrate' : ''}`;
  const titleClass = opts.variant === 'celebrate' ? ' class="visually-hidden"' : '';
  const titleContent = opts.titleHtml ?? escapeHtml(opts.title);

  overlay.innerHTML = `
    <div class="modal${opts.variant === 'celebrate' ? ' modal-celebrate' : ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(opts.title)}">
      <h2${titleClass}>${titleContent}</h2>
      <div class="markdown">${opts.bodyHtml}</div>
      <div class="modal-actions"></div>
    </div>
  `;

  const actionsEl = overlay.querySelector('.modal-actions');
  const close = () => {
    overlay.remove();
    opts.onClose?.();
  };

  const actions = opts.actions?.length
    ? opts.actions
    : [{ label: 'Close', onClick: () => close() }];

  for (const action of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    if (action.id) btn.id = action.id;
    btn.className = `btn ${action.className || ''}`.trim();
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      action.onClick();
      if (document.body.contains(overlay)) overlay.remove();
    });
    actionsEl.appendChild(btn);
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const onKey = (e) => {
    if (e.key === 'Escape') {
      window.removeEventListener('keydown', onKey);
      close();
    }
  };
  window.addEventListener('keydown', onKey);

  document.body.appendChild(overlay);
  const modalEl = overlay.querySelector('.modal');
  if (modalEl) {
    modalEl.tabIndex = -1;
    requestAnimationFrame(() => modalEl.focus());
  }

  return { close, el: overlay };
}
