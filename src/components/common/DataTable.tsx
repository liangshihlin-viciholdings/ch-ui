import {
	type ColumnDef,
	type ColumnPinningState,
	type ColumnSizingState,
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type RowSelectionState,
	type SortingState,
	type Row as TRow,
	useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Copy, Expand, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { QueryResult } from "@/types/common";
import { Checkbox } from "../ui/checkbox";
import { CellDetailSheet, type DetailCell } from "./CellDetailSheet";
import { CellDetailViewer } from "./CellDetailViewer";
import { editorStore } from "@/stores/editorStore";
import {
	type ColumnTypeAst,
	isComplexType,
	parseClickHouseType,
} from "./clickhouseTypes";
import DownloadDialog from "./DownloadDialog";
import { TableHeaderMenu } from "./TableHeaderMenu";
import {
	TablePagination,
	type TablePaginationStatistics,
} from "./TablePagination";

/** Datasets larger than this disable non-essential animations. */
const LARGE_DATASET = 500;

const SELECT_COLUMN_ID = "__select";
const ROW_NUM_COLUMN_ID = "__row_num";
const SELECT_COLUMN_WIDTH = 40;
const ROW_NUM_COLUMN_WIDTH = 60;
const DEFAULT_COLUMN_WIDTH = 180;
const DEFAULT_ROW_HEIGHT = 32;

type RowData = Record<string, unknown>;
type SelectedCell = {
	rowId: string;
	columnId: string;
	value: unknown;
	typeAst: ColumnTypeAst | null;
	rawType: string;
};

export type GridNavKey = "j" | "k" | "h" | "l" | "G" | "gg";

/**
 * Pure next-cell resolver for vim grid navigation. Given the current cell
 * (row/col indices, -1 = none selected yet), a movement key, and the grid
 * dimensions, return the clamped target cell — or null when the grid is empty.
 * The first move from "no selection" lands on the origin (or the last row for
 * G). Kept pure so it can be unit-tested without a table instance.
 */
export function resolveGridTarget(
	curRow: number,
	curCol: number,
	key: GridNavKey,
	rowCount: number,
	colCount: number,
): { row: number; col: number } | null {
	if (rowCount <= 0 || colCount <= 0) return null;
	const clampR = (n: number) => Math.max(0, Math.min(n, rowCount - 1));
	const clampC = (n: number) => Math.max(0, Math.min(n, colCount - 1));
	const noSel = curRow < 0 || curCol < 0;
	switch (key) {
		case "gg":
			return { row: 0, col: noSel ? 0 : curCol };
		case "G":
			return { row: rowCount - 1, col: noSel ? 0 : curCol };
		case "j":
			return noSel ? { row: 0, col: 0 } : { row: clampR(curRow + 1), col: curCol };
		case "k":
			return noSel ? { row: 0, col: 0 } : { row: clampR(curRow - 1), col: curCol };
		case "h":
			return noSel ? { row: 0, col: 0 } : { row: curRow, col: clampC(curCol - 1) };
		case "l":
			return noSel ? { row: 0, col: 0 } : { row: curRow, col: clampC(curCol + 1) };
		default:
			return null;
	}
}

export interface DataTableProps {
	/** Query result from workspaceStore (meta, data, statistics, …). */
	data: QueryResult;
	/** Container height. Numbers are treated as pixels; "100%" fills parent. */
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

function CellContent({
	value,
	typeAst,
	enableHover,
}: {
	value: unknown;
	typeAst: ColumnTypeAst | null;
	enableHover: boolean;
}) {
	const formatted = formatCellValue(value);
	const isNull = value === null || value === undefined;
	const complex = typeAst !== null && isComplexType(typeAst);

	const span = (
		<span
			className={`block truncate ${isNull ? "italic text-muted-foreground" : ""} ${complex ? "cursor-pointer underline decoration-dotted decoration-muted-foreground/50 underline-offset-2" : ""}`}
			title={complex ? undefined : formatted}
		>
			{formatted}
		</span>
	);

	if (!complex || !enableHover) return span;

	return (
		<HoverCard openDelay={200} closeDelay={100}>
			<HoverCardTrigger asChild>{span}</HoverCardTrigger>
			<HoverCardContent
				className="w-80 p-3 font-mono text-xs"
				side="bottom"
				align="center"
			>
				<CellDetailViewer value={value} typeAst={typeAst} mode="hover" />
			</HoverCardContent>
		</HoverCard>
	);
}
const MemoizedCellContent = memo(CellContent);

interface MemoizedRowProps {
	row: TRow<RowData>;
	isRowSelected: boolean;
	selectedCellRowId: string | null;
	selectedCellColId: string | null;
	isLargeDataset: boolean;
	typeAstMap: Record<string, ColumnTypeAst>;
	typeRawMap: Record<string, string>;
	onCellClick: (
		rowId: string,
		colId: string,
		value: unknown,
		typeAst: ColumnTypeAst | null,
		rawType: string,
	) => void;
	onCellContextMenu: (
		value: unknown,
		typeAst: ColumnTypeAst | null,
		rawType: string,
		columnId: string,
	) => void;
}

function TableRowComponent({
	row,
	isRowSelected,
	selectedCellRowId,
	selectedCellColId,
	isLargeDataset,
	typeAstMap,
	typeRawMap,
	onCellClick,
	onCellContextMenu,
}: MemoizedRowProps) {
	return (
		<TableRow
			data-index={row.index}
			data-state={isRowSelected ? "selected" : undefined}
			className={`${!isLargeDataset ? "transition-colors" : ""}`}
			style={{ height: `${DEFAULT_ROW_HEIGHT}px` }}
		>
			{row.getVisibleCells().map((cell) => {
				const isCellSelected =
					selectedCellRowId === row.id && selectedCellColId === cell.column.id;
				const isMetaCol =
					cell.column.id === SELECT_COLUMN_ID ||
					cell.column.id === ROW_NUM_COLUMN_ID;
				const colTypeAst = isMetaCol
					? null
					: (typeAstMap[cell.column.id] ?? null);
				const colRawType = isMetaCol ? "" : (typeRawMap[cell.column.id] ?? "");
				return (
					<TableCell
						key={cell.id}
						className={`border-b border-border/50 px-3 py-1.5 text-foreground overflow-hidden ${
							isCellSelected ? "ring-1 ring-inset ring-primary" : ""
						}`}
						style={{ width: cell.column.getSize() }}
						onClick={
							isMetaCol
								? undefined
								: () =>
										onCellClick(
											row.id,
											cell.column.id,
											row.original[cell.column.id],
											colTypeAst,
											colRawType,
										)
						}
						onContextMenu={
							isMetaCol
								? undefined
								: () =>
										onCellContextMenu(
											row.original[cell.column.id],
											colTypeAst,
											colRawType,
											cell.column.id,
										)
						}
					>
						{flexRender(cell.column.columnDef.cell, cell.getContext())}
					</TableCell>
				);
			})}
		</TableRow>
	);
}

const MemoizedTableRow = memo(TableRowComponent, (prev, next) => {
	const wasThisRowCellSelected = prev.selectedCellRowId === prev.row.id;
	const isThisRowCellSelected = next.selectedCellRowId === next.row.id;
	return (
		prev.row === next.row &&
		prev.isRowSelected === next.isRowSelected &&
		wasThisRowCellSelected === isThisRowCellSelected &&
		(!isThisRowCellSelected ||
			prev.selectedCellColId === next.selectedCellColId) &&
		prev.isLargeDataset === next.isLargeDataset &&
		prev.typeAstMap === next.typeAstMap &&
		prev.typeRawMap === next.typeRawMap
	);
});

/**
 * TanStack-powered table used for query results and metadata views.
 * Virtualizes rows, supports column resize, sort, pin, and pagination.
 * Cells read CSS variables via Tailwind classes so it inherits the app
 * theme automatically.
 */
// DEBUG: render counter
function DataTableInner({
	data,
	height = "350px",
	enablePagination = true,
	pageSize: initialPageSize = 100,
}: DataTableProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const contextMenuCellRef = useRef<{
		value: unknown;
		typeAst: ColumnTypeAst | null;
		rawType: string;
		columnId: string;
	} | null>(null);
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({});
	const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
	const [pagination, setPagination] = useState({
		pageIndex: 0,
		pageSize: initialPageSize,
	});
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
	const [detailCell, setDetailCell] = useState<DetailCell | null>(null);
	// Two-key `gg` sequence state for vim cell nav (below).
	const gCellPendingRef = useRef(false);

	const rows = useMemo(() => (data?.data ?? []) as RowData[], [data?.data]);
	const meta = useMemo(
		() => (data?.meta ?? []) as Array<{ name?: string; type?: string }>,
		[data?.meta],
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
		(
			rowId: string,
			colId: string,
			value: unknown,
			typeAst: ColumnTypeAst | null,
			rawType: string,
		) => {
			setSelectedCell({ rowId, columnId: colId, value, typeAst, rawType });
		},
		[],
	);

	const handleCellContextMenu = useCallback(
		(
			value: unknown,
			typeAst: ColumnTypeAst | null,
			rawType: string,
			columnId: string,
		) => {
			contextMenuCellRef.current = { value, typeAst, rawType, columnId };
		},
		[],
	);

	const typeAstMap = useMemo<Record<string, ColumnTypeAst>>(() => {
		return Object.fromEntries(
			meta
				.filter(
					(m): m is { name: string; type: string } =>
						typeof m.name === "string" && typeof m.type === "string",
				)
				.map((m) => [m.name, parseClickHouseType(m.type)]),
		);
	}, [meta]);

	const typeRawMap = useMemo<Record<string, string>>(() => {
		return Object.fromEntries(
			meta
				.filter(
					(m): m is { name: string; type: string } =>
						typeof m.name === "string" && typeof m.type === "string",
				)
				.map((m) => [m.name, m.type]),
		);
	}, [meta]);

	// Extract column keys from meta (stable) - only recompute when meta changes
	const columnKeys = useMemo(() => {
		return meta
			.map((m) => m.name)
			.filter((n): n is string => typeof n === "string");
	}, [meta]);

	const columns = useMemo<ColumnDef<RowData>[]>(() => {
		// No columns if no meta info
		if (!columnKeys.length) return [];

		const selectCol: ColumnDef<RowData> = {
			id: SELECT_COLUMN_ID,
			header: ({ table }) => (
				<Checkbox
					checked={
						table.getIsAllPageRowsSelected()
							? true
							: table.getIsSomePageRowsSelected()
								? "indeterminate"
								: false
					}
					onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
					title="Select all on page"
				/>
			),
			cell: ({ row }) => (
				<Checkbox
					checked={row.getIsSelected()}
					onCheckedChange={(value) => row.toggleSelected(!!value)}
					onClick={(e) => e.stopPropagation()}
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

		const typeMap = Object.fromEntries(
			meta.flatMap((m) => (m.name && m.type ? [[m.name, m.type]] : [])),
		);

		const dataCols: ColumnDef<RowData>[] = columnKeys.map((key) => ({
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
			cell: ({ getValue }) => (
				<MemoizedCellContent
					value={getValue()}
					typeAst={typeAstMap[key] ?? null}
					enableHover={!isLargeDataset}
				/>
			),
		}));

		return [selectCol, rowNumCol, ...dataCols];
	}, [columnKeys, meta, typeAstMap, isLargeDataset]);

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

	// ── Vim cell navigation ─────────────────────────────────────────────────────
	// j/k/h/l move the selected cell, gg/G jump to the first/last row, Enter opens
	// the detail sheet for complex cells. Gated on Vim Mode; only the DataTable
	// whose [data-vim-pane] currently has focus responds, so multiple mounted
	// grids don't all fire. Skips typing fields and defers Ctrl-chords to the
	// global pane layer.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (!editorStore.state.vimMode) return;
			const pane = containerRef.current?.closest("[data-vim-pane]");
			const activePane = document.activeElement?.closest("[data-vim-pane]");
			if (!pane || pane !== activePane) return;
			const ae = document.activeElement as HTMLElement | null;
			if (
				ae &&
				(/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable)
			)
				return;
			if (e.ctrlKey || e.metaKey || e.altKey) return;

			const dataCols = table
				.getVisibleLeafColumns()
				.map((c) => c.id)
				.filter((id) => id !== SELECT_COLUMN_ID && id !== ROW_NUM_COLUMN_ID);
			const model = table.getRowModel().rows;
			if (!dataCols.length || !model.length) return;

			const curRow = selectedCell
				? model.findIndex((r) => r.id === selectedCell.rowId)
				: -1;
			const curCol = selectedCell
				? dataCols.indexOf(selectedCell.columnId)
				: -1;
			const selectAt = (ri: number, ci: number) => {
				const r = model[ri];
				const colId = dataCols[ci];
				if (!r || colId == null) return;
				setSelectedCell({
					rowId: r.id,
					columnId: colId,
					value: r.original[colId],
					typeAst: typeAstMap[colId] ?? null,
					rawType: typeRawMap[colId] ?? "",
				});
				rowVirtualizer.scrollToIndex(ri, { align: "auto" });
			};
			const move = (key: GridNavKey) => {
				const t = resolveGridTarget(
					curRow,
					curCol,
					key,
					model.length,
					dataCols.length,
				);
				if (t) selectAt(t.row, t.col);
			};

			// gg → first row (two-key). A lone g arms; any other key disarms.
			if (e.key === "g") {
				if (gCellPendingRef.current) {
					gCellPendingRef.current = false;
					e.preventDefault();
					move("gg");
				} else {
					gCellPendingRef.current = true;
					setTimeout(() => {
						gCellPendingRef.current = false;
					}, 600);
				}
				return;
			}
			gCellPendingRef.current = false;

			const MOVE: Record<string, GridNavKey> = {
				j: "j",
				ArrowDown: "j",
				k: "k",
				ArrowUp: "k",
				h: "h",
				ArrowLeft: "h",
				l: "l",
				ArrowRight: "l",
				G: "G",
			};
			if (MOVE[e.key]) {
				e.preventDefault();
				move(MOVE[e.key]);
			} else if (e.key === "Enter") {
				if (selectedCell?.typeAst && isComplexType(selectedCell.typeAst)) {
					e.preventDefault();
					setDetailCell({
						columnId: selectedCell.columnId,
						rawType: selectedCell.rawType,
						typeAst: selectedCell.typeAst,
						value: selectedCell.value,
					});
				}
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [selectedCell, table, typeAstMap, typeRawMap, rowVirtualizer]);

	// "100%" fills parent via Tailwind h-full; everything else uses an inline style.
	const outerStyle =
		height !== "100%"
			? {
					height:
						typeof height === "number" ? `${height}px` : (height as string),
				}
			: undefined;
	const outerHeightClass = height === "100%" ? "h-full" : "";

	if (!rows.length) {
		return null;
	}

	const headerGroups = table.getHeaderGroups();
	const selectedRowCount = Object.keys(rowSelection).length;
	const selectedRows =
		selectedRowCount > 0 ? table.getSelectedRowModel().rows : [];

	const copySelectedRows = () => {
		const keys = meta.filter((m) => m.name).map((m) => m.name as string);
		const effectiveKeys = keys.length
			? keys
			: Object.keys(selectedRows[0]?.original ?? {});
		const header = effectiveKeys.join("\t");
		const body = selectedRows
			.map((r) =>
				effectiveKeys.map((k) => formatCellValue(r.original[k])).join("\t"),
			)
			.join("\n");
		navigator.clipboard.writeText(header + "\n" + body);
		toast.success(
			`Copied ${selectedRowCount} row${selectedRowCount !== 1 ? "s" : ""}`,
			{ duration: 1500 },
		);
	};

	const copySelectedCell = () => {
		if (!selectedCell) return;
		navigator.clipboard.writeText(formatCellValue(selectedCell.value));
		toast.success("Copied cell value", { duration: 1500 });
	};

	return (
		<div
			className={`flex flex-col min-h-0 w-full ${outerHeightClass}`}
			style={outerStyle}
		>
			{/* Selection action bar */}
			{(selectedRowCount > 0 || selectedCell) && (
				<div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 border-b border-border text-sm shrink-0">
					{selectedRowCount > 0 && (
						<>
							<span className="font-medium text-primary">
								{selectedRowCount} row{selectedRowCount !== 1 ? "s" : ""}{" "}
								selected
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
							{selectedCell.typeAst && isComplexType(selectedCell.typeAst) && (
								<button
									onClick={() =>
										setDetailCell({
											columnId: selectedCell.columnId,
											rawType: selectedCell.rawType,
											typeAst: selectedCell.typeAst!,
											value: selectedCell.value,
										})
									}
									className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
									title="View formatted value"
								>
									<Expand className="h-3.5 w-3.5" />
									View
								</button>
							)}
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

			{/* Scroll container — needs min-h-0 so flex-1 actually constrains height */}
			<div
				ref={containerRef}
				className="flex-1 min-h-0 max-h-full max-w-full overflow-scroll border border-border rounded-md bg-background"
			>
				<table
					className="text-sm border-collapse w-full"
					style={{ minWidth: table.getTotalSize() }}
				>
					<TableHeader
						className="sticky top-0 z-10 bg-muted"
						onContextMenu={(e) => e.stopPropagation()}
					>
						{headerGroups.map((headerGroup) => (
							<TableRow
								key={headerGroup.id}
								className="border-b border-border hover:bg-transparent"
							>
								{headerGroup.headers.map((header) => (
									<TableHead
										key={header.id}
										className="relative px-3 py-2 h-auto text-left font-medium text-muted-foreground select-none"
										style={{ maxWidth: header.getSize() }}
									>
										{header.isPlaceholder ? null : header.column.id ===
											SELECT_COLUMN_ID ? (
											flexRender(
												header.column.columnDef.header,
												header.getContext(),
											)
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
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<ContextMenu>
						<ContextMenuTrigger asChild>
							<TableBody>
								{paddingTop > 0 && (
									<TableRow style={{ height: `${paddingTop}px` }} aria-hidden>
										<TableCell colSpan={columns.length} className="p-0" />
									</TableRow>
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
											typeAstMap={typeAstMap}
											typeRawMap={typeRawMap}
											onCellClick={handleCellClick}
											onCellContextMenu={handleCellContextMenu}
										/>
									);
								})}
								{paddingBottom > 0 && (
									<TableRow
										style={{ height: `${paddingBottom}px` }}
										aria-hidden
									>
										<TableCell colSpan={columns.length} className="p-0" />
									</TableRow>
								)}
							</TableBody>
						</ContextMenuTrigger>
						<ContextMenuContent className="w-48">
							<ContextMenuItem
								onClick={() => {
									const cell = contextMenuCellRef.current;
									if (cell) {
										navigator.clipboard.writeText(formatCellValue(cell.value));
									}
								}}
							>
								<Copy className="mr-2 h-4 w-4" />
								Copy Cell Value
							</ContextMenuItem>
							<ContextMenuItem
								onClick={() => {
									const cell = contextMenuCellRef.current;
									if (cell) {
										setDetailCell({
											columnId: cell.columnId,
											rawType: cell.rawType,
											typeAst: cell.typeAst ?? {
												kind: "Unknown",
												raw: cell.rawType,
											},
											value: cell.value,
										});
									}
								}}
							>
								<Expand className="mr-2 h-4 w-4" />
								View Details
							</ContextMenuItem>
						</ContextMenuContent>
					</ContextMenu>
				</table>
			</div>
			{enablePagination && (
				<TablePagination
					table={table}
					statistics={
						(data?.statistics as TablePaginationStatistics | undefined) ?? null
					}
				/>
			)}
			<CellDetailSheet cell={detailCell} onClose={() => setDetailCell(null)} />
		</div>
	);
}

export const DataTable = memo(DataTableInner);
export default DataTable;
