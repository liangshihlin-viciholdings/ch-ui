import * as monaco from "monaco-editor";

// Theme definition type from Monaco
type MonacoThemeData = monaco.editor.IStandaloneThemeData;

// Dracula Theme
const draculaTheme: MonacoThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { background: "282a36", token: "" },
    { foreground: "6272a4", token: "comment" },
    { foreground: "f1fa8c", token: "string" },
    { foreground: "bd93f9", token: "constant.numeric" },
    { foreground: "bd93f9", token: "constant.language" },
    { foreground: "ff79c6", token: "keyword" },
    { foreground: "ff79c6", token: "storage" },
    { foreground: "8be9fd", fontStyle: "italic", token: "storage.type" },
    { foreground: "50fa7b", token: "entity.name.function" },
    { foreground: "50fa7b", token: "entity.name.class" },
    { foreground: "ffb86c", fontStyle: "italic", token: "variable.parameter" },
    { foreground: "8be9fd", token: "support.function" },
    { foreground: "ff79c6", token: "predefined" },
    { foreground: "ff79c6", token: "entity.name.tag" },
    { foreground: "50fa7b", token: "entity.other.attribute-name" },
    // SQL-specific tokens
    { foreground: "ff79c6", token: "keyword.sql" },
    { foreground: "8be9fd", token: "support.function.sql" },
    { foreground: "50fa7b", token: "entity.name.function.sql" },
  ],
  colors: {
    "editor.foreground": "#f8f8f2",
    "editor.background": "#282a36",
    "editor.selectionBackground": "#44475a",
    "editor.lineHighlightBackground": "#44475a",
    "editorCursor.foreground": "#f8f8f0",
    "editorWhitespace.foreground": "#3B3A32",
    "editorLineNumber.foreground": "#6272a4",
    "editorLineNumber.activeForeground": "#f8f8f2",
  },
};

// Nord Theme
const nordTheme: MonacoThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { background: "2E3440", token: "" },
    { foreground: "616e88", token: "comment" },
    { foreground: "a3be8c", token: "string" },
    { foreground: "b48ead", token: "constant.numeric" },
    { foreground: "81a1c1", token: "keyword" },
    { foreground: "81a1c1", token: "storage" },
    { foreground: "81a1c1", token: "storage.type" },
    { foreground: "8fbcbb", token: "entity.name.class" },
    { foreground: "88c0d0", token: "entity.name.function" },
    { foreground: "81a1c1", token: "entity.name.tag" },
    { foreground: "8fbcbb", token: "entity.other.attribute-name" },
    { foreground: "88c0d0", token: "support.function" },
    { foreground: "81a1c1", token: "predefined" },
    { foreground: "ebcb8b", token: "constant.character.escape" },
  ],
  colors: {
    "editor.foreground": "#D8DEE9",
    "editor.background": "#2E3440",
    "editor.selectionBackground": "#434C5ECC",
    "editor.lineHighlightBackground": "#3B4252",
    "editorCursor.foreground": "#D8DEE9",
    "editorWhitespace.foreground": "#434C5ECC",
    "editorLineNumber.foreground": "#4C566A",
    "editorLineNumber.activeForeground": "#D8DEE9",
  },
};

// Gruvbox Dark Theme
const gruvboxDarkTheme: MonacoThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { background: "282828", token: "" },
    { foreground: "928374", token: "comment" },
    { foreground: "b8bb26", token: "string" },
    { foreground: "d3869b", token: "constant.numeric" },
    { foreground: "fb4934", token: "keyword" },
    { foreground: "fb4934", token: "storage" },
    { foreground: "83a598", token: "storage.type" },
    { foreground: "fabd2f", token: "entity.name.class" },
    { foreground: "b8bb26", token: "entity.name.function" },
    { foreground: "8ec07c", token: "entity.name.tag" },
    { foreground: "fabd2f", token: "entity.other.attribute-name" },
    { foreground: "8ec07c", token: "support.function" },
    { foreground: "fb4934", token: "predefined" },
    { foreground: "fe8019", token: "constant.character.escape" },
  ],
  colors: {
    "editor.foreground": "#ebdbb2",
    "editor.background": "#282828",
    "editor.selectionBackground": "#504945",
    "editor.lineHighlightBackground": "#3c3836",
    "editorCursor.foreground": "#ebdbb2",
    "editorWhitespace.foreground": "#504945",
    "editorLineNumber.foreground": "#665c54",
    "editorLineNumber.activeForeground": "#ebdbb2",
  },
};

