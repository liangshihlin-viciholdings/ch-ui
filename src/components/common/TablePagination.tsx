import { useEffect, useRef, useState } from "react";
import type { Table } from "@tanstack/react-table";
import {
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Clock,
  Database,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBytes, formatDuration, formatNumber } from "@/lib/formatters";

export interface TablePaginationStatistics {
  elapsed: number;
  rows_read: number;
  bytes_read: number;
}

interface TablePaginationProps<TData> {
  table: Table<TData>;
  statistics?: TablePaginationStatistics | null;
  /** Controlled open state for the "go to page" dialog (opened via Vim `gp`). */
  goToPageOpen?: boolean;
  onGoToPageOpenChange?: (open: boolean) => void;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * Footer for `DataTable` — renders query statistics on the left and
 * pagination controls (first/prev/page input/next/last + page size) on
 * the right. Built for the TanStack Table pagination API.
 */
export function TablePagination<TData>({
  table,
  statistics,
  goToPageOpen = false,
  onGoToPageOpenChange,
}: TablePaginationProps<TData>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const wheelDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gotoValue, setGotoValue] = useState("");

  const pageIndex = table.getState().pagination.pageIndex;
  const pageSize = table.getState().pagination.pageSize;
  const totalPages = Math.max(table.getPageCount(), 1);
  const totalRows = table.getFilteredRowModel().rows.length;
  const currentPage = pageIndex + 1;

  const goToPage = (page: number) => {
    const clamped = Math.max(1, Math.min(page, totalPages));
    table.setPageIndex(clamped - 1);
  };

  // Seed the dialog input with the current page each time it opens.
  useEffect(() => {
    if (goToPageOpen) setGotoValue(String(currentPage));
  }, [goToPageOpen, currentPage]);

  const submitGoToPage = () => {
    const page = parseInt(gotoValue, 10);
    if (!Number.isNaN(page)) goToPage(page);
    onGoToPageOpenChange?.(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const value = inputRef.current?.value ?? "";
      const page = parseInt(value, 10);
      if (!Number.isNaN(page)) goToPage(page);
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      if (inputRef.current) inputRef.current.value = String(currentPage);
      inputRef.current?.blur();
    }
  };

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const page = parseInt(e.target.value, 10);
    if (!Number.isNaN(page)) {
      goToPage(page);
    } else {
      e.target.value = String(currentPage);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (wheelDebounceRef.current) clearTimeout(wheelDebounceRef.current);
    const delta = e.deltaY < 0 ? 1 : -1;
    const target = Math.max(1, Math.min(currentPage + delta, totalPages));
    if (inputRef.current) inputRef.current.value = String(target);
    wheelDebounceRef.current = setTimeout(() => {
      goToPage(target);
      wheelDebounceRef.current = null;
    }, 150);
  };

  const handlePageSizeChange = (value: string) => {
    const next = parseInt(value, 10);
    if (!Number.isNaN(next)) table.setPageSize(next);
  };

  const getRowRangeDisplay = () => {
    if (totalRows === 0) return "0 - 0 of 0";
    const startRow = pageIndex * pageSize + 1;
    const endRow = Math.min((pageIndex + 1) * pageSize, totalRows);
    return `${startRow} - ${endRow} of ${totalRows}`;
  };

  return (
    <>
    <div className="flex items-center justify-between border-t bg-background px-2 py-1">
      {/* Left: statistics */}
      <div className="flex items-center gap-3 sm:gap-4">
        {statistics ? (
          <>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Clock className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="font-mono">{formatDuration(statistics.elapsed)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <FileText className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="hidden sm:inline">
                {formatNumber(statistics.rows_read)} rows
              </span>
              <span className="sm:hidden font-mono">
                {formatNumber(statistics.rows_read)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Database className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="font-mono">{formatBytes(statistics.bytes_read)}</span>
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">
            No statistics available
          </div>
        )}
      </div>

      {/* Right: pagination controls (only when multi-page) */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1">
            <span className="text-xs whitespace-nowrap">Page Size:</span>
            <Select
              value={String(pageSize)}
              onValueChange={handlePageSizeChange}
            >
              <SelectTrigger className="h-6 w-16 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <span className="text-xs text-muted-foreground mx-2 whitespace-nowrap">
            {getRowRangeDisplay()}
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(1)}
            disabled={currentPage === 1}
            title="First page"
            className="h-6 w-6 p-0"
          >
            <ChevronsLeft className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            title="Previous page"
            className="h-6 w-6 p-0"
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>

          <div className="flex items-center gap-1">
            <span className="text-xs">Page</span>
            <Input
              ref={inputRef}
              type="text"
              // Using defaultValue keeps the input from fighting with
              // TanStack Table updates; we sync via key on currentPage.
              key={`${currentPage}-${totalPages}`}
              defaultValue={String(currentPage)}
              onKeyDown={handleInputKeyDown}
              onBlur={handleInputBlur}
              onWheel={handleWheel}
              className="h-6 w-12 text-center text-xs"
              aria-label="Current page"
            />
            <span className="text-xs">of {totalPages}</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            title="Next page"
            className="h-6 w-6 p-0"
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(totalPages)}
            disabled={currentPage === totalPages}
            title="Last page"
            className="h-6 w-6 p-0"
          >
            <ChevronsRight className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>

    <Dialog open={goToPageOpen} onOpenChange={onGoToPageOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Go to page</DialogTitle>
          <DialogDescription>
            Enter a page number (1–{totalPages}).
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          type="number"
          min={1}
          max={totalPages}
          value={gotoValue}
          onChange={(e) => setGotoValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitGoToPage();
            }
          }}
          className="h-8 text-sm"
          aria-label="Page number"
        />
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onGoToPageOpenChange?.(false)}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={submitGoToPage}>
            Go
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
