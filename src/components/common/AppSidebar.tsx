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
import ConnectionsSection from "@/features/workbench/ConnectionsSection";
import SavedQueriesSection from "./SavedQueriesSection";
import CommandPalette, { type PaletteDest } from "./CommandPalette";

// ─── Navigation destinations ──────────────────────────────────────────────
const PRIMARY: PaletteDest[] = [
  { to: "/", label: "Workbench", icon: SquareTerminal },
  { to: "/dashboards", label: "Dashboards", icon: LayoutDashboard },
  { to: "/search", label: "Search", icon: Search },
  { to: "/logs", label: "Logs", icon: ScrollText },
  { to: "/services", label: "Services", icon: Network },
  { to: "/sessions", label: "Sessions", icon: PlaySquare },
  { to: "/alerts", label: "Alerts", icon: Bell },
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
  const location = useLocation();
  const pathname = location.pathname;
  const isWorkbench = pathname === "/";

  const [width, setWidth] = useState(readWidth);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [filter, setFilter] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);

  const [navOpen, setNavOpen] = useState(true);
  const [savedOpen, setSavedOpen] = useState(true);

  const draggingRef = useRef(false);

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

  // ⌘/Ctrl+B collapse, ⌘/Ctrl+K palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setCollapsed((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
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
    ...(isServerAvailable ? PRIMARY : []),
    ...(isServerAvailable && isAdmin ? [ADMIN_DEST] : []),
    SETTINGS_DEST,
  ];

  // Collapsed: a slim reveal strip.
  if (collapsed) {
    return (
      <div className="flex h-screen w-7 shrink-0 flex-col items-center border-r border-border bg-card py-2">
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
    );
  }

  return (
    <>
      <aside
        className="relative flex h-screen shrink-0 flex-col border-r border-border bg-card"
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

        {/* Shared filter (drives the connection tree) */}
        <div className="border-b border-border px-2 py-2">
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

        {/* Outline */}
        <ScrollArea className="flex-1">
          <div className="py-1.5">
            {/* NAVIGATE */}
            <SectionGroup label="Navigate" open={navOpen} onToggle={() => setNavOpen((v) => !v)}>
              <div className="px-1">
                {isServerAvailable &&
                  PRIMARY.map((d) => (
                    <NavRow key={d.to} dest={d} active={isActive(d.to)} />
                  ))}
                {isServerAvailable && isAdmin && (
                  <NavRow dest={ADMIN_DEST} active={isActive(ADMIN_DEST.to)} />
                )}
                <div className="mx-2 my-1 border-t border-border/50" />
                <NavRow dest={SETTINGS_DEST} active={isActive(SETTINGS_DEST.to)} />
              </div>
            </SectionGroup>

            {/* CONNECTIONS + SAVED QUERIES — workbench route only */}
            {isWorkbench && (
              <>
                <div className="mx-3 my-1.5 border-t border-border/40" />
                <ConnectionsSection filter={filter} />
                <div className="mx-3 my-1.5 border-t border-border/40" />
                <SectionGroup
                  label="Saved Queries"
                  open={savedOpen}
                  onToggle={() => setSavedOpen((v) => !v)}
                >
                  <SavedQueriesSection />
                </SectionGroup>
              </>
            )}
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
                  <CommandShortcut>⌘/Ctrl + K</CommandShortcut>
                </div>
                <div className="flex items-center justify-between">
                  <span>Run query</span>
                  <CommandShortcut>⌘/Ctrl + Enter</CommandShortcut>
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

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        destinations={paletteDests}
      />
    </>
  );
}
