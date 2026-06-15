// Unified sidebar navigator — merges the connections list and the schema
// (database → table → column) tree into a single accordion. Each connection
// is a collapsible node; expanding a disconnected connection connects it and
// loads its schema. Connection management (connect/disconnect, set default,
// edit, delete, admin) lives inline via a per-row menu.
import { useMemo, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Table2,
  Circle,
  Search,
  Shield,
  Database,
  MoreVertical,
  Pencil,
  Trash2,
  Power,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { cn } from "@/lib/utils";
import { ENGINES } from "./engineMeta";
import type { SavedConnection } from "@/lib/db/schema";
import {
  useWorkbenchStore,
  connectConnection,
  disconnectConnection,
  selectConnection,
  expandTable,
  openTab,
  setAdminView,
  type ConnectionStatus,
} from "@/stores/workbenchStore";
import { deleteConnectionById, setAsDefault } from "@/stores/connectionStore";

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  connected: "text-emerald-500 fill-emerald-500",
  idle: "text-amber-500 fill-amber-500",
  disconnected: "text-zinc-400 fill-zinc-400",
};

// Clean, theme-coloured focus indicator for the plain nav buttons (replaces
// the browser's default outline, which renders in currentColor and looks
// like a stray border).
const NAV_BTN_FOCUS =
  "rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

