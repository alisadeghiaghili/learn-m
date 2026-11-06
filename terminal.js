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
      <div class="term-input-row">
        <span class="prompt" aria-hidden="true">»</span>
        <div class="term-input-wrap">
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
          <span class="term-ghost" aria-hidden="true"></span>
        </div>
      </div>
    `;

    this.logEl = this.root.querySelector('#terminal-log');
    this.inputEl = this.root.querySelector('#terminal-input');
    this.ghostEl = this.root.querySelector('.term-ghost');

    this.inputEl.addEventListener('keydown', (e) => this.handleKeyDown(e));
    this.inputEl.addEventListener('input', () => this.syncGhost());
  }

  /**
   * @param {KeyboardEvent} e
   */
  handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = this.inputEl.value.trim();
      if (!val) return;
      this.history.push(val);
      this.historyIndex = this.history.length;
      this.inputEl.value = '';
      this.ghostEl.textContent = '';
      this.onSubmit(val);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!this.history.length) return;
      if (this.historyIndex > 0) {
        this.historyIndex--;
        this.inputEl.value = this.history[this.historyIndex];
        this.syncGhost();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this.historyIndex < this.history.length - 1) {
        this.historyIndex++;
        this.inputEl.value = this.history[this.historyIndex];
      } else {
        this.historyIndex = this.history.length;
        this.inputEl.value = '';
      }
      this.syncGhost();
      return;
    }

    if (e.key === 'Tab') {
      const ghost = this.ghostEl.textContent;
      if (ghost && ghost.startsWith(this.inputEl.value)) {
        e.preventDefault();
        this.inputEl.value = ghost;
        this.ghostEl.textContent = '';
      }
      return;
    }
  }

  syncGhost() {
    const val = this.inputEl.value;
    if (!val) {
      this.ghostEl.textContent = this.hint || '';
      return;
    }

    const all = [...this.extraCompletions, ...BASE_COMPLETIONS];
    const match = all.find((c) => c.toLowerCase().startsWith(val.toLowerCase()) && c.length > val.length);
    if (match) {
      this.ghostEl.textContent = val + match.slice(val.length);
    } else {
      this.ghostEl.textContent = '';
    }
  }

  /**
   * @param {string | null} hint
   */
  setHint(hint) {
    this.hint = hint;
    if (!this.inputEl.value) {
      this.ghostEl.textContent = hint || '';
    }
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
