// src/lib/db/schema.ts
// IndexedDB Schema Declarations for CH-UI

import type { Engine } from "../db-adapter/types";

export type { Engine };

export interface SavedConnection {
  id: string;
  name: string;
  /** Database engine — defaults to "clickhouse" for existing rows */
  engine: Engine;
  url: string;
  /** Default database/schema (e.g. Postgres/MySQL). Optional — ClickHouse
   *  selects its database per-query. Populated by the DBeaver importer.
   *  Non-indexed: persisted by Dexie without a schema version bump. */
  database?: string;
  username: string;
  password: string;
  useAdvanced: boolean;
  customPath: string;
  requestTimeout: number;
  isDistributed: boolean;
  clusterName: string;
  isDefault: boolean;
  /** File path for file-based engines (sqlite, duckdb) */
  filePath?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Type for creating new records (without auto-generated fields)
export type CreateConnection = Omit<
  SavedConnection,
  "id" | "createdAt" | "updatedAt"
>;

// Type for connection display (same as SavedConnection without encryption)
export interface ConnectionDisplay {
  id: string;
  name: string;
  engine: Engine;
  url: string;
  database?: string;
  username: string;
  password: string;
  useAdvanced: boolean;
  customPath: string;
  requestTimeout: number;
  isDistributed: boolean;
  clusterName: string;
  isDefault: boolean;
  filePath?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Export format for connections
export interface ExportedConnection {
  name: string;
  engine?: Engine;
  url: string;
  database?: string;
  username: string;
  password?: string;
  useAdvanced: boolean;
  customPath: string;
  requestTimeout: number;
  isDistributed: boolean;
  clusterName: string;
  filePath?: string;
}

export interface ExportData {
  version: string;
  exportedAt: string;
  connections: ExportedConnection[];
  savedQueries?: Record<string, ExportedSavedQuery[]>; // connectionName -> queries
}

// Saved Queries schema
export interface SavedQuery {
  id: string;
  name: string;
  query: string;
  connectionId: string;
  databaseName: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateSavedQuery = Omit<SavedQuery, "id" | "createdAt" | "updatedAt">;

export interface ExportedSavedQuery {
  name: string;
  query: string;
  databaseName: string;
}

// Dashboard schema — mirrors Dashboard from features/analytics/types.ts but
// kept as a self-contained DB shape so `schema.ts` has no feature imports.
// `tiles`, `tags`, `filters` are stored as opaque JSON blobs in Dexie.
export interface SavedDashboard {
  id: string;
  name: string;
  description?: string;
  tiles: unknown[];
  tags: string[];
  filters: unknown[];
  templateId?: string;
  /** Saved connection this dashboard queries. null/undefined = legacy default. */
  connectionId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateDashboard = Omit<
  SavedDashboard,
  "id" | "createdAt" | "updatedAt"
>;

// Saved Search — a reusable search query + filter set persisted locally.
// `filters` is an opaque JSON blob (runtime shape lives in
// src/features/search/types.ts).
export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  tableName: string;
  filters: unknown[];
  /** Saved connection this search runs against. null/undefined = legacy default. */
  connectionId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateSavedSearch = Omit<
  SavedSearch,
  "id" | "createdAt" | "updatedAt"
>;

// Alert — threshold-based alert on a chart-style query.
// `config` and `lastTriggered` are stored as opaque blobs; the runtime shape
// lives in src/features/alerts/types.ts.
export interface SavedAlert {
  id: string;
  name: string;
  tableName: string;
  config: unknown;
  thresholdOperator: string; // ">" | "<" | ">=" | "<=" | "==" | "!="
  thresholdValue: number;
  evaluationInterval: string; // "5m" | "15m" | "1h"
  enabled: boolean;
  connectionId?: string | null;
  lastTriggered?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateAlert = Omit<
  SavedAlert,
  "id" | "createdAt" | "updatedAt"
>;
