import { useMemo, useRef, useState, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnPinningState,
  type ColumnSizingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Copy } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { TableHeaderMenu } from "./TableHeaderMenu";
import {
  TablePagination,
  type TablePaginationStatistics,
} from "./TablePagination";
import type { QueryResult } from "@/types/common";

/** Datasets larger than this disable non-essential animations. */
const LARGE_DATASET = 500;

const ROW_NUM_COLUMN_ID = "__row_num";
const ROW_NUM_COLUMN_WIDTH = 60;
const DEFAULT_COLUMN_WIDTH = 180;
const DEFAULT_ROW_HEIGHT = 32;

type Row = Record<string, unknown>;

export interface DataTableProps {
  /** Query result from workspaceStore (meta, data, statistics, …). */
  data: QueryResult;
  /** Container height. Numbers are treated as pixels. */
  height?: number | string;
  /** Whether to render the pagination footer. */
  enablePagination?: boolean;
  /** Initial page size when pagination is enabled. */
  pageSize?: number;
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Cell content with right-click "copy value" action.
 */
function CellContent({ value }: { value: unknown }) {
  const formatted = formatCellValue(value);
  const isNull = value === null || value === undefined;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(formatted);
  }, [formatted]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <span
          className={`block truncate ${isNull ? "italic text-muted-foreground" : ""}`}
          title={formatted}
        >
          {formatted}
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={handleCopy}>
          <Copy className="mr-2 h-4 w-4" />
          Copy Cell Value
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * TanStack-powered table used for query results and metadata views.
 * Virtualizes rows, supports column resize, sort, pin, and pagination.
 * Cells read CSS variables via Tailwind classes so it inherits the app
 * theme automatically.
 */
export function DataTable({
  data,
  height = "350px",
  enablePagination = true,
  pageSize: initialPageSize = 100,
}: DataTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({});
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: initialPageSize,
  });

  const rows = (data?.data ?? []) as Row[];
  const meta = (data?.meta ?? []) as Array<{ name?: string }>;

  const isLargeDataset = rows.length >= LARGE_DATASET;

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    if (!rows.length) return [];

    const rowNumCol: ColumnDef<Row> = {
      id: ROW_NUM_COLUMN_ID,
      header: "#",
      size: ROW_NUM_COLUMN_WIDTH,
      minSize: 50,
      maxSize: 80,
      enableSorting: false,
      enableResizing: false,
      enablePinning: false,
      cell: ({ row, table }) => {
        const { pageIndex, pageSize } = table.getState().pagination;
        // Show absolute row number across pages.
        return pageIndex * pageSize + row.index + 1;
      },
    };

    // Prefer declared meta order when available (ClickHouse sends it), but
    // fall back to object keys to support arbitrary row shapes.
    const keys = meta.length
      ? meta.map((m) => m.name).filter((n): n is string => typeof n === "string")
      : Object.keys(rows[0] ?? {});

    const dataCols: ColumnDef<Row>[] = keys.map((key) => ({
      id: key,
      accessorKey: key,
      header: key,
      size: DEFAULT_COLUMN_WIDTH,
      minSize: 80,
      enableResizing: true,
      enableSorting: true,
      cell: ({ getValue }) => <CellContent value={getValue()} />,
    }));

    return [rowNumCol, ...dataCols];
  }, [rows, meta]);

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      sorting,
      columnPinning,
      columnSizing,
      ...(enablePagination ? { pagination } : {}),
    },
    onSortingChange: setSorting,
    onColumnPinningChange: setColumnPinning,
    onColumnSizingChange: setColumnSizing,
    onPaginationChange: enablePagination ? setPagination : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(enablePagination
      ? { getPaginationRowModel: getPaginationRowModel() }
      : {}),
    columnResizeMode: "onChange",
    enableColumnResizing: true,
  });

  const { rows: tableRows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    estimateSize: () => DEFAULT_ROW_HEIGHT,
    getScrollElement: () => containerRef.current,
    overscan: isLargeDataset ? 5 : 10,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? totalSize - virtualItems[virtualItems.length - 1].end
      : 0;

  const resolvedHeight = typeof height === "number" ? `${height}px` : height;

  if (!rows.length) {
    return null;
  }

  const headerGroups = table.getHeaderGroups();

  return (
    <div
      className="flex flex-col min-h-0 w-full"
      style={{ height: resolvedHeight }}
    >
      <div
        ref={containerRef}
        className="flex-1 overflow-auto border border-border rounded-md bg-background"
      >
        <table
          className="text-sm border-collapse"
          style={{ width: table.getTotalSize() }}
        >
          <thead className="sticky top-0 z-10 bg-muted">
            {headerGroups.map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="relative border-b border-border px-3 py-2 text-left font-medium text-muted-foreground select-none"
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder ? null : (
                      <TableHeaderMenu header={header} table={table}>
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </TableHeaderMenu>
                    )}
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none hover:bg-primary ${
                          header.column.getIsResizing() ? "bg-primary" : ""
                        }`}
                      />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingTop > 0 && (
              <tr style={{ height: `${paddingTop}px` }} aria-hidden>
                <td colSpan={columns.length} />
              </tr>
            )}
            {virtualItems.map((virtualRow) => {
              const row = tableRows[virtualRow.index];
              return (
                <tr
                  key={row.id}
                  data-index={virtualRow.index}
                  className={`hover:bg-muted/50 ${
                    !isLargeDataset ? "transition-colors" : ""
                  }`}
                  style={{ height: `${DEFAULT_ROW_HEIGHT}px` }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="border-b border-border/50 px-3 py-1.5 text-foreground overflow-hidden"
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
            {paddingBottom > 0 && (
              <tr style={{ height: `${paddingBottom}px` }} aria-hidden>
                <td colSpan={columns.length} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {enablePagination && (
        <TablePagination
          table={table}
          statistics={(data?.statistics as TablePaginationStatistics | undefined) ?? null}
        />
      )}
    </div>
  );
}

export default DataTable;
