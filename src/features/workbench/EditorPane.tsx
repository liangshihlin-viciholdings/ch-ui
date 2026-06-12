// Editor + results pane with tab bar. Production version.
import { useState } from "react";
import { ChevronDown, Play, Save, X } from "lucide-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ENGINES } from "./engineMeta";
import SaveQueryDialog from "./SaveQueryDialog";

interface EditorTab {
  id: string;
  title: string;
  connectionId: string;
  sql: string;
  dirty?: boolean;
}

// TODO: wire to workspaceStore tabs. For now, mock data for the shell.
const MOCK_TABS: EditorTab[] = [
  { id: "t1", title: "top pages", connectionId: "c1", sql: "SELECT path, count() AS views\nFROM page_views\nGROUP BY path\nORDER BY views DESC\nLIMIT 100", dirty: true },
  { id: "t2", title: "invoices", connectionId: "c2", sql: "SELECT * FROM invoices LIMIT 50" },
];

const MOCK_CONNECTIONS: Record<string, { name: string; engine: keyof typeof ENGINES }> = {
  c1: { name: "analytics-prod", engine: "clickhouse" },
  c2: { name: "billing-pg", engine: "postgres" },
};

function ResultsGrid() {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">0 rows</span>
        <span>· 0.00s</span>
      </div>
      <div className="flex-1 overflow-auto p-4 text-sm text-muted-foreground">
        Run a query to see results
      </div>
    </div>
  );
}

export default function EditorPane({
  onConnectionFocus,
}: {
  onConnectionFocus?: (connId: string) => void;
}) {
  const [active, setActive] = useState(MOCK_TABS[0].id);
  const [saving, setSaving] = useState(false);
  const tab = MOCK_TABS.find((t) => t.id === active)!;
  const conn = MOCK_CONNECTIONS[tab.connectionId];
  const meta = conn ? ENGINES[conn.engine] : undefined;

  const focusTab = (id: string) => {
    setActive(id);
    const t = MOCK_TABS.find((x) => x.id === id);
    if (t) onConnectionFocus?.(t.connectionId);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border bg-muted/30 px-2">
        {MOCK_TABS.map((t) => {
          const tm = ENGINES[MOCK_CONNECTIONS[t.connectionId]?.engine ?? "clickhouse"];
          return (
            <button
              key={t.id}
              onClick={() => focusTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
                t.id === active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <span className={cn("size-2 rounded-full", tm.dot)} />
              {t.title}
              {t.dirty && <span className="text-primary">•</span>}
              <X className="size-3 opacity-50 hover:opacity-100" />
            </button>
          );
        })}
      </div>

      {/* Connection pill + actions */}
      {conn && meta && (
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <span className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs">
            <span className={cn("size-2 rounded-full", meta.dot)} />
            <span className="font-medium">{conn.name}</span>
            <span className="text-muted-foreground">· {meta.label}</span>
            <ChevronDown className="size-3 text-muted-foreground" />
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" className="h-7 gap-1.5">
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

      {/* Editor + results */}
      <ResizablePanelGroup orientation="vertical" className="flex-1">
        <ResizablePanel defaultSize="55%">
          <pre className="h-full overflow-auto bg-background p-4 font-mono text-[13px] leading-relaxed">
            {tab.sql}
          </pre>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="45%">
          <ResultsGrid />
        </ResizablePanel>
      </ResizablePanelGroup>
      <SaveQueryDialog open={saving} onOpenChange={setSaving} />
    </div>
  );
}
