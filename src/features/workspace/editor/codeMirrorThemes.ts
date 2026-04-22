// codeMirrorThemes.ts
// CodeMirror 6 theme + HighlightStyle definitions for all 18 application
// themes (17 ported from monacoThemes.ts + hyperdx). Each theme provides:
//   - EditorView.theme(): editor chrome (background, gutter, selection, cursor)
//   - HighlightStyle: token colors (keyword, string, comment, function, type,
//     number, operator, variableName)
// The exported `getCodeMirrorTheme(appTheme)` returns an Extension[] ready to
// pass to the CodeMirror editor. `isLightTheme(appTheme)` mirrors the
// theme-provider helper so the editor can adapt non-theme colors (e.g. the
// current-query highlight overlay).

import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";

export type AppTheme =
  | "dracula"
  | "nord"
  | "gruvbox-dark"
  | "tokyo-night"
  | "monokai-pro"
  | "solarized-dark"
  | "catppuccin-mocha"
  | "ayu-dark"
  | "kanso"
  | "catppuccin-frappe"
  | "github-light"
  | "gruvbox-light"
  | "catppuccin-latte"
  | "one-light"
  | "solarized-light"
  | "ayu-light"
  | "rose-pine-dawn"
  | "hyperdx"
  | "system";

interface ThemeColors {
  background: string;
  foreground: string;
  caret: string;
  selection: string;
  lineHighlight: string;
  gutterBackground: string;
  gutterForeground: string;
  gutterActiveForeground: string;
  // Token colors
  keyword: string;
  string: string;
  comment: string;
  function: string;
  typeName: string;
  number: string;
  operator: string;
  variableName: string;
}

