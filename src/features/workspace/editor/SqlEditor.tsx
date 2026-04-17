import React, { useEffect, useRef, useCallback, useState, useMemo } from "react";
import * as monaco from "monaco-editor";
import { useTheme } from "@/components/common/theme-provider";
import { useAppearance } from "@/contexts/AppearanceContext";
import useAppStore from "@/stores/workspaceStore";
import {
  initializeMonacoGlobally,
  createMonacoEditor,
} from "@/features/workspace/editor/monacoConfig";
import { initVimMode, VimMode, VimModeInstance } from "monaco-vim";
import { getMonacoTheme, isLightTheme } from "@/features/workspace/editor/monacoThemes";
import { AutocompleteUsageTracker } from "@/features/workspace/editor/usageTracker";
import { Button } from "@/components/ui/button";
import { CirclePlay, Save, PlaySquare } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { getSavedQueryById } from "@/lib/db";
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
import { Label } from "@/components/ui/label";
import { useNavigate } from "@tanstack/react-router";
import { parseQueries, findQueryAtCursor, ParsedQuery } from "@/helpers/queryParser";
import { useConnectionStore } from "@/stores/connectionStore";

interface SQLEditorProps {
  tabId: string;
  onRunQuery: (query: string) => void;
  onRunAllQueries?: (queries: string[]) => void;
  onFocusChange?: (focused: boolean) => void;
}

const HIGHLIGHT_DECORATION_CLASS = "current-query-highlight";

