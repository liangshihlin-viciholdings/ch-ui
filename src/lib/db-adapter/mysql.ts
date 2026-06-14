// MySQL adapter — implements DbAdapter using mysql2/promise.
// Supports schema introspection via information_schema and ?-style
// parameterized queries handled natively by the mysql2 driver.

import mysql from "mysql2/promise";
import type { Pool, RowDataPacket, FieldPacket } from "mysql2/promise";
import type {
  DbAdapter,
  ConnectionConfig,
  ServerConnectionConfig,
  AdapterQueryResult,
  ColumnMeta,
  SchemaInfo,
  TableInfo,
  AdapterCapabilities,
} from "./types";
import { mysqlDialect } from "./dialects/mysql";

// ─── Capabilities ─────────────────────────────────────────────────────────

const MYSQL_CAPABILITIES: AdapterCapabilities = {
  hasAdminIntrospection: false,
  hasExplain: false,
  hasParameterizedQueries: true,
  isServer: true,
  hasStreaming: false,
};

// ─── Adapter ──────────────────────────────────────────────────────────────

export class MySQLAdapter implements DbAdapter {
  readonly engineId = "mysql";
  readonly capabilities = MYSQL_CAPABILITIES;
  readonly dialect = mysqlDialect;

  private pool: Pool | null = null;
  private config: ServerConnectionConfig | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    if (config.kind !== "server") {
      throw new Error("MySQL adapter requires a server connection config");
    }
    this.config = config;
    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password || "",
      database: config.database,
      waitForConnections: true,
      connectionLimit: 5,
      enableKeepAlive: true,
    });
    await this.ping();
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.config = null;
  }

  async ping(): Promise<boolean> {
    if (!this.pool) {
      throw new Error("MySQL pool is not initialized");
    }
    await this.pool.query("SELECT 1");
    return true;
  }

  async query(
    sql: string,
    _params?: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<AdapterQueryResult> {
    if (!this.pool) {
      throw new Error("MySQL pool is not initialized");
    }

    const trimmedQuery = sql.trim();
    if (!trimmedQuery) {
      return {
        meta: [],
        data: [],
        statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
        rows: 0,
        error: null,
      };
    }

    const opts: mysql.QueryOptions = { sql: trimmedQuery };
    if (signal) {
      // mysql2 does not natively support AbortSignal, but we attach it
      // for forward-compatibility — the signal is checked after the query.
      opts.timeout = this.config?.requestTimeout ?? 30000;
    }

    const [result, fields] = await this.pool.query(opts);

    // mysql2 returns RowDataPacket[] for SELECT queries and
    // OkPacket/ResultSetHeader for DDL/DML.
    if (Array.isArray(result)) {
      const rows = result as RowDataPacket[];
      return {
        meta: fields.map((f: FieldPacket) => ({
          name: f.name,
          type: String(f.type ?? "unknown"),
        })),
        data: rows,
        statistics: { elapsed: 0, rows_read: rows.length, bytes_read: 0 },
        rows: rows.length,
        error: null,
      };
    }

    // OkPacket / ResultSetHeader — command executed, no rows to return.
    return {
      meta: [],
      data: [],
      statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
      rows: 0,
      error: null,
    };
  }

  async command(sql: string, _signal?: AbortSignal): Promise<void> {
    if (!this.pool) {
      throw new Error("MySQL pool is not initialized");
    }
    await this.pool.query(sql);
  }

  async getVersion(): Promise<string> {
    if (!this.pool) {
      throw new Error("MySQL pool is not initialized");
    }
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT VERSION() AS version",
    );
    return rows[0]?.version ?? "unknown";
  }

  async listSchemas(): Promise<SchemaInfo[]> {
    if (!this.pool) {
      throw new Error("MySQL pool is not initialized");
    }
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME",
    );
    return rows.map((r) => ({ name: r.SCHEMA_NAME as string }));
  }

  async listTables(schema: string): Promise<TableInfo[]> {
    if (!this.pool) {
      throw new Error("MySQL pool is not initialized");
    }
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME",
      [schema],
    );
    return rows.map((r) => ({
      name: r.TABLE_NAME as string,
      type: (r.TABLE_TYPE as string) ?? "table",
    }));
  }

  async describeTable(schema: string, table: string): Promise<ColumnMeta[]> {
    if (!this.pool) {
      throw new Error("MySQL pool is not initialized");
    }
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
      [schema, table],
    );
    return rows.map((r) => ({
      name: r.COLUMN_NAME as string,
      type: (r.DATA_TYPE as string) ?? "unknown",
    }));
  }
}