export default function ConnectionNavigator({
  onAdd,
  onEdit,
}: {
  onAdd: () => void;
  onEdit: (connection: SavedConnection) => void;
}) {
  const connections = useWorkbenchStore((s) => s.connections);
  const activeId = useWorkbenchStore((s) => s.activeConnectionId);
  const statuses = useWorkbenchStore((s) => s.statuses);
  const schemas = useWorkbenchStore((s) => s.schemas);
  const capabilities = useWorkbenchStore((s) => s.capabilities);

  const [q, setQ] = useState("");
  // Expansion state is keyed by connection/schema/table so it is independent
  // of activeConnectionId (which setActiveTab mutates) — switching tabs never
  // collapses or changes the navigator.
  const [openConn, setOpenConn] = useState<Record<string, boolean>>({});
  const [openSchema, setOpenSchema] = useState<Record<string, boolean>>({});
  const [openTable, setOpenTable] = useState<Record<string, boolean>>({});
  const [pendingDelete, setPendingDelete] = useState<SavedConnection | null>(
    null,
  );

  const needle = q.trim().toLowerCase();

  function toggleConn(c: SavedConnection) {
    const willOpen = !openConn[c.id];
    setOpenConn((o) => ({ ...o, [c.id]: willOpen }));
    selectConnection(c.id);
    if (willOpen && (statuses[c.id] ?? "disconnected") === "disconnected") {
      void connectConnection(c.id);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    if ((statuses[id] ?? "disconnected") === "connected") {
      await disconnectConnection(id);
    }
    await deleteConnectionById(id);
  }

  // Clicking a table name opens a new query tab pre-filled with a default
  // SELECT against that table (the chevron, not the name, toggles columns).
  function openTableQuery(connId: string, schema: string, table: string) {
    selectConnection(connId);
    openTab(connId, {
      title: table,
      sql: `SELECT *\nFROM ${schema}.${table}\nLIMIT 100;`,
    });
  }

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
        {connections.map((c) => {
          const meta = ENGINES[c.engine];
          const Icon = meta.icon;
          const status = statuses[c.id] ?? "disconnected";
          const isOpen = !!openConn[c.id];
          const cache = schemas[c.id] ?? null;
          const adminCaps = capabilities[c.id]?.admin;
          const isActive = c.id === activeId;

          return (
            <div key={c.id}>
              {/* Connection row */}
              <div
                className={cn(
                  "group relative flex w-full items-center gap-1.5 px-2 py-1.5",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50",
                )}
              >
                <button
                  onClick={() => toggleConn(c)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-1.5 text-left",
                    NAV_BTN_FOCUS,
                  )}
                >
                  {isOpen ? (
                    <ChevronDown
                      className={cn(
                        "size-3 shrink-0",
                        isActive ? "text-accent-foreground/80" : "text-muted-foreground",
                      )}
                    />
                  ) : (
                    <ChevronRight
                      className={cn(
                        "size-3 shrink-0",
                        isActive ? "text-accent-foreground/80" : "text-muted-foreground",
                      )}
                    />
                  )}
                  <span className={cn("size-2 shrink-0 rounded-full", meta.dot)} />
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      isActive ? "text-accent-foreground/80" : "text-muted-foreground",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="min-w-0 truncate font-medium">
                        {c.name}
                      </span>
                      <Circle
                        className={cn(
                          "size-2 shrink-0",
                          STATUS_COLOR[status],
                        )}
                      />
                      {c.isDefault && (
                        <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" />
                      )}
                    </div>
                    <div
                      className={cn(
                        "truncate text-[11px]",
                        isActive
                          ? "text-accent-foreground/70"
                          : "text-muted-foreground",
                      )}
                    >
                      {meta.label}
                      {c.filePath
                        ? ` · ${c.filePath}`
                        : c.url
                          ? ` · ${c.url}`
                          : ""}
                    </div>
                  </div>
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute right-1.5 top-1/2 size-6 -translate-y-1/2 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                      title="Connection actions"
                    >
                      <MoreVertical className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {status === "connected" ? (
                      <DropdownMenuItem
                        onClick={() => void disconnectConnection(c.id)}
                      >
                        <Power className="mr-2 size-3.5" /> Disconnect
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => {
                          selectConnection(c.id);
                          void connectConnection(c.id);
                        }}
                      >
                        <Power className="mr-2 size-3.5" /> Connect
                      </DropdownMenuItem>
                    )}
                    {adminCaps && (
                      <DropdownMenuItem
                        onClick={() => {
                          selectConnection(c.id);
                          setAdminView(true);
                        }}
                      >
                        <Shield className="mr-2 size-3.5" /> Admin
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onEdit(c)}>
                      <Pencil className="mr-2 size-3.5" /> Edit
                    </DropdownMenuItem>
                    {!c.isDefault && (
                      <DropdownMenuItem onClick={() => void setAsDefault(c.id)}>
                        <Star className="mr-2 size-3.5" /> Set as default
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setPendingDelete(c)}
                    >
                      <Trash2 className="mr-2 size-3.5" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Schema → table → column subtree */}
              {isOpen && (
                <div>
                  {!cache && (
                    <div className="py-1 pl-9 pr-2 text-[11px] text-muted-foreground">
                      {status === "connected" ? "Loading schema…" : "Connecting…"}
                    </div>
                  )}
                  {cache?.schemas.length === 0 && (
                    <div className="py-1 pl-9 pr-2 text-[11px] text-muted-foreground">
                      No databases.
                    </div>
                  )}
                  {cache?.schemas.map((s) => {
                    const sk = `${c.id}:${s.name}`;
                    const schemaOpen = !!openSchema[sk];
                    const tables = cache.tables[s.name] ?? [];
                    const visibleTables = needle
                      ? tables.filter((t) =>
                          t.name.toLowerCase().includes(needle),
                        )
                      : tables;
                    // While filtering, hide schemas with no matching tables.
                    if (needle && visibleTables.length === 0) return null;
                    const expanded = schemaOpen || needle.length > 0;

                    return (
                      <div key={sk}>
                        <button
                          onClick={() =>
                            setOpenSchema((o) => ({ ...o, [sk]: !o[sk] }))
                          }
                          className={cn(
                            "flex w-full items-center gap-1.5 py-1 pl-7 pr-2 hover:bg-accent",
                            NAV_BTN_FOCUS,
                          )}
                        >
                          {expanded ? (
                            <ChevronDown className="size-3 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-3 text-muted-foreground" />
                          )}
                          <Database className="size-3.5 text-muted-foreground" />
                          <span className="truncate text-[13px]">{s.name}</span>
                        </button>

                        {expanded &&
                          visibleTables.map((t) => {
                            const tk = `${c.id}:${s.name}.${t.name}`;
                            const tableOpen = !!openTable[tk];
                            const colKey = `${s.name}.${t.name}`;
                            const cols = cache.columns[colKey];
                            return (
                              <div key={tk}>
                                <div className="flex w-full items-center gap-1.5 py-1 pl-11 pr-2 hover:bg-accent">
                                  <button
                                    onClick={() => {
                                      setOpenTable((o) => ({
                                        ...o,
                                        [tk]: !o[tk],
                                      }));
                                      if (!cols) {
                                        void expandTable(c.id, s.name, t.name);
                                      }
                                    }}
                                    className={cn("shrink-0", NAV_BTN_FOCUS)}
                                    title={
                                      tableOpen
                                        ? "Collapse columns"
                                        : "Expand columns"
                                    }
                                  >
                                    {tableOpen ? (
                                      <ChevronDown className="size-3 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="size-3 text-muted-foreground" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => openTableQuery(c.id, s.name, t.name)}
                                    className={cn(
                                      "flex min-w-0 flex-1 items-center gap-1.5 text-left",
                                      NAV_BTN_FOCUS,
                                    )}
                                    title={`Open a query for ${t.name}`}
                                  >
                                    <Table2 className="size-3.5 shrink-0 text-muted-foreground" />
                                    <span className="truncate">{t.name}</span>
                                    <span className="ml-auto text-[10px] capitalize text-muted-foreground">
                                      {t.type}
                                    </span>
                                  </button>
                                </div>
                                {tableOpen &&
                                  (cols ?? []).map((col) => (
                                    <div
                                      key={col.name}
                                      className="flex items-center gap-1.5 py-0.5 pl-[68px] pr-2 text-xs hover:bg-accent"
                                    >
                                      <span className="truncate">
                                        {col.name}
                                      </span>
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
                </div>
              )}
            </div>
          );
        })}

        {!connections.length && (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            No connections yet.
          </div>
        )}
      </div>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete connection “{pendingDelete?.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the connection and its saved queries. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
