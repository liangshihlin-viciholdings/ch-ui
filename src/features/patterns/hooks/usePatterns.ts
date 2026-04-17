// src/features/patterns/hooks/usePatterns.ts
// TanStack Query hooks for log-pattern analysis. Normalization happens
// inside ClickHouse (regex replace) so we don't pay per-row cost in JS.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { runQuery } from "@/lib/queryRunner";
import type {
  LogPattern,
  PatternRange,
  PatternSample,
} from "@/features/patterns/types";

interface PatternRow {
  pattern: string;
  cnt: number | string;
  errors: number | string;
  sample: string;
  first_seen: string;
  last_seen: string;
}

interface SampleRow {
  id: string;
  timestamp: string;
  severity: string | null;
  body: string;
  service_name: string | null;
}

function toNum(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// Escape a pattern for safe use inside a ClickHouse regex literal — the same
// regex is used for filtering when we want to load the concrete samples.
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

// ClickHouse-side normalization. Matches HyperDX's simpler normalizer:
//   - UUID (8-4-4-4-12)
//   - Hex blobs ≥ 8 chars
//   - Pure numbers
// All collapsed to `*`.
const NORMALIZE_EXPR = `
  replaceRegexpAll(
    replaceRegexpAll(
      replaceRegexpAll(
        Body,
        '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
        '*'
      ),
      '[0-9a-f]{8,}',
      '*'
    ),
    '[0-9]+',
    '*'
  )
`.trim();

function buildPatternQuery(range: PatternRange, search: string): string {
  const trimmed = search.trim();
  const searchFilter = trimmed
    ? `AND Body ILIKE '%${sqlString(trimmed)}%'`
    : "";
  return `
    SELECT
      ${NORMALIZE_EXPR} AS pattern,
      count()           AS cnt,
      sum(if(SeverityText IN ('ERROR', 'FATAL', 'Error', 'Fatal'), 1, 0)) AS errors,
      any(Body)         AS sample,
      min(Timestamp)    AS first_seen,
      max(Timestamp)    AS last_seen
    FROM otel_logs
    WHERE Timestamp >= parseDateTimeBestEffort('${range.start.toISOString()}')
      AND Timestamp <= parseDateTimeBestEffort('${range.end.toISOString()}')
      ${searchFilter}
    GROUP BY pattern
    ORDER BY cnt DESC
    LIMIT 200
  `.trim();
}

function buildSamplesQuery(pattern: string, range: PatternRange): string {
  // Turn the normalized pattern back into a regex — `*` placeholders become
  // `.*`. Everything else is literal. This is best-effort; overly broad
  // patterns may match more than their "official" group, but it keeps the
  // query simple and predictable.
  const escaped = escapeRegex(pattern).replace(/\\\*/g, ".*");
  return `
    SELECT
      toString(TraceId) AS id,
      Timestamp        AS timestamp,
      SeverityText     AS severity,
      Body             AS body,
      ServiceName      AS service_name
    FROM otel_logs
    WHERE Timestamp >= parseDateTimeBestEffort('${range.start.toISOString()}')
      AND Timestamp <= parseDateTimeBestEffort('${range.end.toISOString()}')
      AND match(Body, '^${sqlString(escaped)}$')
    ORDER BY Timestamp DESC
    LIMIT 100
  `.trim();
}

export interface UsePatternsOptions {
  range: PatternRange;
  search?: string;
  enabled?: boolean;
}

export function usePatterns({
  range,
  search = "",
  enabled = true,
}: UsePatternsOptions): UseQueryResult<LogPattern[], Error> {
  const sql = buildPatternQuery(range, search);
  return useQuery({
    queryKey: ["patterns-list", sql],
    queryFn: async (): Promise<LogPattern[]> => {
      const result = await runQuery(sql);
      const rows = (result.data ?? []) as PatternRow[];
      return rows.map((row) => ({
        pattern: row.pattern ?? "",
        count: toNum(row.cnt),
        errorCount: toNum(row.errors),
        sample: row.sample ?? "",
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
      }));
    },
    enabled,
    staleTime: 30_000,
    retry: 1,
  });
}

export interface UsePatternSamplesOptions {
  pattern: string | null;
  range: PatternRange;
  enabled?: boolean;
}

export function usePatternSamples({
  pattern,
  range,
  enabled = true,
}: UsePatternSamplesOptions): UseQueryResult<PatternSample[], Error> {
  return useQuery({
    queryKey: [
      "pattern-samples",
      pattern,
      range.start.toISOString(),
      range.end.toISOString(),
    ],
    queryFn: async (): Promise<PatternSample[]> => {
      if (!pattern) return [];
      const result = await runQuery(buildSamplesQuery(pattern, range));
      const rows = (result.data ?? []) as SampleRow[];
      return rows.map((row, index) => ({
        id: row.id || `${index}`,
        timestamp: row.timestamp,
        severity: row.severity ?? null,
        body: row.body ?? "",
        serviceName: row.service_name ?? null,
      }));
    },
    enabled: enabled && !!pattern,
    staleTime: 30_000,
    retry: 1,
  });
}
