// src/features/services/types.ts
// Types for the Service Map feature — modeled on HyperDX's ServiceMap but
// pared down to the aggregates we can compute directly from `otel_traces`.

export interface ServiceEdgeSummary {
  /** Upstream (client) service name. */
  source: string;
  /** Downstream (server) service name. */
  target: string;
  /** Total requests observed on this edge in the window. */
  totalRequests: number;
  /** Fraction of requests (0-1) where StatusCode indicates an error. */
  errorPercentage: number;
}

export interface ServiceAggregation {
  serviceName: string;
  /** Total incoming request count (server-side spans). */
  totalRequests: number;
  /** Fraction of requests (0-1) that errored. */
  errorPercentage: number;
  /** Upstream edges (callers) keyed by client service name. */
  callers: Map<string, ServiceEdgeSummary>;
  /** Downstream edges (callees) keyed by server service name. */
  callees: Map<string, ServiceEdgeSummary>;
}

export interface ServiceMapData {
  services: Map<string, ServiceAggregation>;
  edges: ServiceEdgeSummary[];
}

export interface ServiceLatencyStats {
  serviceName: string;
  p50: number;
  p95: number;
  p99: number;
  throughput: number;
  errorRate: number;
}

/** Time window for service map queries. */
export interface ServiceMapRange {
  start: Date;
  end: Date;
}
