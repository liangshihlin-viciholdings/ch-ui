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
import {
	Copy,
	CopyPlus,
	Expand,
	Pencil,
	Plus,
	RotateCcw,
	Save,
	Trash2,
	X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
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
	computeResultDiff,
	diffIsEmpty,
	type ResultDiff,
} from "@/lib/resultDiff";
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

// Scratchpad edits keyed by the result's data-array identity. A single
// DataTable instance is reused across the workbench's multi-statement result
// tabs (only the `data` prop changes), so edits must survive tab flips;
// re-running a query produces new arrays and naturally starts pristine.
const scratchpadCache = new WeakMap<object, RowData[]>();

// Provenance of staged rows: which base-row index a (re-created) local row
// descends from. Untouched rows keep object identity with the base array, so
// they resolve via the per-result index map instead; rows absent from both
// were created in the grid (inserts / duplicates). Keys are unique row
// objects, so a module-level WeakMap is safe and survives tab flips together
// with scratchpadCache.
const rowProvenance = new WeakMap<RowData, number>();
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
	/**
	 * When true, pressing Tab while the results pane is focused transposes the
	 * grid (columns become rows, DBeaver-style). Only enabled for workbench
	 * query results.
	 */
	enableTranspose?: boolean;
	/**
	 * When true, the grid becomes an editable staging area: double-click edits
	 * a cell, rows can be duplicated / inserted / deleted / drag-reordered.
	 * Changes are STAGED locally (never sent to the database by the grid
	 * itself) and diffed against the pristine result; Discard restores it.
	 */
	enableEditing?: boolean;
	/**
	 * When provided (and enableEditing is on), the staging bar shows a Save
	 * button that hands the staged diff to the parent — which owns the
	 * review-diff-and-commit-to-database flow. Without it, staging stays a
	 * pure local scratchpad.
	 */
	onSaveStaged?: (diff: ResultDiff) => void;
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

/** Initial text shown in the inline cell editor (null → empty, objects → JSON). */
export function editableCellText(value: unknown): string {
	if (value === null || value === undefined) return "";
	return formatCellValue(value);
}

/**
 * Coerce the inline editor's raw string back into a cell value.
 * ponytail: pragmatic coercion, not a full ClickHouse type mapper — numbers
 * for numeric columns, JSON for object/array cells, null for cleared
 * Nullable cells, everything else stays a string. Edits are local-only so a
 * wrong guess is harmless and visible.
 */
