import { type ReactNode, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTheme } from "@/components/common/theme-provider";
import { getCodeMirrorTheme } from "@/features/workspace/editor/codeMirrorThemes";
import { type ColumnTypeAst, unwrapNullable } from "./clickhouseTypes";

interface CellDetailViewerProps {
  value: unknown;
  typeAst: ColumnTypeAst;
  mode: "hover" | "sheet";
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function TableView({ rows }: { rows: Array<{ label: string; value: unknown }> }) {
  return (
    <table className="w-full text-xs border-collapse">
      <tbody>
        {rows.map(({ label, value }, i) => (
          <tr key={i} className="border-b border-border/40 last:border-0">
            <td className="py-1 pr-3 font-mono text-muted-foreground align-top whitespace-nowrap">
              {label}
            </td>
            <td className="py-1 font-mono break-all">
              {value === null || value === undefined ? (
                <span className="italic text-muted-foreground">null</span>
              ) : typeof value === "object" ? (
                <pre className="whitespace-pre-wrap">{formatJson(value)}</pre>
              ) : (
                String(value)
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderStructured(value: unknown, ast: ColumnTypeAst): ReactNode {
  const core = unwrapNullable(ast);

  if (core.kind === "Map" && typeof value === "object" && value !== null && !Array.isArray(value)) {
    const rows = Object.entries(value as Record<string, unknown>).map(([k, v]) => ({
      label: k,
      value: v,
    }));
    return <TableView rows={rows} />;
  }

  if (core.kind === "Tuple") {
    if (Array.isArray(value)) {
      const rows = value.map((v, i) => ({
        label: core.fields[i]?.name ?? String(i),
        value: v,
      }));
      return <TableView rows={rows} />;
    }
    if (typeof value === "object" && value !== null) {
      const rows = Object.entries(value as Record<string, unknown>).map(([k, v]) => ({
        label: k,
        value: v,
      }));
      return <TableView rows={rows} />;
    }
  }

  if (core.kind === "Nested" && typeof value === "object" && value !== null) {
    // Nested arrives as { colName: [...] } — transpose to rows
    const entries = Object.entries(value as Record<string, unknown[]>);
    if (entries.length > 0) {
      const len = (entries[0][1] as unknown[]).length ?? 0;
      const rows = Array.from({ length: len }, (_, i) =>
        Object.fromEntries(entries.map(([k, arr]) => [k, (arr as unknown[])[i]]))
      );
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {entries.map(([k]) => (
                  <th
                    key={k}
                    className="border-b border-border px-2 py-1 text-left font-medium text-muted-foreground"
                  >
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-border/40 last:border-0">
                  {entries.map(([k]) => (
                    <td key={k} className="px-2 py-1 font-mono break-all">
                      {String(row[k])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }

  if (core.kind === "Array" && Array.isArray(value)) {
    // Array of primitives → vertical list
    if (value.every((v) => typeof v !== "object" || v === null)) {
      return (
        <div className="flex flex-col gap-0.5 font-mono text-xs">
          {value.map((v, i) => (
            <span key={i} className="border-b border-border/30 last:border-0 py-0.5">
              {v === null ? <span className="italic text-muted-foreground">null</span> : String(v)}
            </span>
          ))}
        </div>
      );
    }
  }

  return null;
}

export function CellDetailViewer({ value, typeAst, mode }: CellDetailViewerProps) {
  const { theme } = useTheme();

  const structured = renderStructured(value, typeAst);

  const jsonString = useMemo(() => formatJson(value), [value]);
  const extensions = useMemo(
    () => [json(), EditorView.lineWrapping, ...getCodeMirrorTheme(theme)],
    [theme]
  );

  if (mode === "hover") {
    if (structured) {
      return (
        <div className="max-h-64 overflow-auto text-xs">
          {structured}
        </div>
      );
    }
    return (
      <div className="max-h-64 overflow-auto text-xs prose prose-sm dark:prose-invert max-w-none prose-pre:m-0 prose-pre:p-0 prose-code:text-xs">
        <Markdown remarkPlugins={[remarkGfm]}>
          {`\`\`\`json\n${jsonString}\n\`\`\``}
        </Markdown>
      </div>
    );
  }

  // Sheet mode: structured table if available, else CodeMirror JSON
  if (structured) {
    return (
      <div className="flex flex-col gap-4">
        <div className="overflow-auto">{structured}</div>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none py-1">Raw JSON</summary>
          <div className="mt-2 max-h-64 overflow-auto rounded border border-border">
            <CodeMirror
              value={jsonString}
              extensions={extensions}
              editable={false}
              basicSetup={{
                lineNumbers: false,
                foldGutter: true,
                highlightActiveLine: false,
                highlightActiveLineGutter: false,
              }}
              height="auto"
            />
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="h-full min-h-48 overflow-auto rounded border border-border">
      <CodeMirror
        value={jsonString}
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
}
