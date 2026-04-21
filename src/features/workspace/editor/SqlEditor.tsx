// SqlEditor.tsx
// CodeMirror 6 based SQL editor. Preserves the public Props API of the
// previous Monaco implementation so SqlTab.tsx continues to work unchanged.
// Features:
//   - ClickHouse-aware syntax highlighting + context-aware completion
//   - Per-app-theme CodeMirror theme + font family/size via editorStore
//   - Vim mode (optional) with :w/:run/:runall ex-commands
//   - Ctrl/Cmd+Enter to run current query, Shift+Ctrl/Cmd+Enter to run all,
//     Ctrl/Cmd+S to open save dialog
//   - parseQueries integration to highlight the query under the cursor and
//     show a 1/N indicator in the toolbar
//   - Save/Update dialog with connection + database selection
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import CodeMirror, {
  EditorView,
  Decoration,
  type DecorationSet,
  type ReactCodeMirrorRef,
  type ViewUpdate,
} from "@uiw/react-codemirror";
import { StateEffect, StateField } from "@codemirror/state";
import {
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  lineNumbers,
  rectangularSelection,
  crosshairCursor,
  dropCursor,
  keymap,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  indentOnInput,
} from "@codemirror/language";
import {
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { toast } from "sonner";
import { CirclePlay, Save, PlaySquare } from "lucide-react";

import { useTheme } from "@/components/common/theme-provider";
import useAppStore from "@/stores/workspaceStore";
import { useConnectionStore } from "@/stores/connectionStore";
import {
  useEditorFontSize,
  useEditorFontFamily,
  useEditorVimMode,
} from "@/stores/editorStore";
import { getSavedQueryById } from "@/lib/db";
import {
  parseQueries,
  findQueryAtCursor,
  type ParsedQuery,
} from "@/helpers/queryParser";

import { createSqlExtensions } from "./codeMirrorConfig";
import { getCodeMirrorTheme, isLightTheme } from "./codeMirrorThemes";
import { registerVimExCommands } from "./vimMode";
import { prewarmCompletionCaches } from "./completionSource";
import { vimSurroundExtension } from "./vimSurround";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Public API ────────────────────────────────────────────────────────────

interface SQLEditorProps {
  tabId: string;
  onRunQuery: (query: string) => void;
  onRunAllQueries?: (queries: string[]) => void;
  onFocusChange?: (focused: boolean) => void;
}

// ─── Font-family mapping (same values as the Monaco version) ───────────────

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

// ─── Current-query highlight (StateField + decorations) ────────────────────

interface HighlightRange {
  from: number;
  to: number;
}

const setHighlightRange = StateEffect.define<HighlightRange | null>();

const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    // deco.map can throw if a stored decoration position exceeds the changeset
    // length (e.g. an off-by-one when the query ends at the very last character
    // of the document). Clearing the decoration is safe: the next cursor-move
    // update will recompute it.
    let next: DecorationSet;
    try {
      next = deco.map(tr.changes);
    } catch {
      next = Decoration.none;
    }
    for (const effect of tr.effects) {
      if (effect.is(setHighlightRange)) {
        if (effect.value === null) {
          next = Decoration.none;
        } else {
          const { from, to } = effect.value;
          if (from < to) {
            next = Decoration.set([
              Decoration.mark({
                class: "cm-current-query-highlight",
              }).range(from, to),
            ]);
          } else {
            next = Decoration.none;
          }
        }
      }
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function lineColToOffset(
  doc: string,
  line: number,
  column: number,
): number {
  // ParsedQuery positions are 1-based in both line and column. The doc
  // string uses \n separators. Convert to a 0-based character offset.
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

// ─── Component ─────────────────────────────────────────────────────────────

const SQLEditor: React.FC<SQLEditorProps> = ({
  tabId,
  onRunQuery,
  onRunAllQueries,
  onFocusChange,
}) => {
  const {
    getTabById,
    updateTab,
    saveQuery,
    updateSavedQuery,
    dataBaseExplorer,
    selectedDatabase,
  } = useAppStore();
  const { connections, activeConnectionId, getDatabasesForConnection } =
    useConnectionStore();

  const tab = getTabById(tabId);
  const { theme } = useTheme();
  const fontSize = useEditorFontSize();
  const fontFamily = useEditorFontFamily();
  const vimMode = useEditorVimMode();

  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const value = typeof tab?.content === "string" ? tab.content : "";
  const [parsedQueries, setParsedQueries] = useState<ParsedQuery[]>([]);
  const [currentQueryIndex, setCurrentQueryIndex] = useState<number>(-1);

  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [queryName, setQueryName] = useState<string>(
    tab?.title || "Untitled Query",
  );
  const [selectedConnectionId, setSelectedConnectionId] =
    useState<string>("");
  const [selectedDatabaseName, setSelectedDatabaseName] =
    useState<string>("");

  // Latest callbacks — exposed through refs so the keymap (built once) calls
  // the freshest function.
  const runQueryRef = useRef<() => void>(() => undefined);
  const runAllQueriesRef = useRef<() => void>(() => undefined);
  const saveOpenRef = useRef<() => void>(() => undefined);

  // Pre-warm completion caches on mount so the first keypress has no lag.
  useEffect(() => {
    void prewarmCompletionCaches();
  }, []);

  // ─── Parsing + highlighting ──────────────────────────────────────────────

  const updateHighlightForCursor = useCallback(
    (view: EditorView, doc: string, queries: ParsedQuery[]) => {
      const pos = view.state.selection.main.head;
      const { line, column } = offsetToLineCol(doc, pos);
      const idx = findQueryAtCursor(queries, line, column);
      setCurrentQueryIndex(idx);

      if (idx >= 0 && queries[idx]) {
        const q = queries[idx];
        const docLen = view.state.doc.length;
        const from = Math.min(lineColToOffset(doc, q.startLine, q.startColumn), docLen);
        // parseQueries.endColumn for the last (semicolon-free) query is already
        // past the final character, so +1 can push beyond doc.length.  Clamp.
        const to = Math.min(lineColToOffset(doc, q.endLine, q.endColumn + 1), docLen);
        view.dispatch({ effects: setHighlightRange.of({ from, to }) });
      } else {
        view.dispatch({ effects: setHighlightRange.of(null) });
      }
    },
    [],
  );

  // Re-run parseQueries whenever the document changes.
  useEffect(() => {
    const queries = parseQueries(value);
    setParsedQueries(queries);

    const view = cmRef.current?.view;
    if (view) {
      updateHighlightForCursor(view, value, queries);
    }
  }, [value, updateHighlightForCursor]);

  // ─── Callbacks that operate on the current editor state ─────────────────

  const getDoc = useCallback((): string => {
    const view = cmRef.current?.view;
    return view ? view.state.doc.toString() : value;
  }, [value]);

  const getCurrentQuery = useCallback((): string => {
    const view = cmRef.current?.view;
    if (!view) return value;

    const sel = view.state.selection.main;
    if (!sel.empty) {
      return view.state.sliceDoc(sel.from, sel.to);
    }

    const doc = view.state.doc.toString();
    const queries = parsedQueries.length > 0 ? parsedQueries : parseQueries(doc);
    const { line, column } = offsetToLineCol(doc, sel.head);
    const idx = findQueryAtCursor(queries, line, column);
    if (idx >= 0 && queries[idx]) {
      return queries[idx].text;
    }
    return doc;
  }, [parsedQueries, value]);

  const getAllQueries = useCallback((): string[] => {
    const doc = getDoc();
    const queries =
      parsedQueries.length > 0 ? parsedQueries : parseQueries(doc);
    return queries.map((q) => q.text).filter((t) => t.trim().length > 0);
  }, [getDoc, parsedQueries]);

  const handleRunQuery = useCallback(() => {
    const current = getCurrentQuery();
    if (!current.trim()) {
      toast.error("Please enter a query to run");
      return;
    }

    // Collect SET param_xxx lines from the full document so parameterized
    // queries still work when only the current block is run.
    const full = getDoc();
    const setParamLines = full
      .split("\n")
      .filter((line) => /^\s*SET\s+param_\w+\s*=/i.test(line));

    const toRun =
      setParamLines.length > 0
        ? `${setParamLines.join("\n")}\n${current}`
        : current;

    onRunQuery(toRun);
  }, [getCurrentQuery, getDoc, onRunQuery]);

  const handleRunAllQueries = useCallback(() => {
    const queries = getAllQueries();
    if (queries.length === 0) {
      toast.error("No queries to run");
      return;
    }
    if (queries.length === 1) {
      onRunQuery(queries[0]);
      return;
    }
    if (onRunAllQueries) {
      onRunAllQueries(queries);
    } else {
      onRunQuery(queries.join("; "));
    }
  }, [getAllQueries, onRunAllQueries, onRunQuery]);

  const openSaveDialog = useCallback(async () => {
    if (tab?.title) {
      setQueryName(tab.title);
    }

    if (tab?.isSaved) {
      try {
        const savedQuery = await getSavedQueryById(tabId);
        if (savedQuery) {
          const connectionExists = connections.some(
            (c) => c.id === savedQuery.connectionId,
          );
          if (connectionExists) {
            setSelectedConnectionId(savedQuery.connectionId);
            setSelectedDatabaseName(savedQuery.databaseName);
            setIsSaveDialogOpen(true);
            return;
          }
        }
      } catch (err) {
        console.error("Failed to fetch saved query:", err);
      }
    }

    const currentConnectionId = activeConnectionId || "";
    setSelectedConnectionId(currentConnectionId);

    let databases: string[] = [];
    if (currentConnectionId) {
      databases =
        currentConnectionId === activeConnectionId
          ? dataBaseExplorer.map((db) => db.name)
          : getDatabasesForConnection(currentConnectionId);
    }

    const currentDatabase =
      selectedDatabase &&
      currentConnectionId &&
      databases.includes(selectedDatabase)
        ? selectedDatabase
        : "";
    setSelectedDatabaseName(currentDatabase);
    setIsSaveDialogOpen(true);
  }, [
    activeConnectionId,
    connections,
    dataBaseExplorer,
    getDatabasesForConnection,
    selectedDatabase,
    tab?.isSaved,
    tab?.title,
    tabId,
  ]);

  // Keep refs fresh so the keymap closures see the latest handlers.
  useEffect(() => {
    runQueryRef.current = handleRunQuery;
  }, [handleRunQuery]);
  useEffect(() => {
    runAllQueriesRef.current = handleRunAllQueries;
  }, [handleRunAllQueries]);
  useEffect(() => {
    saveOpenRef.current = () => {
      void openSaveDialog();
    };
  }, [openSaveDialog]);

  // ─── Vim ex-commands (register once when vim mode is active) ────────────

  useEffect(() => {
    if (!vimMode) return;
    registerVimExCommands({
      onSave: () => saveOpenRef.current?.(),
      onRun: () => runQueryRef.current?.(),
      onRunAll: () => runAllQueriesRef.current?.(),
    });
  }, [vimMode]);

  // ─── Extensions ──────────────────────────────────────────────────────────

  const themeExtensions = useMemo(
    () => getCodeMirrorTheme(theme),
    [theme],
  );

  const highlightBackground = useMemo(
    () =>
      isLightTheme(theme)
        ? "rgba(66, 153, 225, 0.08)"
        : "rgba(99, 179, 237, 0.12)",
    [theme],
  );

  const fontFamilyValue =
    FONT_FAMILY_MAP[fontFamily] ?? FONT_FAMILY_MAP.system;

  const fontExtension = useMemo(
    () =>
      EditorView.theme({
        "&": {
          fontSize: `${fontSize}px`,
        },
        ".cm-content, .cm-gutters": {
          fontFamily: fontFamilyValue,
        },
        ".cm-current-query-highlight": {
          backgroundColor: highlightBackground,
        },
      }),
    [fontSize, fontFamilyValue, highlightBackground],
  );

  // When vim is active, override the theme's caretColor so vim can render
  // its own block cursor (vim sets caret-color:transparent on .cm-vimMode
  // but our theme's scoped .cm-content caretColor wins by specificity).
  const vimCursorFix = useMemo(
    () =>
      vimMode
        ? EditorView.theme({
            ".cm-content": {
              caretColor: "transparent",
            },
          })
        : [],
    [vimMode],
  );

  // When vim mode is on we disable react-codemirror's basicSetup (which adds
  // defaultKeymap, closeBracketsKeymap, etc. before our extensions) and
  // instead include the needed parts here in the correct order (vim first).
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
              ...defaultKeymap,
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
      ...createSqlExtensions({
        vimMode,
        onRun: () => runQueryRef.current?.(),
        onRunAll: () => runAllQueriesRef.current?.(),
        onSave: () => saveOpenRef.current?.(),
      }),
      ...vimBasicSetup,
      ...themeExtensions,
      fontExtension,
      vimCursorFix,
      highlightField,
      EditorView.lineWrapping,
    ],
    [themeExtensions, fontExtension, vimCursorFix, vimBasicSetup, vimMode],
  );

  // ─── CodeMirror callbacks ────────────────────────────────────────────────

  const handleChange = useCallback(
    (next: string) => {
      updateTab(tabId, { content: next });
    },
    [tabId, updateTab],
  );

  const handleUpdate = useCallback(
    (update: ViewUpdate) => {
      if (update.focusChanged) {
        onFocusChange?.(update.view.hasFocus);
      }
      if (update.selectionSet || update.docChanged) {
        const doc = update.state.doc.toString();
        const queries = update.docChanged
          ? parseQueries(doc)
          : parsedQueries;
        updateHighlightForCursor(update.view, doc, queries);
      }
    },
    [onFocusChange, parsedQueries, updateHighlightForCursor],
  );

  // ─── Save dialog plumbing ────────────────────────────────────────────────

  const handleConnectionChange = (connectionId: string) => {
    setSelectedConnectionId(connectionId);
    setSelectedDatabaseName("");
  };

  const availableDatabases = useMemo(() => {
    if (!selectedConnectionId) return [];
    if (selectedConnectionId === activeConnectionId) {
      return dataBaseExplorer.map((db) => db.name);
    }
    return getDatabasesForConnection(selectedConnectionId);
  }, [
    selectedConnectionId,
    activeConnectionId,
    dataBaseExplorer,
    getDatabasesForConnection,
  ]);

  const handleSaveQuery = async () => {
    const query = getDoc();

    if (!queryName.trim()) {
      toast.error("Please enter a query name.");
      return;
    }
    if (!query.trim()) {
      toast.error("Please enter a query to save.");
      return;
    }
    if (!selectedConnectionId) {
      toast.error("Please select a connection.");
      return;
    }

    try {
      if (tab?.isSaved) {
        await updateSavedQuery(
          tabId,
          queryName,
          query,
          selectedConnectionId,
          selectedDatabaseName,
        );
        toast.success("Query updated!");
      } else {
        await saveQuery(
          tabId,
          queryName,
          query,
          selectedConnectionId,
          selectedDatabaseName,
        );
        toast.success("Query saved!");
      }
      setIsSaveDialogOpen(false);
    } catch (err) {
      console.error("Error saving query:", err);
      toast.error(
        tab?.isSaved ? "Failed to update query." : "Failed to save query.",
      );
    }
  };

  if (!tab) return null;

  const queryCount = parsedQueries.length;
  const hasMultipleQueries = queryCount > 1;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 flex items-center justify-between border-b">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground truncate max-w-[200px]">
            {tab.title}
          </span>
          {hasMultipleQueries && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {currentQueryIndex + 1}/{queryCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="link"
                  onClick={handleRunQuery}
                  className="gap-2 px-2"
                >
                  <CirclePlay className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Run current query (Ctrl+Enter)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {hasMultipleQueries && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="link"
                    onClick={handleRunAllQueries}
                    className="gap-2 px-2"
                  >
                    <PlaySquare className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Run all queries (Ctrl+Shift+Enter)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="link"
                  onClick={() => {
                    void openSaveDialog();
                  }}
                  className="gap-2 px-2"
                  disabled={tab.type === "home" || tab.type === "information"}
                >
                  <Save className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {tab.isSaved ? "Update saved query" : "Save query"} (Ctrl+S)
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <CodeMirror
          ref={cmRef}
          value={value}
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
                  autocompletion: false, // our autocomplete is added via extensions
                  indentOnInput: true,
                }
          }
          theme="none"
          extensions={extensions}
          onChange={handleChange}
          onUpdate={handleUpdate}
          className="h-full"
          style={{ height: "100%" }}
        />
      </div>

      <AlertDialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tab?.isSaved ? "Update Query" : "Save Query"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tab?.isSaved
                ? "Update the saved query:"
                : "Save this query to a connection:"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="query-name">Query Name</Label>
              <Input
                id="query-name"
                type="text"
                placeholder="Enter query name"
                value={queryName}
                onChange={(e) => setQueryName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="connection">Connection</Label>
              <Select
                value={selectedConnectionId}
                onValueChange={handleConnectionChange}
              >
                <SelectTrigger id="connection">
                  <SelectValue placeholder="Select connection" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((conn) => (
                    <SelectItem key={conn.id} value={conn.id}>
                      {conn.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="database">Database (optional)</Label>
              <Select
                value={selectedDatabaseName || "__none__"}
                onValueChange={(v) =>
                  setSelectedDatabaseName(v === "__none__" ? "" : v)
                }
                disabled={availableDatabases.length === 0}
              >
                <SelectTrigger id="database">
                  <SelectValue
                    placeholder={
                      availableDatabases.length === 0
                        ? "No databases available"
                        : "Select database"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {availableDatabases.map((db) => (
                    <SelectItem key={db} value={db}>
                      {db}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveQuery}>
              {tab.isSaved ? "Update" : "Save"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SQLEditor;
