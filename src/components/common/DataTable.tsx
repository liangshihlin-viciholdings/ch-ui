import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type RowSelectionState,
  type Row as TRow,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Copy, X } from "lucide-react";
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
import DownloadDialog from "./DownloadDialog";
import { toast } from "sonner";
import type { QueryResult } from "@/types/common";

/** Datasets larger than this disable non-essential animations. */
const LARGE_DATASET = 500;

const SELECT_COLUMN_ID = "__select";
const ROW_NUM_COLUMN_ID = "__row_num";
const SELECT_COLUMN_WIDTH = 40;
const ROW_NUM_COLUMN_WIDTH = 60;
const DEFAULT_COLUMN_WIDTH = 180;
const DEFAULT_ROW_HEIGHT = 32;

type RowData = Record<string, unknown>;
type SelectedCell = { rowId: string; columnId: string; value: unknown };

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

function CellContent({ value }: { value: unknown }) {
  const formatted = formatCellValue(value);
  const isNull = value === null || value === undefined;
  return (
    <span
      className={`block truncate ${isNull ? "italic text-muted-foreground" : ""}`}
      title={formatted}
    >
      {formatted}
    </span>
  );
}
const MemoizedCellContent = memo(CellContent);

interface MemoizedRowProps {
  row: TRow<RowData>;
  isRowSelected: boolean;
  selectedCellRowId: string | null;
  selectedCellColId: string | null;
  isLargeDataset: boolean;
  onCellClick: (rowId: string, colId: string, value: unknown) => void;
  onCellContextMenu: (value: unknown) => void;
}

function TableRowComponent({
  row,
  isRowSelected,
  selectedCellRowId,
  selectedCellColId,
  isLargeDataset,
  onCellClick,
  onCellContextMenu,
}: MemoizedRowProps) {
  return (
    <tr
      data-index={row.index}
      className={`hover:bg-muted/50 ${!isLargeDataset ? "transition-colors" : ""} ${isRowSelected ? "bg-primary/10" : ""}`}
      style={{ height: `${DEFAULT_ROW_HEIGHT}px` }}
    >
      {row.getVisibleCells().map((cell) => {
        const isCellSelected =
          selectedCellRowId === row.id && selectedCellColId === cell.column.id;
        const isMetaCol =
          cell.column.id === SELECT_COLUMN_ID ||
          cell.column.id === ROW_NUM_COLUMN_ID;
        return (
          <td
            key={cell.id}
            className={`border-b border-border/50 px-3 py-1.5 text-foreground overflow-hidden ${
              isCellSelected ? "ring-1 ring-inset ring-primary" : ""
            }`}
            style={{ width: cell.column.getSize() }}
            onClick={
              isMetaCol
                ? undefined
                : () => onCellClick(row.id, cell.column.id, row.original[cell.column.id])
            }
            onContextMenu={
              isMetaCol
                ? undefined
                : () => onCellContextMenu(row.original[cell.column.id])
            }
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        );
      })}
    </tr>
  );
}

