import { escapeHtml } from './dialog.js';

/**
 * @typedef {'cmd' | 'out' | 'err' | 'meta' | 'ok'} LogKind
 */

const BASE_COMPLETIONS = [
  'Table.SelectRows(',
  'Table.AddColumn(',
  'Table.Sort(',
  'Table.TransformColumnTypes(',
  'Table.UnpivotOtherColumns(',
  'Table.Pivot(',
  'Table.SplitColumn(',
  'Table.Group(',
  'Table.NestedJoin(',
  'Table.Join(',
  'Table.Column(',
  'Table.RowCount(',
  'Table.Buffer(',
  'Table.Schema(',
  'Table.Combine(',
  'List.Transform(',
  'List.Select(',
  'List.Sum(',
  'List.Accumulate(',
  'Date.Year(',
  'Text.Upper(',
  'Text.Split(',
  'levels',
  'sandbox',
  'hint',
  'solution',
  'undo',
  'reset',
  'steps',
  'code',
  'clear',
  'help',
];

export class TerminalView {
  /**
   * @param {HTMLElement} root
   * @param {(cmd: string) => void} onSubmit
   */
  constructor(root, onSubmit) {
    this.root = root;
    this.onSubmit = onSubmit;
    this.history = [];
    this.historyIndex = -1;
    this.hint = null;
    this.extraCompletions = [];

    this.mount();
  }