const THEMES: Record<Exclude<AppTheme, "system">, {
  dark: boolean;
  colors: ThemeColors;
}> = {
  dracula: {
    dark: true,
    colors: {
      background: "#282a36",
      foreground: "#f8f8f2",
      caret: "#f8f8f0",
      selection: "#5a5f7a",
      lineHighlight: "#44475a",
      gutterBackground: "#282a36",
      gutterForeground: "#6272a4",
      gutterActiveForeground: "#f8f8f2",
      keyword: "#ff79c6",
      string: "#f1fa8c",
      comment: "#6272a4",
      function: "#50fa7b",
      typeName: "#8be9fd",
      number: "#bd93f9",
      operator: "#ff79c6",
      variableName: "#f8f8f2",
    },
  },
  nord: {
    dark: true,
    colors: {
      background: "#2E3440",
      foreground: "#D8DEE9",
      caret: "#D8DEE9",
      selection: "#4e6180",
      lineHighlight: "#3B4252",
      gutterBackground: "#2E3440",
      gutterForeground: "#4C566A",
      gutterActiveForeground: "#D8DEE9",
      keyword: "#81a1c1",
      string: "#a3be8c",
      comment: "#616e88",
      function: "#88c0d0",
      typeName: "#81a1c1",
      number: "#b48ead",
      operator: "#81a1c1",
      variableName: "#D8DEE9",
    },
  },
  "gruvbox-dark": {
    dark: true,
    colors: {
      background: "#282828",
      foreground: "#ebdbb2",
      caret: "#ebdbb2",
      selection: "#6b5a50",
      lineHighlight: "#3c3836",
      gutterBackground: "#282828",
      gutterForeground: "#665c54",
      gutterActiveForeground: "#ebdbb2",
      keyword: "#fb4934",
      string: "#b8bb26",
      comment: "#928374",
      function: "#b8bb26",
      typeName: "#83a598",
      number: "#d3869b",
      operator: "#fb4934",
      variableName: "#ebdbb2",
    },
  },
  "tokyo-night": {
    dark: true,
    colors: {
      background: "#1a1b26",
      foreground: "#a9b1d6",
      caret: "#c0caf5",
      selection: "#3d5a9e",
      lineHighlight: "#292e42",
      gutterBackground: "#1a1b26",
      gutterForeground: "#3b4261",
      gutterActiveForeground: "#a9b1d6",
      keyword: "#bb9af7",
      string: "#9ece6a",
      comment: "#565f89",
      function: "#7aa2f7",
      typeName: "#7dcfff",
      number: "#ff9e64",
      operator: "#bb9af7",
      variableName: "#a9b1d6",
    },
  },
  "monokai-pro": {
    dark: true,
    colors: {
      background: "#2D2A2E",
      foreground: "#FCFCFA",
      caret: "#FCFCFA",
      selection: "#625f65",
      lineHighlight: "#353236",
      gutterBackground: "#2D2A2E",
      gutterForeground: "#727072",
      gutterActiveForeground: "#FCFCFA",
      keyword: "#FF6188",
      string: "#FFD866",
      comment: "#727072",
      function: "#A9DC76",
      typeName: "#78DCE8",
      number: "#AB9DF2",
      operator: "#FF6188",
      variableName: "#FCFCFA",
    },
  },
  "solarized-dark": {
    dark: true,
    colors: {
      background: "#002B36",
      foreground: "#839496",
      caret: "#839496",
      selection: "#174f60",
      lineHighlight: "#073642",
      gutterBackground: "#002B36",
      gutterForeground: "#586E75",
      gutterActiveForeground: "#93A1A1",
      keyword: "#859900",
      string: "#2AA198",
      comment: "#586E75",
      function: "#268BD2",
      typeName: "#268BD2",
      number: "#D33682",
      operator: "#859900",
      variableName: "#839496",
    },
  },
  "catppuccin-mocha": {
    dark: true,
    colors: {
      background: "#1E1E2E",
      foreground: "#CDD6F4",
      caret: "#F5E0DC",
      selection: "#585b7a",
      lineHighlight: "#313244",
      gutterBackground: "#1E1E2E",
      gutterForeground: "#6C7086",
      gutterActiveForeground: "#CDD6F4",
      keyword: "#CBA6F7",
      string: "#A6E3A1",
      comment: "#6C7086",
      function: "#89B4FA",
      typeName: "#89B4FA",
      number: "#FAB387",
      operator: "#CBA6F7",
      variableName: "#CDD6F4",
    },
  },
  "ayu-dark": {
    dark: true,
    colors: {
      background: "#0A0E14",
      foreground: "#B3B1AD",
      caret: "#E6B450",
      selection: "#2d4f6a",
      lineHighlight: "#11151C",
      gutterBackground: "#0A0E14",
      gutterForeground: "#3D424D",
      gutterActiveForeground: "#B3B1AD",
      keyword: "#FF8F40",
      string: "#AAD94C",
      comment: "#626A73",
      function: "#FFB454",
      typeName: "#39BAE6",
      number: "#D2A6FF",
      operator: "#FF8F40",
      variableName: "#B3B1AD",
    },
  },
  kanso: {
    dark: true,
    colors: {
      background: "#101010",
      foreground: "#DCD7BA",
      caret: "#C8C093",
      selection: "#33607d",
      lineHighlight: "#1A1A1A",
      gutterBackground: "#101010",
      gutterForeground: "#54546D",
      gutterActiveForeground: "#C8C093",
      keyword: "#957FB8",
      string: "#98BB6C",
      comment: "#727169",
      function: "#7E9CD8",
      typeName: "#7E9CD8",
      number: "#D27E99",
      operator: "#957FB8",
      variableName: "#DCD7BA",
    },
  },
  "catppuccin-frappe": {
    dark: true,
    colors: {
      background: "#303446",
      foreground: "#C6D0F5",
      caret: "#F2D5CF",
      selection: "#636882",
      lineHighlight: "#414559",
      gutterBackground: "#303446",
      gutterForeground: "#737994",
      gutterActiveForeground: "#C6D0F5",
      keyword: "#CA9EE6",
      string: "#A6D189",
      comment: "#737994",
      function: "#8CAAEE",
      typeName: "#8CAAEE",
      number: "#EF9F76",
      operator: "#CA9EE6",
      variableName: "#C6D0F5",
    },
  },
  hyperdx: {
    // HyperDX green-accent dark theme
    dark: true,
    colors: {
      background: "#0F1116",
      foreground: "#E6E8EB",
      caret: "#50FA7B",
      selection: "#2a4060",
      lineHighlight: "#161A21",
      gutterBackground: "#0F1116",
      gutterForeground: "#4B5563",
      gutterActiveForeground: "#E6E8EB",
      keyword: "#50FA7B",
      string: "#FBBF24",
      comment: "#6B7280",
      function: "#60A5FA",
      typeName: "#38BDF8",
      number: "#A78BFA",
      operator: "#50FA7B",
      variableName: "#E6E8EB",
    },
  },
  "github-light": {
    dark: false,
    colors: {
      background: "#ffffff",
      foreground: "#24292e",
      caret: "#24292e",
      selection: "#b3d4f8",
      lineHighlight: "#fafbfc",
      gutterBackground: "#ffffff",
      gutterForeground: "#959da5",
      gutterActiveForeground: "#24292e",
      keyword: "#d73a49",
      string: "#032f62",
      comment: "#6a737d",
      function: "#6f42c1",
      typeName: "#d73a49",
      number: "#005cc5",
      operator: "#d73a49",
      variableName: "#24292e",
    },
  },
  "gruvbox-light": {
    dark: false,
    colors: {
      background: "#fbf1c7",
      foreground: "#3c3836",
      caret: "#3c3836",
      selection: "#bfad8e",
      lineHighlight: "#ebdbb2",
      gutterBackground: "#fbf1c7",
      gutterForeground: "#a89984",
      gutterActiveForeground: "#3c3836",
      keyword: "#9d0006",
      string: "#79740e",
      comment: "#928374",
      function: "#79740e",
      typeName: "#076678",
      number: "#8f3f71",
      operator: "#9d0006",
      variableName: "#3c3836",
    },
  },
  "catppuccin-latte": {
    dark: false,
    colors: {
      background: "#eff1f5",
      foreground: "#4c4f69",
      caret: "#dc8a78",
      selection: "#8c91a6",
      lineHighlight: "#e6e9ef",
      gutterBackground: "#eff1f5",
      gutterForeground: "#9ca0b0",
      gutterActiveForeground: "#4c4f69",
      keyword: "#8839ef",
      string: "#40a02b",
      comment: "#9ca0b0",
      function: "#1e66f5",
      typeName: "#1e66f5",
      number: "#fe640b",
      operator: "#8839ef",
      variableName: "#4c4f69",
    },
  },
  "one-light": {
    dark: false,
    colors: {
      background: "#fafafa",
      foreground: "#383a42",
      caret: "#526fff",
      selection: "#c8d3f5",
      lineHighlight: "#f2f2f2",
      gutterBackground: "#fafafa",
      gutterForeground: "#9d9d9f",
      gutterActiveForeground: "#383a42",
      keyword: "#a626a4",
      string: "#50a14f",
      comment: "#a0a1a7",
      function: "#4078f2",
      typeName: "#0184bc",
      number: "#986801",
      operator: "#a626a4",
      variableName: "#383a42",
    },
  },
  "solarized-light": {
    dark: false,
    colors: {
      background: "#FDF6E3",
      foreground: "#657B83",
      caret: "#657B83",
      selection: "#b8dce0",
      lineHighlight: "#EEE8D5",
      gutterBackground: "#FDF6E3",
      gutterForeground: "#93A1A1",
      gutterActiveForeground: "#657B83",
      keyword: "#859900",
      string: "#2AA198",
      comment: "#93A1A1",
      function: "#268BD2",
      typeName: "#268BD2",
      number: "#D33682",
      operator: "#859900",
      variableName: "#657B83",
    },
  },
  "ayu-light": {
    dark: false,
    colors: {
      background: "#FAFAFA",
      foreground: "#575F66",
      caret: "#FF9940",
      selection: "#aacde8",
      lineHighlight: "#F0F0F0",
      gutterBackground: "#FAFAFA",
      gutterForeground: "#ABB0B6",
      gutterActiveForeground: "#575F66",
      keyword: "#FA8D3E",
      string: "#86B300",
      comment: "#ABB0B6",
      function: "#F2AE49",
      typeName: "#399EE6",
      number: "#A37ACC",
      operator: "#FA8D3E",
      variableName: "#575F66",
    },
  },
  "rose-pine-dawn": {
    dark: false,
    colors: {
      background: "#FAF4ED",
      foreground: "#575279",
      caret: "#575279",
      selection: "#c5bed9",
      lineHighlight: "#F4EDE8",
      gutterBackground: "#FAF4ED",
      gutterForeground: "#9893A5",
      gutterActiveForeground: "#575279",
      keyword: "#286983",
      string: "#EA9D34",
      comment: "#9893A5",
      function: "#286983",
      typeName: "#56949F",
      number: "#907AA9",
      operator: "#286983",
      variableName: "#575279",
    },
  },
};