export function coerceCellEdit(
	raw: string,
	rawType: string,
	prev: unknown,
	complexType = false,
): unknown {
	const nullable = rawType.includes("Nullable(");
	if (raw === "" && (nullable || prev === null || prev === undefined))
		return null;
	const inner = rawType.replace(/^(?:Nullable|LowCardinality)\((.*)\)$/, "$1");
	if (/^(?:Nullable\()?(?:U?Int|Float|Decimal)/.test(inner)) {
		const n = Number(raw);
		// Only adopt the JS number when it round-trips exactly: Int64/UInt64/
		// Decimal beyond 2^53 must stay strings so precision survives display
		// and SQL generation (numeric-looking strings stay unquoted there).
		if (raw.trim() !== "" && Number.isFinite(n)) {
			return String(n) === raw.trim() ? n : raw.trim();
		}
	}
	// Parse JSON for object cells AND for complex-typed columns whose current
	// value is null (e.g. blank inserted rows) so Map/Array cells stay typed.
	if (complexType || (typeof prev === "object" && prev !== null)) {
		try {
			return JSON.parse(raw);
		} catch {
			/* keep as string */
		}
	}
	return raw;
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

/**
 * Inline cell editor. Commits on Enter/blur, cancels on Escape. Keeps its own
 * text state so parent re-renders don't clobber typing.
 */
function CellEditInput({
	initial,
	onCommit,
	onCancel,
}: {
	initial: string;
	onCommit: (raw: string) => void;
	onCancel: () => void;
}) {
	const [text, setText] = useState(initial);
	return (
		<input
			// eslint-disable-next-line jsx-a11y/no-autofocus -- editor opened by explicit user action
			autoFocus
			value={text}
			onChange={(e) => setText(e.target.value)}
			onFocus={(e) => e.target.select()}
			onBlur={() => onCommit(text)}
			onKeyDown={(e) => {
				// Keep grid-level handlers (Escape-clears-selection, vim nav) out.
				e.stopPropagation();
				if (e.key === "Enter") onCommit(text);
				else if (e.key === "Escape") onCancel();
			}}
			onClick={(e) => e.stopPropagation()}
			onDoubleClick={(e) => e.stopPropagation()}
			className="w-full h-6 px-1 -mx-1 bg-background text-foreground text-sm border border-primary rounded-sm outline-none"
		/>
	);
}

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
		rowIndex: number,
	) => void;
	/** Column id currently being edited in THIS row, or null. */
	editingColId: string | null;
	/** Columns of THIS row staged as changed (updates), or null. */
	changedCols: Set<string> | null;
	/** True when THIS row was created in the grid (staged INSERT). */
	isInsertedRow: boolean;
	enableEditing: boolean;
	onStartEdit: (rowIndex: number, columnId: string) => void;
	onCommitEdit: (rowIndex: number, columnId: string, raw: string) => void;
	onCancelEdit: () => void;
	dragState: { from: number; over: number } | null;
	onRowDragStart: (rowIndex: number) => void;
	onRowDragOver: (rowIndex: number) => void;
	onRowDrop: (rowIndex: number) => void;
	canReorder: boolean;
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
	editingColId,
	changedCols,
	isInsertedRow,
	enableEditing,
	onStartEdit,
	onCommitEdit,
	onCancelEdit,
	dragState,
	onRowDragStart,
	onRowDragOver,
	onRowDrop,
	canReorder,
}: MemoizedRowProps) {
	const isDragOver = dragState !== null && dragState.over === row.index;
	const isDragSource = dragState !== null && dragState.from === row.index;
	return (
		<TableRow
			data-index={row.index}
			data-state={isRowSelected ? "selected" : undefined}
			className={`${!isLargeDataset ? "transition-colors" : ""} ${
				isDragOver ? "outline outline-1 -outline-offset-1 outline-primary" : ""
			} ${isDragSource ? "opacity-50" : ""} ${
				isInsertedRow ? "bg-emerald-500/10" : ""
			}`}
			style={{ height: `${DEFAULT_ROW_HEIGHT}px` }}
			onDragOver={
				canReorder
					? (e) => {
							e.preventDefault();
							onRowDragOver(row.index);
						}
					: undefined
			}
			onDrop={
				canReorder
					? (e) => {
							e.preventDefault();
							onRowDrop(row.index);
						}
					: undefined
			}
		>
			{row.getVisibleCells().map((cell) => {
				const isCellSelected =
					selectedCellRowId === row.id && selectedCellColId === cell.column.id;
				const isMetaCol =
					cell.column.id === SELECT_COLUMN_ID ||
					cell.column.id === ROW_NUM_COLUMN_ID;
				const isEditingCell =
					!isMetaCol && editingColId !== null && editingColId === cell.column.id;
				const colTypeAst = isMetaCol
					? null
					: (typeAstMap[cell.column.id] ?? null);
				const colRawType = isMetaCol ? "" : (typeRawMap[cell.column.id] ?? "");
				const isRowNumCol = cell.column.id === ROW_NUM_COLUMN_ID;
				const isStagedCell =
					!isMetaCol && changedCols !== null && changedCols.has(cell.column.id);
				return (
					<TableCell
						key={cell.id}
						className={`border-b border-border/50 px-3 py-1.5 text-foreground overflow-hidden ${
							isCellSelected ? "ring-1 ring-inset ring-primary" : ""
						} ${isRowNumCol && canReorder ? "cursor-grab select-none" : ""} ${
							isStagedCell ? "bg-amber-500/15" : ""
						}`}
						style={{ width: cell.column.getSize() }}
						draggable={isRowNumCol && canReorder ? true : undefined}
						onDragStart={
							isRowNumCol && canReorder
								? (e) => {
										e.dataTransfer.effectAllowed = "move";
										onRowDragStart(row.index);
									}
								: undefined
						}
						title={
							isRowNumCol && canReorder ? "Drag to reorder row" : undefined
						}
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
						onDoubleClick={
							isMetaCol || !enableEditing
								? undefined
								: () => onStartEdit(row.index, cell.column.id)
						}
						onContextMenu={
							isMetaCol
								? // Meta cells must not open the body-level context menu: the
									// ref would still point at the previously right-clicked cell
									// and row actions would target the wrong row.
									(e) => e.stopPropagation()
								: () =>
										onCellContextMenu(
											row.original[cell.column.id],
											colTypeAst,
											colRawType,
											cell.column.id,
											row.index,
										)
						}
					>
						{isEditingCell ? (
							<CellEditInput
								initial={editableCellText(row.original[cell.column.id])}
								onCommit={(raw) => onCommitEdit(row.index, cell.column.id, raw)}
								onCancel={onCancelEdit}
							/>
						) : (
							flexRender(cell.column.columnDef.cell, cell.getContext())
						)}
					</TableCell>
				);
			})}
		</TableRow>
	);
}