  mount() {
    this.root.innerHTML = `
      <div class="term-log" id="terminal-log" role="log" aria-live="polite"></div>
      <div class="term-hint" id="term-hint" hidden dir="ltr"></div>
      <div class="term-quick-bar" id="term-quick-bar" dir="ltr" aria-label="Terminal Quick Keys">
        <button type="button" class="quick-btn" data-key="Tab" title="Tab completion">Tab ⇥</button>
        <button type="button" class="quick-btn" data-key="ArrowUp" title="Previous command" aria-label="Up">↑</button>
        <button type="button" class="quick-btn" data-key="ArrowDown" title="Next command" aria-label="Down">↓</button>
        <button type="button" class="quick-btn chip" data-insert="Table.SelectRows(">SelectRows</button>
        <button type="button" class="quick-btn chip" data-insert="Table.AddColumn(">AddColumn</button>
        <button type="button" class="quick-btn chip" data-insert="Table.Sort(">Sort</button>
        <button type="button" class="quick-btn chip" data-insert="each ">each</button>
        <button type="button" class="quick-btn run" data-action="run" title="Run command">↵ Run</button>
      </div>
      <div class="term-input-row" dir="ltr">
        <label class="prompt" for="terminal-input">m &gt;</label>
        <div class="term-input-wrap" id="term-input-wrap">
          <input
            id="terminal-input"
            class="term-input"
            type="text"
            spellcheck="false"
            autocomplete="off"
            autocapitalize="off"
            aria-label="Power Query M expression input"
            placeholder="Type M expression or command..."
          />
          <div class="term-ghost" id="term-ghost" aria-hidden="true"></div>
        </div>
      </div>
    `;

    this.logEl = this.root.querySelector('#terminal-log');
    this.hintEl = this.root.querySelector('#term-hint');
    this.inputEl = this.root.querySelector('#terminal-input');
    this.ghostEl = this.root.querySelector('#term-ghost');

    this.inputEl.addEventListener('keydown', (e) => this.handleKeyDown(e));
    this.inputEl.addEventListener('input', () => this.syncGhost());

    this.root.querySelectorAll('.quick-btn').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => e.preventDefault());
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const key = btn.dataset.key;
        const insert = btn.dataset.insert;
        const action = btn.dataset.action;
        if (key === 'Tab') {
          this.applyTab();
        } else if (key === 'ArrowUp') {
          this.navigateHistory('up');
        } else if (key === 'ArrowDown') {
          this.navigateHistory('down');
        } else if (insert) {
          this.insertText(insert);
        } else if (action === 'run') {
          this.submitCurrent();
        }
      });
    });
  }

  submitCurrent() {
    const val = this.inputEl.value.trim();
    if (!val) return;
    this.history.push(val);
    this.historyIndex = this.history.length;
    this.inputEl.value = '';
    this.ghostEl.textContent = '';
    this.ghostEl.dataset.visible = '0';
    this.onSubmit(val);
  }

  /**
   * @param {KeyboardEvent} e
   */
  handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.submitCurrent();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.navigateHistory('up');
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.navigateHistory('down');
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      this.applyTab();
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      this.inputEl.value = '';
      this.syncGhost();
      return;
    }
  }

  applyTab() {
    const val = this.inputEl.value;
    if (!val && this.hint) {
      this.inputEl.value = this.hint;
      this.syncGhost();
      this.focus();
      return;
    }

    const ghost = this.ghostEl.textContent;
    if (ghost && ghost.startsWith(val)) {
      this.inputEl.value = ghost;
      this.syncGhost();
      this.focus();
    }
  }

  navigateHistory(direction) {
    if (!this.history.length) return;
    if (direction === 'up') {
      if (this.historyIndex > 0) {
        this.historyIndex--;
        this.inputEl.value = this.history[this.historyIndex];
        this.syncGhost();
      }
    } else if (direction === 'down') {
      if (this.historyIndex < this.history.length - 1) {
        this.historyIndex++;
        this.inputEl.value = this.history[this.historyIndex];
      } else {
        this.historyIndex = this.history.length;
        this.inputEl.value = '';
      }
      this.syncGhost();
    }
  }

  syncGhost() {
    const val = this.inputEl.value;
    if (!val) {
      this.ghostEl.textContent = '';
      this.ghostEl.dataset.visible = '0';
      return;
    }

    const all = [...this.extraCompletions, ...BASE_COMPLETIONS];
    const match = all.find((c) => c.toLowerCase().startsWith(val.toLowerCase()) && c.length > val.length);
    if (match) {
      this.ghostEl.textContent = val + match.slice(val.length);
      this.ghostEl.dataset.visible = '1';
    } else {
      this.ghostEl.textContent = '';
      this.ghostEl.dataset.visible = '0';
    }
  }

  /**
   * @param {string | null} hint
   */
  setHint(hint) {
    this.hint = hint;
    if (this.hintEl) {
      if (hint) {
        this.hintEl.hidden = false;
        this.hintEl.innerHTML = `Next: <code>${escapeHtml(hint)}</code> <span class="par-note">· Tab fills command</span>`;
        this.inputEl.placeholder = `Next: ${hint}`;
      } else {
        this.hintEl.hidden = true;
        this.hintEl.textContent = '';
        this.inputEl.placeholder = 'Type M expression or command...';
      }
    }
    this.syncGhost();
  }

  /**
   * @param {string[]} completions
   */
  setExtraCompletions(completions) {
    this.extraCompletions = completions;
  }

  /**
   * @param {string} text
   */
  pushCmd(text) {
    this.appendLine('cmd', `» ${text}`);
  }

  /**
   * @param {string} text
   */
  pushOut(text) {
    this.appendLine('out', text);
  }

  /**
   * @param {string} text
   */
  pushErr(text) {
    this.appendLine('err', text);
  }

  /**
   * @param {string} text
   */
  pushMeta(text) {
    this.appendLine('meta', text);
  }

  /**
   * @param {string} text
   */
  pushOk(text) {
    this.appendLine('ok', text);
  }

  /**
   * @param {LogKind} kind
   * @param {string} text
   */
  appendLine(kind, text) {
    if (!text && text !== '') return;
    const line = document.createElement('div');
    line.className = `term-line ${kind}`;
    line.textContent = text;
    this.logEl.appendChild(line);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  clear() {
    this.logEl.innerHTML = '';
  }

  insertText(text) {
    if (!this.inputEl) return;
    const start = this.inputEl.selectionStart ?? this.inputEl.value.length;
    const end = this.inputEl.selectionEnd ?? this.inputEl.value.length;
    const val = this.inputEl.value;
    this.inputEl.value = val.slice(0, start) + text + val.slice(end);
    const nextPos = start + text.length;
    this.inputEl.setSelectionRange(nextPos, nextPos);
    this.inputEl.focus();
    this.syncGhost();
  }

  focus() {
    this.inputEl?.focus();
  }
}