/**
 * Light theme identifiers (used for e.g. selecting the highlight-overlay
 * background and falling back to a sensible default for `system`).
 */
export const LIGHT_THEMES: AppTheme[] = [
  "github-light",
  "gruvbox-light",
  "catppuccin-latte",
  "one-light",
  "solarized-light",
  "ayu-light",
  "rose-pine-dawn",
];

function resolveTheme(appTheme: AppTheme): Exclude<AppTheme, "system"> {
  if (appTheme === "system") {
    const systemIsDark =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    return systemIsDark ? "dracula" : "github-light";
  }
  return appTheme;
}

function buildEditorTheme(colors: ThemeColors, dark: boolean): Extension {
  return EditorView.theme(
    {
      "&": {
        color: colors.foreground,
        backgroundColor: colors.background,
      },
      ".cm-content": {
        caretColor: colors.caret,
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: colors.caret,
      },
      // Target the layer created by drawSelection() — the exact DOM path
      // CM6 uses: editor > scroller > selectionLayer > selectionBackground
      "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
        backgroundColor: colors.selection,
      },
      // Fallback for unfocused state and ::selection (native browser selection)
      "& .cm-selectionBackground, ::selection": {
        backgroundColor: `${colors.selection} !important`,
      },
      // Use boxShadow instead of backgroundColor so the selection layer
      // (z-index:1, below content z-index:2) remains visible on the active line.
      ".cm-activeLine": {
        backgroundColor: "transparent",
        boxShadow: `inset 2px 0 0 0 ${colors.caret}`,
      },
      ".cm-gutters": {
        backgroundColor: colors.gutterBackground,
        color: colors.gutterForeground,
        border: "none",
      },
      ".cm-activeLineGutter": {
        backgroundColor: colors.lineHighlight,
        color: colors.gutterActiveForeground,
      },
      ".cm-lineNumbers .cm-gutterElement": {
        color: colors.gutterForeground,
      },
      ".cm-tooltip": {
        backgroundColor: colors.background,
        border: `1px solid ${colors.selection}`,
        color: colors.foreground,
      },
      ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
        backgroundColor: colors.selection,
        color: colors.foreground,
      },
      ".cm-completionIcon": {
        width: "1em",
        marginRight: "0.4em",
        textAlign: "center",
        opacity: "0.9",
      },
      ".cm-completionIcon-property": { color: colors.variableName },
      ".cm-completionIcon-type": { color: colors.typeName },
      ".cm-completionIcon-namespace": { color: colors.keyword },
      ".cm-completionIcon-function": { color: colors.function },
      ".cm-completionIcon-keyword": { color: colors.keyword },
      ".cm-completionIcon-class": { color: colors.typeName },
      ".cm-completionIcon-enum": { color: colors.typeName },
      ".cm-completionMatchedText": {
        textDecoration: "underline",
        color: colors.keyword,
        fontWeight: "bold",
      },
      ".cm-completionDetail": {
        color: colors.comment,
        fontStyle: "italic",
        marginLeft: "auto",
        paddingLeft: "1em",
        fontSize: "0.85em",
      },
      ".cm-panels": {
        backgroundColor: colors.background,
        color: colors.foreground,
      },
      ".cm-scroller": {
        fontFamily: "inherit",
      },
    },
    { dark },
  );
}

