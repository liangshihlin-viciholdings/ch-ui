import { useEffect, useState } from "react";
import { useMemo } from "react";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Table2,
  Circle,
  Search,
  KeyRound,
} from "lucide-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ENGINES, type EngineMeta } from "./engineMeta";
import NewConnectionDialog from "./NewConnectionDialog";
import EditorPane from "./EditorPane";
import {
  useWorkbenchStore,
  loadConnections,
  connectConnection,
  selectConnection,
  expandTable,
  type ConnectionStatus,
} from "@/stores/workbenchStore";

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  connected: "text-emerald-500 fill-emerald-500",
  idle: "text-amber-500 fill-amber-500",
  disconnected: "text-zinc-400 fill-zinc-400",
};

function ConnectionList({
  onAdd,
}: {
  onAdd: () => void;
}) {
  const connections = useWorkbenchStore((s) => s.connections);
  const activeId = useWorkbenchStore((s) => s.activeConnectionId);
  const statuses = useWorkbenchStore((s) => s.statuses);

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Connections
        </span>
        <Button size="icon" variant="ghost" className="size-6" onClick={onAdd}>
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {connections.map((c) => {
          const meta = ENGINES[c.engine];
          const Icon = meta.icon;
          const status = statuses[c.id] ?? "disconnected";
          return (
            <button
              key={c.id}
              onClick={() => {
                selectConnection(c.id);
                if (status === "disconnected") {
                  void connectConnection(c.id);
                }
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-sm",
                c.id === activeId ? "bg-accent" : "hover:bg-accent/50",
              )}
            >
              <span className={cn("size-2 shrink-0 rounded-full", meta.dot)} />
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate font-medium">{c.name}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {meta.label}
                  {c.filePath ? ` · ${c.filePath}` : c.url ? ` · ${c.url}` : ""}
                </div>
              </div>
              <Circle
                className={cn("size-2 shrink-0", STATUS_COLOR[status])}
              />
            </button>
          );
        })}
        {!connections.length && (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            No connections yet.
          </div>
        )}
      </div>
    </div>
  );
}

function SchemaTree() {
  const activeId = useWorkbenchStore((s) => s.activeConnectionId);
  const schemaCache = useWorkbenchStore((s) =>
    activeId ? s.schemas[activeId] : null,
  );
  const [q, setQ] = useState("");
  const [openTable, setOpenTable] = useState<Record<string, boolean>>({});

  const allTables = useMemo(() => {
    if (!schemaCache) return [];
    return Object.entries(schemaCache.tables).flatMap(([schema, tables]) =>
      tables.map((t) => ({ schema, ...t })),
    );
  }, [schemaCache]);

  const filtered = useMemo(() => {
    if (!q) return allTables;
    const needle = q.toLowerCase();
    return allTables.filter((t) => t.name.toLowerCase().includes(needle));
  }, [allTables, q]);

  if (!activeId || !schemaCache) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Select a connection
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="border-b border-border px-2 py-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter tables…"
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto py-1 text-sm">
        {filtered.map((t) => {
          const tk = `${t.schema}.${t.name}`;
          const to = openTable[tk];
          const cols = schemaCache.columns[tk];
          return (
            <div key={tk}>
              <button
                onClick={() => {
                  setOpenTable((o) => ({ ...o, [tk]: !o[tk] }));
                  if (!cols) {
                    void expandTable(activeId, t.schema, t.name);
                  }
                }}
                className="flex w-full items-center gap-1.5 py-1 pl-4 pr-2 hover:bg-accent"
              >
                {to ? (
                  <ChevronDown className="size-3 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-3 text-muted-foreground" />
                )}
                <Table2 className="size-3.5 text-muted-foreground" />
                <span className="truncate">{t.name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground capitalize">
                  {t.type}
                </span>
              </button>
              {to &&
                (cols ?? []).map((col) => (
                  <div
                    key={col.name}
                    className="flex items-center gap-1.5 py-0.5 pl-10 pr-2 text-xs hover:bg-accent"
                  >
                    <span className="size-3 shrink-0" />
                    <span className="truncate">{col.name}</span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {col.type}
                    </span>
                  </div>
                ))}
            </div>
          );
        })}
        {!filtered.length && (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            No tables match "{q}".
          </div>
        )}
      </div>
    </div>
  );
}

export default function WorkbenchShell() {
  const [newConn, setNewConn] = useState(false);
  const activeId = useWorkbenchStore((s) => s.activeConnectionId);

  useEffect(() => {
    void loadConnections();
  }, []);

  return (
    <>
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize="22%" minSize={220} collapsible>
        <ResizablePanelGroup orientation="vertical" className="h-full">
          <ResizablePanel defaultSize="42%" minSize="20%">
            <ConnectionList onAdd={() => setNewConn(true)} />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel minSize="30%">
            <SchemaTree />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel minSize="50%">
        <EditorPane />
      </ResizablePanel>
    </ResizablePanelGroup>
    <NewConnectionDialog open={newConn} onOpenChange={setNewConn} />
    </>
  );
}
