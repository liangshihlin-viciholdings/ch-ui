import React, { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import { useTheme } from "@/components/common/theme-provider";
import { getCodeMirrorTheme } from "../../editor/codeMirrorThemes";
import { ExplainResult } from "@/types/common";

interface JsonViewProps {
  explainResult: ExplainResult;
}

export const JsonView: React.FC<JsonViewProps> = ({ explainResult }) => {
  const { theme } = useTheme();

  const value = useMemo(
    () =>
      JSON.stringify(explainResult.rawJson || explainResult.tree, null, 2),
    [explainResult],
  );

  const extensions = useMemo(
    () => [json(), EditorView.lineWrapping, ...getCodeMirrorTheme(theme)],
    [theme],
  );

  return (
    <div className="w-full h-full overflow-auto">
      <CodeMirror
        value={value}
        extensions={extensions}
        editable={false}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
        }}
        height="100%"
      />
    </div>
  );
};
