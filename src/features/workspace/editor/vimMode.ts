// vimMode.ts
// Thin wrapper around @replit/codemirror-vim so the SQL editor can opt into
// vim keybindings through a single extension. Keeping the import isolated
// here allows tree-shaking when vim mode is disabled and gives us a single
// seam to extend if we need to customize vim commands in the future.

import { vim, Vim, getCM, type CodeMirrorV } from "@replit/codemirror-vim";
import { EditorView } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { workspaceStore, setActiveTab, removeTab, closeAllTabs } from "@/stores/workspaceStore";
import { registerVimSurround } from "./vimSurround";

// ─── Ctrl+D / Ctrl+U half-page scroll ─────────────────────────────────────
// The @replit/codemirror-vim shim's scrollTo implementation sets
// scrollDOM.scrollTop directly, but CM6 can silently override that during
// its render cycle. We intercept these keys at Prec.highest priority so our
// CM6-native implementation always wins.

function halfPageScroll(view: EditorView, forward: boolean): void {
  const { scrollDOM, state, defaultLineHeight } = view;
  const halfLines = Math.round(scrollDOM.clientHeight / (2 * defaultLineHeight));
  const halfPx = halfLines * defaultLineHeight;

  // Move cursor half-page in the correct direction.
  const curLine = state.doc.lineAt(state.selection.main.head).number;
  const targetLine = forward
    ? Math.min(curLine + halfLines, state.doc.lines)
    : Math.max(1, curLine - halfLines);
  const targetPos = state.doc.line(targetLine).from;

  // Dispatch cursor move without scrollIntoView so CM6 won't auto-scroll.
  view.dispatch({ selection: { anchor: targetPos } });

  // Scroll the viewport separately (after dispatch to avoid CM6 override).
  const newTop = Math.max(
    0,
    Math.min(
      scrollDOM.scrollTop + (forward ? halfPx : -halfPx),
      scrollDOM.scrollHeight - scrollDOM.clientHeight,
    ),
  );
  scrollDOM.scrollTop = newTop;
}

function vimScrollExtension(): Extension {
  return Prec.highest(
    EditorView.domEventHandlers({
      keydown(event, view) {
        if (!event.ctrlKey || event.altKey || event.metaKey) return false;
        if (event.key !== "d" && event.key !== "u") return false;
        // Only intercept in vim normal/visual mode (not insert mode).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vimState = (view as any).cm6?.state?.vim ?? (view as any).state?.vim;
        if (vimState?.insertMode) return false;
        event.preventDefault();
        event.stopImmediatePropagation();
        halfPageScroll(view, event.key === "d");
        return true;
      },
    }),
  );
}

// ─── Enter / Backspace in normal & visual mode ─────────────────────────────
// Vim maps <CR> → j^ and <BS> → h (motions, not edits), but the vim plugin
// handles keys at default precedence. basicSetup's defaultKeymap binds Enter →
// insertNewline and Backspace → deleteCharBackward at the same level, so it
// ties/wins and mutates the buffer in normal mode. We intercept these two keys
// at Prec.highest when NOT in insert mode and forward them to vim (which does
// the mode-correct motion in both normal and visual mode); insert mode falls
// through to CM's default editing. Same approach as vimScrollExtension above.
function vimNonInsertEditKeyFix(): Extension {
  return Prec.highest(
    EditorView.domEventHandlers({
      keydown(event, view) {
        if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey)
          return false;
        const vimKey =
          event.key === "Enter"
            ? "<CR>"
            : event.key === "Backspace"
              ? "<BS>"
              : null;
        if (!vimKey) return false;
        const cm = getCM(view);
        const vimState = (cm?.state as { vim?: { insertMode?: boolean } } | undefined)
          ?.vim;
        if (!cm || !vimState || vimState.insertMode) return false;
        event.preventDefault();
        event.stopImmediatePropagation();
        Vim.handleKey(cm, vimKey, "user");
        return true;
      },
    }),
  );
}

/**
 * Build the vim-mode Extension. Pass the returned extension to the editor
 * in its `extensions` array when vim mode is enabled.
 */
export function vimExtension(): Extension {
  return [vim({ status: true }), vimScrollExtension(), vimNonInsertEditKeyFix()];
}

