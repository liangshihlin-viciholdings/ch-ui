// Merged "deebee" sidebar — one global left structure replacing the old icon
// rail and the workbench connection navigator.
//
//   NAVIGATE        always visible (gating preserved: isServerAvailable/isAdmin)
//   CONNECTIONS     workbench route only (the reusable ConnectionsSection)
//   SAVED QUERIES   workbench route only (active connection's queries)
//
// Drag the right edge to resize (persisted); ⌘/Ctrl+B hides it to a slim
// reveal strip; ⌘/Ctrl+K opens the command palette.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  SquareTerminal,
  LayoutDashboard,
  Search,
  ScrollText,
  Network,
  PlaySquare,
  Bell,
  ShieldCheck,
  Settings as SettingsIcon,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  LifeBuoy,
  Command as CommandIcon,
  type LucideIcon,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CommandShortcut } from "@/components/ui/command";
import { Logo } from "@/components/common/Logo";
import { cn } from "@/lib/utils";
import useAppStore from "@/stores/workspaceStore";
import { useWorkbenchStore } from "@/stores/workbenchStore";
import { editorStore } from "@/stores/editorStore";
import ConnectionsSection from "@/features/workbench/ConnectionsSection";
import SavedQueriesSection from "./SavedQueriesSection";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import CommandPalette, { type PaletteDest } from "./CommandPalette";

// ─── Navigation destinations ──────────────────────────────────────────────
// Each destination declares the capability it needs to be shown:
//   "always" — always visible (core / generic).
//   "any"    — any connection exists (multi-engine features: Dashboards, Alerts).
//   "ch"     — a ClickHouse-backed legacy connection is available (isServerAvailable);
//              these features query CH/OTel data through the legacy path.
type NavGate = "always" | "any" | "ch";
interface NavDest extends PaletteDest {
  gate: NavGate;
}

const NAV_PRIMARY: NavDest[] = [
  { to: "/", label: "Workbench", icon: SquareTerminal, gate: "always" },
  { to: "/dashboards", label: "Dashboards", icon: LayoutDashboard, gate: "any" },
  { to: "/alerts", label: "Alerts", icon: Bell, gate: "any" },
  { to: "/search", label: "Search", icon: Search, gate: "ch" },
  { to: "/logs", label: "Logs", icon: ScrollText, gate: "ch" },
  { to: "/services", label: "Services", icon: Network, gate: "ch" },
  { to: "/sessions", label: "Sessions", icon: PlaySquare, gate: "ch" },
];
const ADMIN_DEST: PaletteDest = { to: "/admin", label: "Admin", icon: ShieldCheck };
const SETTINGS_DEST: PaletteDest = { to: "/settings", label: "Settings", icon: SettingsIcon };

// ─── Width / collapse persistence ───────────────────────────────────────────
const WIDTH_KEY = "deebee-sidebar-width";
const COLLAPSED_KEY = "deebee-sidebar-collapsed";
const MIN_W = 240;
const MAX_W = 560;
const DEFAULT_W = 288;

function readWidth(): number {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(v) && v >= MIN_W && v <= MAX_W) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_W;
}
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

// ─── Collapsible section group (shared look with ConnectionsSection) ─────────
function SectionGroup({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-0.5">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-1 px-2 py-1 text-left"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground/60" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
        )}
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          {label}
        </span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

function NavRow({ dest, active }: { dest: PaletteDest; active: boolean }) {
  const Icon: LucideIcon = dest.icon;
  return (
    <Link
      to={dest.to}
      data-vim-row
      data-vim-id={`nav:${dest.to}`}
      data-vim-depth={0}
      data-vim-primary
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]",
        active
          ? "bg-accent font-medium text-accent-foreground"
          : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 truncate">{dest.label}</span>
    </Link>
  );
}