// Tokyo Night Theme
const tokyoNightTheme: MonacoThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { background: "1a1b26", token: "" },
    { foreground: "565f89", token: "comment" },
    { foreground: "9ece6a", token: "string" },
    { foreground: "ff9e64", token: "constant.numeric" },
    { foreground: "bb9af7", token: "keyword" },
    { foreground: "bb9af7", token: "storage" },
    { foreground: "7dcfff", token: "storage.type" },
    { foreground: "7aa2f7", token: "entity.name.class" },
    { foreground: "7aa2f7", token: "entity.name.function" },
    { foreground: "f7768e", token: "entity.name.tag" },
    { foreground: "73daca", token: "entity.other.attribute-name" },
    { foreground: "7dcfff", token: "support.function" },
    { foreground: "bb9af7", token: "predefined" },
    { foreground: "89ddff", token: "constant.character.escape" },
  ],
  colors: {
    "editor.foreground": "#a9b1d6",
    "editor.background": "#1a1b26",
    "editor.selectionBackground": "#33467c",
    "editor.lineHighlightBackground": "#292e42",
    "editorCursor.foreground": "#c0caf5",
    "editorWhitespace.foreground": "#3b4261",
    "editorLineNumber.foreground": "#3b4261",
    "editorLineNumber.activeForeground": "#a9b1d6",
  },
};

// GitHub Light Theme
const githubLightTheme: MonacoThemeData = {
  base: "vs",
  inherit: true,
  rules: [
    { background: "ffffff", token: "" },
    { foreground: "6a737d", token: "comment" },
    { foreground: "032f62", token: "string" },
    { foreground: "005cc5", token: "constant.numeric" },
    { foreground: "d73a49", token: "keyword" },
    { foreground: "d73a49", token: "storage" },
    { foreground: "d73a49", token: "storage.type" },
    { foreground: "6f42c1", token: "entity.name.class" },
    { foreground: "6f42c1", token: "entity.name.function" },
    { foreground: "22863a", token: "entity.name.tag" },
    { foreground: "6f42c1", token: "entity.other.attribute-name" },
    { foreground: "005cc5", token: "support.function" },
    { foreground: "6f42c1", token: "predefined" },
    { foreground: "005cc5", token: "variable" },
  ],
  colors: {
    "editor.foreground": "#24292e",
    "editor.background": "#ffffff",
    "editor.selectionBackground": "#c8c8fa",
    "editor.lineHighlightBackground": "#fafbfc",
    "editorCursor.foreground": "#24292e",
    "editorWhitespace.foreground": "#959da5",
    "editorLineNumber.foreground": "#959da5",
    "editorLineNumber.activeForeground": "#24292e",
  },
};

// Gruvbox Light Theme
const gruvboxLightTheme: MonacoThemeData = {
  base: "vs",
  inherit: true,
  rules: [
    { background: "fbf1c7", token: "" },
    { foreground: "928374", token: "comment" },
    { foreground: "79740e", token: "string" },
    { foreground: "8f3f71", token: "constant.numeric" },
    { foreground: "9d0006", token: "keyword" },
    { foreground: "9d0006", token: "storage" },
    { foreground: "076678", token: "storage.type" },
    { foreground: "b57614", token: "entity.name.class" },
    { foreground: "79740e", token: "entity.name.function" },
    { foreground: "427b58", token: "entity.name.tag" },
    { foreground: "b57614", token: "entity.other.attribute-name" },
    { foreground: "427b58", token: "support.function" },
    { foreground: "427b58", token: "predefined" },
    { foreground: "af3a03", token: "constant.character.escape" },
  ],
  colors: {
    "editor.foreground": "#3c3836",
    "editor.background": "#fbf1c7",
    "editor.selectionBackground": "#d5c4a1",
    "editor.lineHighlightBackground": "#ebdbb2",
    "editorCursor.foreground": "#3c3836",
    "editorWhitespace.foreground": "#a89984",
    "editorLineNumber.foreground": "#a89984",
    "editorLineNumber.activeForeground": "#3c3836",
  },
};

