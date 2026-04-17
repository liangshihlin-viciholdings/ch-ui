// src/features/analytics/charts/TableChart.tsx
// Wraps the shared DataTable by synthesising a QueryResult from the rows
// that came out of TanStack Query.

import { useMemo } from "react";
import { DataTable } from "@/components/common/DataTable";
import type { QueryResult } from "@/types/common";
import type { ChartProps } from "./types";

export function TableChart({ data, height = 320 }: ChartProps) {
  const synthesized: QueryResult = useMemo(() => {
    const meta = data.length
      ? Object.keys(data[0]).map((name) => ({ name, type: "String" }))
      : [];
    return {
      meta,
      data,
      statistics: { elapsed: 0, rows_read: data.length, bytes_read: 0 },
      rows: data.length,
      error: null,
    };
  }, [data]);

  if (!data.length) {
    return (
      <div
        className="flex h-full w-full items-center justify-center text-xs text-muted-foreground"
        style={{ height }}
      >
        No data
      </div>
    );
  }

  return <DataTable data={synthesized} height={height} enablePagination />;
}

export default TableChart;
