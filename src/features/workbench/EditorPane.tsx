import {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  type MutableRefObject,
} from "react";
import CodeMirror, {
  EditorView,
  Decoration,
  type DecorationSet,
  type ReactCodeMirrorRef,
  type ViewUpdate,
} from "@uiw/react-codemirror";
import { keymap } from "@codemirror/view";
import { StateField, type EditorState } from "@codemirror/state";
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
import { Check, ChevronDown, Play, Save, X, Plus, Power, Circle, Square } from "lucide-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import DataTable from "@/components/common/DataTable";
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
  getWorkbenchState,
  useDialectForTab,
  openTab,
  closeTab,
  setActiveTab,
  setTabConnection,
  connectConnection,
  updateTabSql,
  runQuery,
  runAllQueries,
  cancelQuery,
  setActiveResultIndex,
  type WorkbenchResultItem,
} from "@/stores/workbenchStore";
import type { AdapterQueryResult } from "@/lib/db-adapter/types";
import {
  parseQueries,
  findQueryAtCursor,
} from "@/helpers/queryParser";

// ─── Current-statement highlight (StateField + decorations) ────────────────
// Shades the statement the caret sits in so it's obvious which statement
// Ctrl+Enter will run. Self-contained: the field recomputes from each
// transaction's own state, so nothing dispatches into the editor from an
// update listener (which CodeMirror forbids). Only applied when the buffer
// holds 2+ statements.

function computeHighlight(state: EditorState): DecorationSet {
  const doc = state.doc.toString();
  const queries = parseQueries(doc);
  if (queries.length <= 1) return Decoration.none;

  const { line, column } = offsetToLineCol(doc, state.selection.main.head);
  const idx = findQueryAtCursor(queries, line, column);
  const q = idx >= 0 ? queries[idx] : undefined;
  if (!q) return Decoration.none;

  const docLen = state.doc.length;
  const from = Math.min(
    lineColToOffset(doc, q.startLine, q.startColumn),
    docLen,
  );
  // endColumn for the last (semicolon-free) statement can sit past the final
  // character, so +1 may exceed doc length — clamp.
  const to = Math.min(lineColToOffset(doc, q.endLine, q.endColumn + 1), docLen);
  if (from >= to) return Decoration.none;

  return Decoration.set([
    Decoration.mark({ class: "cm-current-query-highlight" }).range(from, to),
  ]);
}