// Catppuccin Latte Theme
const catppuccinLatteTheme: MonacoThemeData = {
  base: "vs",
  inherit: true,
  rules: [
    { background: "eff1f5", token: "" },
    { foreground: "9ca0b0", token: "comment" },
    { foreground: "40a02b", token: "string" },
    { foreground: "fe640b", token: "constant.numeric" },
    { foreground: "8839ef", token: "keyword" },
    { foreground: "8839ef", token: "storage" },
    { foreground: "1e66f5", token: "storage.type" },
    { foreground: "df8e1d", token: "entity.name.class" },
    { foreground: "1e66f5", token: "entity.name.function" },
    { foreground: "179299", token: "entity.name.tag" },
    { foreground: "df8e1d", token: "entity.other.attribute-name" },
    { foreground: "04a5e5", token: "support.function" },
    { foreground: "1e66f5", token: "predefined" },
    { foreground: "dd7878", token: "constant.character.escape" },
  ],
  colors: {
    "editor.foreground": "#4c4f69",
    "editor.background": "#eff1f5",
    "editor.selectionBackground": "#acb0be",
    "editor.lineHighlightBackground": "#e6e9ef",
    "editorCursor.foreground": "#dc8a78",
    "editorWhitespace.foreground": "#9ca0b0",
    "editorLineNumber.foreground": "#9ca0b0",
    "editorLineNumber.activeForeground": "#4c4f69",
  },
};

// One Light Theme
const oneLightTheme: MonacoThemeData = {
  base: "vs",
  inherit: true,
  rules: [
    { background: "fafafa", token: "" },
    { foreground: "a0a1a7", token: "comment" },
    { foreground: "50a14f", token: "string" },
    { foreground: "986801", token: "constant.numeric" },
    { foreground: "a626a4", token: "keyword" },
    { foreground: "a626a4", token: "storage" },
    { foreground: "0184bc", token: "storage.type" },
    { foreground: "c18401", token: "entity.name.class" },
    { foreground: "4078f2", token: "entity.name.function" },
    { foreground: "e45649", token: "entity.name.tag" },
    { foreground: "c18401", token: "entity.other.attribute-name" },
    { foreground: "0184bc", token: "support.function" },
    { foreground: "0184bc", token: "predefined" },
    { foreground: "986801", token: "constant.character.escape" },
  ],
  colors: {
    "editor.foreground": "#383a42",
    "editor.background": "#fafafa",
    "editor.selectionBackground": "#e5e5e6",
    "editor.lineHighlightBackground": "#f2f2f2",
    "editorCursor.foreground": "#526fff",
    "editorWhitespace.foreground": "#d3d3d3",
    "editorLineNumber.foreground": "#9d9d9f",
    "editorLineNumber.activeForeground": "#383a42",
  },
};

// Monokai Pro Theme
const monokaiProTheme: MonacoThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { background: "2D2A2E", token: "" },
    { foreground: "727072", token: "comment" },
    { foreground: "FFD866", token: "string" },
    { foreground: "AB9DF2", token: "constant.numeric" },
    { foreground: "FF6188", token: "keyword" },
    { foreground: "FF6188", token: "storage" },
    { foreground: "78DCE8", fontStyle: "italic", token: "storage.type" },
    { foreground: "A9DC76", token: "entity.name.class" },
    { foreground: "A9DC76", token: "entity.name.function" },
    { foreground: "FF6188", token: "entity.name.tag" },
    { foreground: "78DCE8", token: "entity.other.attribute-name" },
    { foreground: "A9DC76", token: "support.function" },
    { foreground: "AB9DF2", token: "predefined" },
    { foreground: "FC9867", token: "constant.character.escape" },
  ],
  colors: {
    "editor.foreground": "#FCFCFA",
    "editor.background": "#2D2A2E",
    "editor.selectionBackground": "#403E41",
    "editor.lineHighlightBackground": "#353236",
    "editorCursor.foreground": "#FCFCFA",
    "editorWhitespace.foreground": "#403E41",
    "editorLineNumber.foreground": "#727072",
    "editorLineNumber.activeForeground": "#FCFCFA",
  },
};