export default function AppSidebar() {
  const { isServerAvailable, isAdmin } = useAppStore();
  const connections = useWorkbenchStore((s) => s.connections);
  // Capability flags drive which destinations appear.
  const hasAnyConnection = isServerAvailable || connections.length > 0;
  const canShow = (gate: NavGate): boolean =>
    gate === "always" ? true : gate === "any" ? hasAnyConnection : isServerAvailable;
  const location = useLocation();
  const pathname = location.pathname;

  const [width, setWidth] = useState(readWidth);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [filter, setFilter] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);

  const [navOpen, setNavOpen] = useState(true);

  const draggingRef = useRef(false);

  // ── Vim sidebar roving cursor ──────────────────────────────────────────────
  // A single DOM-driven cursor over every visible sidebar row (nav links +
  // connection tree + saved queries). Rows self-describe via data-vim-* so this
  // handler stays generic and ConnectionsSection/FolderRow/SavedQueries only add
  // inert attributes. Active only when Vim Mode is on; ignores typing fields so
  // the filter inputs keep working.
  const focusedVimIdRef = useRef<string | null>(null);
  const pendingGRef = useRef(false);

  const handleSidebarVimKey = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (!editorStore.state.vimMode) return;
      const target = e.target as HTMLElement;
      if (
        /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
        target.isContentEditable
      )
        return;
      // Let the global layer own Ctrl-chord pane moves.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const aside = e.currentTarget;
      const rows = Array.from(
        aside.querySelectorAll<HTMLElement>("[data-vim-row]"),
      );
      if (!rows.length) return;
      const idx = rows.findIndex(
        (r) => r.dataset.vimId === focusedVimIdRef.current,
      );

      const focusRow = (i: number) => {
        const el = rows[i];
        if (!el) return;
        focusedVimIdRef.current = el.dataset.vimId ?? null;
        rows.forEach((r) => r.removeAttribute("data-vim-active"));
        el.setAttribute("data-vim-active", "true");
        el.scrollIntoView({ block: "nearest" });
      };
      // The clickable may be the row element itself (nav link, saved query) or a
      // descendant (tree rows). querySelector only searches descendants, so check
      // the row first.
      const pick = (row: HTMLElement, sel: string): HTMLElement | null =>
        row.matches(sel) ? row : row.querySelector<HTMLElement>(sel);

      // gg → top (two-key). A lone g arms; any other key disarms below.
      if (e.key === "g") {
        if (pendingGRef.current) {
          pendingGRef.current = false;
          e.preventDefault();
          focusRow(0);
        } else {
          pendingGRef.current = true;
          setTimeout(() => {
            pendingGRef.current = false;
          }, 600);
        }
        return;
      }
      pendingGRef.current = false;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          focusRow(idx < 0 ? 0 : Math.min(idx + 1, rows.length - 1));
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          focusRow(idx < 0 ? 0 : Math.max(idx - 1, 0));
          break;
        case "G":
          e.preventDefault();
          focusRow(rows.length - 1);
          break;
        case "l":
        case "ArrowRight":
        case "Enter": {
          e.preventDefault();
          if (idx < 0) {
            focusRow(0);
            break;
          }
          const row = rows[idx];
          const expandable = row.hasAttribute("data-vim-expandable");
          const open = row.dataset.vimOpen === "1";
          if ((e.key === "l" || e.key === "ArrowRight") && expandable && !open) {
            pick(row, "[data-vim-toggle]")?.click();
          } else {
            (
              pick(row, "[data-vim-primary]") ?? pick(row, "[data-vim-toggle]")
            )?.click();
          }
          break;
        }
        case "h":
        case "ArrowLeft": {
          if (idx < 0) break;
          e.preventDefault();
          const row = rows[idx];
          const expandable = row.hasAttribute("data-vim-expandable");
          const open = row.dataset.vimOpen === "1";
          if (expandable && open) {
            pick(row, "[data-vim-toggle]")?.click();
          } else {
            const depth = Number(row.dataset.vimDepth ?? "0");
            for (let i = idx - 1; i >= 0; i--) {
              if (Number(rows[i].dataset.vimDepth ?? "0") < depth) {
                focusRow(i);
                break;
              }
            }
          }
          break;
        }
      }
    },
    [],
  );

  // Persist width / collapsed.
  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      /* ignore */
    }
  }, [width]);
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  // ⌘/Ctrl+B collapse; command palette on ⌘/Ctrl+K — except when Vim Mode is on,
  // where Ctrl+K is reassigned to pane navigation, so the palette answers to
  // Ctrl+P instead (⌘K still works on Mac).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setCollapsed((v) => !v);
      }
      const vimOn = editorStore.state.vimMode;
      const paletteChord =
        (e.metaKey && e.key === "k") ||
        (!e.metaKey && e.ctrlKey && (vimOn ? e.key === "p" : e.key === "k"));
      if (paletteChord) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Drag-to-resize the right edge.
  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const next = Math.min(MAX_W, Math.max(MIN_W, ev.clientX));
      setWidth(next);
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const isActive = (to: string) =>
    to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");

  const paletteDests: PaletteDest[] = [
    ...NAV_PRIMARY.filter((d) => canShow(d.gate)),
    ...(isServerAvailable && isAdmin ? [ADMIN_DEST] : []),
    SETTINGS_DEST,
  ];

  return (
    <>
      {collapsed ? (
        // Collapsed: a slim reveal strip.
        <div
          data-vim-pane="sidebar"
          tabIndex={-1}
          onKeyDown={(e) => {
            // Vim: l / Enter / → expands the collapsed sidebar so there's
            // something to navigate into.
            if (
              editorStore.state.vimMode &&
              (e.key === "l" || e.key === "Enter" || e.key === "ArrowRight")
            ) {
              e.preventDefault();
              setCollapsed(false);
            }
          }}
          className="flex h-screen w-7 shrink-0 flex-col items-center border-r border-border bg-card py-2 outline-none"
        >
          <Button
            size="icon"
            variant="ghost"
            className="size-6"
            onClick={() => setCollapsed(false)}
            title="Show sidebar (Cmd/Ctrl+B)"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ) : (
        <aside
          data-vim-pane="sidebar"
          tabIndex={-1}
          onKeyDown={handleSidebarVimKey}
          className="relative flex h-screen shrink-0 flex-col border-r border-border bg-card outline-none focus:ring-2 focus:ring-inset focus:ring-ring/40"
          style={{ width }}
        >
        {/* Brand header */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Link to="/" className="flex min-w-0 flex-1 items-center gap-2">
            <Logo size={24} />
            <span className="truncate text-lg font-semibold lowercase tracking-tight">
              deebee
            </span>
          </Link>
          <Button
            size="icon"
            variant="ghost"
            className="size-6"
            onClick={() => setCollapsed(true)}
            title="Hide sidebar (Cmd/Ctrl+B)"
          >
            <ChevronLeft className="size-4" />
          </Button>
        </div>

        {/* Outline */}
        <ScrollArea className="flex-1">
          <div className="py-1.5">
            {/* NAVIGATE */}
            <SectionGroup label="Navigate" open={navOpen} onToggle={() => setNavOpen((v) => !v)}>
              <div className="px-1">
                {NAV_PRIMARY.filter((d) => canShow(d.gate)).map((d) => (
                  <NavRow key={d.to} dest={d} active={isActive(d.to)} />
                ))}
                {isServerAvailable && isAdmin && (
                  <NavRow dest={ADMIN_DEST} active={isActive(ADMIN_DEST.to)} />
                )}
                <div className="mx-2 my-1 border-t border-border/50" />
                <NavRow dest={SETTINGS_DEST} active={isActive(SETTINGS_DEST.to)} />
              </div>
            </SectionGroup>

            {/* CONNECTIONS + SAVED QUERIES */}
            <>
              <div className="mx-3 my-1.5 border-t border-border/40" />
              <Tabs defaultValue="connections">
                <TabsList className="mx-2 grid h-7 w-auto grid-cols-2 p-0.5">
                  <TabsTrigger
                    value="connections"
                    className="h-6 px-2 text-[11px]"
                  >
                    Connections
                  </TabsTrigger>
                  <TabsTrigger value="saved" className="h-6 px-2 text-[11px]">
                    Saved Queries
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="connections" className="mt-1.5">
                  {/* Filter — sits above the connection tree it filters */}
                  <div className="px-2 pb-1">
                    <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
                      <Search className="size-3.5 shrink-0 text-muted-foreground/50" />
                      <input
                        type="text"
                        placeholder="Filter tables…"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="min-w-0 flex-1 bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground/50"
                      />
                      {filter && (
                        <button
                          onClick={() => setFilter("")}
                          className="shrink-0 text-[11px] text-muted-foreground/40 hover:text-muted-foreground"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                  <ConnectionsSection filter={filter} />
                </TabsContent>
                <TabsContent value="saved" className="mt-1.5">
                  <SavedQueriesSection />
                </TabsContent>
              </Tabs>
            </>
          </div>
        </ScrollArea>

        {/* Footer */}
        <Separator />
        <div className="flex items-center justify-between px-2 py-1.5">
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Command palette (Cmd/Ctrl+K)"
          >
            <CommandIcon className="size-3.5" />
            <span>Search</span>
            <CommandShortcut>⌘K</CommandShortcut>
          </button>
          <Sheet>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" className="size-7" title="Help">
                <LifeBuoy className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Keyboard shortcuts</SheetTitle>
                <SheetDescription>Handy commands in deebee.</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Toggle sidebar</span>
                  <CommandShortcut>⌘/Ctrl + B</CommandShortcut>
                </div>
                <div className="flex items-center justify-between">
                  <span>Command palette</span>
                  <CommandShortcut>⌘K / Ctrl+K</CommandShortcut>
                </div>
                <div className="flex items-center justify-between">
                  <span>Run query</span>
                  <CommandShortcut>⌘/Ctrl + Enter</CommandShortcut>
                </div>
                <div className="mt-3 mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Vim mode
                </div>
                <div className="flex items-center justify-between">
                  <span>Move between panes</span>
                  <CommandShortcut>Ctrl + h/j/k/l</CommandShortcut>
                </div>
                <div className="flex items-center justify-between">
                  <span>Next / prev query tab</span>
                  <CommandShortcut>gt / gT</CommandShortcut>
                </div>
                <div className="flex items-center justify-between">
                  <span>Command palette (vim)</span>
                  <CommandShortcut>Ctrl+P / ⌘K</CommandShortcut>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={startDrag}
          className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-ring/40"
          title="Drag to resize"
        />
        </aside>
      )}

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        destinations={paletteDests}
      />
    </>
  );
}
