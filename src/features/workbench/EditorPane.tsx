import { useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { ChevronDown, Play, Save, X, Plus } from "lucide-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
          <div className="h-full overflow-auto">
            <CodeMirror
              value={tab.sql}
              height="100%"
              extensions={[dialect.languageSupport()]}
              onChange={(val) => updateTabSql(tab.id, val)}
            />
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
