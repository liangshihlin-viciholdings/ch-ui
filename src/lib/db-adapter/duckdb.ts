// DuckDB adapter — implements DbAdapter for file-based DuckDB connections.
// Uses @duckdb/node-api for instance/connection management.

import { DuckDBInstance } from "@duckdb/node-api";
import type { DuckDBConnection } from "@duckdb/node-api";
import type { DuckDBType } from "@duckdb/node-api";
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
import { duckdbDialect } from "./dialects/duckdb";

// ─── Capabilities ─────────────────────────────────────────────────────────

const DUCKDB_CAPABILITIES: AdapterCapabilities = {
  hasAdminIntrospection: false,
  hasExplain: false,
  hasParameterizedQueries: true,
  isServer: false,
  hasStreaming: false,
};

// ─── Adapter ──────────────────────────────────────────────────────────────

export class DuckDBAdapter implements DbAdapter {
  readonly engineId = "duckdb";
  readonly capabilities = DUCKDB_CAPABILITIES;
  readonly dialect = duckdbDialect;

  private instance: DuckDBInstance | null = null;
  private connection: DuckDBConnection | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    if (config.kind !== "file") {
      throw new Error("DuckDB adapter requires a file connection config");
    }
    const fileConfig = config as FileConnectionConfig;
    const path = fileConfig.memory ? ":memory:" : fileConfig.filePath;
    this.instance = await DuckDBInstance.create(path);
    this.connection = await this.instance.connect();
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      this.connection.disconnectSync();
      this.connection = null;
    }
    if (this.instance) {
      this.instance.closeSync();
      this.instance = null;
    }
  }

  async ping(): Promise<boolean> {
    if (!this.connection) {
      throw new Error("DuckDB connection is not initialized");
    }
    await this.connection.run("SELECT 1");
    return true;
  }

  async query(
    sqlText: string,
    _params?: Record<string, string>,
    _signal?: AbortSignal,
  ): Promise<AdapterQueryResult> {
    if (!this.connection) {
      throw new Error("DuckDB connection is not initialized");
    }

    const trimmedQuery = sqlText.trim();
    if (!trimmedQuery) {
      return {
        meta: [],
        data: [],
        statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
        rows: 0,
        error: null,
      };
    }

    if (this.dialect.isCommand(trimmedQuery)) {
      await this.connection.run(trimmedQuery);
      return {
        meta: [],
        data: [],
        statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
        rows: 0,
        error: null,
      };
    }

    const reader = await this.connection.runAndReadAll(trimmedQuery);
    await reader.readAll();
    const rows = reader.getRowObjects();
    const columnNames = reader.columnNames();
    const columnTypes = reader.columnTypes();

    const meta: ColumnMeta[] = columnNames.map((name, i) => ({
      name,
      type: duckdbTypeToString(columnTypes[i]),
    }));

    return {
      meta,
      data: rows as Record<string, unknown>[],
      statistics: { elapsed: 0, rows_read: rows.length, bytes_read: 0 },
      rows: rows.length,
      error: null,
    };
  }

  async command(sqlText: string, _signal?: AbortSignal): Promise<void> {
    if (!this.connection) {
      throw new Error("DuckDB connection is not initialized");
    }
    await this.connection.run(sqlText);
  }

  async getVersion(): Promise<string> {
    if (!this.connection) {
      throw new Error("DuckDB connection is not initialized");
    }
    const reader = await this.connection.runAndReadAll("SELECT version()");
    await reader.readAll();
    const rows = reader.getRowObjects();
    return String(rows[0]["version()"] ?? "unknown");
  }

  async listSchemas(): Promise<SchemaInfo[]> {
    if (!this.connection) {
      throw new Error("DuckDB connection is not initialized");
    }
    const reader = await this.connection.runAndReadAll(
      "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name",
    );
    await reader.readAll();
    const rows = reader.getRowObjects();
    return rows.map((row) => ({
      name: String(row["schema_name"]),
    }));
  }

  async listTables(schema: string): Promise<TableInfo[]> {
    if (!this.connection) {
      throw new Error("DuckDB connection is not initialized");
    }
    const reader = await this.connection.runAndReadAll(
      "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name",
      [schema],
    );
    await reader.readAll();
    const rows = reader.getRowObjects();
    return rows.map((row) => ({
      name: String(row["table_name"]),
      type: String(row["table_type"] ?? "BASE TABLE"),
    }));
  }

  async describeTable(schema: string, table: string): Promise<ColumnMeta[]> {
    if (!this.connection) {
      throw new Error("DuckDB connection is not initialized");
    }
    const reader = await this.connection.runAndReadAll(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position",
      [schema, table],
    );
    await reader.readAll();
    const rows = reader.getRowObjects();
    return rows.map((row) => ({
      name: String(row["column_name"]),
      type: String(row["data_type"]),
    }));
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Convert a DuckDBType to a human-readable string (e.g. "VARCHAR", "INTEGER").
 * DuckDBType subclasses have a toString() method that returns the canonical
 * type name, so we delegate to that.
 */
function duckdbTypeToString(type: DuckDBType): string {
  return type.toString();
}
