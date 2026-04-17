// src/features/patterns/components/PatternTable.tsx
// Groups log messages by normalized pattern. Exposed as a standalone panel
// so it can be mounted inside the Logs page or as a Search tab — there is
// no dedicated route for patterns.

import { useMemo, useState } from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  AlertCircle,
  BarChart3,
  RefreshCcw,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import PatternDetail from "@/features/patterns/components/PatternDetail";
import { usePatterns } from "@/features/patterns/hooks/usePatterns";
import type { LogPattern, PatternRange } from "@/features/patterns/types";

interface PatternTableProps {
  /** Optional override — defaults to a "Last hour" window. */
  range?: PatternRange;
  /** Hide the internal chrome (title / time selector) for embedding. */
  embed?: boolean;
}

const TIME_RANGE_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
  hours: number;
}> = [
  { value: "15m", label: "Last 15 minutes", hours: 0.25 },
  { value: "1h", label: "Last hour", hours: 1 },
  { value: "6h", label: "Last 6 hours", hours: 6 },
  { value: "24h", label: "Last 24 hours", hours: 24 },
];

function toRange(hours: number): PatternRange {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  return { start, end };
}

function formatRelative(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
    return `${Math.round(ms / 86_400_000)}d ago`;
  } catch {
    return iso;
  }
}

export default function PatternTable({ range: rangeProp, embed }: PatternTableProps) {
  const [rangeKey, setRangeKey] = useState<string>("1h");
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "count", desc: true },
  ]);
  const [selected, setSelected] = useState<LogPattern | null>(null);
  const [open, setOpen] = useState(false);

  const range = useMemo<PatternRange>(() => {
    if (rangeProp) return rangeProp;
    const hours =
      TIME_RANGE_OPTIONS.find((opt) => opt.value === rangeKey)?.hours ?? 1;
    return toRange(hours);
  }, [rangeKey, rangeProp]);

  const { data, isLoading, error, refetch, isFetching } = usePatterns({
    range,
    search,
  });

  const columns = useMemo<ColumnDef<LogPattern>[]>(
    () => [
      {
        accessorKey: "count",
        header: "Count",
        cell: ({ row }) => (
          <span className="tabular-nums font-medium">
            {row.original.count.toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "errorCount",
        header: "Errors",
        cell: ({ row }) =>
          row.original.errorCount > 0 ? (
            <Badge variant="destructive" className="">
              {row.original.errorCount.toLocaleString()}
            </Badge>
          ) : (
            <span className="text-muted-foreground">0</span>
          ),
      },
      {
        accessorKey: "pattern",
        header: "Pattern",
        cell: ({ row }) => (
          <span
            className="block max-w-[520px] truncate font-mono text-xs"
            title={row.original.pattern}
          >
            {row.original.pattern || "(empty)"}
          </span>
        ),
      },
      {
        accessorKey: "sample",
        header: "Sample",
        cell: ({ row }) => (
          <span
            className="block max-w-[320px] truncate text-xs text-muted-foreground"
            title={row.original.sample}
          >
            {row.original.sample}
          </span>
        ),
      },
      {
        accessorKey: "lastSeen",
        header: "Last seen",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatRelative(row.original.lastSeen)}
          </span>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: data ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  return (
    <div className="flex h-full w-full flex-col">
      {!embed && (
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Log Patterns</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="w-64 pl-8"
                placeholder="Filter by substring..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={rangeKey} onValueChange={setRangeKey}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCcw
                className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Failed to load log patterns</AlertTitle>
            <AlertDescription>
              {error.message}
              <div className="mt-1 text-xs opacity-80">
                Expected table: <code>otel_logs</code>.
              </div>
            </AlertDescription>
          </Alert>
        )}

        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {!isLoading && !error && (data ?? []).length === 0 && (
          <div className="flex h-[50vh] flex-col items-center justify-center text-center text-muted-foreground">
            <BarChart3 className="mb-3 h-10 w-10 opacity-50" />
            <p className="text-sm">No log patterns in the selected range.</p>
          </div>
        )}

        {!isLoading && !error && (data ?? []).length > 0 && (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                {table.getHeaderGroups().map((group) => (
                  <tr key={group.id}>
                    {group.headers.map((header) => (
                      <th
                        key={header.id}
                        className="cursor-pointer select-none border-b border-border px-3 py-2 text-left font-medium text-muted-foreground"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {header.column.getIsSorted() === "asc" && " ↑"}
                        {header.column.getIsSorted() === "desc" && " ↓"}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-b border-border/50 hover:bg-muted/50"
                    onClick={() => {
                      setSelected(row.original);
                      setOpen(true);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                Showing {table.getRowModel().rows.length} of {data?.length ?? 0}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!table.getCanPreviousPage()}
                  onClick={() => table.previousPage()}
                >
                  Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!table.getCanNextPage()}
                  onClick={() => table.nextPage()}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <PatternDetail
        pattern={selected}
        range={range}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}