const SQLEditor: React.FC<SQLEditorProps> = ({ tabId, onRunQuery, onRunAllQueries, onFocusChange }) => {
  const { getTabById, updateTab, saveQuery, updateSavedQuery, dataBaseExplorer, selectedDatabase } =
    useAppStore();
  const { connections, activeConnectionId, getDatabasesForConnection } = useConnectionStore();
  const editorRef = useRef<HTMLDivElement>(null);
  const monacoRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const vimModeRef = useRef<VimModeInstance | null>(null);
  const statusBarRef = useRef<HTMLDivElement | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const isDisposedRef = useRef(false);
  const highlightTimeoutRef = useRef<number | undefined>(undefined);
  const usageTrackerRef = useRef<AutocompleteUsageTracker | null>(null);
  const handleRunQueryRef = useRef<() => void>(() => {});
  const handleRunAllQueriesRef = useRef<() => void>(() => {});
  const handleSaveOpenDialogRef = useRef<() => void>(() => {});
  const tab = getTabById(tabId);
  const { theme } = useTheme();
  const { editorFontSize, editorFontFamily, editorVimMode } = useAppearance();
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [queryName, setQueryName] = useState(tab?.title || "Untitled Query");
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");
  const [selectedDatabaseName, setSelectedDatabaseName] = useState<string>("");
  const [parsedQueries, setParsedQueries] = useState<ParsedQuery[]>([]);
  const [currentQueryIndex, setCurrentQueryIndex] = useState<number>(-1);
  const navigate = useNavigate();

  const editorTheme = getMonacoTheme(theme);
  const highlightBackground = isLightTheme(theme)
    ? "rgba(66, 153, 225, 0.08)"
    : "rgba(99, 179, 237, 0.12)";

  const updateParsedQueries = useCallback(() => {
    if (isDisposedRef.current || !monacoRef.current) return [];
    const content = monacoRef.current.getValue();
    const queries = parseQueries(content);
    setParsedQueries(queries);
    return queries;
  }, []);

  const updateCurrentQueryHighlight = useCallback(() => {
    if (isDisposedRef.current || !monacoRef.current) return;

    const position = monacoRef.current.getPosition();
    if (!position) return;

    const queries = parsedQueries.length > 0 ? parsedQueries : updateParsedQueries();
    const queryIndex = findQueryAtCursor(queries, position.lineNumber, position.column);
    setCurrentQueryIndex(queryIndex);

    if (queryIndex >= 0 && queries[queryIndex]) {
      const query = queries[queryIndex];
      const newDecorations = monacoRef.current.deltaDecorations(
        decorationsRef.current,
        [
          {
            range: new monaco.Range(
              query.startLine,
              query.startColumn,
              query.endLine,
              query.endColumn + 1
            ),
            options: {
              className: HIGHLIGHT_DECORATION_CLASS,
              inlineClassName: HIGHLIGHT_DECORATION_CLASS,
            },
          },
        ]
      );
      decorationsRef.current = newDecorations;
    } else {
      const newDecorations = monacoRef.current.deltaDecorations(decorationsRef.current, []);
      decorationsRef.current = newDecorations;
    }
  }, [parsedQueries, updateParsedQueries]);

  const getCurrentQuery = useCallback(() => {
    if (!monacoRef.current) return "";

    const selection = monacoRef.current.getSelection();
    const model = monacoRef.current.getModel();

    if (selection && model && !selection.isEmpty()) {
      return model.getValueInRange(selection);
    }

    const position = monacoRef.current.getPosition();
    if (position) {
      const queries = parsedQueries.length > 0 ? parsedQueries : updateParsedQueries();
      const queryIndex = findQueryAtCursor(queries, position.lineNumber, position.column);
      if (queryIndex >= 0 && queries[queryIndex]) {
        return queries[queryIndex].text;
      }
    }

    return monacoRef.current.getValue();
  }, [parsedQueries, updateParsedQueries]);

  const getAllQueries = useCallback(() => {
    const queries = parsedQueries.length > 0 ? parsedQueries : updateParsedQueries();
    return queries.map((q) => q.text).filter((text) => text.trim());
  }, [parsedQueries, updateParsedQueries]);

  const handleRunQuery = useCallback(() => {
    const content = getCurrentQuery();
    if (!content.trim()) {
      toast.error("Please enter a query to run");
      return;
    }

    // Collect SET param_xxx lines from the full editor so parameterized
    // queries work when only the current block is run.
    const fullContent = monacoRef.current?.getValue() ?? '';
    const setParamLines = fullContent
      .split('\n')
      .filter(line => /^\s*SET\s+param_\w+\s*=/i.test(line));

    const queryToRun = setParamLines.length > 0
      ? setParamLines.join('\n') + '\n' + content
      : content;

    onRunQuery(queryToRun);
  }, [onRunQuery, getCurrentQuery]);

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
      onRunQuery(queries.join('; '));
    }
  }, [getAllQueries, onRunQuery, onRunAllQueries]);

  useEffect(() => { handleRunQueryRef.current = handleRunQuery; }, [handleRunQuery]);
  useEffect(() => { handleRunAllQueriesRef.current = handleRunAllQueries; }, [handleRunAllQueries]);

  const hanldeSaveOpenDialog = async () => {
    if (tab?.title) {
      setQueryName(tab.title);
    }

    if (tab?.isSaved) {
      try {
        const savedQuery = await getSavedQueryById(tabId);
        if (savedQuery) {
          const connectionExists = connections.some(
            (conn) => conn.id === savedQuery.connectionId
          );

          if (connectionExists) {
            setSelectedConnectionId(savedQuery.connectionId);
            setSelectedDatabaseName(savedQuery.databaseName);
            setIsSaveDialogOpen(true);
            return;
          }
        }
      } catch (error) {
        console.error("Failed to fetch saved query:", error);
      }
    }

    const currentConnectionId = activeConnectionId || "";
    setSelectedConnectionId(currentConnectionId);

    let databases: string[] = [];
    if (currentConnectionId) {
      if (currentConnectionId === activeConnectionId) {
        databases = dataBaseExplorer.map((db) => db.name);
      } else {
        databases = getDatabasesForConnection(currentConnectionId);
      }
    }

    const currentDatabase =
      selectedDatabase && currentConnectionId && databases.includes(selectedDatabase)
        ? selectedDatabase
        : "";
    setSelectedDatabaseName(currentDatabase);

    setIsSaveDialogOpen(true);
  };

  useEffect(() => { handleSaveOpenDialogRef.current = hanldeSaveOpenDialog; });

  useEffect(() => {
    initializeMonacoGlobally();
    if (editorRef.current) {
      isDisposedRef.current = false;
      const editor = createMonacoEditor(editorRef.current, editorTheme, editorFontSize, editorFontFamily);
      monacoRef.current = editor;

      const connectionId = activeConnectionId || 'default';
      if (!usageTrackerRef.current) {
        usageTrackerRef.current = new AutocompleteUsageTracker(connectionId);
      } else {
        usageTrackerRef.current.setConnection(connectionId);
      }

      if (tab?.content) {
        const content = typeof tab.content === "string" ? tab.content : "";
        editor.setValue(content);
      }

      const initialQueries = parseQueries(editor.getValue());
      setParsedQueries(initialQueries);

      const changeListener = editor.onDidChangeModelContent((event) => {
        const newContent = editor.getValue();
        updateTab(tabId, { content: newContent });
        updateParsedQueries();
        highlightTimeoutRef.current = window.setTimeout(updateCurrentQueryHighlight, 0);

        if (usageTrackerRef.current) {
          usageTrackerRef.current.checkForAcceptedSuggestion(event, editor.getModel());
        }
      });

      const cursorListener = editor.onDidChangeCursorPosition(() => {
        updateCurrentQueryHighlight();
      });

      const focusListener = editor.onDidFocusEditorText(() => {
        onFocusChange?.(true);
      });

      const blurListener = editor.onDidBlurEditorText(() => {
        onFocusChange?.(false);
      });

      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        () => { handleRunQueryRef.current(); }
      );

      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
        () => { handleRunAllQueriesRef.current(); }
      );

      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => { handleSaveOpenDialogRef.current(); }
      );

      const styleId = `query-highlight-style-${tabId}`;
      if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
          .${HIGHLIGHT_DECORATION_CLASS} {
            background-color: ${highlightBackground} !important;
          }
        `;
        document.head.appendChild(style);
      }

      return () => {
        if (highlightTimeoutRef.current) {
          clearTimeout(highlightTimeoutRef.current);
        }
        isDisposedRef.current = true;
        changeListener.dispose();
        cursorListener.dispose();
        focusListener.dispose();
        blurListener.dispose();
        editor.dispose();
        monacoRef.current = null;
        const styleElement = document.getElementById(styleId);
        if (styleElement) {
          styleElement.remove();
        }

        if (vimModeRef.current) {
          vimModeRef.current.dispose();
          vimModeRef.current = null;
        }
      };
    }
  }, [tabId, updateTab, editorTheme, editorFontSize, editorFontFamily]);

  useEffect(() => {
    const styleId = `query-highlight-style-${tabId}`;
    const styleElement = document.getElementById(styleId);
    if (styleElement) {
      styleElement.textContent = `
        .${HIGHLIGHT_DECORATION_CLASS} {
          background-color: ${highlightBackground} !important;
        }
      `;
    }
  }, [highlightBackground, tabId]);

  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.updateOptions({ fontSize: editorFontSize });
    }
  }, [editorFontSize]);

  useEffect(() => {
    if (monacoRef.current) {
      const FONT_FAMILY_MAP: Record<string, string> = {
        "system": "monospace",
        "jetbrains-mono": "'JetBrains Mono', monospace",
        "fira-code": "'Fira Code', monospace",
        "cascadia-code": "'Cascadia Code', monospace",
        "source-code-pro": "'Source Code Pro', monospace",
        "monaco": "'Monaco', monospace",
        "consolas": "'Consolas', monospace",
        "ibm-plex-mono": "'IBM Plex Mono', monospace",
      };
      const fontFamilyValue = FONT_FAMILY_MAP[editorFontFamily] || FONT_FAMILY_MAP["system"];
      monacoRef.current.updateOptions({ fontFamily: fontFamilyValue, fontLigatures: true });
    }
  }, [editorFontFamily]);

  useEffect(() => {
    if (monacoRef.current) {
      if (editorVimMode) {
        if (!statusBarRef.current) {
          console.error("Vim status bar ref not available.");
          return;
        }

        vimModeRef.current = initVimMode(monacoRef.current, statusBarRef.current);

        VimMode.Vim.defineEx('w', 'w', () => {
          handleSaveOpenDialogRef.current();
        });

        VimMode.Vim.defineEx('run', 'run', () => {
          handleRunQueryRef.current();
        });

        VimMode.Vim.defineEx('runall', 'runall', () => {
          handleRunAllQueriesRef.current();
        });

        VimMode.Vim.defineOperator('surround', (cm, args, ranges) => {
          const char = args.char;
          if (!char) return;

          const replacements: { from: string; to: string }[] = [];
          cm.eachSelection((selection: any) => {
            const selectedText = cm.getRange(selection.from(), selection.to());
            let from = '\'' + char;
            let to = '\'' + char;

            if (char === 'b') { from = '('; to = ')'; }
            else if (char === 'B') { from = '{'; to = '}'; }
            else if (char === '[') { from = '['; to = ']'; }
            
            replacements.push({
              from: selectedText,
              to: from + selectedText + to,
            });
          });

          cm.replaceSelections(replacements.map(r => r.to));
        });

        VimMode.Vim.mapCommand('<leader>sa', 'operator', 'surround', {});
        VimMode.Vim.mapCommand('gsd', 'operator', 'surround', { char: "'" });
        VimMode.Vim.mapCommand('gsr', 'operator', 'surround', { char: "`" });

        monacoRef.current.updateOptions({ lineNumbers: "relative" });

        return () => {
          if (vimModeRef.current) {
            vimModeRef.current.dispose();
            vimModeRef.current = null;
          }
          if (monacoRef.current && !isDisposedRef.current) {
             monacoRef.current.updateOptions({ lineNumbers: "on" });
          }
        };
      } else if (vimModeRef.current) {
        vimModeRef.current.dispose();
        vimModeRef.current = null;
        if (monacoRef.current && !isDisposedRef.current) {
          monacoRef.current.updateOptions({ lineNumbers: "on" });
        }
      }
    }
  }, [editorVimMode]);

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
  }, [selectedConnectionId, activeConnectionId, dataBaseExplorer, getDatabasesForConnection]);

  const handleSaveQuery = async () => {
    const query = monacoRef.current?.getValue() || "";

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
        await updateSavedQuery(tabId, queryName, query, selectedConnectionId, selectedDatabaseName);
        toast.success("Query updated!");
      } else {
        await saveQuery(tabId, queryName, query, selectedConnectionId, selectedDatabaseName);
        toast.success("Query saved!");
      }
      setIsSaveDialogOpen(false);
    } catch (error) {
      console.error("Error saving query:", error);
      toast.error(tab?.isSaved ? "Failed to update query." : "Failed to save query.");
    }
  };

  const handleQueryNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQueryName(e.target.value);
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
                <Button variant="link" onClick={handleRunQuery} className="gap-2 px-2">
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
                  <Button variant="link" onClick={handleRunAllQueries} className="gap-2 px-2">
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
                  onClick={hanldeSaveOpenDialog}
                  className="gap-2 px-2"
                  disabled={tab.type === "home" || tab.type === "information"}
                >
                  <Save className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{tab.isSaved ? "Update saved query" : "Save query"} (Ctrl+S)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      <div ref={editorRef} className="flex-1 min-h-0" />
      {editorVimMode && (
        <div
          ref={statusBarRef}
          className="vim-status-bar h-6 bg-muted text-muted-foreground text-sm px-2 flex items-center shrink-0"
        />
      )}

      <AlertDialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tab?.isSaved ? "Update Query" : "Save Query"}</AlertDialogTitle>
            <AlertDialogDescription>
              {tab?.isSaved ? "Update the saved query:" : "Save this query to a connection:"}
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
                onChange={handleQueryNameChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="connection">Connection</Label>
              <Select value={selectedConnectionId} onValueChange={handleConnectionChange}>
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
                onValueChange={(value) => setSelectedDatabaseName(value === "__none__" ? "" : value)}
                disabled={availableDatabases.length === 0}
              >
                <SelectTrigger id="database">
                  <SelectValue placeholder={
                    availableDatabases.length === 0
                      ? "No databases available"
                      : "Select database"
                  } />
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
