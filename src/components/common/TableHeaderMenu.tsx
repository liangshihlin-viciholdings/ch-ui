import React, { useCallback } from "react";
import type { Header, Table } from "@tanstack/react-table";
import {
  Pin,
  PinOff,
  ArrowLeftToLine,
  ArrowRightToLine,
  Maximize2,
  RotateCcw,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface TableHeaderMenuProps<TData> {
  header: Header<TData, unknown>;
  table: Table<TData>;
  children: React.ReactNode;
}

/**
 * Radix ContextMenu wrapper for TanStack Table header cells.
 *
 * Behaviors:
 * - Click to toggle sorting (Shift+click for multi-sort)
 * - Right-click for pin-left / pin-right / unpin / auto-size / reset
 */
export function TableHeaderMenu<TData>({
  header,
  table,
  children,
}: TableHeaderMenuProps<TData>) {
  const { column } = header;
  const canSort = column.getCanSort();
  const sortDir = column.getIsSorted();
  const pinned = column.getIsPinned();

  const handleSort = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Only react to primary button clicks — context menu uses right click.
      if (event.button !== 0 || !canSort) return;
      column.toggleSorting(undefined, event.shiftKey);
    },
    [canSort, column],
  );

  const handlePinLeft = useCallback(() => column.pin("left"), [column]);
  const handlePinRight = useCallback(() => column.pin("right"), [column]);
  const handleUnpin = useCallback(() => column.pin(false), [column]);

  const handleAutoSize = useCallback(() => {
    // TanStack Table is headless — autosizing is approximated by resetting
    // this column's width, which falls back to defaultColumn.size.
    column.resetSize();
  }, [column]);

  const handleResetColumns = useCallback(() => {
    table.resetColumnSizing();
    table.resetColumnPinning();
  }, [table]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={`flex w-full h-full items-center ${
            canSort ? "cursor-pointer" : "cursor-default"
          } select-none`}
          onClick={handleSort}
          onMouseDown={(e) => {
            if (e.detail > 1) e.preventDefault();
          }}
        >
          <span className="truncate">{children}</span>
          {sortDir && (
            <span className="ml-1 flex items-center text-muted-foreground">
              {sortDir === "asc" ? (
                <ArrowUp className="h-3 w-3" />
              ) : (
                <ArrowDown className="h-3 w-3" />
              )}
            </span>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {pinned !== "left" && (
          <ContextMenuItem onClick={handlePinLeft}>
            <ArrowLeftToLine className="mr-2 h-4 w-4" />
            Pin Left
          </ContextMenuItem>
        )}
        {pinned !== "right" && (
          <ContextMenuItem onClick={handlePinRight}>
            <ArrowRightToLine className="mr-2 h-4 w-4" />
            Pin Right
          </ContextMenuItem>
        )}
        {pinned && (
          <ContextMenuItem onClick={handleUnpin}>
            <PinOff className="mr-2 h-4 w-4" />
            Unpin
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        {column.getCanResize() && (
          <ContextMenuItem onClick={handleAutoSize}>
            <Maximize2 className="mr-2 h-4 w-4" />
            Reset Column Width
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={handleResetColumns}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset All Columns
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

TableHeaderMenu.displayName = "TableHeaderMenu";

// Re-export Pin icon as a no-op placeholder export so future consumers that
// rely on the lucide `Pin` symbol can import it from here if desired.
export { Pin };
