// A2 Workbench shell — the desktop main surface.
// Split navigator (connection list top, schema tree bottom) + editor+results right.
// Tab → navigator sync, save-query dialog as form.

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
import { ENGINES, type EngineMeta } from "./engineMeta";
import NewConnectionDialog from "./NewConnectionDialog";
import EditorPane from "./EditorPane";

// ─── Connection status types ──────────────────────────────────────────────

type ConnectionStatus = "connected" | "idle" | "disconnected";

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  connected: "text-emerald-500 fill-emerald-500",
  idle: "text-amber-500 fill-amber-500",
  disconnected: "text-zinc-400 fill-zinc-400",
};

// ─── Connection list (top panel) ──────────────────────────────────────────

interface ConnectionEntry {
  id: string;
  name: string;
  engine: keyof typeof ENGINES;
  host?: string;
  filePath?: string;
  status: ConnectionStatus;
}

function ConnectionList({
  connections,
  activeId,
  onPick,
  onAdd,
}: {
  connections: ConnectionEntry[];
  activeId: string;
  onPick: (id: string) => void;
  onAdd: () => void;
}) {
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
          return (
            <button
              key={c.id}
              onClick={() => onPick(c.id)}
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
    </div>
  );
}

// ─── Schema tree (bottom panel) ───────────────────────────────────────────

interface SchemaEntry {
  name: string;
  tables: { name: string; type: string; cols?: { name: string; type: string; pk?: boolean }[] }[];
}

function SchemaTree({ schema }: { schema: SchemaEntry | null }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [openTable, setOpenTable] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    if (!schema) return [];
    if (!q) return schema.tables;
    const needle = q.toLowerCase();
    return schema.tables.filter((t) => t.name.toLowerCase().includes(needle));
  }, [schema, q]);

  if (!schema) {
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
          const tk = t.name;
          const to = openTable[tk];
          return (
            <div key={tk}>
              <button
                onClick={() =>
                  setOpenTable((o) => ({ ...o, [tk]: !o[tk] }))
                }
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
                (t.cols ?? []).map((col) => (
                  <div
                    key={col.name}
                    className="flex items-center gap-1.5 py-0.5 pl-10 pr-2 text-xs hover:bg-accent"
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
        {!filtered.length && (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            No tables match "{q}".
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main shell ───────────────────────────────────────────────────────────

// TODO: wire to real connection/adapter data. For now uses mock.
const MOCK_CONNECTIONS: ConnectionEntry[] = [
  { id: "c1", name: "analytics-prod", engine: "clickhouse", host: "ch.internal:8443", status: "connected" },
  { id: "c2", name: "billing-pg", engine: "postgres", host: "db.aws:5432", status: "idle" },
  { id: "c3", name: "local-cache.db", engine: "sqlite", filePath: "~/data/cache.db", status: "disconnected" },
];

const MOCK_SCHEMAS: Record<string, SchemaEntry> = {
  c1: { name: "analytics", tables: [
    { name: "page_views", type: "table", cols: [
      { name: "path", type: "String", pk: false },
      { name: "timestamp", type: "DateTime", pk: false },
      { name: "user_id", type: "UInt64", pk: true },
    ]},
    { name: "sessions", type: "table", cols: [
      { name: "session_id", type: "UUID", pk: true },
      { name: "user_id", type: "UInt64", pk: false },
    ]},
  ]},
  c2: { name: "billing", tables: [
    { name: "invoices", type: "table" },
    { name: "customers", type: "table" },
  ]},
};

export default function WorkbenchShell() {
  const [activeId, setActiveId] = useState(MOCK_CONNECTIONS[0].id);
  const [newConn, setNewConn] = useState(false);

  const activeSchema = MOCK_SCHEMAS[activeId] ?? null;

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize="22%" minSize={220} collapsible>
        <ResizablePanelGroup orientation="vertical" className="h-full">
          <ResizablePanel defaultSize="42%" minSize="20%">
            <ConnectionList
              connections={MOCK_CONNECTIONS}
              activeId={activeId}
              onPick={setActiveId}
              onAdd={() => setNewConn(true)}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel minSize="30%">
            <SchemaTree schema={activeSchema} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel minSize="50%">
        <EditorPane onConnectionFocus={setActiveId} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
