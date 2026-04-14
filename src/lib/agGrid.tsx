import React, { useCallback } from "react";
import {
  ColDef,
  ICellRendererParams,
  GridOptions,
  ColumnPinnedType,
} from "ag-grid-community";
import { themeBalham, colorSchemeDark } from "ag-grid-community";
import { Theme, isLightTheme } from "@/components/common/theme-provider";
import { Copy } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

/**
 * Performance thresholds for dynamic AG Grid configuration
 *
 * LARGE_DATASET: Disables animations to reduce overhead
 * VERY_LARGE_DATASET: Future threshold for additional optimizations
 */
export const LARGE_DATASET = 500;
export const VERY_LARGE_DATASET = 5000;

/**
 * Type for column pinning state
 */
export interface PinnedColumnsState {
  [colId: string]: ColumnPinnedType;
}

/**
 * Format cell values for display in AG Grid
 *
 * Handles null/undefined values and complex objects consistently
 */
export const formatCellValue = (value: any): string => {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
};

/**
 * Memoized cell renderer component for AG Grid
 *
 * PERFORMANCE NOTE: React.memo() prevents unnecessary re-renders
 * when cell values haven't changed, critical for large datasets.
 *
 * SECURITY NOTE: Uses React elements instead of unsafe HTML injection
 * to prevent XSS vulnerabilities.
 */
export const CellRenderer = React.memo((props: ICellRendererParams) => {
  const formattedValue = formatCellValue(props.value);
  const isNull = props.value === null || props.value === undefined;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(formattedValue);
  }, [formattedValue]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <span
          className={isNull ? "italic text-muted-foreground truncate" : "truncate"}
          title={formattedValue}
        >
          {formattedValue}
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
});

CellRenderer.displayName = "CellRenderer";

/**
 * Create default column definition for AG Grid
 *
 * CRITICAL: Does NOT include autoHeight: true, which would disable
 * row virtualization and render all rows in the DOM simultaneously.
 */
export const createDefaultColDef = (): ColDef => ({
  flex: 1,
  minWidth: 130,
  sortable: true,
  filter: true,
  resizable: true,
  filterParams: { buttons: ["reset", "apply"] },
  cellRenderer: CellRenderer,
  // NOTE: autoHeight is intentionally NOT set (would disable virtualization)
});

/**
 * Create grid options dynamically based on dataset size
 *
 * @param rowCount - Number of rows in the dataset
 * @returns Partial grid options optimized for the dataset size
 *
 * PERFORMANCE OPTIMIZATION:
 * - Small datasets (<500 rows): Enable animations for better UX
 * - Large datasets (≥500 rows): Disable animations to reduce overhead
 * - Always uses row virtualization (no autoHeight)
 */
export const createGridOptions = (rowCount: number): Partial<GridOptions> => {
  const isLargeDataset = rowCount >= LARGE_DATASET;

  return {
    pagination: true,
    paginationPageSize: 100,
    suppressPaginationPanel: true, // Use custom pagination component
    enableCellTextSelection: false,
    animateRows: !isLargeDataset, // Disable animations for large datasets
    suppressMovableColumns: false,
    // domLayout: 'normal' is the default (enables virtualization)
  };
};

/**
 * Apply pinned state to column definitions
 *
 * @param colDefs - Original column definitions
 * @param pinnedState - Map of column IDs to their pinned state
 * @returns Column definitions with pinned state applied
 */
export const applyPinnedState = <T = any>(
  colDefs: ColDef<T>[],
  pinnedState: PinnedColumnsState,
): ColDef<T>[] => {
  return colDefs.map((colDef) => {
    const field = colDef.field || colDef.headerName;
    if (!field) return colDef;

    const pinnedValue = pinnedState[field];
    if (pinnedValue !== undefined) {
      return { ...colDef, pinned: pinnedValue };
    }
    return colDef;
  });
};

/**
 * Create column definition for row number column with pagination support
 *
 * Shows absolute row numbers across paginated results:
 * - Page 1 (rows 1-100): Shows 1, 2, 3, ..., 100
 * - Page 2 (rows 101-200): Shows 101, 102, 103, ..., 200
 */
export const createRowNumberColDef = (): ColDef => ({
  headerName: "#",
  width: 60,
  minWidth: 50,
  maxWidth: 80,
  pinned: "left",
  lockPosition: "left",
  suppressMovable: true,
  sortable: false,
  filter: false,
  resizable: false,
  cellClass: "ag-header-cell-text",
  cellStyle: {
    textAlign: "center",
    cursor: "pointer",
    userSelect: "none",
  },
  valueGetter: (params) => {
    if (params.node?.rowIndex == null) return "";
    const api = params.api;
    const currentPage = api.paginationGetCurrentPage();
    const pageSize = api.paginationGetPageSize();
    return currentPage * pageSize + params.node.rowIndex + 1;
  },
});

const getCssVarAsHsl = (varName: string): string => {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return value ? `hsl(${value})` : "";
};

export const createAgGridTheme = (theme: Theme) => {
  const isLight = isLightTheme(theme);
  const baseTheme = isLight
    ? themeBalham
    : themeBalham.withPart(colorSchemeDark);

  // Use foreground color with opacity for visible borders
  const foregroundColor = getCssVarAsHsl("--foreground");
  const borderColor = foregroundColor.replace(")", " / 0.2)");

  return baseTheme.withParams({
    backgroundColor: getCssVarAsHsl("--background"),
    foregroundColor: foregroundColor,
    borderColor: borderColor,
    chromeBackgroundColor: getCssVarAsHsl("--muted"),
    headerBackgroundColor: getCssVarAsHsl("--muted"),
    headerTextColor: foregroundColor,
    rowHoverColor: getCssVarAsHsl("--select-row"),
    accentColor: getCssVarAsHsl("--accent"),
    selectedRowBackgroundColor: getCssVarAsHsl("--selected-row"),
    oddRowBackgroundColor: getCssVarAsHsl("--background"),
    modalOverlayBackgroundColor: getCssVarAsHsl("--background"),
    // Header column separator (vertical borders between headers)
    headerColumnBorderColor: borderColor,
    headerColumnBorderHeight: "100%",
    // Column borders
    columnBorder: true,
  });
};
