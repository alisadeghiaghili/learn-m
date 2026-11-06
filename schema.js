import { escapeHtml } from './dialog.js';
import { isTable, typeName, envLookup, sampleDatasets } from './m-engine.js';
import { ui } from './i18n/index.js';

/**
 * Returns type badge and styling class for a column type.
 * @param {string} type
 * @returns {{ badge: string, typeClass: string }}
 */
export function getTypeInfo(type) {
  switch (type) {
    case 'number':
      return { badge: '123', typeClass: 'num' };
    case 'text':
      return { badge: 'ABC', typeClass: 'txt' };
    case 'date':
      return { badge: '📅', typeClass: 'date' };
    case 'logical':
      return { badge: 'TF', typeClass: 'log' };
    case 'list':
      return { badge: '[ ]', typeClass: 'list' };
    case 'record':
      return { badge: '{ }', typeClass: 'rec' };
    case 'table':
      return { badge: '☷', typeClass: 'tbl' };
    default:
      return { badge: 'ANY', typeClass: 'any' };
  }
}

/**
 * Extracts schema info (columns, types, row count) from a table object.
 * @param {string} tableName
 * @param {any} tableObj
 * @returns {{ name: string, rowCount: number, columns: Array<{ name: string, type: string, badge: string, typeClass: string }>, table: any } | null}
 */
export function inspectTableSchema(tableName, tableObj) {
  if (!tableObj || !isTable(tableObj)) return null;

  const cols = (tableObj.columns || []).map((col) => {
    const colName = typeof col === 'string' ? col : col.name;
    let colType = col && typeof col === 'object' && col.type ? col.type : null;

    if (!colType && Array.isArray(tableObj.rows) && tableObj.rows.length) {
      for (const r of tableObj.rows) {
        if (!r) continue;
        const v = typeof r === 'object' ? r[colName] : undefined;
        if (v !== null && v !== undefined) {
          colType = typeName(v);
          break;
        }
      }
    }

    const resolvedType = colType || 'any';
    const info = getTypeInfo(resolvedType);
    return {
      name: colName,
      type: resolvedType,
      badge: info.badge,
      typeClass: info.typeClass,
    };
  });

  const rowCount = Array.isArray(tableObj.rows) ? tableObj.rows.length : 0;
  return {
    name: tableName,
    rowCount,
    columns: cols,
    table: tableObj,
  };
}

/**
 * Gets all active source tables in scope for the given level/environment.
 * @param {any} env
 * @param {any | null} level
 * @returns {Array<{ name: string, rowCount: number, columns: Array<{ name: string, type: string, badge: string, typeClass: string }>, table: any }>}
 */
export function getAvailableTables(env, level) {
  const result = [];
  const seen = new Set();

  if (level && level.startTables) {
    for (const bindName of Object.keys(level.startTables)) {
      if (seen.has(bindName)) continue;
      seen.add(bindName);
      const tab = envLookup(env, bindName);
      if (tab) {
        const inspected = inspectTableSchema(bindName, tab);
        if (inspected) result.push(inspected);
      }
    }
  }

  // If no startTables or in sandbox, collect all tables in env
  if (!result.length && env) {
    let cur = env;
    while (cur) {
      if (cur.bindings) {
        for (const [name, val] of Object.entries(cur.bindings)) {
          if (!seen.has(name) && isTable(val)) {
            seen.add(name);
            const inspected = inspectTableSchema(name, val);
            if (inspected) result.push(inspected);
          }
        }
      }
      cur = cur.parent;
    }
  }

  // Fallback to sampleDatasets if still empty
  if (!result.length) {
    const data = sampleDatasets();
    for (const [name, val] of Object.entries(data)) {
      if (!seen.has(name) && isTable(val)) {
        seen.add(name);
        const inspected = inspectTableSchema(name, val);
        if (inspected) result.push(inspected);
      }
    }
  }

  return result;
}

/**
 * Builds the Schema / Source Tables HTML.
 * @param {Array<any>} tables
 * @param {Object} [opts]
 * @param {string | null} [opts.peekedTable]
 * @returns {string}
 */
export function renderSchemaHtml(tables, opts = {}) {
  const u = ui();

  if (!tables || !tables.length) {
    return `
      <div class="schema-panel">
        <div class="panel-header">
          <span>${escapeHtml(u.schemaTitle)}</span>
          <span>${escapeHtml(u.tablesCount(0))}</span>
        </div>
        <div class="panel-body">
          <div class="empty-state">${escapeHtml(u.noTablesInLevel)}</div>
        </div>
      </div>
    `;
  }

  const cardsHtml = tables
    .map((t) => {
      const isPeeked = opts.peekedTable === t.name;
      const colsHtml = t.columns
        .map(
          (c) => `
            <button
              type="button"
              class="col-item-btn"
              data-insert-col="${escapeHtml(c.name)}"
              title="${escapeHtml(u.insertColTitle)}: [${escapeHtml(c.name)}]"
            >
              <span class="col-badge ${c.typeClass}" aria-hidden="true">${c.badge}</span>
              <span class="col-name" dir="ltr">[${escapeHtml(c.name)}]</span>
              <span class="col-type-label">${escapeHtml(c.type)}</span>
            </button>
          `
        )
        .join('');

      return `
        <div class="table-card${isPeeked ? ' is-peeked' : ''}" data-table-card="${escapeHtml(t.name)}">
          <div class="table-card-head">
            <button
              type="button"
              class="table-name-btn"
              data-insert-table="${escapeHtml(t.name)}"
              title="${escapeHtml(u.insertTableTitle)}: ${escapeHtml(t.name)}"
            >
              <span class="table-icon" aria-hidden="true">🗄️</span>
              <span class="table-name">${escapeHtml(t.name)}</span>
            </button>
            <div class="table-meta-group">
              <span class="table-row-count">${t.rowCount} ${escapeHtml(u.rowsLabel)}</span>
              <button
                type="button"
                class="btn-peek${isPeeked ? ' active' : ''}"
                data-peek-table="${escapeHtml(t.name)}"
                title="${escapeHtml(u.peekTitle)}"
              >
                <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/></svg>
                <span>${escapeHtml(u.peekLabel)}</span>
              </button>
            </div>
          </div>
          <div class="table-cols-list">
            ${colsHtml}
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <div class="schema-panel">
      <div class="panel-header">
        <span>${escapeHtml(u.schemaTitle)}</span>
        <span>${escapeHtml(u.tablesCount(tables.length))}</span>
      </div>
      <div class="panel-body">
        ${cardsHtml}
      </div>
    </div>
  `;
}
