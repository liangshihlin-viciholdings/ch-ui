// src/lib/dbeaver/types.ts
// On-disk shapes for DBeaver Community's workspace config and the normalized
// result our importer produces. Pure types — safe to import from the renderer
// (web + desktop) and from the Electron main process.

import type { Engine } from "@/lib/db-adapter/types";

// ─── DBeaver data-sources.json ──────────────────────────────────────────────

/** A connection's `configuration` block in data-sources.json. */
export interface DbeaverConfiguration {
  host?: string;
  /** DBeaver stores port as a string in most versions, integer in some. */
  port?: string | number;
  database?: string;
  /** Full JDBC URL, e.g. "jdbc:postgresql://host:5432/db" or "jdbc:sqlite:/path". */
  url?: string;
  user?: string;
  /** Usually null — real passwords live (encrypted) in credentials-config.json. */
  password?: string | null;
  "save-password"?: boolean;
  "auth-model"?: string;
  /** Driver-specific key/value pairs (SSL flags, charset, custom path, …). */
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DbeaverConnectionEntry {
  /** Provider plugin id, e.g. "clickhouse", "postgresql", "mysql", "generic". */
  provider?: string;
  /** Driver id, e.g. "postgres-jdbc", "mysql:mysql8", "generic:sqlite_jdbc". */
  driver?: string;
  name?: string;
  /** Folder reference: a UUID key into `folders`, or a literal path string. */
  folder?: string | null;
  configuration?: DbeaverConfiguration;
  [key: string]: unknown;
}

export interface DbeaverFolder {
  name?: string;
  description?: string;
  "parent-folder"?: string | null;
}

export interface DbeaverDataSourcesFile {
  folders?: Record<string, DbeaverFolder>;
  connections?: Record<string, DbeaverConnectionEntry>;
}

// ─── DBeaver credentials-config.json (decrypted) ────────────────────────────

export interface DbeaverCredentialEntry {
  /** The primary connection credentials scope. */
  "#connection"?: { user?: string; password?: string };
  [scope: string]: unknown;
}

/** Decrypted credentials keyed by the same connection id as data-sources.json. */
export type DbeaverCredentialsMap = Record<string, DbeaverCredentialEntry>;

// ─── Normalized importer output ─────────────────────────────────────────────

/** A DBeaver connection mapped onto deebee's connection shape. */
export interface ImportedConnection {
  /** DBeaver connection id (the key in data-sources.json `connections`). */
  sourceId: string;
  /** Display name, folder-prefixed (e.g. "Prod / Analytics / My DB"). */
  name: string;
  engine: Engine;
  /**
   * deebee connection url. For server engines: "host:port" (ClickHouse gets an
   * http(s):// scheme so the adapter's URL parser keeps it). Empty for file engines.
   */
  url: string;
  database?: string;
  username: string;
  /** Recovered password, or "" when it could not be decrypted/found. */
  password: string;
  /** True only when a real password was recovered. */
  hasPassword: boolean;
  /** File path for sqlite/duckdb (absent ⇒ in-memory). */
  filePath?: string;
  /** Resolved folder path, if the connection lived in a folder. */
  folderPath?: string;
}

/** A DBeaver connection we could not import (unsupported engine, etc.). */
export interface SkippedConnection {
  sourceId: string;
  name: string;
  /** The driver/provider id we failed to map. */
  driver: string;
  reason: string;
}

export interface DbeaverParseResult {
  connections: ImportedConnection[];
  skipped: SkippedConnection[];
}
