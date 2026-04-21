// vimSurround.ts
// Implements vim-surround commands for @replit/codemirror-vim:
//
//   S<char>          (visual)  — wrap selection with char
//   ys{motion}<char> (normal)  — wrap motion result with char
//   yss<char>        (normal)  — wrap current line with char
//   ds<char>         (normal)  — delete surrounding char pair
//   cs<char><new>    (normal)  — change surrounding char pair
//
// Pair aliases: b→()  B→{}  r→[]  a→<>  others→same char on both sides
//
// Usage:
//   1. Call registerVimSurround() once (e.g. alongside registerVimExCommands).
//   2. Include vimSurroundExtension() in the editor's extension list whenever
//      vim mode is enabled — it installs the DOM-level key interceptor that
//      captures the target character for ys and cs without vim seeing it.

import { Vim } from "@replit/codemirror-vim";
import { EditorView } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import type { Text, Extension } from "@codemirror/state";

// ─── Pair lookup ─────────────────────────────────────────────────────────────

interface Pair {
  open: string;
  close: string;
}

function getSurroundPair(char: string): Pair {
  switch (char) {
    case "(":
    case ")":
    case "b":
      return { open: "(", close: ")" };
    case "[":
    case "]":
    case "r":
      return { open: "[", close: "]" };
    case "{":
    case "}":
    case "B":
      return { open: "{", close: "}" };
    case "<":
    case ">":
    case "a":
      return { open: "<", close: ">" };
    default:
      return { open: char, close: char };
  }
}

// ─── CM5 Pos → CM6 document offset ───────────────────────────────────────────
// codemirror-vim passes operator ranges as CM5-style {line, ch} Pos objects
// where `line` is 0-indexed. CM6 doc.line() is 1-indexed.

function posToOffset(doc: Text, pos: { line: number; ch: number }): number {
  const lineNum = Math.max(1, Math.min(pos.line + 1, doc.lines));
  const line = doc.line(lineNum);
  return Math.min(line.from + Math.max(0, pos.ch), line.to);
}

// ─── Pending character interceptor ───────────────────────────────────────────
// ys{motion} and cs{old} need to read one more character after vim's normal
// key-dispatch finishes. We capture it at the DOM level (highest priority)
// before vim's own keydown handler processes it.

let pendingCharCallback: ((char: string) => void) | null = null;

function awaitNextChar(cb: (char: string) => void): void {
  pendingCharCallback = cb;
}

/**
 * CM6 extension that intercepts the next printable keydown when a surround
 * command is waiting for its target character.  Must be added to the editor's
 * extension list alongside vim mode.
 */
export function vimSurroundExtension(): Extension {
  return Prec.highest(
    EditorView.domEventHandlers({
      keydown(event) {
        if (!pendingCharCallback) return false;
        if (event.key.length !== 1) return false; // ignore Shift, Ctrl, etc.
        const cb = pendingCharCallback;
        pendingCharCallback = null;
        event.preventDefault();
        event.stopImmediatePropagation();
        cb(event.key);
        return true;
      },
    }),
  );
}

// ─── Core helpers ─────────────────────────────────────────────────────────────

function applySurround(
  view: EditorView,
  from: number,
  to: number,
  char: string,
): void {
  const { open, close } = getSurroundPair(char);
  view.dispatch(
    view.state.update({
      changes: [
        { from, insert: open },
        { from: to, insert: close },
      ],
      // Place cursor just inside the opening delimiter.
      selection: { anchor: from + open.length },
    }),
  );
}

/**
 * Scan outward from `cursor` to find the nearest enclosing `open`/`close`
 * pair.  Returns the offsets of the delimiters themselves (inclusive).
 */
function findSurroundBounds(
  text: string,
  cursor: number,
  open: string,
  close: string,
): { from: number; to: number } | null {
  if (open === close) {
    // Symmetric delimiters (quotes, backticks): scan left then right.
    let from = -1;
    for (let i = cursor - 1; i >= 0; i--) {
      if (text[i] === open) {
        from = i;
        break;
      }
    }
    if (from === -1) return null;
    for (let i = cursor; i < text.length; i++) {
      if (text[i] === close) return { from, to: i };
    }
    return null;
  }

  // Asymmetric bracket pairs: depth-count outward from cursor.
  let depth = 0;
  let from = -1;
  for (let i = cursor - 1; i >= 0; i--) {
    if (text[i] === close) depth++;
    else if (text[i] === open) {
      if (depth === 0) {
        from = i;
        break;
      }
      depth--;
    }
  }
  if (from === -1) return null;
  depth = 0;
  for (let i = from + 1; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      if (depth === 0) return { from, to: i };
      depth--;
    }
  }
  return null;
}

