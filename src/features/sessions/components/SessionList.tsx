// src/features/sessions/components/SessionList.tsx
// Top-level list view for user sessions. Uses TanStack Table for sorting /
// pagination. Row click drives a full-page session detail view.

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
  PlaySquare,
  RefreshCcw,
  Search,
  Users,
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
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import SessionDetail from "@/features/sessions/components/SessionDetail";
import { useSessions } from "@/features/sessions/hooks/useSessions";
import type {
  SessionListRange,
  SessionSummary,
} from "@/features/sessions/types";

const TIME_RANGE_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
  hours: number;
}> = [
  { value: "1h", label: "Last hour", hours: 1 },
  { value: "6h", label: "Last 6 hours", hours: 6 },
  { value: "24h", label: "Last 24 hours", hours: 24 },
  { value: "7d", label: "Last 7 days", hours: 168 },
];

function toRange(hours: number): SessionListRange {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  return { start, end };
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default function SessionList() {
  const [rangeKey, setRangeKey] = useState<string>("24h");
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "startTime", desc: true },
  ]);
  const [selected, setSelected] = useState<SessionSummary | null>(null);

  const range = useMemo<SessionListRange>(() => {
    const hours =
      TIME_RANGE_OPTIONS.find((opt) => opt.value === rangeKey)?.hours ?? 24;
    return toRange(hours);
  }, [rangeKey]);

  const { data, isLoading, error, refetch, isFetching } = useSessions({
    range,
    search,
  });

  const columns = useMemo<ColumnDef<SessionSummary>[]>(
    () => [
      {
        accessorKey: "sessionId",
        header: "Session",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.sessionId.slice(0, 12)}…
          </span>
        ),
      },
      {
        accessorKey: "userId",
        header: "User",
        cell: ({ row }) => row.original.userId ?? <span className="text-muted-foreground">anonymous</span>,
      },
      {
        accessorKey: "startTime",
        header: "Started",
        cell: ({ row }) => (
          <span className="tabular-nums text-xs">
            {formatDateTime(row.original.startTime)}
          </span>
        ),
      },
      {
        accessorKey: "durationMs",
        header: "Duration",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatDuration(row.original.durationMs)}
          </span>
        ),
      },
      {
        accessorKey: "eventCount",
        header: "Events",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.eventCount.toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "errorCount",
        header: "Errors",
        cell: ({ row }) =>
          row.original.errorCount > 0 ? (
            <Badge variant="destructive" className="">
              {row.original.errorCount}
            </Badge>
          ) : (
            <span className="text-muted-foreground">0</span>
          ),
      },
      {
        accessorKey: "firstUrl",
        header: "Entry URL",
        cell: ({ row }) =>
          row.original.firstUrl ? (
            <span className="truncate text-xs text-muted-foreground" title={row.original.firstUrl}>
              {row.original.firstUrl}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
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

  if (selected) {
    return (
      <SessionDetail
        session={selected}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Sessions</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="w-64 pl-8"
              placeholder="Search session / user..."
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

      <div className="flex-1 overflow-auto p-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Failed to load sessions</AlertTitle>
            <AlertDescription>
              {error.message}
              <div className="mt-1 text-xs opacity-80">
                Expected table: <code>otel_logs</code> with a{" "}
                <code>rum.sessionId</code> attribute.
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
            <PlaySquare className="mb-3 h-10 w-10 opacity-50" />
            <p className="text-sm">No sessions found for the selected range.</p>
            <p className="text-xs">
              Ensure your browser SDK tags events with <code>rum.sessionId</code>.
            </p>
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
                    onClick={() => setSelected(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="max-w-[280px] overflow-hidden truncate px-3 py-2"
                      >
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
    </div>
  );
}
