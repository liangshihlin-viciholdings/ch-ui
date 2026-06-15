// src/features/sessions/hooks/useSessions.ts
// Data hooks for the session-replay feature. Pulls session metadata by
// aggregating `otel_logs` rows that carry a `rum.sessionId` attribute, which
// is how HyperDX's browser SDK (also bundled here as @hyperdx/browser) tags
// events.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { runQuery } from "@/lib/queryRunner";
import { useActiveClickHouseConnectionId } from "@/stores/workbenchStore";
import type {
  SessionEvent,
  SessionEventKind,
  SessionListRange,
  SessionSummary,
} from "@/features/sessions/types";

interface SessionRow {
  session_id: string;
  user_id: string | null;
  start_time: string;
  end_time: string;
  duration_ms: number | string;
  event_count: number | string;
  error_count: number | string;
  first_url: string | null;
}

interface EventRow {
  id: string;
  timestamp: string;
  severity: string | null;
  body: string;
  url: string | null;
  attrs: Record<string, string> | string | null;
}

function toNum(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function sanitizeId(value: string): string {
  return value.replace(/'/g, "''");
}

function buildListQuery(range: SessionListRange, search: string): string {
  const trimmed = search.trim();
  const searchFilter = trimmed
    ? `AND (LogAttributes['rum.sessionId'] ILIKE '%${trimmed.replace(/'/g, "''")}%'
           OR LogAttributes['userId'] ILIKE '%${trimmed.replace(/'/g, "''")}%'
           OR LogAttributes['email'] ILIKE '%${trimmed.replace(/'/g, "''")}%')`
    : "";

  return `
    SELECT
      LogAttributes['rum.sessionId'] AS session_id,
      any(LogAttributes['userId'])   AS user_id,
      min(Timestamp)                 AS start_time,
      max(Timestamp)                 AS end_time,
      toUInt64(dateDiff('millisecond', min(Timestamp), max(Timestamp))) AS duration_ms,
      count()                        AS event_count,
      sum(if(SeverityText IN ('ERROR', 'FATAL', 'Error', 'Fatal'), 1, 0)) AS error_count,
      any(if(LogAttributes['http.url'] != '', LogAttributes['http.url'], LogAttributes['location.href'])) AS first_url
    FROM otel_logs
    WHERE Timestamp >= parseDateTimeBestEffort('${range.start.toISOString()}')
      AND Timestamp <= parseDateTimeBestEffort('${range.end.toISOString()}')
      AND LogAttributes['rum.sessionId'] != ''
      ${searchFilter}
    GROUP BY session_id
    ORDER BY start_time DESC
    LIMIT 200
  `.trim();
}

function buildEventsQuery(sessionId: string): string {
  const safe = sanitizeId(sessionId);
  return `
    SELECT
      toString(TraceId) AS id,
      Timestamp        AS timestamp,
      SeverityText     AS severity,
      Body             AS body,
      coalesce(nullIf(LogAttributes['http.url'], ''), LogAttributes['location.href']) AS url,
      LogAttributes    AS attrs
    FROM otel_logs
    WHERE LogAttributes['rum.sessionId'] = '${safe}'
    ORDER BY Timestamp ASC
    LIMIT 2000
  `.trim();
}

function normalizeAttrs(raw: EventRow["attrs"]): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }
  return raw as Record<string, unknown>;
}

function classifyEvent(
  severity: string | null,
  body: string,
  attrs: Record<string, unknown>,
): SessionEventKind {
  const sev = (severity ?? "").toUpperCase();
  if (sev === "ERROR" || sev === "FATAL") return "error";
  const attrStrings = Object.keys(attrs);
  if (attrs["component"] === "console" || attrs["console"] === "log") return "log";
  if (
    attrStrings.some((k) => k.startsWith("http.")) ||
    attrs["http.method"] ||
    attrs["http.url"]
  ) {
    return "network";
  }
  if (attrs["event.type"] === "click" || body.toLowerCase().includes("click")) {
    return "click";
  }
  if (
    attrs["event.type"] === "navigation" ||
    attrs["location.href"] ||
    body.toLowerCase().includes("navigate")
  ) {
    return "navigation";
  }
  return "other";
}

export interface UseSessionsOptions {
  range: SessionListRange;
  search?: string;
  enabled?: boolean;
}

export function useSessions({
  range,
  search = "",
  enabled = true,
}: UseSessionsOptions): UseQueryResult<SessionSummary[], Error> {
  const connectionId = useActiveClickHouseConnectionId();
  const sql = buildListQuery(range, search);
  return useQuery({
    queryKey: ["sessions-list", sql, connectionId ?? "legacy"],
    queryFn: async (): Promise<SessionSummary[]> => {
      const result = await runQuery(sql, connectionId);
      const rows = (result.data ?? []) as SessionRow[];
      return rows
        .filter((row) => row.session_id)
        .map((row) => ({
          sessionId: row.session_id,
          userId: row.user_id ?? null,
          startTime: row.start_time,
          endTime: row.end_time,
          durationMs: toNum(row.duration_ms),
          eventCount: toNum(row.event_count),
          errorCount: toNum(row.error_count),
          firstUrl: row.first_url ?? null,
        }));
    },
    enabled,
    staleTime: 30_000,
    retry: 1,
  });
}

export interface UseSessionEventsOptions {
  sessionId: string | null;
  enabled?: boolean;
}

export function useSessionEvents({
  sessionId,
  enabled = true,
}: UseSessionEventsOptions): UseQueryResult<SessionEvent[], Error> {
  const connectionId = useActiveClickHouseConnectionId();
  return useQuery({
    queryKey: ["session-events", sessionId, connectionId ?? "legacy"],
    queryFn: async (): Promise<SessionEvent[]> => {
      if (!sessionId) return [];
      const result = await runQuery(buildEventsQuery(sessionId), connectionId);
      const rows = (result.data ?? []) as EventRow[];
      return rows.map((row, index) => {
        const attrs = normalizeAttrs(row.attrs);
        const kind = classifyEvent(row.severity, row.body ?? "", attrs);
        return {
          id: row.id || `${sessionId}-${index}`,
          timestamp: row.timestamp,
          severity: row.severity ?? null,
          message: row.body ?? "",
          url: row.url ?? null,
          kind,
          raw: attrs,
        };
      });
    },
    enabled: enabled && !!sessionId,
    staleTime: 30_000,
    retry: 1,
  });
}
