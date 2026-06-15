// src/features/analytics/hooks/useChartData.ts
// Runs a chart's generated SQL via TanStack Query. The dashboard's
// connectionId (when set) selects both the engine — so builder SQL is
// generated in the right dialect — and the transport runQuery routes to.
// A null/undefined connectionId keeps the legacy single-ClickHouse path.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { runQuery } from "@/lib/queryRunner";
import { generateChartSql } from "@/lib/chartUtils";
import { useAutoRefresh } from "@/features/analytics/contexts/AutoRefreshContext";
import { useWorkbenchStore } from "@/stores/workbenchStore";
import type {
  ChartConfig,
  DashboardFilter,
} from "@/features/analytics/types";
import type { Engine } from "@/lib/db/schema";

export interface UseChartDataOptions {
  config: ChartConfig;
  dateRange: [Date, Date];
  tableName: string;
  timestampColumn?: string;
  filters?: DashboardFilter[];
  enabled?: boolean;
  /** Saved connection to query. null/undefined = legacy default (ClickHouse). */
  connectionId?: string | null;
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
  connectionId,
}: UseChartDataOptions): UseQueryResult<ChartDataResult, Error> {
  const { refetchInterval } = useAutoRefresh();

  // Resolve the engine for dialect-aware SQL. Unknown/legacy → ClickHouse.
  const engine = useWorkbenchStore(
    (s) => s.connections.find((c) => c.id === connectionId)?.engine,
  ) as Engine | undefined;

  const sql = generateChartSql(
    config,
    dateRange,
    tableName,
    timestampColumn,
    filters,
    engine ?? "clickhouse",
  );

  // Raw SQL queries don't need a tableName - the query is self-contained
  const isRawSql = config.type === "rawsql";
  const canExecute = isRawSql || !!tableName;

  return useQuery({
    // Cache per SQL + connection — same SQL on two connections must not collide.
    queryKey: ["chart-data", sql, connectionId ?? "legacy"],
    queryFn: async (): Promise<ChartDataResult> => {
      const result = await runQuery(sql, connectionId ?? undefined);
      return {
        rows: (result.data ?? []) as Record<string, unknown>[],
        sql,
      };
    },
    enabled: enabled && canExecute,
    staleTime: 30_000,
    refetchInterval,
  });
}
