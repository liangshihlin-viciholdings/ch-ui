// SQLite adapter — implements DbAdapter for file-based SQLite databases.
// Uses better-sqlite3 (synchronous) under the hood; all methods return
// Promises for interface compatibility with the server-based adapters.

import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import type {
  DbAdapter,
  ConnectionConfig,
  FileConnectionConfig,
  AdapterQueryResult,
  ColumnMeta,
  SchemaInfo,
  TableInfo,
  AdapterCapabilities,
} from "./types";
import { sqliteDialect } from "./dialects/sqlite";

// ─── Capabilities ─────────────────────────────────────────────────────────

const SQLITE_CAPABILITIES: AdapterCapabilities = {
  hasAdminIntrospection: false,
  hasExplain: false,
  hasParameterizedQueries: true,
  isServer: false,
  hasStreaming: false,
};

// ─── Adapter ──────────────────────────────────────────────────────────────

export class SQLiteAdapter implements DbAdapter {
  readonly engineId = "sqlite";
  readonly capabilities = SQLITE_CAPABILITIES;
  readonly dialect = sqliteDialect;

  private db: DatabaseType | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    if (config.kind !== "file") {
      throw new Error("SQLite adapter requires a file connection config");
    }
    const fileConfig = config as FileConnectionConfig;
    const target = fileConfig.memory ? ":memory:" : fileConfig.filePath;
    this.db = new Database(target);
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async ping(): Promise<boolean> {
    // File-based — if the Database handle is open we are "connected".
    return this.db !== null && this.db.open;
  }

  async query(
    sqlText: string,
    _params?: Record<string, string>,
    _signal?: AbortSignal,
  ): Promise<AdapterQueryResult> {
    if (!this.db) {
      throw new Error("SQLite database is not initialized");
    }

    const trimmed = sqlText.trim();
    if (!trimmed) {
      return {
        meta: [],
        data: [],
        statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
        rows: 0,
        error: null,
      };
    }

    // Route DDL/DML through command().
    if (this.dialect.isCommand(trimmed)) {
      await this.command(trimmed);
      return {
        meta: [],
        data: [],
        statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
        rows: 0,
        error: null,
      };
    }

    const stmt = this.db.prepare(trimmed);
    const rows = stmt.all() as Record<string, unknown>[];
    const columns = stmt.columns();

    return {
      meta: columns.map((col) => ({
        name: col.name,
        type: col.type ?? "ANY",
      })),
      data: rows,
      statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
      rows: rows.length,
      error: null,
    };
  }

  async command(sqlText: string, _signal?: AbortSignal): Promise<void> {
    if (!this.db) {
      throw new Error("SQLite database is not initialized");
    }
    this.db.exec(sqlText);
  }

  async getVersion(): Promise<string> {
    if (!this.db) {
      throw new Error("SQLite database is not initialized");
    }
    const row = this.db
      .prepare("SELECT sqlite_version() AS version")
      .get() as { version: string };
    return row.version;
  }

  async listSchemas(): Promise<SchemaInfo[]> {
    // SQLite has a single "main" schema (plus temp and attached DBs).
    return [{ name: "main" }];
  }

  async listTables(_schema: string): Promise<TableInfo[]> {
    if (!this.db) {
      throw new Error("SQLite database is not initialized");
    }
    const rows = this.db
      .prepare(
        `SELECT name, type
         FROM sqlite_master
         WHERE type IN ('table', 'view')
           AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all() as { name: string; type: string }[];

    return rows.map((row) => ({
      name: row.name,
      type: row.type,
    }));
  }

  async describeTable(_schema: string, table: string): Promise<ColumnMeta[]> {
    if (!this.db) {
      throw new Error("SQLite database is not initialized");
    }
    const rows = this.db
      .prepare(`SELECT name AS column_name, type AS data_type FROM pragma_table_info(?)`)
      .all(table) as { column_name: string; data_type: string }[];

    return rows.map((row) => ({
      name: row.column_name,
      type: row.data_type,
    }));
  }
}