const highlightField = StateField.define<DecorationSet>({
  create: (state) => computeHighlight(state),
  update(deco, tr) {
    if (tr.docChanged || tr.selection) return computeHighlight(tr.state);
    // Neither doc nor selection changed: keep decorations, mapping positions
    // through any other changes. Clearing on a thrown map is safe.
    try {
      return deco.map(tr.changes);
    } catch {
      return Decoration.none;
    }
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ParsedQuery positions are 1-based (line, column); the editor works in 0-based
// character offsets. These convert between the two.
function lineColToOffset(doc: string, line: number, column: number): number {
  const lines = doc.split("\n");
  let offset = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    offset += lines[i].length + 1; // +1 for the newline
  }
  return offset + Math.max(0, column - 1);
}

function offsetToLineCol(
  doc: string,
  offset: number,
): { line: number; column: number } {
  let line = 1;
  let column = 1;
  const limit = Math.min(offset, doc.length);
  for (let i = 0; i < limit; i++) {
    if (doc.charCodeAt(i) === 10) {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

// Stable empty reference so the store selector doesn't churn on every render.
const EMPTY_RESULTS: WorkbenchResultItem[] = [];

/** Short label for a result tab: the statement's first line, else "Result N". */
function resultLabel(queryText: string, index: number): string {
  const firstLine = queryText.split("\n")[0].trim();
  if (firstLine.length > 0 && firstLine.length <= 28) return firstLine;
  if (firstLine.length > 28) return `${firstLine.slice(0, 27)}…`;
  return `Result ${index + 1}`;
}

// ─── Result rendering ──────────────────────────────────────────────────────

/** Render one statement's result: error, empty, or the data grid. */
function ResultBody({ result }: { result: AdapterQueryResult }) {
  if (result.error) {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="border-b border-border px-3 py-1.5 text-xs text-destructive">
          Error
        </div>
        <div className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-sm text-destructive">
          {result.error}
        </div>
      </div>
    );
  }

  if (!result.data.length) {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">0 rows</span>
          <span>· {(result.statistics.elapsed / 1000).toFixed(2)}s</span>
        </div>
        <div className="flex-1 overflow-auto p-4 text-sm text-muted-foreground">
          Query returned no rows.
        </div>
      </div>
    );
  }

  // The shared DataTable renders a stacked column-name / data-type header,
  // virtualized rows, pagination, and a query-stats footer (elapsed, rows
  // read, bytes read). AdapterQueryResult is structurally a QueryResult.
  return (
    <div className="h-full overflow-hidden bg-background p-2">
      <DataTable
        data={result}
        height="100%"
        enablePagination
        pageSize={100}
        enableTranspose
      />
    </div>
  );
}

/** One selectable tab per statement (run-all). Hidden for single results. */
function ResultTabBar({
  items,
  activeIndex,
  tabId,
}: {
  items: WorkbenchResultItem[];
  activeIndex: number;
  tabId: string;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-muted/30 px-2 py-1.5">
      {items.map((it, i) => {
        const isError = !!it.result.error;
        const selected = i === activeIndex;
        return (
          <button
            key={i}
            title={it.queryText}
            onClick={() => setActiveResultIndex(tabId, i)}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-xs transition-colors",
              selected
                ? "border border-border bg-background shadow-sm"
                : "border border-transparent hover:bg-muted",
              isError && "text-destructive",
            )}
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                isError ? "bg-destructive" : "bg-emerald-500",
              )}
            />
            <span className="max-w-32 truncate">
              {resultLabel(it.queryText, i)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ResultsGrid({ tabId }: { tabId: string }) {
  const items = useWorkbenchStore((s) => s.results[tabId] ?? EMPTY_RESULTS);
  const executing = useWorkbenchStore((s) => s.executing[tabId] ?? false);
  const activeIndex = useWorkbenchStore((s) => s.activeResultIndex[tabId] ?? 0);

  if (executing) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Running…
      </div>
    );
  }

  if (!items.length) {
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

  const safeIndex = Math.min(Math.max(activeIndex, 0), items.length - 1);
  const active = items[safeIndex];

  return (
    <div className="flex h-full flex-col bg-background">
      {items.length > 1 && (
        <ResultTabBar items={items} activeIndex={safeIndex} tabId={tabId} />
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        <ResultBody result={active.result} />
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

// Connection-status dot colours for the editor toolbar (mirrors the sidebar's
// ConnectionsSection so the two read the same at a glance).
const STATUS_DOT: Record<string, string> = {
  connected: "text-emerald-500 fill-emerald-500",
  idle: "text-amber-500 fill-amber-500",
  disconnected: "text-zinc-400 fill-zinc-400",
};

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

interface WorkbenchEditorApi {
  runCurrent: () => void;
  runAll: () => void;
}

interface StatementInfo {
  count: number;
  index: number;
}

function WorkbenchEditor({
  tabId,
  dialect,
  onSave,
  apiRef,
  onStatementInfo,
}: {
  tabId: string;
  dialect: ReturnType<typeof useDialectForTab>;
  onSave: () => void;
  apiRef: MutableRefObject<WorkbenchEditorApi | null>;
  onStatementInfo: (info: StatementInfo) => void;
}) {
  const { theme } = useTheme();
  const fontSize = useEditorFontSize();
  const fontFamily = useEditorFontFamily();
  const vimMode = useEditorVimMode();
  const cmRef = useRef<ReactCodeMirrorRef>(null);

  const isDark = !isLightTheme(theme);

  const saveRef = useRef<() => void>(() => {});
  const runRef = useRef<() => void>(() => {});
  const runAllRef = useRef<() => void>(() => {});

  // A single WorkbenchEditor instance is reused across tabs (no key on the
  // mount), so tabId changes on this instance when the active tab switches.
  // The memoized completion-context closure reads tabId via this ref so it
  // always sees the current tab without rebuilding the extension array.
  const tabIdRef = useRef(tabId);
  tabIdRef.current = tabId;

  const tab = useWorkbenchStore((s) => s.tabs.find((t) => t.id === tabId));

  // The statement under the caret (or the active selection). Falls back to the
  // whole buffer when nothing can be resolved.
  const getCurrentStatement = useCallback((): string => {
    const view = cmRef.current?.view;
    const fallback = tab?.sql ?? "";
    if (!view) return fallback;
    const sel = view.state.selection.main;
    if (!sel.empty) return view.state.sliceDoc(sel.from, sel.to);
    const doc = view.state.doc.toString();
    const queries = parseQueries(doc);
    const { line, column } = offsetToLineCol(doc, sel.head);
    const idx = findQueryAtCursor(queries, line, column);
    return idx >= 0 && queries[idx] ? queries[idx].text : doc;
  }, [tab?.sql]);

  // Every non-empty statement in the buffer, in document order.
  const getAllStatements = useCallback((): string[] => {
    const view = cmRef.current?.view;
    const doc = view ? view.state.doc.toString() : tab?.sql ?? "";
    return parseQueries(doc)
      .map((q) => q.text)
      .filter((t) => t.trim().length > 0);
  }, [tab?.sql]);

  useEffect(() => {
    saveRef.current = onSave;
    runRef.current = () => {
      void runQuery(tabId, getCurrentStatement());
    };
    runAllRef.current = () => {
      const queries = getAllStatements();
      if (queries.length <= 1) {
        void runQuery(tabId, queries[0] ?? getCurrentStatement());
      } else {
        void runAllQueries(tabId, queries);
      }
    };
  }, [tabId, onSave, getCurrentStatement, getAllStatements]);

  // Expose the run handlers to the toolbar, which lives in the parent
  // EditorPane (only the editor knows the live cursor position).
  useEffect(() => {
    apiRef.current = {
      runCurrent: () => runRef.current?.(),
      runAll: () => runAllRef.current?.(),
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef]);

  useEffect(() => {
    if (!vimMode) return;
    // Drive gt/gT/:q/:qa against the workbench store (not the legacy
    // workspaceStore the vim module defaults to), so tab navigation works here.
    registerVimExCommands({
      onSave: () => saveRef.current?.(),
      onRun: () => runRef.current?.(),
      onRunAll: () => runAllRef.current?.(),
      onNextTab: () => {
        const { tabs, activeTabId } = getWorkbenchState();
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        if (idx >= 0) setActiveTab(tabs[(idx + 1) % tabs.length].id);
      },
      onPrevTab: () => {
        const { tabs, activeTabId } = getWorkbenchState();
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        if (idx >= 0)
          setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length].id);
      },
      onCloseTab: () => {
        const { activeTabId } = getWorkbenchState();
        if (activeTabId) closeTab(activeTabId);
      },
      onCloseAllTabs: () => {
        getWorkbenchState()
          .tabs.map((t) => t.id)
          .forEach((id) => closeTab(id));
      },
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

  const highlightTheme = useMemo(
    () =>
      EditorView.theme(
        {
          ".cm-current-query-highlight": {
            backgroundColor: isDark
              ? "rgba(99, 179, 237, 0.12)"
              : "rgba(66, 153, 225, 0.08)",
          },
        },
        { dark: isDark },
      ),
    [isDark],
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
        onRunAll: () => runAllRef.current?.(),
        onSave: () => saveRef.current?.(),
        languageSupport: dialect.languageSupport(),
        // Resolve this tab's connection live at completion time (closure over
        // the stable tabId), so suggestions follow the active connection — even
        // after a connection switch — without rebuilding the extension array.
        getCompletionContext: () => {
          const s = getWorkbenchState();
          const t = s.tabs.find((x) => x.id === tabIdRef.current);
          if (!t) return undefined;
          const c = s.connections.find((x) => x.id === t.connectionId);
          return {
            connectionId: t.connectionId,
            engine: c?.engine,
            selectedDatabase: c?.database,
          };
        },
      }),
      highlightField,
      highlightTheme,
      ...vimBasicSetup,
      ...themeExtensions,
      fontExtension,
      vimCursorFix,
      EditorView.lineWrapping,
    ],
    [
      themeExtensions,
      fontExtension,
      vimCursorFix,
      vimBasicSetup,
      vimMode,
      dialect,
      highlightTheme,
    ],
  );

  const handleChange = useCallback(
    (val: string) => updateTabSql(tabId, val),
    [tabId],
  );

  // Report the statement count + the index under the caret to the toolbar's
  // 1/N indicator. Safe inside onUpdate: it only calls setState, never
  // view.dispatch (the highlight is a self-contained StateField instead).
  const handleUpdate = useCallback(
    (update: ViewUpdate) => {
      if (!update.selectionSet && !update.docChanged) return;
      const doc = update.state.doc.toString();
      const queries = parseQueries(doc);
      const { line, column } = offsetToLineCol(
        doc,
        update.state.selection.main.head,
      );
      const index = queries.length
        ? findQueryAtCursor(queries, line, column)
        : -1;
      onStatementInfo({ count: queries.length, index });
    },
    [onStatementInfo],
  );

  return (
    <CodeMirror
      ref={cmRef}
      value={tab?.sql ?? ""}
      onUpdate={handleUpdate}
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
  const statuses = useWorkbenchStore((s) => s.statuses);
  const executing = useWorkbenchStore((s) =>
    activeTabId ? (s.executing[activeTabId] ?? false) : false,
  );
  const [saving, setSaving] = useState(false);

  // The toolbar (Run / Run all / 1-of-N) lives here, but only the editor knows
  // the live caret. WorkbenchEditor publishes its run handlers via this ref and
  // reports the current statement count/index through onStatementInfo.
  const editorApiRef = useRef<WorkbenchEditorApi | null>(null);
  const [stmtInfo, setStmtInfo] = useState<StatementInfo>({
    count: 0,
    index: -1,
  });
  const handleStatementInfo = useCallback((info: StatementInfo) => {
    // Dedupe so caret moves within a single statement don't re-render.
    setStmtInfo((prev) =>
      prev.count === info.count && prev.index === info.index ? prev : info,
    );
  }, []);

  const tab = tabs.find((t) => t.id === activeTabId);
  const dialect = useDialectForTab(activeTabId);
  // Statement count derives from the buffer so the 1/N indicator and Run-all
  // button are correct on load, before the editor reports a cursor position.
  const statementCount = useMemo(
    () => parseQueries(tab?.sql ?? "").length,
    [tab?.sql],
  );

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
  const connStatus = statuses[tab.connectionId] ?? "disconnected";
  const connConnected = connStatus === "connected";

  // Connections this tab may switch to: same engine only, so the editor's SQL
  // dialect never changes underneath the user.
  const sameEngineConns = conn
    ? connections.filter((c) => c.engine === conn.engine)
    : [];

  function switchConnection(connectionId: string) {
    if (connectionId === tab!.connectionId) return;
    setTabConnection(tab!.id, connectionId);
    if ((statuses[connectionId] ?? "disconnected") !== "connected") {
      void connectConnection(connectionId);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <TabBar />
      {conn && meta && (
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent/50"
                title="Switch this tab's connection (same engine only)"
              >
                <span className={cn("size-2 rounded-full", meta.dot)} />
                <span className="font-medium">{conn.name}</span>
                <span className="text-muted-foreground">· {meta.label}</span>
                <Circle
                  className={cn("size-2 shrink-0", STATUS_DOT[connStatus])}
                  aria-label={`Connection ${connStatus}`}
                />
                <ChevronDown className="size-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Switch to a {meta.label} connection
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {sameEngineConns.map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  className="gap-2"
                  onClick={() => switchConnection(c.id)}
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      ENGINES[c.engine].dot,
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {c.id === conn.id && <Check className="size-3.5 shrink-0" />}
                </DropdownMenuItem>
              ))}
              {sameEngineConns.length <= 1 && (
                <DropdownMenuItem disabled className="text-xs">
                  No other {meta.label} connections
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {!connConnected && (
            <button
              type="button"
              onClick={() => void connectConnection(tab.connectionId)}
              className="flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-600 hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-400"
              title="This tab's connection is not connected — click to connect"
            >
              <Power className="size-3" />
              {connStatus === "idle" ? "Idle — Connect" : "Disconnected — Connect"}
            </button>
          )}
          <div className="ml-auto flex items-center gap-1">
            {statementCount > 1 && (
              <span
                className="mr-1 rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground"
                title="Statement under the cursor / total statements"
              >
                {(stmtInfo.index >= 0 ? stmtInfo.index : 0) + 1}/{statementCount}
              </span>
            )}
            {executing ? (
              <Button
                size="sm"
                variant="destructive"
                className="h-7 gap-1.5"
                title="Cancel the running query"
                onClick={() => activeTabId && void cancelQuery(activeTabId)}
              >
                <Square className="size-3.5" /> Cancel
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-7 gap-1.5"
                title="Run the statement under the cursor (Ctrl+Enter)"
                onClick={() => editorApiRef.current?.runCurrent()}
              >
                <Play className="size-3.5" /> Run
              </Button>
            )}
            {statementCount > 1 && (
              <Button
                size="sm"
                variant="secondary"
                className="h-7 gap-1.5"
                disabled={executing}
                title="Run all statements; one result tab each (Ctrl+Shift+Enter)"
                onClick={() => editorApiRef.current?.runAll()}
              >
                <Play className="size-3.5" /> Run all
              </Button>
            )}
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
        <ResizablePanel defaultSize="20%">
          <div
            data-vim-pane="editor"
            tabIndex={-1}
            className="h-full overflow-hidden outline-none"
          >
            <WorkbenchEditor
              tabId={tab.id}
              dialect={dialect}
              onSave={() => setSaving(true)}
              apiRef={editorApiRef}
              onStatementInfo={handleStatementInfo}
            />
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="80%">
          <div
            data-vim-pane="results"
            tabIndex={-1}
            className="h-full outline-none focus:ring-2 focus:ring-inset focus:ring-ring/40"
          >
            <ResultsGrid tabId={tab.id} />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      <SaveQueryDialog open={saving} onOpenChange={setSaving} />
    </div>
  );
}