const MemoizedTableRow = memo(TableRowComponent, (prev, next) => {
	const wasThisRowCellSelected = prev.selectedCellRowId === prev.row.id;
	const isThisRowCellSelected = next.selectedCellRowId === next.row.id;
	// Drag visuals only depend on whether THIS row is the source / hover target.
	const wasDragOver = prev.dragState?.over === prev.row.index;
	const isDragOver = next.dragState?.over === next.row.index;
	const wasDragSource = prev.dragState?.from === prev.row.index;
	const isDragSource = next.dragState?.from === next.row.index;
	return (
		prev.row === next.row &&
		prev.isRowSelected === next.isRowSelected &&
		wasThisRowCellSelected === isThisRowCellSelected &&
		(!isThisRowCellSelected ||
			prev.selectedCellColId === next.selectedCellColId) &&
		prev.isLargeDataset === next.isLargeDataset &&
		prev.typeAstMap === next.typeAstMap &&
		prev.typeRawMap === next.typeRawMap &&
		prev.editingColId === next.editingColId &&
		prev.changedCols === next.changedCols &&
		prev.isInsertedRow === next.isInsertedRow &&
		prev.enableEditing === next.enableEditing &&
		prev.canReorder === next.canReorder &&
		wasDragOver === isDragOver &&
		wasDragSource === isDragSource
	);
});

/**
 * TanStack-powered table used for query results and metadata views.
 * Virtualizes rows, supports column resize, sort, pin, and pagination.
 * Cells read CSS variables via Tailwind classes so it inherits the app
 * theme automatically.
 */
