// src/features/sessions/types.ts
// Lightweight session-replay model — ch-ui is not a full session replay
// tool, so we only track what we can reliably pull from otel_logs.

export interface SessionSummary {
  sessionId: string;
  userId: string | null;
  startTime: string;
  endTime: string;
  durationMs: number;
  eventCount: number;
  errorCount: number;
  /** First non-empty URL seen in the session, if any. */
  firstUrl: string | null;
}

export type SessionEventKind =
  | "navigation"
  | "click"
  | "error"
  | "network"
  | "log"
  | "other";

export interface SessionEvent {
  id: string;
  timestamp: string;
  kind: SessionEventKind;
  severity: string | null;
  message: string;
  url: string | null;
  raw: Record<string, unknown>;
}

export interface SessionListRange {
  start: Date;
  end: Date;
}
