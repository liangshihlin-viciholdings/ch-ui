// src/features/services/hooks/useServiceMap.ts
// TanStack Query hook that aggregates the service graph from `otel_traces`.
// Mirrors HyperDX's ServiceMap query shape — one row per (source, target)
// edge plus server/error counts — but issues a single ClickHouse query.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { runQuery } from "@/lib/queryRunner";
import { useActiveClickHouseConnectionId } from "@/stores/workbenchStore";
import type {
  ServiceAggregation,
  ServiceEdgeSummary,
  ServiceLatencyStats,
  ServiceMapData,
  ServiceMapRange,
} from "@/features/services/types";

interface EdgeRow {
  source: string;
  target: string;
  calls: number | string;
  errors: number | string;
}

interface LatencyRow {
  p50: number | string;
  p95: number | string;
  p99: number | string;
  throughput: number | string;
  errorRate: number | string;
}

function toNum(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function buildEdgeQuery(range: ServiceMapRange): string {
  // We approximate the service graph with ParentServiceName (if present) →
  // ServiceName. Spans without a parent service are roots and only contribute
  // a node, not an edge.
  return `
    SELECT
      coalesce(nullIf(ParentServiceName, ''), '') AS source,
      ServiceName AS target,
      count() AS calls,
      sum(if(StatusCode = 'STATUS_CODE_ERROR', 1, 0)) AS errors
    FROM otel_traces
    WHERE Timestamp >= parseDateTimeBestEffort('${range.start.toISOString()}')
      AND Timestamp <= parseDateTimeBestEffort('${range.end.toISOString()}')
    GROUP BY source, target
    ORDER BY calls DESC
    LIMIT 500
  `.trim();
}

function buildLatencyQuery(
  serviceName: string,
  range: ServiceMapRange,
): string {
  // Duration is nanoseconds in the default OTel schema; convert to ms.
  const windowSeconds =
    Math.max(1, (range.end.getTime() - range.start.getTime()) / 1000);
  return `
    SELECT
      quantile(0.50)(Duration) / 1e6 AS p50,
      quantile(0.95)(Duration) / 1e6 AS p95,
      quantile(0.99)(Duration) / 1e6 AS p99,
      count() / ${windowSeconds} AS throughput,
      sum(if(StatusCode = 'STATUS_CODE_ERROR', 1, 0)) / greatest(count(), 1) AS errorRate
    FROM otel_traces
    WHERE ServiceName = '${serviceName.replace(/'/g, "''")}'
      AND Timestamp >= parseDateTimeBestEffort('${range.start.toISOString()}')
      AND Timestamp <= parseDateTimeBestEffort('${range.end.toISOString()}')
  `.trim();
}

function aggregateRows(rows: EdgeRow[]): ServiceMapData {
  const services = new Map<string, ServiceAggregation>();
  const edges: ServiceEdgeSummary[] = [];

  const ensureService = (name: string): ServiceAggregation => {
    let svc = services.get(name);
    if (!svc) {
      svc = {
        serviceName: name,
        totalRequests: 0,
        errorPercentage: 0,
        callers: new Map(),
        callees: new Map(),
      };
      services.set(name, svc);
    }
    return svc;
  };

  // First pass: build node + edge data from the raw rows.
  for (const row of rows) {
    const target = row.target;
    const source = row.source?.length ? row.source : "";
    const calls = toNum(row.calls);
    const errors = toNum(row.errors);
    if (!target) continue;

    const targetService = ensureService(target);
    targetService.totalRequests += calls;
    targetService.errorPercentage += errors;

    if (source && source !== target) {
      ensureService(source);
      const edge: ServiceEdgeSummary = {
        source,
        target,
        totalRequests: calls,
        errorPercentage: calls > 0 ? errors / calls : 0,
      };
      edges.push(edge);
      targetService.callers.set(source, edge);
      services.get(source)!.callees.set(target, edge);
    }
  }

  // Second pass: finalize error percentages (sum of errors / sum of calls).
  for (const svc of services.values()) {
    svc.errorPercentage =
      svc.totalRequests > 0 ? svc.errorPercentage / svc.totalRequests : 0;
  }

  return { services, edges };
}

export interface UseServiceMapOptions {
  range: ServiceMapRange;
  enabled?: boolean;
}

export function useServiceMap({
  range,
  enabled = true,
}: UseServiceMapOptions): UseQueryResult<ServiceMapData, Error> {
  const connectionId = useActiveClickHouseConnectionId();
  const sql = buildEdgeQuery(range);
  return useQuery({
    queryKey: ["service-map", sql, connectionId ?? "legacy"],
    queryFn: async (): Promise<ServiceMapData> => {
      const result = await runQuery(sql, connectionId);
      const rows = (result.data ?? []) as EdgeRow[];
      return aggregateRows(rows);
    },
    enabled,
    staleTime: 30_000,
    retry: 1,
  });
}

export interface UseServiceLatencyOptions {
  serviceName: string | null;
  range: ServiceMapRange;
  enabled?: boolean;
}

export function useServiceLatency({
  serviceName,
  range,
  enabled = true,
}: UseServiceLatencyOptions): UseQueryResult<ServiceLatencyStats | null, Error> {
  const connectionId = useActiveClickHouseConnectionId();
  return useQuery({
    queryKey: ["service-latency", serviceName, range.start.toISOString(), range.end.toISOString(), connectionId ?? "legacy"],
    queryFn: async (): Promise<ServiceLatencyStats | null> => {
      if (!serviceName) return null;
      const sql = buildLatencyQuery(serviceName, range);
      const result = await runQuery(sql, connectionId);
      const row = (result.data?.[0] ?? null) as LatencyRow | null;
      if (!row) {
        return {
          serviceName,
          p50: 0,
          p95: 0,
          p99: 0,
          throughput: 0,
          errorRate: 0,
        };
      }
      return {
        serviceName,
        p50: toNum(row.p50),
        p95: toNum(row.p95),
        p99: toNum(row.p99),
        throughput: toNum(row.throughput),
        errorRate: toNum(row.errorRate),
      };
    },
    enabled: enabled && !!serviceName,
    staleTime: 30_000,
    retry: 1,
  });
}
