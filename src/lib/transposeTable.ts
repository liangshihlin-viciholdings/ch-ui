import type { ColumnDef } from "@tanstack/react-table";

type Row = Record<string, unknown>;

interface ColumnMeta {
  name: string;
  type?: string;
}

export interface TransposedResult {
  columnDefs: ColumnDef<Row>[];
  rowData: Row[];
}

/**
 * Transpose rows into columns for field-by-field inspection.
 *
 * Normal view: Each row is a data record.
 * Transposed view: Each original row becomes a column, with field names as rows.
 *
 * Example:
 * Input (2 rows):
 *   | id | name  | age |
 *   |----|-------|-----|
 *   | 1  | Alice | 30  |
 *   | 2  | Bob   | 25  |
 *
 * Output (transposed):
 *   | Field | Row 1 | Row 2 |
 *   |-------|-------|-------|
 *   | id    | 1     | 2     |
 *   | name  | Alice | Bob   |
 *   | age   | 30    | 25    |
 */
export function transposeTableData(
  selectedRows: Row[],
  columnMeta: ColumnMeta[],
): TransposedResult {
  if (!selectedRows.length || !columnMeta.length) {
    return { columnDefs: [], rowData: [] };
  }

  const columnDefs: ColumnDef<Row>[] = [
    {
      id: "field",
      accessorKey: "field",
      header: "Field",
      size: 160,
      minSize: 120,
      enableSorting: false,
    },
    ...selectedRows.map<ColumnDef<Row>>((_, index) => ({
      id: `row_${index}`,
      accessorKey: `row_${index}`,
      header: `Row ${index + 1}`,
      size: 160,
      minSize: 100,
      enableSorting: false,
    })),
  ];

  const rowData: Row[] = columnMeta.map((col) => {
    const row: Row = { field: col.name };
    selectedRows.forEach((selectedRow, index) => {
      row[`row_${index}`] = selectedRow[col.name];
    });
    return row;
  });

  return { columnDefs, rowData };
}