// Solarized Dark Theme
const solarizedDarkTheme: MonacoThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { background: "002B36", token: "" },
    { foreground: "586E75", token: "comment" },
    { foreground: "2AA198", token: "string" },
    { foreground: "D33682", token: "constant.numeric" },
    { foreground: "859900", token: "keyword" },
    { foreground: "859900", token: "storage" },
    { foreground: "268BD2", token: "storage.type" },
    { foreground: "B58900", token: "entity.name.class" },
    { foreground: "268BD2", token: "entity.name.function" },
    { foreground: "268BD2", token: "entity.name.tag" },
    { foreground: "B58900", token: "entity.other.attribute-name" },
    { foreground: "268BD2", token: "support.function" },
    { foreground: "6C71C4", token: "predefined" },
    { foreground: "CB4B16", token: "constant.character.escape" },
  ],
  colors: {
    "editor.foreground": "#839496",
    "editor.background": "#002B36",
    "editor.selectionBackground": "#073642",
    "editor.lineHighlightBackground": "#073642",
    "editorCursor.foreground": "#839496",
    "editorWhitespace.foreground": "#073642",
    "editorLineNumber.foreground": "#586E75",
    "editorLineNumber.activeForeground": "#93A1A1",
  },
};

// Catppuccin Mocha Theme
const catppuccinMochaTheme: MonacoThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { background: "1E1E2E", token: "" },
    { foreground: "6C7086", token: "comment" },
    { foreground: "A6E3A1", token: "string" },
    { foreground: "FAB387", token: "constant.numeric" },
    { foreground: "CBA6F7", token: "keyword" },
    { foreground: "CBA6F7", token: "storage" },
    { foreground: "89B4FA", token: "storage.type" },
    { foreground: "F9E2AF", token: "entity.name.class" },
    { foreground: "89B4FA", token: "entity.name.function" },
    { foreground: "94E2D5", token: "entity.name.tag" },
    { foreground: "F9E2AF", token: "entity.other.attribute-name" },
    { foreground: "74C7EC", token: "support.function" },
    { foreground: "89B4FA", token: "predefined" },
    { foreground: "F38BA8", token: "constant.character.escape" },
  ],
  colors: {
    "editor.foreground": "#CDD6F4",
    "editor.background": "#1E1E2E",
    "editor.selectionBackground": "#45475A",
    "editor.lineHighlightBackground": "#313244",
    "editorCursor.foreground": "#F5E0DC",
    "editorWhitespace.foreground": "#45475A",
    "editorLineNumber.foreground": "#6C7086",
    "editorLineNumber.activeForeground": "#CDD6F4",
  },
};

// Ayu Dark Theme
const ayuDarkTheme: MonacoThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { background: "0A0E14", token: "" },
    { foreground: "626A73", token: "comment" },
    { foreground: "AAD94C", token: "string" },
    { foreground: "D2A6FF", token: "constant.numeric" },
    { foreground: "FF8F40", token: "keyword" },
    { foreground: "FF8F40", token: "storage" },
    { foreground: "39BAE6", token: "storage.type" },
    { foreground: "59C2FF", token: "entity.name.class" },
    { foreground: "FFB454", token: "entity.name.function" },
    { foreground: "39BAE6", token: "entity.name.tag" },
    { foreground: "59C2FF", token: "entity.other.attribute-name" },
    { foreground: "FFB454", token: "support.function" },
    { foreground: "E6B673", token: "predefined" },
    { foreground: "95E6CB", token: "constant.character.escape" },
  ],
  colors: {
    "editor.foreground": "#B3B1AD",
    "editor.background": "#0A0E14",
    "editor.selectionBackground": "#273747",
    "editor.lineHighlightBackground": "#11151C",
    "editorCursor.foreground": "#E6B450",
    "editorWhitespace.foreground": "#2D3640",
    "editorLineNumber.foreground": "#3D424D",
    "editorLineNumber.activeForeground": "#B3B1AD",
  },
};

