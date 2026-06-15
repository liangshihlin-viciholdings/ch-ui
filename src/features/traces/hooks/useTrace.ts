// src/features/traces/hooks/useTrace.ts
// Fetch all spans belonging to a single trace ID and fold them into a Trace
// aggregate. Queries the `otel_traces` ClickHouse table directly.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { runQuery } from "@/lib/queryRunner";
import { useActiveClickHouseConnectionId } from "@/stores/workbenchStore";
import {
  DEFAULT_TRACES_TABLE,
  type Span,
  type SpanEvent,
  type SpanStatus,
  type Trace,
} from "@/features/traces/types";

// Columns we pull from otel_traces. Mirrors the default schema produced by
// the OTel collector's `clickhouse` exporter.
const COLUMNS = [
  "TraceId",
  "SpanId",
  "ParentSpanId",
  "SpanName",
  "SpanKind",
  "ServiceName",
  "Timestamp",
  "Duration",
  "StatusCode",
  "StatusMessage",
  "SpanAttributes",
  "ResourceAttributes",
  "Events.Name",
  "Events.Timestamp",
  "Events.Attributes",
] as const;

function parseStatus(raw: unknown): SpanStatus {
  if (typeof raw !== "string") return "UNSET";
  const upper = raw.toUpperCase();
  if (upper.includes("ERROR")) return "ERROR";
  if (upper.includes("OK")) return "OK";
  return "UNSET";
}

function toIso(raw: unknown): string {
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === "number") return new Date(raw).toISOString();
  if (typeof raw === "string") {
    const normalized = raw.includes("T") ? raw : raw.replace(" ", "T") + "Z";
    const ts = Date.parse(normalized);
    return Number.isNaN(ts) ? new Date(0).toISOString() : new Date(ts).toISOString();
  }
  return new Date(0).toISOString();
}

function toDurationNs(raw: unknown): number {
  // otel_traces.Duration is UInt64 nanoseconds. ClickHouse client returns it
  // as a string when it exceeds Number.MAX_SAFE_INTEGER.
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function toStringMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = v == null ? "" : String(v);
  }
  return out;
}

function toEventArray(
  names: unknown,
  timestamps: unknown,
  attrs: unknown,
): SpanEvent[] {
  if (!Array.isArray(names)) return [];
  const ts = Array.isArray(timestamps) ? timestamps : [];
  const at = Array.isArray(attrs) ? attrs : [];
  return names.map((name, i) => ({
    name: String(name ?? ""),
    timestamp: toIso(ts[i]),
    attributes: toStringMap(at[i]),
  }));
}

function rowToSpan(row: Record<string, unknown>): Span {
  const startTime = toIso(row["Timestamp"]);
  const attributes = {
    ...toStringMap(row["ResourceAttributes"]),
    ...toStringMap(row["SpanAttributes"]),
  };
  return {
    traceId: String(row["TraceId"] ?? ""),
    spanId: String(row["SpanId"] ?? ""),
    parentSpanId: String(row["ParentSpanId"] ?? ""),
    name: String(row["SpanName"] ?? ""),
    kind: String(row["SpanKind"] ?? ""),
    serviceName: String(row["ServiceName"] ?? ""),
    startTime,
    durationNs: toDurationNs(row["Duration"]),
    statusCode: parseStatus(row["StatusCode"]),
    statusMessage: row["StatusMessage"] ? String(row["StatusMessage"]) : undefined,
    attributes,
    events: toEventArray(
      row["Events.Name"],
      row["Events.Timestamp"],
      row["Events.Attributes"],
    ),
  };
}

function buildTrace(traceId: string, rows: Record<string, unknown>[]): Trace {
  const spans = rows.map(rowToSpan);
  if (!spans.length) {
    const now = new Date().toISOString();
    return {
      traceId,
      spans: [],
      startTime: now,
      endTime: now,
      durationNs: 0,
      serviceNames: [],
    };
  }
  let minStartMs = Infinity;
  let maxEndMs = -Infinity;
  const services = new Set<string>();
  for (const s of spans) {
    const startMs = Date.parse(s.startTime);
    const endMs = startMs + s.durationNs / 1_000_000;
    if (startMs < minStartMs) minStartMs = startMs;
    if (endMs > maxEndMs) maxEndMs = endMs;
    if (s.serviceName) services.add(s.serviceName);
  }
  return {
    traceId,
    spans,
    startTime: new Date(minStartMs).toISOString(),
    endTime: new Date(maxEndMs).toISOString(),
    durationNs: Math.max(0, (maxEndMs - minStartMs) * 1_000_000),
    serviceNames: Array.from(services).sort(),
  };
}

export interface UseTraceOptions {
  traceId: string;
  tableName?: string;
  enabled?: boolean;
}

export function useTrace({
  traceId,
  tableName = DEFAULT_TRACES_TABLE,
  enabled = true,
}: UseTraceOptions): UseQueryResult<Trace, Error> {
  const connectionId = useActiveClickHouseConnectionId();
  const sql =
    `SELECT ${COLUMNS.join(", ")}\n` +
    `FROM ${tableName}\n` +
    `WHERE TraceId = '${traceId.replace(/'/g, "''")}'\n` +
    `ORDER BY Timestamp ASC\n` +
    `LIMIT 5000`;

  return useQuery({
    queryKey: ["trace", traceId, tableName, connectionId ?? "legacy"],
    queryFn: async (): Promise<Trace> => {
      const result = await runQuery(sql, connectionId);
      const rows = (result.data ?? []) as Record<string, unknown>[];
      return buildTrace(traceId, rows);
    },
    enabled: enabled && !!traceId,
    staleTime: 30_000,
  });
}
