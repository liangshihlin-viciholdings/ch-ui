// vimMode.ts
// Thin wrapper around @replit/codemirror-vim so the SQL editor can opt into
// vim keybindings through a single extension. Keeping the import isolated
// here allows tree-shaking when vim mode is disabled and gives us a single
// seam to extend if we need to customize vim commands in the future.

import { vim, Vim } from "@replit/codemirror-vim";
import type { Extension } from "@codemirror/state";

/**
 * Build the vim-mode Extension. Pass the returned extension to the editor
 * in its `extensions` array when vim mode is enabled.
 */
export function vimExtension(): Extension {
  return vim();
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
}

export { Vim };
