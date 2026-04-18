import { createContext, useContext, useEffect, useState } from "react";
import {
  setEditorFontSize as setStoreFontSize,
  setEditorFontFamily as setStoreFontFamily,
  setEditorVimMode as setStoreVimMode,
} from "@/stores/editorStore";

const STORAGE_KEYS = {
  UI_FONT_SIZE: "ch-ui-font-size",
  EDITOR_FONT_SIZE: "ch-ui-editor-font-size",
  EDITOR_FONT_FAMILY: "ch-ui-editor-font-family",
  EDITOR_VIM_MODE: "ch-ui-editor-vim-mode",
} as const;

const DEFAULT_VALUES = {
  UI_FONT_SIZE: 14,
  EDITOR_FONT_SIZE: 14,
  EDITOR_FONT_FAMILY: "system",
  EDITOR_VIM_MODE: false,
} as const;

export type EditorFontFamily =
  | "system"
  | "jetbrains-mono"
  | "fira-code"
  | "cascadia-code"
  | "source-code-pro"
  | "monaco"
  | "consolas"
  | "ibm-plex-mono";

interface AppearanceSettings {
  uiFontSize: number;
  editorFontSize: number;
  editorFontFamily: EditorFontFamily;
  editorVimMode: boolean;
  setUIFontSize: (size: number) => void;
  setEditorFontSize: (size: number) => void;
  setEditorFontFamily: (family: EditorFontFamily) => void;
  setEditorVimMode: (enabled: boolean) => void;
}

const AppearanceContext = createContext<AppearanceSettings | undefined>(
  undefined
);

export function AppearanceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [uiFontSize, setUIFontSizeState] = useState<number>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.UI_FONT_SIZE);
    return stored ? parseInt(stored, 10) : DEFAULT_VALUES.UI_FONT_SIZE;
  });

  const [editorFontSize, setEditorFontSizeState] = useState<number>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.EDITOR_FONT_SIZE);
    return stored ? parseInt(stored, 10) : DEFAULT_VALUES.EDITOR_FONT_SIZE;
  });

  const [editorFontFamily, setEditorFontFamilyState] =
    useState<EditorFontFamily>(() => {
      const stored = localStorage.getItem(STORAGE_KEYS.EDITOR_FONT_FAMILY);
      return (stored as EditorFontFamily) || DEFAULT_VALUES.EDITOR_FONT_FAMILY;
    });

  const [editorVimMode, setEditorVimModeState] = useState<boolean>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.EDITOR_VIM_MODE);
    return stored === "true";
  });

  // Apply UI font size to CSS custom property
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--font-size-base",
      `${uiFontSize}px`
    );
  }, [uiFontSize]);

  const setUIFontSize = (size: number) => {
    setUIFontSizeState(size);
    localStorage.setItem(STORAGE_KEYS.UI_FONT_SIZE, size.toString());
  };

  const setEditorFontSize = (size: number) => {
    setEditorFontSizeState(size);
    localStorage.setItem(STORAGE_KEYS.EDITOR_FONT_SIZE, size.toString());
    setStoreFontSize(size);
  };

  const setEditorFontFamily = (family: EditorFontFamily) => {
    setEditorFontFamilyState(family);
    localStorage.setItem(STORAGE_KEYS.EDITOR_FONT_FAMILY, family);
    setStoreFontFamily(family);
  };

  const setEditorVimMode = (enabled: boolean) => {
    setEditorVimModeState(enabled);
    localStorage.setItem(STORAGE_KEYS.EDITOR_VIM_MODE, enabled.toString());
    setStoreVimMode(enabled);
  };

  return (
    <AppearanceContext.Provider
      value={{
        uiFontSize,
        editorFontSize,
        editorFontFamily,
        editorVimMode,
        setUIFontSize,
        setEditorFontSize,
        setEditorFontFamily,
        setEditorVimMode,
      }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (context === undefined) {
    throw new Error("useAppearance must be used within an AppearanceProvider");
  }
  return context;
}