/**
 * Wire application-specific ex-commands (`:w`, `:run`, `:runall`) to the
 * provided callbacks. Safe to call multiple times; re-defining an ex-command
 * replaces the previous binding.
 */
export function registerVimExCommands(options: {
  onSave: () => void;
  onRun: () => void;
  onRunAll: () => void;
  // Tab navigation/closing is store-specific: the legacy editor uses
  // workspaceStore, the multi-engine workbench uses workbenchStore. Vim commands
  // are global (one Vim singleton), so each editor passes its own store's
  // handlers and the most-recently-mounted editor wins. When omitted, these
  // fall back to the legacy workspaceStore.
  onNextTab?: () => void;
  onPrevTab?: () => void;
  onCloseTab?: () => void;
  onCloseAllTabs?: () => void;
}): void {
  const nextTab =
    options.onNextTab ??
    (() => {
      const { tabs, activeTab } = workspaceStore.state;
      const idx = tabs.findIndex((t) => t.id === activeTab);
      if (idx >= 0) setActiveTab(tabs[(idx + 1) % tabs.length].id);
    });
  const prevTab =
    options.onPrevTab ??
    (() => {
      const { tabs, activeTab } = workspaceStore.state;
      const idx = tabs.findIndex((t) => t.id === activeTab);
      if (idx >= 0) setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length].id);
    });
  const closeCurrentTab =
    options.onCloseTab ?? (() => removeTab(workspaceStore.state.activeTab));
  const closeAll = options.onCloseAllTabs ?? (() => closeAllTabs());

  Vim.defineEx("w", "w", () => {
    options.onSave();
  });
  Vim.defineEx("run", "run", () => {
    options.onRun();
  });
  Vim.defineEx("runall", "runall", () => {
    options.onRunAll();
  });
  Vim.defineEx("q", "q", () => {
    closeCurrentTab();
  });
  Vim.defineEx("qa", "qa", () => {
    closeAll();
  });
  Vim.defineEx("wq", "wq", () => {
    options.onSave();
    closeCurrentTab();
  });
  Vim.defineEx("x", "x", () => {
    options.onSave();
    closeCurrentTab();
  });
  Vim.defineAction("vimNextTab", () => nextTab());
  Vim.mapCommand("gt", "action", "vimNextTab", {}, {});

  Vim.defineAction("vimPrevTab", () => prevTab());
  Vim.mapCommand("gT", "action", "vimPrevTab", {}, {});

  // ── Comment toggling (gc{motion}, gcc, visual gc) ───────────────────────────
  // Toggle SQL line comments (--) on a range of lines. If any line is
  // uncommented, comment all; otherwise uncomment all.
  function toggleCommentLines(view: EditorView, fromLine: number, toLine: number): void {
    const doc = view.state.doc;
    const changes: { from: number; to: number; insert?: string }[] = [];
    let allCommented = true;

    // First pass: check if all lines are commented
    for (let lineNum = fromLine; lineNum <= toLine; lineNum++) {
      const line = doc.line(lineNum);
      const trimmed = line.text.trimStart();
      if (trimmed.length > 0 && !trimmed.startsWith("--")) {
        allCommented = false;
        break;
      }
    }

    // Second pass: apply changes
    for (let lineNum = fromLine; lineNum <= toLine; lineNum++) {
      const line = doc.line(lineNum);
      const leadingMatch = line.text.match(/^(\s*)/);
      const leadingWs = leadingMatch ? leadingMatch[1] : "";
      const rest = line.text.slice(leadingWs.length);

      if (rest.length === 0) continue; // skip empty lines

      if (allCommented) {
        // Uncomment
        if (rest.startsWith("-- ")) {
          changes.push({ from: line.from + leadingWs.length, to: line.from + leadingWs.length + 3 });
        } else if (rest.startsWith("--")) {
          changes.push({ from: line.from + leadingWs.length, to: line.from + leadingWs.length + 2 });
        }
      } else {
        // Comment (only uncommented lines)
        if (!rest.startsWith("--")) {
          changes.push({ from: line.from + leadingWs.length, to: line.from + leadingWs.length, insert: "-- " });
        }
      }
    }

    if (changes.length > 0) {
      view.dispatch({ changes });
    }
  }

  // gcc - toggle comment on current line
  // NOTE: Removed gc operator to avoid conflict with gcc (both would fire).
  // Use visual mode + gc for multi-line comments instead of gc{motion}.
  Vim.defineAction("vimToggleLineComment", (cm: { cm6: EditorView }) => {
    const view = cm.cm6;
    const cursor = view.state.selection.main.head;
    const line = view.state.doc.lineAt(cursor);
    const col = cursor - line.from;
    toggleCommentLines(view, line.number, line.number);
    // Restore cursor to same column on same line (line position may shift due to comment prefix)
    const newLine = view.state.doc.line(line.number);
    const newCol = Math.min(col, newLine.length);
    view.dispatch({ selection: { anchor: newLine.from + newCol } });
  });
  Vim.mapCommand("gcc", "action", "vimToggleLineComment", {}, { isEdit: true });

  // gc in visual mode - toggle comment on selection
  Vim.defineAction("vimToggleCommentVisual", (cm: CodeMirrorV) => {
    const view = cm.cm6;
    const sel = view.state.selection.main;
    const fromLine = view.state.doc.lineAt(sel.from).number;
    const toLine = view.state.doc.lineAt(sel.to).number;
    toggleCommentLines(view, fromLine, toLine);
    Vim.exitVisualMode(cm);
  });
  Vim.mapCommand("gc", "action", "vimToggleCommentVisual", {}, { isEdit: true, context: "visual" });

  // ── % bracket matching (normal and visual mode) ────────────────────────────
  const BRACKETS: Record<string, string> = {
    "(": ")", ")": "(",
    "[": "]", "]": "[",
    "{": "}", "}": "{",
    "<": ">", ">": "<",
  };
  const OPEN_BRACKETS = new Set(["(", "[", "{", "<"]);

  function findMatchingBracket(text: string, pos: number): number | null {
    const char = text[pos];
    if (!char || !(char in BRACKETS)) return null;

    const match = BRACKETS[char];
    const isOpen = OPEN_BRACKETS.has(char);
    const dir = isOpen ? 1 : -1;
    let depth = 0;

    for (let i = pos; i >= 0 && i < text.length; i += dir) {
      if (text[i] === char) depth++;
      else if (text[i] === match) depth--;
      if (depth === 0) return i;
    }
    return null;
  }

  function findBracketOnLine(text: string, lineStart: number, cursorPos: number): number | null {
    // First check cursor position
    if (text[cursorPos] in BRACKETS) return cursorPos;
    // Then scan forward on same line until newline
    for (let i = cursorPos; i < text.length && text[i] !== "\n"; i++) {
      if (text[i] in BRACKETS) return i;
    }
    return null;
  }

  // % in normal mode - jump to matching bracket
  Vim.defineAction("vimMatchBracket", (cm: { cm6: EditorView }) => {
    const view = cm.cm6;
    const text = view.state.doc.toString();
    const cursor = view.state.selection.main.head;
    const line = view.state.doc.lineAt(cursor);
    const bracketPos = findBracketOnLine(text, line.from, cursor);
    if (bracketPos === null) return;
    const matchPos = findMatchingBracket(text, bracketPos);
    if (matchPos !== null) {
      view.dispatch({ selection: { anchor: matchPos } });
    }
  });
  Vim.mapCommand("%", "action", "vimMatchBracket", {}, {});

  // % in visual mode - extend selection to matching bracket
  Vim.defineAction("vimMatchBracketVisual", (cm: { cm6: EditorView }) => {
    const view = cm.cm6;
    const text = view.state.doc.toString();
    const sel = view.state.selection.main;
    const line = view.state.doc.lineAt(sel.head);
    const bracketPos = findBracketOnLine(text, line.from, sel.head);
    if (bracketPos === null) return;
    const matchPos = findMatchingBracket(text, bracketPos);
    if (matchPos !== null) {
      // Extend selection: keep anchor, move head to match
      view.dispatch({ selection: { anchor: sel.anchor, head: matchPos } });
    }
  });
  Vim.mapCommand("%", "action", "vimMatchBracketVisual", {}, { context: "visual" });

  registerVimSurround();
}

export { Vim };
