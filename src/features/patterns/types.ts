// src/features/patterns/types.ts
// Log-pattern analysis types. A "pattern" is a normalized log body where
// variable tokens (numbers, UUIDs, hex ids) have been replaced with `*`.

export interface LogPattern {
  /** Normalized body, e.g. "Request * failed after * ms". */
  pattern: string;
  /** Total occurrences in the window. */
  count: number;
  /** Sample of the original body (first match). */
  sample: string;
  /** Earliest timestamp of a matching log. */
  firstSeen: string;
  /** Latest timestamp of a matching log. */
  lastSeen: string;
  /** Count of matches with severity ≥ ERROR. */
  errorCount: number;
}

export interface PatternSample {
  id: string;
  timestamp: string;
  severity: string | null;
  body: string;
  serviceName: string | null;
}

export interface PatternRange {
  start: Date;
  end: Date;
}
