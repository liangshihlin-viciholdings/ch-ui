// src/lib/db/schema.ts
// IndexedDB Schema Definitions for CH-UI

export interface SavedConnection {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
  useAdvanced: boolean;
  customPath: string;
  requestTimeout: number;
  isDistributed: boolean;
  clusterName: string;
  isDefault: boolean;
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
  url: string;
  username: string;
  password: string;
  useAdvanced: boolean;
  customPath: string;
  requestTimeout: number;
  isDistributed: boolean;
  clusterName: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Export format for connections
export interface ExportedConnection {
  name: string;
  url: string;
  username: string;
  password?: string;
  useAdvanced: boolean;
  customPath: string;
  requestTimeout: number;
  isDistributed: boolean;
  clusterName: string;
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
  createdAt: Date;
  updatedAt: Date;
}

export type CreateDashboard = Omit<
  SavedDashboard,
  "id" | "createdAt" | "updatedAt"
>;