// ─── Registration ─────────────────────────────────────────────────────────────

let registered = false;

/**
 * Register all vim-surround commands with the global Vim instance.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function registerVimSurround(): void {
  if (registered) return;
  registered = true;

  // ── S<char> (visual) — wrap selection ──────────────────────────────────────
  Vim.defineAction("vimSurroundVisual", (cm: any, args: any) => {
    const char: string = args.selectedCharacter;
    if (!char) return;
    const view: EditorView = cm.cm6;
    const sel = view.state.selection.main;
    applySurround(view, sel.from, sel.to, char);
    Vim.exitVisualMode(cm);
  });

  Vim.mapCommand("S<character>", "action", "vimSurroundVisual", {}, {
    isEdit: true,
    context: "visual",
  });

  // ── ys{motion}<char> (normal) — wrap motion result ─────────────────────────
  // The operator resolves the motion range, then awaits one more keypress via
  // the DOM interceptor (not via vim's key queue) for the target character.
  Vim.defineOperator(
    "vimSurroundYs",
    (
      cm: any,
      _args: any,
      ranges: Array<{
        anchor: { line: number; ch: number };
        head: { line: number; ch: number };
      }>,
    ) => {
      if (!ranges?.length) return;
      const view: EditorView = cm.cm6;
      const doc = view.state.doc;
      const a = posToOffset(doc, ranges[0].anchor);
      const b = posToOffset(doc, ranges[0].head);
      const [from, to] = a <= b ? [a, b] : [b, a];
      awaitNextChar((char) => applySurround(view, from, to, char));
    },
  );

  Vim.mapCommand("ys", "operator", "vimSurroundYs", {}, {});

  // ── yss<char> (normal) — wrap current line (trimming leading whitespace) ───
  Vim.defineAction("vimSurroundLine", (cm: any, args: any) => {
    const char: string = args.selectedCharacter;
    if (!char) return;
    const view: EditorView = cm.cm6;
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    const leadingSpaces = line.text.match(/^\s*/)?.[0].length ?? 0;
    applySurround(view, line.from + leadingSpaces, line.to, char);
  });

  Vim.mapCommand("yss<character>", "action", "vimSurroundLine", {}, {
    isEdit: true,
  });

  // ── ds<char> (normal) — delete surrounding pair ────────────────────────────
  Vim.defineAction("vimSurroundDelete", (cm: any, args: any) => {
    const char: string = args.selectedCharacter;
    if (!char) return;
    const view: EditorView = cm.cm6;
    const { open, close } = getSurroundPair(char);
    const cursor = view.state.selection.main.head;
    const text = view.state.doc.toString();
    const bounds = findSurroundBounds(text, cursor, open, close);
    if (!bounds) return;
    // Both positions reference the original document — CM6 applies them correctly.
    view.dispatch(
      view.state.update({
        changes: [
          { from: bounds.from, to: bounds.from + 1 },
          { from: bounds.to, to: bounds.to + 1 },
        ],
      }),
    );
  });

  Vim.mapCommand("ds<character>", "action", "vimSurroundDelete", {}, {
    isEdit: true,
  });

  // ── cs<char><new> (normal) — change surrounding pair ──────────────────────
  // selectedCharacter gives us the old delimiter; awaitNextChar reads the new one.
  Vim.defineAction("vimSurroundChange", (cm: any, args: any) => {
    const oldChar: string = args.selectedCharacter;
    if (!oldChar) return;
    const view: EditorView = cm.cm6;
    const { open, close } = getSurroundPair(oldChar);
    const cursor = view.state.selection.main.head;
    const text = view.state.doc.toString();
    const bounds = findSurroundBounds(text, cursor, open, close);
    if (!bounds) return;
    awaitNextChar((newChar) => {
      const { open: newOpen, close: newClose } = getSurroundPair(newChar);
      view.dispatch(
        view.state.update({
          changes: [
            { from: bounds.from, to: bounds.from + 1, insert: newOpen },
            { from: bounds.to, to: bounds.to + 1, insert: newClose },
          ],
        }),
      );
    });
  });

  Vim.mapCommand("cs<character>", "action", "vimSurroundChange", {}, {
    isEdit: true,
  });
}
