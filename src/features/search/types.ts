// src/features/search/types.ts
// Runtime types for the search feature — kept isolated from the Dexie layer
// so src/lib/db/schema.ts can remain dependency-free.

export type SearchOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "contains"
  | "exists";

export interface SearchFilter {
  field: string;
  operator: SearchOperator;
  value: string;
}

export interface SearchQueryInput {
  /** Free-text query, parsed with the simple `field:value` splitter. */
  query: string;
  /** Active filter pills. */
  filters: SearchFilter[];
  /** Fully-qualified source table (e.g. `otel.otel_logs`). */
  tableName: string;
  /** Inclusive time range to scan. */
  dateRange: [Date, Date];
  /** Row limit. Defaults to 500 in the hook. */
  limit?: number;
  /** Timestamp column name. Defaults to `Timestamp` for OTel tables. */
  timestampColumn?: string;
}

// Runtime shape for a persisted search (ISO-string dates, typed filters).
// Dexie stores the underlying SavedSearch row with Date objects + opaque
// filter blobs; see src/db/alerts.ts for the conversion.
export interface SavedSearchRuntime {
  id: string;
  name: string;
  query: string;
  tableName: string;
  filters: SearchFilter[];
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_LOGS_TABLE = "otel_logs";
export const DEFAULT_TIMESTAMP_COLUMN = "Timestamp";
export const DEFAULT_LOG_COLUMNS: ReadonlyArray<string> = [
  "Timestamp",
  "SeverityText",
  "ServiceName",
  "Body",
  "TraceId",
  "SpanId",
] as const;
