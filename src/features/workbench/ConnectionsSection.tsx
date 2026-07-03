// Self-contained connections + schema navigator. Renders a collapsible
// "Connections" section: each connection is a node that expands to its
// database → table → column tree. Connection management (connect/disconnect,
// revalidate, refresh, admin, edit, set-default, delete) lives inline via a
// per-row menu, and this component OWNS its dialogs (new/edit, delete,
// export/import) so it can be dropped into any shell with no prop wiring.
//
// Used both standalone (workbench panel) and embedded in the global AppSidebar.
// Pass `filter` to drive table filtering from an external (shared) input; omit
// it to render this section's own "Filter tables…" box.
import { useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  FolderPlus,
  Folder,
  GripVertical,
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
  RefreshCw,
  RotateCw,
  Download,
  Upload,
  HardDriveDownload,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragMoveEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
import NewConnectionDialog from "./NewConnectionDialog";
import FolderRow from "./FolderRow";
import {
  buildTree,
  flattenTree,
  getDropTarget,
  descendantIds,
  isDescendant,
  INDENT_PX,
  type FlatItem,
  type DropTarget,
} from "./connectionTree";
import type { SavedConnection, ConnectionFolder } from "@/lib/db/schema";
import type { ConnectionDisplay } from "@/lib/db";
import type { TableInfo } from "@/lib/db-adapter/types";
import {
  createConnectionFolder,
  updateConnectionFolder,
  deleteConnectionFolder,
  updateConnection,
} from "@/lib/db";
import {
  useWorkbenchStore,
  connectConnection,
  disconnectConnection,
  selectConnection,
  expandTable,
  openTab,
  loadConnections,
  loadSchema,
  setAdminView,
  type ConnectionStatus,
} from "@/stores/workbenchStore";
import { deleteConnectionById, setAsDefault } from "@/stores/connectionStore";
import ExportImportDialog from "@/features/connections/components/ExportImportDialog";
import DbeaverImportDialog from "@/features/connections/components/DbeaverImportDialog";

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

// A relation whose engine/type mentions "view" is grouped under Views — covers
// MySQL/Postgres/SQLite/DuckDB "VIEW" and ClickHouse "View"/"MaterializedView".
function isViewType(type: string | undefined): boolean {
  return (type ?? "").toLowerCase().includes("view");
}

type SortableState = ReturnType<typeof useSortable>;

// Wraps one tree row in dnd-kit sortable wiring. Render-prop so the (large)
// connection-row JSX stays inline in ConnectionsSection with its closures intact.
function SortableRow({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled: boolean;
  children: (s: {
    setNodeRef: SortableState["setNodeRef"];
    style: React.CSSProperties;
    attributes: SortableState["attributes"];
    listeners: SortableState["listeners"];
    isDragging: boolean;
  }) => React.ReactNode;
}) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } =
    useSortable({ id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };
  return <>{children({ setNodeRef, style, attributes, listeners, isDragging })}</>;
}

// Hover-revealed grip carrying the drag listeners. Clicks are swallowed so the
// handle never triggers the row's toggle/select.
function DragHandle({
  attributes,
  listeners,
  className,
}: {
  attributes: SortableState["attributes"];
  listeners: SortableState["listeners"];
  className?: string;
}) {
  return (
    <button
      {...attributes}
      {...listeners}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "flex size-6 items-center justify-center text-muted-foreground/70 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing",
        NAV_BTN_FOCUS,
        className,
      )}
      title="Drag to move"
      aria-label="Drag to reorder"
    >
      <GripVertical className="size-3.5" />
    </button>
  );
}

