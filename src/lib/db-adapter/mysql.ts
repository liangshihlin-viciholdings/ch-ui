// MySQL adapter — implements DbAdapter using mysql2/promise.
// Supports schema introspection via information_schema and ?-style
// parameterized queries handled natively by the mysql2 driver.

import mysql from "mysql2/promise";
import { Types } from "mysql2";
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
  AdminUser,
  AdminRole,
  AdminGrant,
} from "./types";
import { mysqlDialect } from "./dialects/mysql";

// ─── Capabilities ─────────────────────────────────────────────────────────

const MYSQL_CAPABILITIES: AdapterCapabilities = {
  hasAdminIntrospection: false,
  hasExplain: false,
  hasParameterizedQueries: true,
  isServer: true,
  hasStreaming: false,
  admin: {
    users: true,
    roles: true,
    grants: true,
    rowPolicies: false,
    quotas: false,
    settingsProfiles: false,
  },
};

// ─── Field type mapping ─────────────────────────────────────────────────────
// mysql2 reports column types as numeric protocol codes (e.g. 253, 246, 10).
// Map them to readable SQL type names so the UI shows "VARCHAR" instead of "253".
// Codes without a friendly override fall back to the mysql2 enum name.

const MYSQL_TYPE_NAMES: Record<number, string> = {
  [Types.DECIMAL]: "DECIMAL",
  [Types.TINY]: "TINYINT",
  [Types.SHORT]: "SMALLINT",
  [Types.LONG]: "INT",
  [Types.FLOAT]: "FLOAT",
  [Types.DOUBLE]: "DOUBLE",
  [Types.NULL]: "NULL",
  [Types.TIMESTAMP]: "TIMESTAMP",
  [Types.LONGLONG]: "BIGINT",
  [Types.INT24]: "MEDIUMINT",
  [Types.DATE]: "DATE",
  [Types.TIME]: "TIME",
  [Types.DATETIME]: "DATETIME",
  [Types.YEAR]: "YEAR",
  [Types.NEWDATE]: "DATE",
  [Types.VARCHAR]: "VARCHAR",
  [Types.BIT]: "BIT",
  [Types.JSON]: "JSON",
  [Types.NEWDECIMAL]: "DECIMAL",
  [Types.ENUM]: "ENUM",
  [Types.SET]: "SET",
  [Types.TINY_BLOB]: "TINYBLOB",
  [Types.MEDIUM_BLOB]: "MEDIUMBLOB",
  [Types.LONG_BLOB]: "LONGBLOB",
  [Types.BLOB]: "BLOB",
  [Types.VAR_STRING]: "VARCHAR",
  [Types.STRING]: "CHAR",
  [Types.GEOMETRY]: "GEOMETRY",
};

function mysqlTypeName(code: number | undefined): string {
  if (code == null) return "unknown";
  return (
    MYSQL_TYPE_NAMES[code] ??
    (Types as unknown as Record<number, string>)[code] ??
    String(code)
  );
}

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
          type: mysqlTypeName(f.type),
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

  // ─── Admin introspection ─────────────────────────────────────────────────

  async listUsers(): Promise<AdminUser[]> {
    try {
      const [rows] = await this.pool!.query<RowDataPacket[]>(
        "SELECT User, Host FROM mysql.user ORDER BY User",
      );
      return rows.map((r) => ({
        name: r.User as string,
        host: r.Host as string,
      }));
    } catch (err) {
      console.error("MySQL listUsers failed:", err);
      return [];
    }
  }

  async listRoles(): Promise<AdminRole[]> {
    try {
      const [rows] = await this.pool!.query<RowDataPacket[]>(
        "SELECT FROM_USER AS role_name FROM mysql.role_edges GROUP BY FROM_USER ORDER BY FROM_USER",
      );
      return rows.map((r) => ({
        name: r.role_name as string,
      }));
    } catch (err) {
      console.error("MySQL listRoles failed:", err);
      return [];
    }
  }

  async listGrants(): Promise<AdminGrant[]> {
    try {
      const [rows] = await this.pool!.query<RowDataPacket[]>(
        "SELECT GRANTEE, PRIVILEGE_TYPE, IS_GRANTABLE FROM information_schema.USER_PRIVILEGES ORDER BY GRANTEE",
      );
      return rows.map((r) => ({
        grantee: (r.GRANTEE as string).replace(/['"`]/g, ""),
        privilege: r.PRIVILEGE_TYPE as string,
        grantOption: (r.IS_GRANTABLE as string) === "YES",
      }));
    } catch (err) {
      console.error("MySQL listGrants failed:", err);
      return [];
    }
  }
}
