// vimMode.ts
// Thin wrapper around @replit/codemirror-vim so the SQL editor can opt into
// vim keybindings through a single extension. Keeping the import isolated
// here allows tree-shaking when vim mode is disabled and gives us a single
// seam to extend if we need to customize vim commands in the future.

import { vim, Vim } from "@replit/codemirror-vim";
import type { Extension } from "@codemirror/state";
import { workspaceStore, setActiveTab } from "@/stores/workspaceStore";
import { registerVimSurround } from "./vimSurround";

/**
 * Build the vim-mode Extension. Pass the returned extension to the editor
 * in its `extensions` array when vim mode is enabled.
 */
export function vimExtension(): Extension {
  return vim({ status: true });
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
