// src/stores/editorStore.ts
// Editor settings (font size, font family, vim mode) persisted to
// localStorage. Intended for consumption by the upcoming CodeMirror editor
// rewrite. Today's Monaco editor reads these values from AppearanceContext.

import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import type { EditorFontFamily } from "@/contexts/AppearanceContext";

export interface EditorState {
  fontSize: number;
  fontFamily: EditorFontFamily;
  vimMode: boolean;
}

const FONT_SIZE_KEY = "ch-ui-editor-font-size";
const FONT_FAMILY_KEY = "ch-ui-editor-font-family";
const VIM_MODE_KEY = "ch-ui-editor-vim-mode";

function loadPersisted(): Partial<EditorState> {
  try {
    const fontSizeRaw = localStorage.getItem(FONT_SIZE_KEY);
    const fontFamily = localStorage.getItem(
      FONT_FAMILY_KEY,
    ) as EditorFontFamily | null;
    const vimMode = localStorage.getItem(VIM_MODE_KEY);
    return {
      fontSize: fontSizeRaw ? parseInt(fontSizeRaw, 10) : undefined,
      fontFamily: fontFamily ?? undefined,
      vimMode: vimMode === "true",
    };
  } catch {
    return {};
  }
}

const persisted = loadPersisted();

export const editorStore = new Store<EditorState>({
  fontSize: persisted.fontSize ?? 14,
  fontFamily: persisted.fontFamily ?? "system",
  vimMode: persisted.vimMode ?? false,
});

editorStore.subscribe(() => {
  try {
    const { fontSize, fontFamily, vimMode } = editorStore.state;
    localStorage.setItem(FONT_SIZE_KEY, String(fontSize));
    localStorage.setItem(FONT_FAMILY_KEY, fontFamily);
    localStorage.setItem(VIM_MODE_KEY, String(vimMode));
  } catch {
    // Ignore quota errors
  }
});

export function setEditorFontSize(size: number) {
  editorStore.setState((prev) => ({ ...prev, fontSize: size }));
}

export function setEditorFontFamily(family: EditorFontFamily) {
  editorStore.setState((prev) => ({ ...prev, fontFamily: family }));
}

export function setEditorVimMode(enabled: boolean) {
  editorStore.setState((prev) => ({ ...prev, vimMode: enabled }));
}

export function useEditorFontSize(): number {
  return useStore(editorStore, (s) => s.fontSize);
}

export function useEditorFontFamily(): EditorFontFamily {
  return useStore(editorStore, (s) => s.fontFamily);
}

export function useEditorVimMode(): boolean {
  return useStore(editorStore, (s) => s.vimMode);
}