function DataTableInner({
	data,
	height = "350px",
	enablePagination = true,
	pageSize: initialPageSize = 100,
	enableTranspose = false,
	enableEditing = false,
	onSaveStaged,
}: DataTableProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	const [transposed, setTransposed] = useState(false);
	const contextMenuCellRef = useRef<{
		value: unknown;
		typeAst: ColumnTypeAst | null;
		rawType: string;
		columnId: string;
		rowIndex: number;
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
	const [goToPageOpen, setGoToPageOpen] = useState(false);
	// Two-key `gg` sequence state for vim cell nav (below).
	const gCellPendingRef = useRef(false);

	// ── Local scratchpad editing state (enableEditing) ──────────────────────
	// localRows === null → pristine, render the query result as-is. First edit
	// copies the result; Reset drops back to null. Never persisted to the DB.
	const [localRows, setLocalRows] = useState<RowData[] | null>(null);
	const [editingCell, setEditingCell] = useState<{
		rowIndex: number;
		columnId: string;
	} | null>(null);
	const [dragState, setDragState] = useState<{
		from: number;
		over: number;
	} | null>(null);

	const baseRows = useMemo(() => (data?.data ?? []) as RowData[], [data?.data]);
	// New result set → drop local edits and start from page 1 (autoResetPageIndex
	// is disabled below so local edits don't bounce the grid back to page 1).
	// Adjusted during render (not in an effect) so a stale scratchpad never
	// flashes for one frame over the new result.
	const [prevBaseRows, setPrevBaseRows] = useState(baseRows);
	if (prevBaseRows !== baseRows) {
		setPrevBaseRows(baseRows);
		// Restore this result's scratchpad if we've edited it before (result-tab
		// switch); otherwise pristine (new query result).
		setLocalRows(enableEditing ? (scratchpadCache.get(baseRows) ?? null) : null);
		setEditingCell(null);
		setDragState(null);
		setPagination((p) => (p.pageIndex === 0 ? p : { ...p, pageIndex: 0 }));
	}
	const rows = enableEditing && localRows ? localRows : baseRows;

	// Row provenance resolution (see rowProvenance above): explicit entry for
	// re-created rows, object identity against the base array for untouched
	// ones, undefined for grid-created rows.
	const baseIndexMap = useMemo(
		() => new Map(baseRows.map((r, i) => [r, i] as const)),
		[baseRows],
	);
	const baseIndexOf = useCallback(
		(row: RowData) => rowProvenance.get(row) ?? baseIndexMap.get(row),
		[baseIndexMap],
	);
	const meta = useMemo(
		() => (data?.meta ?? []) as Array<{ name?: string; type?: string }>,
		[data?.meta],
	);

	const isLargeDataset = rows.length >= LARGE_DATASET;

	const selectedCellRowId = selectedCell?.rowId ?? null;
	const selectedCellColId = selectedCell?.columnId ?? null;

	// Escape clears selection; Ctrl+C copies selected cell. Skips typing
	// fields so the inline cell editor (and dialogs) keep native behavior.
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			const ae = document.activeElement as HTMLElement | null;
			if (
				ae &&
				(/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable)
			)
				return;
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

	// Tab transposes the grid (columns↔rows) when the results pane is focused,
	// DBeaver-style. Pane-scoped like the vim nav below so only the focused
	// results table responds; skips typing fields so Tab keeps working there.
	useEffect(() => {
		if (!enableTranspose) return;
		const onKey = (e: KeyboardEvent) => {
			if (
				e.key !== "Tab" ||
				e.shiftKey ||
				e.ctrlKey ||
				e.metaKey ||
				e.altKey
			)
				return;
			const pane = rootRef.current?.closest("[data-vim-pane]");
			const activePane = document.activeElement?.closest("[data-vim-pane]");
			if (!pane || pane !== activePane) return;
			const ae = document.activeElement as HTMLElement | null;
			if (
				ae &&
				(/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable)
			)
				return;
			e.preventDefault();
			setSelectedCell(null);
			setRowSelection({});
			setEditingCell(null);
			setDragState(null);
			setTransposed((t) => !t);
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [enableTranspose]);

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
			rowIndex: number,
		) => {
			contextMenuCellRef.current = { value, typeAst, rawType, columnId, rowIndex };
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

	// Staged diff vs the pristine result (null while the grid is pristine).
	// Reorders don't appear: row order has no database meaning.
	const stagedDiff = useMemo(
		() =>
			enableEditing && localRows
				? computeResultDiff(baseRows, localRows, columnKeys, baseIndexOf)
				: null,
		[enableEditing, localRows, baseRows, columnKeys, baseIndexOf],
	);
	// Per-row staging visuals: changed columns per updated row, and the set
	// of grid-created (insert) rows.
	const changedColsByRow = useMemo(() => {
		const m = new Map<RowData, Set<string>>();
		if (stagedDiff)
			for (const u of stagedDiff.updates) m.set(u.row, new Set(u.changedCols));
		return m;
	}, [stagedDiff]);
	const insertedRowSet = useMemo(
		() => new Set(stagedDiff?.inserts ?? []),
		[stagedDiff],
	);

	// ── Scratchpad mutations (enableEditing) ────────────────────────────────
	// Copy-on-write from the pristine result on first use. Structural ops
	// clear selection/editing since row ids are index-based and would drift.
	// Reading `rows` from the closure is safe: any rows change recreates the
	// row-model objects, so memoized rows re-render and get fresh callbacks.
	const mutateRows = useCallback(
		(fn: (next: RowData[]) => RowData[]) => {
			const next = fn(rows.slice());
			setLocalRows(next);
			scratchpadCache.set(baseRows, next);
			// Keep the current page in range after structural changes.
			if (enablePagination) {
				setPagination((p) => ({
					...p,
					pageIndex: Math.min(
						p.pageIndex,
						Math.max(0, Math.ceil(next.length / p.pageSize) - 1),
					),
				}));
			}
		},
		[rows, baseRows, enablePagination],
	);

	const clearTransientState = useCallback(() => {
		setSelectedCell(null);
		setRowSelection({});
		setEditingCell(null);
		setDragState(null);
	}, []);

	const startEdit = useCallback((rowIndex: number, columnId: string) => {
		setEditingCell({ rowIndex, columnId });
	}, []);

	const cancelEdit = useCallback(() => setEditingCell(null), []);

	const commitEdit = useCallback(
		(rowIndex: number, columnId: string, raw: string) => {
			const prevVal = rows[rowIndex]?.[columnId];
			// No-op edits (open editor, blur) must not flip the grid into
			// scratchpad mode.
			if (raw === editableCellText(prevVal)) {
				setEditingCell(null);
				return;
			}
			const ast = typeAstMap[columnId];
			const coerced = coerceCellEdit(
				raw,
				typeRawMap[columnId] ?? "",
				prevVal,
				ast ? isComplexType(ast) : false,
			);
			mutateRows((next) => {
				const oldRow = next[rowIndex];
				const newRow = { ...oldRow, [columnId]: coerced };
				// Carry provenance so the edit stages as an UPDATE of its base
				// row; rows created in the grid stay INSERTs even when edited.
				const bi = baseIndexOf(oldRow);
				if (bi !== undefined) rowProvenance.set(newRow, bi);
				next[rowIndex] = newRow;
				return next;
			});
			setEditingCell(null);
			// Keep the selection-bar value in sync if it points at this cell.
			setSelectedCell((s) =>
				s && s.columnId === columnId && s.rowId === String(rowIndex)
					? { ...s, value: coerced }
					: s,
			);
		},
		[rows, typeRawMap, typeAstMap, mutateRows, baseIndexOf],
	);

	const emptyRow = useCallback(
		(): RowData => Object.fromEntries(columnKeys.map((k) => [k, null])),
		[columnKeys],
	);

	const duplicateRow = useCallback(
		(rowIndex: number) => {
			mutateRows((next) => {
				const src = next[rowIndex];
				if (src) next.splice(rowIndex + 1, 0, { ...src });
				return next;
			});
			clearTransientState();
		},
		[mutateRows, clearTransientState],
	);

	const insertRowBelow = useCallback(
		(rowIndex: number) => {
			mutateRows((next) => {
				next.splice(rowIndex + 1, 0, emptyRow());
				return next;
			});
			// An active sort would fling the blank row wherever nulls sort,
			// away from the clicked row — drop back to data order so the new
			// row is visibly below where the user asked for it.
			setSorting([]);
			clearTransientState();
		},
		[mutateRows, clearTransientState, emptyRow],
	);

	const appendRow = useCallback(() => {
		mutateRows((next) => {
			next.push(emptyRow());
			return next;
		});
		setSorting([]); // same reason as insertRowBelow: keep the new row visible at the end
		clearTransientState();
	}, [mutateRows, clearTransientState, emptyRow]);

	const deleteRows = useCallback(
		(rowIndexes: number[]) => {
			const drop = new Set(rowIndexes);
			mutateRows((next) => next.filter((_, i) => !drop.has(i)));
			clearTransientState();
		},
		[mutateRows, clearTransientState],
	);

	// ── Row drag-reorder (native HTML5 DnD on the # cell) ───────────────────
	// The drag source lives in a ref: rows rendered before the drag started
	// hold stale dragState closures, so drop must not read from state.
	const dragFromRef = useRef<number | null>(null);
	const onRowDragStart = useCallback((rowIndex: number) => {
		dragFromRef.current = rowIndex;
		setDragState({ from: rowIndex, over: rowIndex });
	}, []);
	const onRowDragOver = useCallback((rowIndex: number) => {
		setDragState((s) =>
			s && s.over !== rowIndex ? { ...s, over: rowIndex } : s,
		);
	}, []);
	const onRowDrop = useCallback(
		(rowIndex: number) => {
			const from = dragFromRef.current;
			dragFromRef.current = null;
			setDragState(null);
			if (from === null || from === rowIndex) return;
			mutateRows((next) => {
				const [moved] = next.splice(from, 1);
				next.splice(rowIndex, 0, moved);
				return next;
			});
			clearTransientState();
		},
		[mutateRows, clearTransientState],
	);
	// Cancelled drags (drop outside the grid) leave visuals behind — clean up
	// on the global dragend that always fires on the source element.
	useEffect(() => {
		if (!dragState) return;
		const end = () => {
			dragFromRef.current = null;
			setDragState(null);
		};
		document.addEventListener("dragend", end);
		return () => document.removeEventListener("dragend", end);
	}, [dragState]);

	// Reordering by drag only makes sense in data order: sorting would
	// immediately re-sort the moved row somewhere else.
	const canReorder = enableEditing && !transposed && sorting.length === 0;

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
		// Local scratchpad edits change data identity; don't yank the user back
		// to page 1 on every edit. New result sets reset the page explicitly.
		autoResetPageIndex: false,
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
	// the detail sheet for complex cells. [ / ] flip to the prev/next page and gp
	// opens the "go to page" dialog. Gated on Vim Mode; only the DataTable whose
	// [data-vim-pane] currently has focus responds, so multiple mounted grids
	// don't all fire. Skips typing fields and defers Ctrl-chords to the global
	// pane layer.
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

			// [ / ] page navigation (independent of cell selection).
			if (enablePagination && (e.key === "[" || e.key === "]")) {
				e.preventDefault();
				gCellPendingRef.current = false;
				if (e.key === "[") table.previousPage();
				else table.nextPage();
				return;
			}

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
				// Follow the cursor horizontally: no columns are sticky, so a leaf
				// column's left edge is just the sum of preceding column widths.
				const el = containerRef.current;
				if (el) {
					const leaf = table.getVisibleLeafColumns();
					let left = 0;
					let width = 0;
					for (const c of leaf) {
						if (c.id === colId) {
							width = c.getSize();
							break;
						}
						left += c.getSize();
					}
					const right = left + width;
					if (left < el.scrollLeft) el.scrollLeft = left;
					else if (right > el.scrollLeft + el.clientWidth)
						el.scrollLeft = right - el.clientWidth;
				}
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

			// gg → first row, gp → go-to-page dialog (two-key). A lone g arms; any
			// other key disarms.
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
			if (gCellPendingRef.current && e.key === "p" && enablePagination) {
				gCellPendingRef.current = false;
				e.preventDefault();
				setGoToPageOpen(true);
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
	}, [
		selectedCell,
		table,
		typeAstMap,
		typeRawMap,
		rowVirtualizer,
		enablePagination,
	]);

	// "100%" fills parent via Tailwind h-full; everything else uses an inline style.
	const outerStyle =
		height !== "100%"
			? {
					height:
						typeof height === "number" ? `${height}px` : (height as string),
				}
			: undefined;
	const outerHeightClass = height === "100%" ? "h-full" : "";

	// Keep rendering an empty grid while local edits exist (all rows deleted)
	// so the Reset / Add-row bar stays reachable.
	if (!rows.length && !(enableEditing && localRows)) {
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
			ref={rootRef}
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
							{enableEditing && (
								<button
									onClick={() => deleteRows(selectedRows.map((r) => r.index))}
									className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
									title="Delete selected rows (local only)"
								>
									<Trash2 className="h-3.5 w-3.5" />
									Delete
								</button>
							)}
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

			{/* Staging bar: appears once edits are staged; shows the pending
			    update/insert/delete counts; Discard restores the pristine result. */}
			{enableEditing && localRows && stagedDiff && (
				<div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border-b border-border text-xs text-muted-foreground shrink-0">
					<Pencil className="h-3 w-3 shrink-0" />
					<span>
						{stagedDiff.updates.length ||
						stagedDiff.inserts.length ||
						stagedDiff.deletes.length ? (
							<>
								Staged:{" "}
								<span className="text-foreground">
									{stagedDiff.updates.length} update
									{stagedDiff.updates.length !== 1 ? "s" : ""} ·{" "}
									{stagedDiff.inserts.length} insert
									{stagedDiff.inserts.length !== 1 ? "s" : ""} ·{" "}
									{stagedDiff.deletes.length} delete
									{stagedDiff.deletes.length !== 1 ? "s" : ""}
								</span>{" "}
								— not yet saved to the database
							</>
						) : (
							"No staged changes (row order is display-only)"
						)}
					</span>
					<button
						onClick={appendRow}
						className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-muted hover:text-foreground"
						title="Append an empty row"
					>
						<Plus className="h-3 w-3" />
						Add row
					</button>
					{onSaveStaged && (
						<button
							onClick={() => onSaveStaged(stagedDiff)}
							disabled={diffIsEmpty(stagedDiff)}
							className="flex items-center gap-1 px-2 py-0.5 rounded text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
							title="Review staged changes and save them to the database"
						>
							<Save className="h-3 w-3" />
							Save…
						</button>
					)}
					<button
						onClick={() => {
							setLocalRows(null);
							scratchpadCache.delete(baseRows);
							clearTransientState();
						}}
						className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded hover:bg-muted hover:text-foreground"
						title="Discard staged changes and restore query results"
					>
						<RotateCcw className="h-3 w-3" />
						Discard
					</button>
				</div>
			)}

			{transposed ? (
				/* Transposed view: each column becomes a row, each row a column.
				   Reuses the sorted/paginated tableRows so it mirrors what the
				   normal grid shows. Complex-type hover/detail is skipped here —
				   ponytail: cell types are heterogeneous per column when transposed. */
				<div className="flex-1 min-h-0 max-h-full max-w-full overflow-scroll border border-border rounded-md bg-background">
					<table className="text-sm border-collapse">
						<thead className="sticky top-0 z-20 bg-muted">
							<TableRow className="border-b border-border hover:bg-transparent">
								<th className="sticky left-0 z-30 bg-muted px-3 py-2 text-left font-medium text-muted-foreground border-r border-border whitespace-nowrap">
									Column
								</th>
								{tableRows.map((r) => (
									<th
										key={r.id}
										className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap"
									>
										{(enablePagination
											? pagination.pageIndex * pagination.pageSize
											: 0) +
											r.index +
											1}
									</th>
								))}
							</TableRow>
						</thead>
						<TableBody>
							{meta
								.filter((m): m is { name: string; type?: string } =>
									typeof m.name === "string",
								)
								.map((m) => (
									<TableRow
										key={m.name}
										className="border-b border-border/50"
									>
										<th className="sticky left-0 z-10 bg-background px-3 py-1.5 text-left align-top border-r border-border">
											<div className="flex flex-col leading-tight">
												<span className="font-medium text-foreground">
													{m.name}
												</span>
												{m.type && (
													<span className="text-[10px] text-muted-foreground/70">
														{m.type}
													</span>
												)}
											</div>
										</th>
										{tableRows.map((r) => {
											const formatted = formatCellValue(r.original[m.name]);
											return (
												<TableCell
													key={r.id}
													className="border-b border-border/50 px-3 py-1.5 text-foreground"
												>
													<span
														className="block max-w-100 truncate"
														title={formatted}
													>
														{formatted}
													</span>
												</TableCell>
											);
										})}
									</TableRow>
								))}
						</TableBody>
					</table>
				</div>
			) : (
			/* Scroll container — needs min-h-0 so flex-1 actually constrains height */
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
											editingColId={
												editingCell && editingCell.rowIndex === row.index
													? editingCell.columnId
													: null
											}
											changedCols={changedColsByRow.get(row.original) ?? null}
											isInsertedRow={insertedRowSet.has(row.original)}
											enableEditing={enableEditing}
											onStartEdit={startEdit}
											onCommitEdit={commitEdit}
											onCancelEdit={cancelEdit}
											dragState={dragState}
											onRowDragStart={onRowDragStart}
											onRowDragOver={onRowDragOver}
											onRowDrop={onRowDrop}
											canReorder={canReorder}
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
							{enableEditing && (
								<>
									<ContextMenuSeparator />
									<ContextMenuItem
										onClick={() => {
											const cell = contextMenuCellRef.current;
											if (cell) startEdit(cell.rowIndex, cell.columnId);
										}}
									>
										<Pencil className="mr-2 h-4 w-4" />
										Edit Cell
									</ContextMenuItem>
									<ContextMenuItem
										onClick={() => {
											const cell = contextMenuCellRef.current;
											if (cell) duplicateRow(cell.rowIndex);
										}}
									>
										<CopyPlus className="mr-2 h-4 w-4" />
										Duplicate Row
									</ContextMenuItem>
									<ContextMenuItem
										onClick={() => {
											const cell = contextMenuCellRef.current;
											if (cell) insertRowBelow(cell.rowIndex);
										}}
									>
										<Plus className="mr-2 h-4 w-4" />
										Insert Row Below
									</ContextMenuItem>
									<ContextMenuItem
										className="text-destructive focus:text-destructive"
										onClick={() => {
											const cell = contextMenuCellRef.current;
											if (cell) deleteRows([cell.rowIndex]);
										}}
									>
										<Trash2 className="mr-2 h-4 w-4" />
										Delete Row
									</ContextMenuItem>
								</>
							)}
						</ContextMenuContent>
					</ContextMenu>
				</table>
			</div>
			)}
			{enablePagination && (
				<TablePagination
					table={table}
					statistics={
						(data?.statistics as TablePaginationStatistics | undefined) ?? null
					}
					goToPageOpen={goToPageOpen}
					onGoToPageOpenChange={setGoToPageOpen}
				/>
			)}
			<CellDetailSheet cell={detailCell} onClose={() => setDetailCell(null)} />
		</div>
	);
}

export const DataTable = memo(DataTableInner);
export default DataTable;