// Kansō Theme (Kanagawa-inspired zen)
const kansoTheme: MonacoThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { background: "101010", token: "" },
    { foreground: "727169", token: "comment" },
    { foreground: "98BB6C", token: "string" },
    { foreground: "D27E99", token: "constant.numeric" },
    { foreground: "957FB8", token: "keyword" },
    { foreground: "957FB8", token: "storage" },
    { foreground: "7E9CD8", token: "storage.type" },
    { foreground: "C0A36E", token: "entity.name.class" },
    { foreground: "7E9CD8", token: "entity.name.function" },
    { foreground: "7FB4CA", token: "entity.name.tag" },
    { foreground: "C0A36E", token: "entity.other.attribute-name" },
    { foreground: "7E9CD8", token: "support.function" },
    { foreground: "957FB8", token: "predefined" },
    { foreground: "E6C384", token: "constant.character.escape" },
  ],
  colors: {
    "editor.foreground": "#DCD7BA",
    "editor.background": "#101010",
    "editor.selectionBackground": "#2D4F67",
    "editor.lineHighlightBackground": "#1A1A1A",
    "editorCursor.foreground": "#C8C093",
    "editorWhitespace.foreground": "#2A2A2A",
    "editorLineNumber.foreground": "#54546D",
    "editorLineNumber.activeForeground": "#C8C093",
  },
};

// Catppuccin Frappé Theme
const catppuccinFrappeTheme: MonacoThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { background: "303446", token: "" },
    { foreground: "737994", token: "comment" },
    { foreground: "A6D189", token: "string" },
    { foreground: "EF9F76", token: "constant.numeric" },
    { foreground: "CA9EE6", token: "keyword" },
    { foreground: "CA9EE6", token: "storage" },
    { foreground: "8CAAEE", token: "storage.type" },
    { foreground: "E5C890", token: "entity.name.class" },
    { foreground: "8CAAEE", token: "entity.name.function" },
    { foreground: "81C8BE", token: "entity.name.tag" },
    { foreground: "E5C890", token: "entity.other.attribute-name" },
    { foreground: "85C1DC", token: "support.function" },
    { foreground: "8CAAEE", token: "predefined" },
    { foreground: "E78284", token: "constant.character.escape" },
  ],
  colors: {
    "editor.foreground": "#C6D0F5",
    "editor.background": "#303446",
    "editor.selectionBackground": "#51576D",
    "editor.lineHighlightBackground": "#414559",
    "editorCursor.foreground": "#F2D5CF",
    "editorWhitespace.foreground": "#51576D",
    "editorLineNumber.foreground": "#737994",
    "editorLineNumber.activeForeground": "#C6D0F5",
  },
};

// Solarized Light Theme
const solarizedLightTheme: MonacoThemeData = {
  base: "vs",
  inherit: true,
  rules: [
    { background: "FDF6E3", token: "" },
    { foreground: "93A1A1", token: "comment" },
    { foreground: "2AA198", token: "string" },
    { foreground: "D33682", token: "constant.numeric" },
    { foreground: "859900", token: "keyword" },
    { foreground: "859900", token: "storage" },
    { foreground: "268BD2", token: "storage.type" },
    { foreground: "B58900", token: "entity.name.class" },
    { foreground: "268BD2", token: "entity.name.function" },
    { foreground: "268BD2", token: "entity.name.tag" },
    { foreground: "B58900", token: "entity.other.attribute-name" },
    { foreground: "268BD2", token: "support.function" },
    { foreground: "6C71C4", token: "predefined" },
    { foreground: "CB4B16", token: "constant.character.escape" },
  ],
  colors: {
    "editor.foreground": "#657B83",
    "editor.background": "#FDF6E3",
    "editor.selectionBackground": "#EEE8D5",
    "editor.lineHighlightBackground": "#EEE8D5",
    "editorCursor.foreground": "#657B83",
    "editorWhitespace.foreground": "#EEE8D5",
    "editorLineNumber.foreground": "#93A1A1",
    "editorLineNumber.activeForeground": "#657B83",
  },
};

// Ayu Light Theme
const ayuLightTheme: MonacoThemeData = {
  base: "vs",
  inherit: true,
  rules: [
    { background: "FAFAFA", token: "" },
    { foreground: "ABB0B6", token: "comment" },
    { foreground: "86B300", token: "string" },
    { foreground: "A37ACC", token: "constant.numeric" },
    { foreground: "FA8D3E", token: "keyword" },
    { foreground: "FA8D3E", token: "storage" },
    { foreground: "399EE6", token: "storage.type" },
    { foreground: "F2AE49", token: "entity.name.class" },
    { foreground: "F2AE49", token: "entity.name.function" },
    { foreground: "55B4D4", token: "entity.name.tag" },
    { foreground: "399EE6", token: "entity.other.attribute-name" },
    { foreground: "F2AE49", token: "support.function" },
    { foreground: "399EE6", token: "predefined" },
    { foreground: "E6B673", token: "constant.character.escape" },
  ],
  colors: {
    "editor.foreground": "#575F66",
    "editor.background": "#FAFAFA",
    "editor.selectionBackground": "#D1E4F4",
    "editor.lineHighlightBackground": "#F0F0F0",
    "editorCursor.foreground": "#FF9940",
    "editorWhitespace.foreground": "#D9D8D7",
    "editorLineNumber.foreground": "#ABB0B6",
    "editorLineNumber.activeForeground": "#575F66",
  },
};