const MemoizedTableRow = memo(TableRowComponent, (prev, next) => {
  const wasThisRowCellSelected = prev.selectedCellRowId === prev.row.id;
  const isThisRowCellSelected = next.selectedCellRowId === next.row.id;
  return (
    prev.row === next.row &&
    prev.isRowSelected === next.isRowSelected &&
    wasThisRowCellSelected === isThisRowCellSelected &&
    (!isThisRowCellSelected || prev.selectedCellColId === next.selectedCellColId) &&
    prev.isLargeDataset === next.isLargeDataset
  );
});

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
  const contextMenuValueRef = useRef<unknown>(undefined);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({});
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: initialPageSize,
  });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);

  const rows = useMemo(() => (data?.data ?? []) as RowData[], [data?.data]);
  const meta = useMemo(
    () => (data?.meta ?? []) as Array<{ name?: string; type?: string }>,
    [data?.meta]
  );

  const isLargeDataset = rows.length >= LARGE_DATASET;

  const selectedCellRowId = selectedCell?.rowId ?? null;
  const selectedCellColId = selectedCell?.columnId ?? null;

  // Escape clears selection; Ctrl+C copies selected cell.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setRowSelection({});
        setSelectedCell(null);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "c" && selectedCell) {
        navigator.clipboard.writeText(formatCellValue(selectedCell.value));
        toast.success("Copied cell value", { duration: 1500 });
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectedCell]);

  const handleCellClick = useCallback(
    (rowId: string, colId: string, value: unknown) => {
      setSelectedCell({ rowId, columnId: colId, value });
    },
    []
  );

  const handleCellContextMenu = useCallback((value: unknown) => {
    contextMenuValueRef.current = value;
  }, []);

  const columns = useMemo<ColumnDef<RowData>[]>(() => {
    if (!rows.length) return [];

    const selectCol: ColumnDef<RowData> = {
      id: SELECT_COLUMN_ID,
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllPageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
          className="h-4 w-4 rounded border-border cursor-pointer accent-primary"
          title="Select all on page"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-border cursor-pointer accent-primary"
        />
      ),
      size: SELECT_COLUMN_WIDTH,
      minSize: SELECT_COLUMN_WIDTH,
      maxSize: SELECT_COLUMN_WIDTH,
      enableSorting: false,
      enableResizing: false,
      enablePinning: false,
    };

    const rowNumCol: ColumnDef<RowData> = {
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
        return pageIndex * pageSize + row.index + 1;
      },
    };

    // Prefer declared meta order when available (ClickHouse sends it), but
    // fall back to object keys to support arbitrary row shapes.
    const keys = meta.length
      ? meta.map((m) => m.name).filter((n): n is string => typeof n === "string")
      : Object.keys(rows[0] ?? {});

    const typeMap = Object.fromEntries(
      meta.flatMap((m) => (m.name && m.type ? [[m.name, m.type]] : []))
    );

    const dataCols: ColumnDef<RowData>[] = keys.map((key) => ({
      id: key,
      accessorKey: key,
      header: () => (
        <div className="flex flex-col leading-tight">
          <span>{key}</span>
          {typeMap[key] && (
            <span className="text-[10px] font-normal text-muted-foreground/70 truncate">
              {typeMap[key]}
            </span>
          )}
        </div>
      ),
      size: DEFAULT_COLUMN_WIDTH,
      minSize: 80,
      enableResizing: true,
      enableSorting: true,
      cell: ({ getValue }) => <MemoizedCellContent value={getValue()} />,
    }));

    return [selectCol, rowNumCol, ...dataCols];
  }, [rows, meta]);

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      sorting,
      columnPinning,
      columnSizing,
      rowSelection,
      ...(enablePagination ? { pagination } : {}),
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
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
  const selectedRowCount = Object.keys(rowSelection).length;
  const selectedRows = selectedRowCount > 0 ? table.getSelectedRowModel().rows : [];

  const copySelectedRows = () => {
    const keys = meta.filter((m) => m.name).map((m) => m.name as string);
    const effectiveKeys = keys.length
      ? keys
      : Object.keys(selectedRows[0]?.original ?? {});
    const header = effectiveKeys.join("\t");
    const body = selectedRows
      .map((r) => effectiveKeys.map((k) => formatCellValue(r.original[k])).join("\t"))
      .join("\n");
    navigator.clipboard.writeText(header + "\n" + body);
    toast.success(`Copied ${selectedRowCount} row${selectedRowCount !== 1 ? "s" : ""}`, {
      duration: 1500,
    });
  };

  const copySelectedCell = () => {
    if (!selectedCell) return;
    navigator.clipboard.writeText(formatCellValue(selectedCell.value));
    toast.success("Copied cell value", { duration: 1500 });
  };

  return (
    <div
      className="flex flex-col min-h-0 w-full"
      style={{ height: resolvedHeight }}
    >
      {/* Selection action bar */}
      {(selectedRowCount > 0 || selectedCell) && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 border-b border-border text-sm shrink-0">
          {selectedRowCount > 0 && (
            <>
              <span className="font-medium text-primary">
                {selectedRowCount} row{selectedRowCount !== 1 ? "s" : ""} selected
              </span>
              <button
                onClick={copySelectedRows}
                className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Copy as TSV"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy TSV
              </button>
              <DownloadDialog data={selectedRows.map((r) => r.original)} />
            </>
          )}
          {selectedCell && (
            <>
              {selectedRowCount > 0 && (
                <span className="text-border select-none">|</span>
              )}
              <span
                className="text-muted-foreground truncate max-w-48 font-mono text-xs"
                title={formatCellValue(selectedCell.value)}
              >
                {selectedCell.columnId}:{" "}
                <span className="text-foreground">
                  {formatCellValue(selectedCell.value)}
                </span>
              </span>
              <button
                onClick={copySelectedCell}
                className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Copy cell value"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
            </>
          )}
          <button
            onClick={() => {
              setRowSelection({});
              setSelectedCell(null);
            }}
            className="ml-auto flex items-center px-1.5 py-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Clear selection (Esc)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        className="flex-1 overflow-auto border border-border rounded-md bg-background"
      >
        <table
          className="text-sm border-collapse"
          style={{ width: table.getTotalSize() }}
        >
          <thead
            className="sticky top-0 z-10 bg-muted"
            onContextMenu={(e) => e.stopPropagation()}
          >
            {headerGroups.map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="relative border-b border-border px-3 py-2 text-left font-medium text-muted-foreground select-none"
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder ? null : header.column.id === SELECT_COLUMN_ID ? (
                      flexRender(header.column.columnDef.header, header.getContext())
                    ) : (
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
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <tbody>
                {paddingTop > 0 && (
                  <tr style={{ height: `${paddingTop}px` }} aria-hidden>
                    <td colSpan={columns.length} />
                  </tr>
                )}
                {virtualItems.map((virtualRow) => {
                  const row = tableRows[virtualRow.index];
                  return (
                    <MemoizedTableRow
                      key={row.id}
                      row={row}
                      isRowSelected={row.getIsSelected()}
                      selectedCellRowId={selectedCellRowId}
                      selectedCellColId={selectedCellColId}
                      isLargeDataset={isLargeDataset}
                      onCellClick={handleCellClick}
                      onCellContextMenu={handleCellContextMenu}
                    />
                  );
                })}
                {paddingBottom > 0 && (
                  <tr style={{ height: `${paddingBottom}px` }} aria-hidden>
                    <td colSpan={columns.length} />
                  </tr>
                )}
              </tbody>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
              <ContextMenuItem
                onClick={() => {
                  const val = contextMenuValueRef.current;
                  if (val !== undefined) {
                    navigator.clipboard.writeText(formatCellValue(val));
                  }
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy Cell Value
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
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