function buildHighlightStyle(colors: ThemeColors): HighlightStyle {
  return HighlightStyle.define([
    { tag: t.keyword, color: colors.keyword },
    { tag: [t.controlKeyword, t.moduleKeyword], color: colors.keyword },
    { tag: [t.string, t.special(t.string)], color: colors.string },
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: colors.comment, fontStyle: "italic" },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: colors.function },
    // @codemirror/lang-sql tags builtin dialect entries (e.g. toDate, now) with
    // tags.standard(tags.name) — map those to the function color.
    { tag: t.standard(t.name), color: colors.function },
    { tag: [t.typeName, t.className], color: colors.typeName },
    { tag: [t.number, t.bool, t.null], color: colors.number },
    { tag: [t.operator, t.punctuation, t.separator], color: colors.operator },
    { tag: t.variableName, color: colors.variableName },
    { tag: t.propertyName, color: colors.variableName },
    { tag: t.definition(t.variableName), color: colors.variableName },
    { tag: t.attributeName, color: colors.function },
    { tag: t.escape, color: colors.number },
  ]);
}

/**
 * Get CodeMirror extensions implementing the given application theme.
 * Returns an array containing both the editor chrome theme and the
 * syntax-highlight style so callers can spread it into their extension list.
 */
export function getCodeMirrorTheme(appTheme: AppTheme): Extension[] {
  const resolved = resolveTheme(appTheme);
  const spec = THEMES[resolved];
  return [
    buildEditorTheme(spec.colors, spec.dark),
    syntaxHighlighting(buildHighlightStyle(spec.colors)),
  ];
}

/**
 * Whether the app theme should be rendered as a light theme. Mirrors the
 * helper in theme-provider.tsx so editor chrome code (e.g. the current-query
 * highlight overlay background) can adapt without a round-trip through React
 * context.
 */
export function isLightTheme(appTheme: AppTheme): boolean {
  if (appTheme === "system") {
    return (
      typeof window !== "undefined" &&
      !window.matchMedia?.("(prefers-color-scheme: dark)").matches
    );
  }
  return LIGHT_THEMES.includes(appTheme);
}