// Rosé Pine Dawn Theme
const rosePineDawnTheme: MonacoThemeData = {
  base: "vs",
  inherit: true,
  rules: [
    { background: "FAF4ED", token: "" },
    { foreground: "9893A5", token: "comment" },
    { foreground: "EA9D34", token: "string" },
    { foreground: "907AA9", token: "constant.numeric" },
    { foreground: "286983", token: "keyword" },
    { foreground: "286983", token: "storage" },
    { foreground: "56949F", token: "storage.type" },
    { foreground: "D7827E", token: "entity.name.class" },
    { foreground: "286983", token: "entity.name.function" },
    { foreground: "56949F", token: "entity.name.tag" },
    { foreground: "907AA9", token: "entity.other.attribute-name" },
    { foreground: "56949F", token: "support.function" },
    { foreground: "907AA9", token: "predefined" },
    { foreground: "B4637A", token: "constant.character.escape" },
  ],
  colors: {
    "editor.foreground": "#575279",
    "editor.background": "#FAF4ED",
    "editor.selectionBackground": "#DFDAD9",
    "editor.lineHighlightBackground": "#F4EDE8",
    "editorCursor.foreground": "#575279",
    "editorWhitespace.foreground": "#DFDAD9",
    "editorLineNumber.foreground": "#9893A5",
    "editorLineNumber.activeForeground": "#575279",
  },
};

// All theme definitions for registration
export const MONACO_THEMES: Record<string, MonacoThemeData> = {
  dracula: draculaTheme,
  nord: nordTheme,
  "gruvbox-dark": gruvboxDarkTheme,
  "tokyo-night": tokyoNightTheme,
  "monokai-pro": monokaiProTheme,
  "solarized-dark": solarizedDarkTheme,
  "catppuccin-mocha": catppuccinMochaTheme,
  "ayu-dark": ayuDarkTheme,
  kanso: kansoTheme,
  "catppuccin-frappe": catppuccinFrappeTheme,
  "github-light": githubLightTheme,
  "gruvbox-light": gruvboxLightTheme,
  "catppuccin-latte": catppuccinLatteTheme,
  "one-light": oneLightTheme,
  "solarized-light": solarizedLightTheme,
  "ayu-light": ayuLightTheme,
  "rose-pine-dawn": rosePineDawnTheme,
};

// Light themes list for reference
export const LIGHT_THEMES = [
  "github-light",
  "gruvbox-light",
  "catppuccin-latte",
  "one-light",
  "solarized-light",
  "ayu-light",
  "rose-pine-dawn",
];

// Track registered themes
let themesRegistered = false;

/**
 * Register all custom Monaco themes
 * Should be called once during Monaco initialization
 */
export function registerMonacoThemes(): void {
  if (themesRegistered) return;

  Object.entries(MONACO_THEMES).forEach(([name, themeData]) => {
    monaco.editor.defineTheme(name, themeData);
  });

  themesRegistered = true;
}

/**
 * Get the Monaco theme name for a given app theme
 * Returns the matching custom theme, or falls back to vs-dark/vs-light
 */
export function getMonacoTheme(appTheme: string, systemIsDark = true): string {
  if (appTheme === "system") {
    return systemIsDark ? "dracula" : "github-light";
  }
  
  // If we have a custom theme registered for this app theme, use it
  if (appTheme in MONACO_THEMES) {
    return appTheme;
  }
  
  // Fallback to built-in themes
  return LIGHT_THEMES.includes(appTheme) ? "vs" : "vs-dark";
}

/**
 * Check if a theme is a light theme
 */
export function isLightTheme(theme: string): boolean {
  if (theme === "system") {
    return !window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return LIGHT_THEMES.includes(theme);
}