export default function ConnectionsSection({
  filter: externalFilter,
}: {
  /** Controlled filter from a shared input. Omit to render an own filter box. */
  filter?: string;
}) {
  const connections = useWorkbenchStore((s) => s.connections);
  const folders = useWorkbenchStore((s) => s.connectionFolders);
  const activeId = useWorkbenchStore((s) => s.activeConnectionId);
  const statuses = useWorkbenchStore((s) => s.statuses);
  const schemas = useWorkbenchStore((s) => s.schemas);
  const capabilities = useWorkbenchStore((s) => s.capabilities);

  // Collapsed folder ids (UI-only; their children are hidden in the flattened
  // tree). Kept local — folder collapse is ephemeral view state like openConn.
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    () => new Set(),
  );

  // Section collapse (matches the other sidebar groups).
  const [sectionOpen, setSectionOpen] = useState(true);

  // Filter: controlled by `externalFilter` when provided, else local.
  const [localQ, setLocalQ] = useState("");
  const controlled = externalFilter !== undefined;
  const q = controlled ? externalFilter : localQ;

  // Expansion state is keyed by connection/schema/table so it is independent
  // of activeConnectionId (which setActiveTab mutates) — switching tabs never
  // collapses or changes the navigator.
  const [openConn, setOpenConn] = useState<Record<string, boolean>>({});
  const [openSchema, setOpenSchema] = useState<Record<string, boolean>>({});
  const [openTable, setOpenTable] = useState<Record<string, boolean>>({});
  // Tables/Views group folders default to open (undefined → open).
  const [openGroup, setOpenGroup] = useState<Record<string, boolean>>({});
  const [pendingDelete, setPendingDelete] = useState<SavedConnection | null>(
    null,
  );
  const [exportImport, setExportImport] = useState<null | "export" | "import">(
    null,
  );

  // New / edit connection dialog (owned here, was previously in WorkbenchShell).
  const [dbeaverOpen, setDbeaverOpen] = useState(false);
  const [connDialogOpen, setConnDialogOpen] = useState(false);
  const [editConn, setEditConn] = useState<SavedConnection | null>(null);

  const needle = q.trim().toLowerCase();

  // ── Folder tree ────────────────────────────────────────────────────────────
  // Build the nested tree from the two DB arrays, then flatten to rows. While
  // filtering, ignore folder collapse so matching tables stay reachable.
  const flatItems = useMemo<FlatItem[]>(
    () =>
      flattenTree(
        buildTree(folders, connections),
        0,
        needle ? new Set<string>() : collapsedFolders,
      ),
    [folders, connections, needle, collapsedFolders],
  );
  const folderById = useMemo(
    () => new Map(folders.map((f) => [f.id, f] as const)),
    [folders],
  );
  const connById = useMemo(
    () => new Map(connections.map((c) => [c.id, c] as const)),
    [connections],
  );

  function toggleFolder(id: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Sort key that appends a new item at the end of its container.
  function nextSortOrder(parentId: string | null): number {
    const orders = [
      ...folders
        .filter((f) => (f.parentId ?? null) === parentId)
        .map((f) => f.sortOrder ?? 0),
      ...connections
        .filter((c) => (c.folderId ?? null) === parentId)
        .map((c) => c.sortOrder ?? 0),
    ];
    return (orders.length ? Math.max(...orders) : 0) + 1000;
  }

  async function addFolder(parentId: string | null) {
    await createConnectionFolder({
      name: "New folder",
      parentId,
      sortOrder: nextSortOrder(parentId),
    });
    if (parentId) {
      // Make sure a freshly created subfolder is visible.
      setCollapsedFolders((prev) => {
        if (!prev.has(parentId)) return prev;
        const next = new Set(prev);
        next.delete(parentId);
        return next;
      });
    }
  }

  // ── Drag and drop ────────────────────────────────────────────────────────────
  // Single DndContext over the flattened tree (dnd-kit "sortable tree": one
  // SortableContext, one items array, horizontal offset projects depth/parent).
  // DnD is disabled while filtering — the visible rows are a subset, so a
  // reorder would corrupt the order of hidden siblings.
  const dndDisabled = needle.length > 0;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [projected, setProjected] = useState<DropTarget | null>(null);
  // Rows frozen at drag start (dragged folder's descendants removed, so the
  // whole subtree moves as one). The live liveQuery keeps updating the store
  // underneath; we render this snapshot until the drag ends to keep dnd-kit's
  // item set stable.
  const frozenRef = useRef<FlatItem[]>([]);
  const displayItems = activeDragId ? frozenRef.current : flatItems;
  // Stable id array for SortableContext (it re-diffs when this prop changes by
  // reference; the inline .map would allocate a new array every render).
  const displayIds = useMemo(() => displayItems.map((i) => i.id), [displayItems]);

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    const item = flatItems.find((i) => i.id === id);
    let frozen = flatItems;
    if (item?.kind === "folder") {
      const desc = new Set(descendantIds(flatItems, id));
      frozen = flatItems.filter((i) => !desc.has(i.id));
    }
    frozenRef.current = frozen;
    setActiveDragId(id);
    setProjected(null);
  }

  function handleDragMove(e: DragMoveEvent) {
    const { active, over, delta } = e;
    if (!over) {
      setProjected(null);
      return;
    }
    setProjected(
      getDropTarget(frozenRef.current, String(active.id), String(over.id), delta.x),
    );
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over, delta } = e;
    const items = frozenRef.current;
    // Unfreeze BEFORE the Dexie await: the write triggers a fresh liveQuery
    // emission, and we want that re-render to use the live tree, not the frozen one.
    setActiveDragId(null);
    setProjected(null);
    if (!over) return;

    const id = String(active.id);
    const overId = String(over.id);
    const t = getDropTarget(items, id, overId, delta.x);
    if (!t) return;
    const item = items.find((i) => i.id === id);
    if (!item) return;
    // No-op: released on its own row without changing depth. Recomputing a
    // midpoint sortOrder here would differ from the stored value and trigger a
    // pointless write that slowly drifts the ordering.
    if (id === overId && item.parentId === t.parentId) return;
    if (item.parentId === t.parentId && item.sortOrder === t.sortOrder) return;

    if (item.kind === "folder") {
      // Cycle guard: never nest a folder into itself or a descendant.
      if (t.parentId === id || isDescendant(folders, t.parentId, id)) return;
      await updateConnectionFolder(id, {
        parentId: t.parentId,
        sortOrder: t.sortOrder,
      });
    } else {
      await updateConnection(id, {
        folderId: t.parentId,
        sortOrder: t.sortOrder,
      });
    }
  }

  function openAdd() {
    setEditConn(null);
    setConnDialogOpen(true);
  }
  function openEdit(connection: SavedConnection) {
    setEditConn(connection);
    setConnDialogOpen(true);
  }
  function handleDialogOpenChange(open: boolean) {
    setConnDialogOpen(open);
    if (!open) setEditConn(null);
  }

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

  // Tear down and re-establish a connection (re-validates credentials and
  // reloads its schema/capabilities).
  async function revalidate(id: string) {
    if ((statuses[id] ?? "disconnected") === "connected") {
      await disconnectConnection(id);
    }
    await connectConnection(id);
  }

  // Reload schema for every currently-connected connection.
  function refreshAllSchemas() {
    for (const c of connections) {
      if ((statuses[c.id] ?? "disconnected") === "connected") {
        void loadSchema(c.id);
      }
    }
  }

  // Per-connection actions, shared between the hover kebab (DropdownMenu) and
  // the right-click ContextMenu so the two stay in sync. `Item`/`Sep` are the
  // menu-item / separator components of whichever menu is rendering.
  function connActions(
    c: SavedConnection,
    Item: React.ElementType,
    Sep: React.ElementType,
  ) {
    const status = statuses[c.id] ?? "disconnected";
    const adminCaps = capabilities[c.id]?.admin;
    const connected = status === "connected";
    return (
      <>
        {connected ? (
          <Item onClick={() => void disconnectConnection(c.id)}>
            <Power className="mr-2 size-3.5" /> Disconnect
          </Item>
        ) : (
          <Item
            onClick={() => {
              selectConnection(c.id);
              void connectConnection(c.id);
            }}
          >
            <Power className="mr-2 size-3.5" /> Connect
          </Item>
        )}
        <Item onClick={() => void revalidate(c.id)}>
          <RotateCw className="mr-2 size-3.5" /> Revalidate
        </Item>
        <Item disabled={!connected} onClick={() => void loadSchema(c.id)}>
          <RefreshCw className="mr-2 size-3.5" /> Refresh tables
        </Item>
        {adminCaps && (
          <Item
            onClick={() => {
              selectConnection(c.id);
              setAdminView(true);
            }}
          >
            <Shield className="mr-2 size-3.5" /> Admin
          </Item>
        )}
        <Sep />
        <Item onClick={() => openEdit(c)}>
          <Pencil className="mr-2 size-3.5" /> Edit…
        </Item>
        {!c.isDefault && (
          <Item onClick={() => void setAsDefault(c.id)}>
            <Star className="mr-2 size-3.5" /> Set as default
          </Item>
        )}
        <Sep />
        <Item
          className="text-destructive focus:text-destructive"
          onClick={() => setPendingDelete(c)}
        >
          <Trash2 className="mr-2 size-3.5" /> Delete
        </Item>
      </>
    );
  }

  return (
    <div>
      {/* Section header (collapsible) + actions */}
      <div className="flex items-center gap-1 px-2 py-1">
        <button
          onClick={() => setSectionOpen((v) => !v)}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1 text-left",
            NAV_BTN_FOCUS,
          )}
          aria-expanded={sectionOpen}
        >
          {sectionOpen ? (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground/60" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
          )}
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Connections
          </span>
        </button>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          onClick={() => setExportImport("import")}
          title="Import connections"
        >
          <Upload className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          onClick={() => setExportImport("export")}
          title="Export connections"
        >
          <Download className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          onClick={() => void addFolder(null)}
          title="New folder"
        >
          <FolderPlus className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          onClick={openAdd}
          title="Add connection"
        >
          <Plus className="size-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              title="More actions"
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Connections
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => void loadConnections()}>
              <RefreshCw className="mr-2 size-3.5" /> Refresh connections
            </DropdownMenuItem>
            <DropdownMenuItem onClick={refreshAllSchemas}>
              <RefreshCw className="mr-2 size-3.5" /> Refresh all schemas
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setDbeaverOpen(true)}>
              <HardDriveDownload className="mr-2 size-3.5" /> Migrate from DBeaver…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {sectionOpen && (
        <>
          {/* Own filter box (only when not externally controlled) */}
          {!controlled && (
            <div className="px-2 pb-1.5">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={localQ}
                  onChange={(e) => setLocalQ(e.target.value)}
                  placeholder="Filter tables…"
                  className="h-7 pl-7 text-xs"
                />
              </div>
            </div>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={() => {
              setActiveDragId(null);
              setProjected(null);
            }}
          >
          <SortableContext
            items={displayIds}
            strategy={verticalListSortingStrategy}
          >
          <div className="pb-1 text-sm">
            {displayItems.map((item) => {
              // The dragged row follows the live horizontal projection so its
              // indent previews where it will nest.
              const depth =
                item.id === activeDragId && projected
                  ? projected.depth
                  : item.depth;

              if (item.kind === "folder") {
                const f = folderById.get(item.id);
                if (!f) return null;
                return (
                  <SortableRow key={f.id} id={f.id} disabled={dndDisabled}>
                    {({ setNodeRef, style, attributes, listeners, isDragging }) => (
                      <FolderRow
                        folder={f}
                        depth={depth}
                        collapsed={collapsedFolders.has(f.id)}
                        onToggle={() => toggleFolder(f.id)}
                        onRename={(name) =>
                          void updateConnectionFolder(f.id, { name })
                        }
                        onNewSubfolder={() => void addFolder(f.id)}
                        onDelete={() => void deleteConnectionFolder(f.id)}
                        innerRef={setNodeRef}
                        style={style}
                        isDragging={isDragging}
                        dragHandle={
                          dndDisabled ? null : (
                            <DragHandle
                              attributes={attributes}
                              listeners={listeners}
                            />
                          )
                        }
                      />
                    )}
                  </SortableRow>
                );
              }

              const c = connById.get(item.id);
              if (!c) return null;
              const meta = ENGINES[c.engine];
              const Icon = meta.icon;
              const status = statuses[c.id] ?? "disconnected";
              const isOpen = !!openConn[c.id];
              const cache = schemas[c.id] ?? null;
              const isActive = c.id === activeId;

              return (
                <SortableRow key={c.id} id={c.id} disabled={dndDisabled}>
                  {({ setNodeRef, style, attributes, listeners, isDragging }) => (
                    <div
                      ref={setNodeRef}
                      style={{ ...style, paddingLeft: depth * INDENT_PX }}
                      className={cn(isDragging && "opacity-40")}
                    >
                      {/* Connection row (right-click opens the context menu) */}
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <div
                            data-vim-row
                            data-vim-id={`conn:${c.id}`}
                            data-vim-depth={depth}
                            data-vim-expandable
                            data-vim-open={isOpen ? "1" : "0"}
                            className={cn(
                              "group relative flex w-full items-center gap-1.5 px-2 py-1.5",
                              isActive
                                ? "bg-accent text-accent-foreground"
                                : "hover:bg-accent/50",
                            )}
                          >
                            <button
                              data-vim-primary
                              data-vim-toggle
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
                                    isActive
                                      ? "text-accent-foreground/80"
                                      : "text-muted-foreground",
                                  )}
                                />
                              ) : (
                                <ChevronRight
                                  className={cn(
                                    "size-3 shrink-0",
                                    isActive
                                      ? "text-accent-foreground/80"
                                      : "text-muted-foreground",
                                  )}
                                />
                              )}
                              <span
                                className={cn("size-2 shrink-0 rounded-full", meta.dot)}
                              />
                              <Icon
                                className={cn(
                                  "size-4 shrink-0",
                                  isActive
                                    ? "text-accent-foreground/80"
                                    : "text-muted-foreground",
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

                            {!dndDisabled && (
                              <DragHandle
                                attributes={attributes}
                                listeners={listeners}
                                className="absolute right-8 top-1/2 -translate-y-1/2"
                              />
                            )}

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
                              <DropdownMenuContent align="end" className="w-48">
                                {connActions(c, DropdownMenuItem, DropdownMenuSeparator)}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-52">
                          {connActions(c, ContextMenuItem, ContextMenuSeparator)}
                        </ContextMenuContent>
                      </ContextMenu>

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

                            // One table/view row. Extracted so the Tables and
                            // Views group folders can each render their subset.
                            const renderTableRow = (t: TableInfo) => {
                              const tk = `${c.id}:${s.name}.${t.name}`;
                              const tableOpen = !!openTable[tk];
                              const colKey = `${s.name}.${t.name}`;
                              const cols = cache.columns[colKey];
                              return (
                                <div key={tk}>
                                  <div
                                    data-vim-row
                                    data-vim-id={`table:${tk}`}
                                    data-vim-depth={depth + 3}
                                    data-vim-expandable
                                    data-vim-open={tableOpen ? "1" : "0"}
                                    className="flex w-full items-center gap-1.5 py-1 pl-11 pr-2 hover:bg-accent"
                                  >
                                    <button
                                      data-vim-toggle
                                      onClick={() => {
                                        setOpenTable((o) => ({ ...o, [tk]: !o[tk] }));
                                        if (!cols) {
                                          void expandTable(c.id, s.name, t.name);
                                        }
                                      }}
                                      className={cn("shrink-0", NAV_BTN_FOCUS)}
                                      title={
                                        tableOpen ? "Collapse columns" : "Expand columns"
                                      }
                                    >
                                      {tableOpen ? (
                                        <ChevronDown className="size-3 text-muted-foreground" />
                                      ) : (
                                        <ChevronRight className="size-3 text-muted-foreground" />
                                      )}
                                    </button>
                                    <button
                                      data-vim-primary
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
                                        data-vim-row
                                        data-vim-id={`col:${tk}:${col.name}`}
                                        data-vim-depth={depth + 4}
                                        className="flex items-center gap-1.5 py-0.5 pl-[68px] pr-2 text-xs hover:bg-accent"
                                      >
                                        <span className="truncate">{col.name}</span>
                                        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                                          {col.type}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              );
                            };

                            const tableItems = visibleTables.filter(
                              (t) => !isViewType(t.type),
                            );
                            const viewItems = visibleTables.filter((t) =>
                              isViewType(t.type),
                            );

                            // A collapsible "Tables" / "Views" folder under the
                            // database. Rendered only when it has members.
                            const renderGroup = (
                              label: string,
                              items: TableInfo[],
                              suffix: string,
                            ) => {
                              if (!items.length) return null;
                              const gk = `${sk}:${suffix}`;
                              const groupOpen =
                                (openGroup[gk] ?? true) || needle.length > 0;
                              return (
                                <div key={gk}>
                                  <button
                                    data-vim-row
                                    data-vim-id={`group:${gk}`}
                                    data-vim-depth={depth + 2}
                                    data-vim-expandable
                                    data-vim-open={groupOpen ? "1" : "0"}
                                    data-vim-primary
                                    data-vim-toggle
                                    onClick={() =>
                                      setOpenGroup((o) => ({
                                        ...o,
                                        [gk]: !(o[gk] ?? true),
                                      }))
                                    }
                                    className={cn(
                                      "flex w-full items-center gap-1.5 py-1 pl-9 pr-2 hover:bg-accent",
                                      NAV_BTN_FOCUS,
                                    )}
                                  >
                                    {groupOpen ? (
                                      <ChevronDown className="size-3 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="size-3 text-muted-foreground" />
                                    )}
                                    <Folder className="size-3.5 text-muted-foreground" />
                                    <span className="truncate text-[13px]">{label}</span>
                                    <span className="ml-auto text-[10px] text-muted-foreground">
                                      {items.length}
                                    </span>
                                  </button>
                                  {groupOpen && items.map(renderTableRow)}
                                </div>
                              );
                            };

                            return (
                              <div key={sk}>
                                <button
                                  data-vim-row
                                  data-vim-id={`schema:${sk}`}
                                  data-vim-depth={depth + 1}
                                  data-vim-expandable
                                  data-vim-open={expanded ? "1" : "0"}
                                  data-vim-primary
                                  data-vim-toggle
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

                                {expanded && (
                                  <>
                                    {renderGroup("Tables", tableItems, "tables")}
                                    {renderGroup("Views", viewItems, "views")}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </SortableRow>
              );
            })}

            {!flatItems.length && (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground space-y-2">
                <div>No connections yet.</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDbeaverOpen(true)}
                >
                  <HardDriveDownload className="mr-2 size-3.5" /> Migrate from DBeaver
                </Button>
              </div>
            )}
          </div>
          </SortableContext>
          </DndContext>
        </>
      )}

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

      <ExportImportDialog
        open={exportImport !== null}
        onOpenChange={(open) => {
          if (!open) setExportImport(null);
        }}
        connections={connections as ConnectionDisplay[]}
        defaultTab={exportImport ?? "export"}
      />

      <DbeaverImportDialog
        open={dbeaverOpen}
        onOpenChange={setDbeaverOpen}
        existingNames={new Set(connections.map((c) => c.name))}
      />

      <NewConnectionDialog
        open={connDialogOpen}
        onOpenChange={handleDialogOpenChange}
        editing={editConn}
      />
    </div>
  );
}
