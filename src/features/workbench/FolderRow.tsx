// One folder row in the connections sidebar tree. Owns its inline-rename state;
// all persistence happens in the parent via the callbacks. The optional drag
// handle (Phase 4) is wired by the parent through `dragHandle` so this stays
// agnostic about dnd-kit.
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreVertical,
  Pencil,
  Trash2,
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
import { cn } from "@/lib/utils";
import type { ConnectionFolder } from "@/lib/db/schema";
import { INDENT_PX } from "./connectionTree";

const NAV_BTN_FOCUS =
  "rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

export default function FolderRow({
  folder,
  depth,
  collapsed,
  onToggle,
  onRename,
  onNewSubfolder,
  onDelete,
  dragHandle,
  innerRef,
  style,
  isDragging,
}: {
  folder: ConnectionFolder;
  depth: number;
  collapsed: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onNewSubfolder: () => void;
  onDelete: () => void;
  /** Optional drag-handle node (the grip), wired by the parent. */
  dragHandle?: React.ReactNode;
  /** Sortable node ref + transform style, supplied by the parent's SortableRow. */
  innerRef?: (el: HTMLElement | null) => void;
  style?: React.CSSProperties;
  isDragging?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guards the commit so Escape discards and the blur fired by unmounting the
  // input can't commit a second time after Enter/Escape already handled it.
  const committingRef = useRef(false);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function startRename() {
    committingRef.current = false;
    setDraft(folder.name);
    setEditing(true);
  }
  function commit() {
    if (committingRef.current) return;
    committingRef.current = true;
    const name = draft.trim();
    if (name && name !== folder.name) onRename(name);
    setEditing(false);
  }
  function cancelRename() {
    committingRef.current = true; // suppress the commit the unmount blur would fire
    setEditing(false);
  }

  return (
    <div
      ref={innerRef}
      className={cn(
        "group relative flex w-full items-center gap-1.5 py-1.5 pr-2 hover:bg-accent/50",
        isDragging && "opacity-40",
      )}
      style={{ ...style, paddingLeft: depth * INDENT_PX + 8 }}
    >
      {editing ? (
        // Rename input — rendered in PLACE of the toggle button, never nested
        // inside it (an <input> inside a <button> is invalid HTML and makes
        // Enter activate the button, toggling the folder).
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {collapsed ? (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          )}
          <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelRename();
              }
            }}
            className="h-6 px-1 py-0 text-[13px]"
            autoFocus
          />
        </div>
      ) : (
        <button
          onClick={onToggle}
          className={cn("flex min-w-0 flex-1 items-center gap-1.5 text-left", NAV_BTN_FOCUS)}
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          )}
          {collapsed ? (
            <Folder className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span
            className="min-w-0 truncate text-[13px] font-medium"
            onDoubleClick={startRename}
          >
            {folder.name}
          </span>
        </button>
      )}

      {dragHandle}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-6 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
            title="Folder actions"
          >
            <MoreVertical className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={startRename}>
            <Pencil className="mr-2 size-3.5" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onNewSubfolder}>
            <FolderPlus className="mr-2 size-3.5" /> New subfolder
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="mr-2 size-3.5" /> Delete folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
