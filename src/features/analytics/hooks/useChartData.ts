// src/features/analytics/hooks/useChartData.ts
// Runs a chart's generated SQL against the active workspace connection via
// TanStack Query. Intentionally simple — the workspace store owns the
// ClickHouseClient so we reuse its `runQuery` entry point.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { runQuery } from "@/lib/queryRunner";
import { generateChartSql } from "@/lib/chartUtils";
import type {
  ChartConfig,
  DashboardFilter,
} from "@/features/analytics/types";

export interface UseChartDataOptions {
  config: ChartConfig;
  dateRange: [Date, Date];
  tableName: string;
  timestampColumn?: string;
  filters?: DashboardFilter[];
  enabled?: boolean;
}

export interface ChartDataResult {
  rows: Record<string, unknown>[];
  sql: string;
}

export function useChartData({
  config,
  dateRange,
  tableName,
  timestampColumn = "timestamp",
  filters = [],
  enabled = true,
}: UseChartDataOptions): UseQueryResult<ChartDataResult, Error> {
  const sql = generateChartSql(
    config,
    dateRange,
    tableName,
    timestampColumn,
    filters,
  );

  // Raw SQL queries don't need a tableName - the query is self-contained
  const isRawSql = config.type === "rawsql";
  const canExecute = isRawSql || !!tableName;

  return useQuery({
    // Cache per SQL — dateRange + config + filters are fully encoded there.
    queryKey: ["chart-data", sql],
    queryFn: async (): Promise<ChartDataResult> => {
      const result = await runQuery(sql);
      return {
        rows: (result.data ?? []) as Record<string, unknown>[],
        sql,
      };
    },
    enabled: enabled && canExecute,
    staleTime: 30_000,
  });
}
