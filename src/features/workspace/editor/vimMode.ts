// vimMode.ts
// Thin wrapper around @replit/codemirror-vim so the SQL editor can opt into
// vim keybindings through a single extension. Keeping the import isolated
// here allows tree-shaking when vim mode is disabled and gives us a single
// seam to extend if we need to customize vim commands in the future.

import { vim, Vim } from "@replit/codemirror-vim";
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

/**
 * Build the vim-mode Extension. Pass the returned extension to the editor
 * in its `extensions` array when vim mode is enabled.
 */
export function vimExtension(): Extension {
  return [vim({ status: true }), vimScrollExtension()];
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
}): void {
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
    removeTab(workspaceStore.state.activeTab);
  });
  Vim.defineEx("qa", "qa", () => {
    closeAllTabs();
  });
  Vim.defineEx("wq", "wq", () => {
    options.onSave();
    removeTab(workspaceStore.state.activeTab);
  });
  Vim.defineEx("x", "x", () => {
    options.onSave();
    removeTab(workspaceStore.state.activeTab);
  });
  Vim.defineAction("vimNextTab", () => {
    const { tabs, activeTab } = workspaceStore.state;
    const idx = tabs.findIndex((t) => t.id === activeTab);
    if (idx >= 0) setActiveTab(tabs[(idx + 1) % tabs.length].id);
  });
  Vim.mapCommand("gt", "action", "vimNextTab", {}, {});

  Vim.defineAction("vimPrevTab", () => {
    const { tabs, activeTab } = workspaceStore.state;
    const idx = tabs.findIndex((t) => t.id === activeTab);
    if (idx >= 0) setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length].id);
  });
  Vim.mapCommand("gT", "action", "vimPrevTab", {}, {});

  registerVimSurround();
}

export { Vim };
