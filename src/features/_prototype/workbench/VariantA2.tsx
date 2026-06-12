// PROTOTYPE — throwaway. A2: split navigator (WINNER + tweaks). Top = compact
// connection list; bottom = the ACTIVE connection's schema tree, with a filter box
// (grafted from A3), tables expandable to columns, and tab→connection sync.
import { useState, useMemo } from "react";
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
import { CONNECTIONS, ENGINES, connOf } from "./mockData";
import NewConnectionDialog from "./NewConnectionDialog";
import EditorPane from "./EditorPane";

const STATUS_COLOR = {
  connected: "text-emerald-500 fill-emerald-500",
  idle: "text-amber-500 fill-amber-500",
  disconnected: "text-zinc-400 fill-zinc-400",
} as const;

function ConnectionList({
  activeId,
  onPick,
}: {
  activeId: string;
  onPick: (id: string) => void;
}) {
  const [newConn, setNewConn] = useState(false);
  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Connections
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          onClick={() => setNewConn(true)}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {CONNECTIONS.map((c) => {
          const meta = ENGINES[c.engine];
          const Icon = meta.icon;
          return (
            <button
              key={c.id}
              onClick={() => onPick(c.id)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-sm",
                c.id === activeId
                  ? "bg-accent"
                  : "hover:bg-accent/50",
              )}
            >
              <span className={cn("size-2 shrink-0 rounded-full", meta.dot)} />
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate font-medium">{c.name}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {meta.label}
                  {c.host ? ` · ${c.host}` : c.filePath ? ` · ${c.filePath}` : ""}
                </div>
              </div>
              <Circle
                className={cn("size-2 shrink-0", STATUS_COLOR[c.status])}
              />
            </button>
          );
        })}
      </div>
      <NewConnectionDialog open={newConn} onOpenChange={setNewConn} />
    </div>
  );
}

// fake column metadata so the tree can expand one level deeper
const COL_TYPES = ["UInt64", "String", "DateTime", "Float64", "UUID", "Int32"];
function fakeColumns(table: string, n: number) {
  return Array.from({ length: Math.min(n, 8) }, (_, i) => ({
    name: i === 0 ? `${table.replace(/s$/, "")}_id` : `col_${i}`,
    type: COL_TYPES[i % COL_TYPES.length],
    pk: i === 0,
  }));
}

function SchemaTree({ connId }: { connId: string }) {
  const c = connOf(connId);
  const meta = ENGINES[c.engine];
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({
    [c.schemas[0]?.name]: true,
  });
  const [openTable, setOpenTable] = useState<Record<string, boolean>>({});

  const schemas = useMemo(() => {
    if (!q) return c.schemas;
    const needle = q.toLowerCase();
    return c.schemas
      .map((s) => ({
        ...s,
        tables: s.tables.filter((t) =>
          t.name.toLowerCase().includes(needle),
        ),
      }))
      .filter((s) => s.tables.length > 0);
  }, [c, q]);

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <span className={cn("size-2 rounded-full", meta.dot)} />
        <span className="truncate text-sm font-semibold">{c.name}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          schema
        </span>
      </div>
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
        {schemas.map((s) => {
          const so = q ? true : open[s.name];
          return (
            <div key={s.name}>
              <button
                onClick={() => setOpen((o) => ({ ...o, [s.name]: !o[s.name] }))}
                className="flex w-full items-center gap-1.5 px-2 py-1.5 hover:bg-accent"
              >
                {so ? (
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                )}
                <span className="font-medium">{s.name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {s.tables.length}
                </span>
              </button>
              {so &&
                s.tables.map((t) => {
                  const tk = `${s.name}/${t.name}`;
                  const to = openTable[tk];
                  return (
                    <div key={tk}>
                      <button
                        onClick={() =>
                          setOpenTable((o) => ({ ...o, [tk]: !o[tk] }))
                        }
                        className="flex w-full items-center gap-1.5 py-1 pl-6 pr-2 hover:bg-accent"
                      >
                        {to ? (
                          <ChevronDown className="size-3 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="size-3 text-muted-foreground" />
                        )}
                        <Table2 className="size-3.5 text-muted-foreground" />
                        <span className="truncate">{t.name}</span>
                        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                          {t.rows}
                        </span>
                      </button>
                      {to &&
                        fakeColumns(t.name, t.cols).map((col) => (
                          <div
                            key={col.name}
                            className="flex items-center gap-1.5 py-0.5 pl-12 pr-2 text-xs hover:bg-accent"
                          >
                            {col.pk ? (
                              <KeyRound className="size-3 shrink-0 text-amber-500" />
                            ) : (
                              <span className="size-3 shrink-0" />
                            )}
                            <span className="truncate">{col.name}</span>
                            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                              {col.type}
                            </span>
                          </div>
                        ))}
                    </div>
                  );
                })}
            </div>
          );
        })}
        {!schemas.length && (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            No tables match “{q}”.
          </div>
        )}
      </div>
    </div>
  );
}

export default function VariantA2() {
  const [activeId, setActiveId] = useState(CONNECTIONS[0].id);
  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize="22%" minSize={220} collapsible>
        <ResizablePanelGroup orientation="vertical" className="h-full">
          <ResizablePanel defaultSize="42%" minSize="20%">
            <ConnectionList activeId={activeId} onPick={setActiveId} />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel minSize="30%">
            <SchemaTree connId={activeId} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel minSize="50%">
        {/* focusing a tab re-points the navigator at that tab's connection */}
        <EditorPane onConnectionFocus={setActiveId} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
