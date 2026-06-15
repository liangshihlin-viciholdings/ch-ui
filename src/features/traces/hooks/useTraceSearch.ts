// src/features/traces/hooks/useTraceSearch.ts
// Lightweight search over the `otel_traces` table that returns one row per
// trace id. Used by the default /traces landing page (not implemented in
// this slice — the route jumps straight into $traceId/ detail view).

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { runQuery } from "@/lib/queryRunner";
import { useActiveClickHouseConnectionId } from "@/stores/workbenchStore";
import { DEFAULT_TRACES_TABLE } from "@/features/traces/types";
import type { QueryResult } from "@/types/common";

export interface TraceSearchOptions {
  tableName?: string;
  dateRange: [Date, Date];
  serviceName?: string;
  limit?: number;
  enabled?: boolean;
}

export function useTraceSearch({
  tableName = DEFAULT_TRACES_TABLE,
  dateRange,
  serviceName,
  limit = 100,
  enabled = true,
}: TraceSearchOptions): UseQueryResult<QueryResult, Error> {
  const connectionId = useActiveClickHouseConnectionId();
  const [start, end] = dateRange;
  const startIso = start.toISOString().replace("T", " ").replace("Z", "");
  const endIso = end.toISOString().replace("T", " ").replace("Z", "");

  const where: string[] = [
    `Timestamp >= toDateTime64('${startIso}', 3)`,
    `Timestamp <= toDateTime64('${endIso}', 3)`,
  ];
  if (serviceName) {
    where.push(`ServiceName = '${serviceName.replace(/'/g, "''")}'`);
  }

  const sql =
    `SELECT\n` +
    `  TraceId,\n` +
    `  any(ServiceName) AS ServiceName,\n` +
    `  min(Timestamp) AS StartTime,\n` +
    `  max(Timestamp + INTERVAL Duration NANOSECOND) AS EndTime,\n` +
    `  max(Duration) AS MaxDuration,\n` +
    `  count() AS SpanCount,\n` +
    `  countIf(StatusCode = 'ERROR') AS ErrorCount\n` +
    `FROM ${tableName}\n` +
    `WHERE ${where.join("\n  AND ")}\n` +
    `GROUP BY TraceId\n` +
    `ORDER BY StartTime DESC\n` +
    `LIMIT ${limit}`;

  return useQuery({
    queryKey: ["trace-search", sql, connectionId ?? "legacy"],
    queryFn: () => runQuery(sql, connectionId),
    enabled,
    staleTime: 15_000,
  });
}
