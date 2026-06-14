// src/components/common/SqlCodeMirror.tsx
// Minimal CodeMirror SQL editor with ClickHouse syntax highlighting.
// Reusable in dialogs, forms, and other contexts where the full SqlEditor
// (with tabs, run buttons, vim mode) is overkill.

import { useMemo, useRef } from "react";
import CodeMirror, {
  EditorView,
  type ReactCodeMirrorRef,
} from "@uiw/react-codemirror";

import { useTheme } from "@/components/common/theme-provider";
import {
  useEditorFontSize,
  useEditorFontFamily,
} from "@/stores/editorStore";
import { createSqlExtensions } from "@/features/workspace/editor/codeMirrorConfig";
import { getCodeMirrorTheme, isLightTheme } from "@/features/workspace/editor/codeMirrorThemes";

const FONT_FAMILY_MAP: Record<string, string> = {
  system: "ui-monospace, SFMono-Regular, Menlo, monospace",
  "jetbrains-mono": "'JetBrains Mono', monospace",
  "fira-code": "'Fira Code', monospace",
  "cascadia-code": "'Cascadia Code', monospace",
  "source-code-pro": "'Source Code Pro', monospace",
  monaco: "'Monaco', monospace",
  consolas: "'Consolas', monospace",
  "ibm-plex-mono": "'IBM Plex Mono', monospace",
};

interface SqlCodeMirrorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  height?: string;
  className?: string;
}

export function SqlCodeMirror({
  value,
  onChange,
  placeholder,
  height = "160px",
  className,
}: SqlCodeMirrorProps) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const { theme } = useTheme();
  const fontSize = useEditorFontSize();
  const fontFamily = useEditorFontFamily();

  const themeExtensions = useMemo(() => getCodeMirrorTheme(theme), [theme]);

  const fontFamilyValue = FONT_FAMILY_MAP[fontFamily] ?? FONT_FAMILY_MAP.system;

  const dark = !isLightTheme(theme);

  const fontExtension = useMemo(
    () =>
      EditorView.theme(
        {
          "&": {
            fontSize: `${fontSize}px`,
          },
          ".cm-content, .cm-gutters": {
            fontFamily: fontFamilyValue,
          },
        },
        { dark },
      ),
    [fontSize, fontFamilyValue, dark],
  );

  const extensions = useMemo(
    () => [
      ...createSqlExtensions({
        vimMode: false,
        onRun: () => {},
        onRunAll: () => {},
        onSave: () => {},
      }),
      ...themeExtensions,
      fontExtension,
      EditorView.lineWrapping,
    ],
    [themeExtensions, fontExtension],
  );

  return (
    <CodeMirror
      ref={cmRef}
      value={value}
      onChange={onChange}
      height={height}
      placeholder={placeholder}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: true,
        foldGutter: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: false, // our autocomplete is in extensions
        indentOnInput: true,
      }}
      theme="none"
      extensions={extensions}
      className={className}
    />
  );
}

export default SqlCodeMirror;
