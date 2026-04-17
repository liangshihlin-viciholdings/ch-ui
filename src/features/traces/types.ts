// src/features/traces/types.ts
// Runtime types for the traces feature. Shape mirrors the OTel `otel_traces`
// ClickHouse table produced by the OTel collector's `clickhouse` exporter.

export type SpanStatus = "OK" | "ERROR" | "UNSET";

export interface SpanEvent {
  name: string;
  timestamp: string; // ISO string
  attributes: Record<string, string>;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId: string;
  name: string;
  kind: string;
  serviceName: string;
  /** ISO timestamp when the span started. */
  startTime: string;
  /** Duration in nanoseconds — matches `otel_traces.Duration`. */
  durationNs: number;
  statusCode: SpanStatus;
  statusMessage?: string;
  attributes: Record<string, string>;
  events: SpanEvent[];
}

export interface Trace {
  traceId: string;
  spans: Span[];
  /** Earliest span start time (ISO). */
  startTime: string;
  /** Latest span end time (ISO). */
  endTime: string;
  /** Total duration in nanoseconds. */
  durationNs: number;
  serviceNames: string[];
}

export const DEFAULT_TRACES_TABLE = "otel_traces";
