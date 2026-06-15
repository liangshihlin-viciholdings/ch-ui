import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { keymap } from "@codemirror/view";
import {
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
} from "@codemirror/view";
import { history } from "@codemirror/commands";
import { foldGutter, indentOnInput, bracketMatching } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, historyKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { ChevronDown, Play, Save, X, Plus } from "lucide-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/common/theme-provider";
import {
  useEditorFontSize,
  useEditorFontFamily,
  useEditorVimMode,
} from "@/stores/editorStore";
import { getCodeMirrorTheme, isLightTheme } from "@/features/workspace/editor/codeMirrorThemes";
import { createSqlExtensions } from "@/features/workspace/editor/codeMirrorConfig";
import { registerVimExCommands } from "@/features/workspace/editor/vimMode";
import { vimSurroundExtension } from "@/features/workspace/editor/vimSurround";
import { ENGINES } from "./engineMeta";
import SaveQueryDialog from "./SaveQueryDialog";
import {
  useWorkbenchStore,
  useDialectForTab,
  openTab,
  closeTab,
  setActiveTab,
  updateTabSql,
  runQuery,
} from "@/stores/workbenchStore";

function ResultsGrid({ tabId }: { tabId: string }) {
  const result = useWorkbenchStore((s) => s.results[tabId] ?? null);
  const executing = useWorkbenchStore((s) => s.executing[tabId] ?? false);

  if (executing) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Running…
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">0 rows</span>
        </div>
        <div className="flex-1 overflow-auto p-4 text-sm text-muted-foreground">
          Run a query to see results
        </div>
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="border-b border-border px-3 py-1.5 text-xs text-destructive">
          Error
        </div>
        <div className="flex-1 overflow-auto p-4 text-sm text-destructive">
          {result.error}
        </div>
      </div>
    );
  }

  const columns = result.meta;
  const rows = result.data;

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{result.rows} rows</span>
        <span>· {(result.statistics.elapsed / 1000).toFixed(2)}s</span>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.name}
                  className="border-b border-border px-3 py-1.5 text-left font-medium"
                >
                  {col.name}
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                    {col.type}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-accent/30">
                {columns.map((col) => (
                  <td
                    key={col.name}
                    className="border-b border-border/50 px-3 py-1 font-mono text-xs"
                  >
                    {String(row[col.name] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabBar() {
  const tabs = useWorkbenchStore((s) => s.tabs);
  const activeTabId = useWorkbenchStore((s) => s.activeTabId);
  const connections = useWorkbenchStore((s) => s.connections);
  const activeConnectionId = useWorkbenchStore((s) => s.activeConnectionId);

  if (!tabs.length) {
    return (
      <div className="flex items-center gap-1 border-b border-border bg-muted/30 px-2 py-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1"
          disabled={!activeConnectionId}
          onClick={() => activeConnectionId && openTab(activeConnectionId)}
        >
          <Plus className="size-3.5" /> New Query
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 border-b border-border bg-muted/30 px-2">
      {tabs.map((t) => {
        const conn = connections.find((c) => c.id === t.connectionId);
        const tm = ENGINES[conn?.engine ?? "clickhouse"];
        return (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
              t.id === activeTabId
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <span className={cn("size-2 rounded-full", tm.dot)} />
            {t.title}
            {t.dirty && <span className="text-primary">•</span>}
            <X
              className="size-3 opacity-50 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.id);
              }}
            />
          </button>
        );
      })}
      <Button
        size="icon"
        variant="ghost"
        className="ml-1 size-7"
        disabled={!activeConnectionId}
        onClick={() => activeConnectionId && openTab(activeConnectionId)}
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}

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

function WorkbenchEditor({
  tabId,
  dialect,
  onSave,
}: {
  tabId: string;
  dialect: ReturnType<typeof useDialectForTab>;
  onSave: () => void;
}) {
  const { theme } = useTheme();
  const fontSize = useEditorFontSize();
  const fontFamily = useEditorFontFamily();
  const vimMode = useEditorVimMode();
  const cmRef = useRef<ReactCodeMirrorRef>(null);

  const isDark = !isLightTheme(theme);

  const saveRef = useRef<() => void>(() => {});
  const runRef = useRef<() => void>(() => {});

  const tab = useWorkbenchStore((s) => s.tabs.find((t) => t.id === tabId));

  useEffect(() => {
    saveRef.current = onSave;
    runRef.current = () => { void runQuery(tabId); };
  }, [tabId, onSave]);

  useEffect(() => {
    if (!vimMode) return;
    registerVimExCommands({
      onSave: () => saveRef.current?.(),
      onRun: () => runRef.current?.(),
      onRunAll: () => runRef.current?.(),
    });
  }, [vimMode]);

  const themeExtensions = useMemo(() => getCodeMirrorTheme(theme), [theme]);
  const fontFamilyValue = FONT_FAMILY_MAP[fontFamily] ?? FONT_FAMILY_MAP.system;

  const fontExtension = useMemo(
    () =>
      EditorView.theme(
        {
          "&": { fontSize: `${fontSize}px` },
          ".cm-content, .cm-gutters": { fontFamily: fontFamilyValue },
        },
        { dark: isDark },
      ),
    [fontSize, fontFamilyValue, isDark],
  );

  const vimCursorFix = useMemo(
    () =>
      vimMode
        ? EditorView.theme({ ".cm-content": { caretColor: "transparent" } }, { dark: isDark })
        : [],
    [vimMode, isDark],
  );

  const vimBasicSetup = useMemo(
    () =>
      vimMode
        ? [
            lineNumbers(),
            highlightActiveLine(),
            highlightActiveLineGutter(),
            highlightSpecialChars(),
            history(),
            foldGutter(),
            drawSelection(),
            dropCursor(),
            indentOnInput(),
            bracketMatching(),
            closeBrackets(),
            rectangularSelection(),
            crosshairCursor(),
            highlightSelectionMatches(),
            keymap.of([
              ...closeBracketsKeymap,
              ...defaultKeymap.filter(
                (k) => k.key !== "PageUp" && k.key !== "PageDown",
              ),
              ...searchKeymap,
              ...historyKeymap,
              ...completionKeymap,
              indentWithTab,
            ]),
            vimSurroundExtension(),
          ]
        : [],
    [vimMode],
  );

  const extensions = useMemo(
    () => [
      // Identical vim / completion / keymap stack as the pre-A2 SqlEditor.
      // The per-engine dialect is passed as languageSupport so non-ClickHouse
      // tabs keep engine-appropriate highlighting. Run/save route through refs
      // so the extension array does not rebuild (and CodeMirror does not fully
      // reconfigure) on every tab switch.
      ...createSqlExtensions({
        vimMode,
        onRun: () => runRef.current?.(),
        onRunAll: () => runRef.current?.(),
        onSave: () => saveRef.current?.(),
        languageSupport: dialect.languageSupport(),
      }),
      ...vimBasicSetup,
      ...themeExtensions,
      fontExtension,
      vimCursorFix,
      EditorView.lineWrapping,
    ],
    [themeExtensions, fontExtension, vimCursorFix, vimBasicSetup, vimMode, dialect],
  );

  const handleChange = useCallback(
    (val: string) => updateTabSql(tabId, val),
    [tabId],
  );

  return (
    <CodeMirror
      ref={cmRef}
      value={tab?.sql ?? ""}
      height="100%"
      basicSetup={
        vimMode
          ? false
          : {
              lineNumbers: true,
              highlightActiveLine: true,
              highlightActiveLineGutter: true,
              foldGutter: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: false,
              indentOnInput: true,
            }
      }
      theme="none"
      extensions={extensions}
      onChange={handleChange}
      className="h-full"
      style={{ height: "100%" }}
    />
  );
}

export default function EditorPane() {
  const tabs = useWorkbenchStore((s) => s.tabs);
  const activeTabId = useWorkbenchStore((s) => s.activeTabId);
  const connections = useWorkbenchStore((s) => s.connections);
  const [saving, setSaving] = useState(false);

  const tab = tabs.find((t) => t.id === activeTabId);
  const dialect = useDialectForTab(activeTabId);

  if (!tab) {
    return (
      <div className="flex h-full flex-col">
        <TabBar />
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Open a new query to get started
        </div>
      </div>
    );
  }

  const conn = connections.find((c) => c.id === tab.connectionId);
  const meta = conn ? ENGINES[conn.engine] : undefined;

  return (
    <div className="flex h-full flex-col">
      <TabBar />
      {conn && meta && (
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <span className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs">
            <span className={cn("size-2 rounded-full", meta.dot)} />
            <span className="font-medium">{conn.name}</span>
            <span className="text-muted-foreground">· {meta.label}</span>
            <ChevronDown className="size-3 text-muted-foreground" />
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="sm"
              className="h-7 gap-1.5"
              onClick={() => void runQuery(tab.id)}
            >
              <Play className="size-3.5" /> Run
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5"
              onClick={() => setSaving(true)}
            >
              <Save className="size-3.5" /> Save
            </Button>
          </div>
        </div>
      )}
      <ResizablePanelGroup orientation="vertical" className="flex-1">
        <ResizablePanel defaultSize="55%">
          <div className="h-full overflow-hidden">
            <WorkbenchEditor tabId={tab.id} dialect={dialect} onSave={() => setSaving(true)} />
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="45%">
          <ResultsGrid tabId={tab.id} />
        </ResizablePanel>
      </ResizablePanelGroup>
      <SaveQueryDialog open={saving} onOpenChange={setSaving} />
    </div>
  );
}
