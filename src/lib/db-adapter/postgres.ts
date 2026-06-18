// Postgres adapter — implements DbAdapter for PostgreSQL connections using
// the `pg` (node-postgres) driver. Designed for the desktop build; the web
// build only uses ClickHouseAdapter.

import { Pool } from "pg";
import type { Pool as PoolType, QueryResult } from "pg";
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
  AdminRowPolicy,
} from "./types";
import { postgresDialect } from "./dialects/postgres";

// ─── Capabilities ─────────────────────────────────────────────────────────

const POSTGRES_CAPABILITIES: AdapterCapabilities = {
  hasAdminIntrospection: false,
  hasExplain: false,
  hasParameterizedQueries: true,
  isServer: true,
  hasStreaming: false,
  admin: {
    users: true,
    roles: true,
    grants: true,
    rowPolicies: true,
    quotas: false,
    settingsProfiles: false,
  },
};

// ─── Adapter ──────────────────────────────────────────────────────────────

export class PostgresAdapter implements DbAdapter {
  readonly engineId = "postgres";
  readonly capabilities = POSTGRES_CAPABILITIES;
  readonly dialect = postgresDialect;

  private pool: PoolType | null = null;
  private config: ServerConnectionConfig | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    if (config.kind !== "server") {
      throw new Error("Postgres adapter requires a server connection config");
    }
    this.config = config;
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      query_timeout: config.requestTimeout ?? 30000,
    });
    await this.ping();
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
    this.pool = null;
    this.config = null;
  }

  async ping(): Promise<boolean> {
    if (!this.pool) {
      throw new Error("Postgres pool is not initialized");
    }
    const result = await this.pool.query("SELECT 1");
    return result.rowCount === 1;
  }

  async query(
    sql: string,
    params?: Record<string, string>,
    _signal?: AbortSignal,
  ): Promise<AdapterQueryResult> {
    if (!this.pool) {
      throw new Error("Postgres pool is not initialized");
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

    // If the query is a command, delegate to command() and return empty result.
    if (this.dialect.isCommand(trimmedQuery)) {
      await this.command(trimmedQuery, _signal);
      return {
        meta: [],
        data: [],
        statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
        rows: 0,
        error: null,
      };
    }

    const start = Date.now();

    try {
      const result: QueryResult = params && Object.keys(params).length > 0
        ? await this.pool.query({ text: trimmedQuery, values: Object.values(params) })
        : await this.pool.query(trimmedQuery);

      const elapsed = (Date.now() - start) / 1000;

      const meta: ColumnMeta[] = result.fields.map((field) => ({
        name: field.name,
        type: this.dataTypeToName(field.dataTypeID),
      }));

      const data: Record<string, unknown>[] = result.rows.map((row) =>
        row as Record<string, unknown>,
      );

      return {
        meta,
        data,
        statistics: {
          elapsed,
          rows_read: result.rowCount ?? data.length,
          bytes_read: 0,
        },
        rows: result.rowCount ?? data.length,
        error: null,
      };
    } catch (err) {
      const elapsed = (Date.now() - start) / 1000;
      const message = err instanceof Error ? err.message : String(err);
      return {
        meta: [],
        data: [],
        statistics: { elapsed, rows_read: 0, bytes_read: 0 },
        rows: 0,
        error: message,
      };
    }
  }

  async command(sql: string, _signal?: AbortSignal): Promise<void> {
    if (!this.pool) {
      throw new Error("Postgres pool is not initialized");
    }
    await this.pool.query(sql);
  }

  async getVersion(): Promise<string> {
    if (!this.pool) {
      throw new Error("Postgres pool is not initialized");
    }
    const result = await this.pool.query("SELECT version()");
    return result.rows[0]["version"] as string;
  }

  async listSchemas(): Promise<SchemaInfo[]> {
    if (!this.pool) {
      throw new Error("Postgres pool is not initialized");
    }
    const result = await this.pool.query(
      "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name",
    );
    return result.rows.map((row) => ({
      name: row["schema_name"] as string,
    }));
  }

  async listTables(schema: string): Promise<TableInfo[]> {
    if (!this.pool) {
      throw new Error("Postgres pool is not initialized");
    }
    const result = await this.pool.query(
      "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name",
      [schema],
    );
    return result.rows.map((row) => ({
      name: row["table_name"] as string,
      type: this.normalizeTableType(row["table_type"] as string),
    }));
  }

  async describeTable(schema: string, table: string): Promise<ColumnMeta[]> {
    if (!this.pool) {
      throw new Error("Postgres pool is not initialized");
    }
    const result = await this.pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position",
      [schema, table],
    );
    return result.rows.map((row) => ({
      name: row["column_name"] as string,
      type: row["data_type"] as string,
    }));
  }

  // ─── Admin introspection ────────────────────────────────────────────────

  async listUsers(): Promise<AdminUser[]> {
    try {
      const result = await this.pool!.query(
        "SELECT rolname, rolcanlogin, rolsuper FROM pg_roles WHERE rolcanlogin = true ORDER BY rolname",
      );
      return result.rows.map(
        (row): AdminUser => ({
          name: row["rolname"] as string,
          login: row["rolcanlogin"] as boolean,
          superuser: row["rolsuper"] as boolean,
        }),
      );
    } catch (err) {
      console.error("listUsers failed:", err);
      return [];
    }
  }

  async listRoles(): Promise<AdminRole[]> {
    try {
      const result = await this.pool!.query(
        "SELECT rolname FROM pg_roles ORDER BY rolname",
      );
      return result.rows.map(
        (row): AdminRole => ({
          name: row["rolname"] as string,
        }),
      );
    } catch (err) {
      console.error("listRoles failed:", err);
      return [];
    }
  }

  async listGrants(): Promise<AdminGrant[]> {
    try {
      const result = await this.pool!.query(
        "SELECT grantee, privilege_type, table_schema || '.' || table_name AS object, is_grantable FROM information_schema.role_table_grants ORDER BY grantee",
      );
      return result.rows.map(
        (row): AdminGrant => ({
          grantee: row["grantee"] as string,
          privilege: row["privilege_type"] as string,
          object: row["object"] as string,
          grantOption: row["is_grantable"] === "YES",
        }),
      );
    } catch (err) {
      console.error("listGrants failed:", err);
      return [];
    }
  }

  async listRowPolicies(): Promise<AdminRowPolicy[]> {
    try {
      const result = await this.pool!.query(
        "SELECT policyname, tablename, qual, roles FROM pg_policies ORDER BY schemaname, tablename",
      );
      return result.rows.map(
        (row): AdminRowPolicy => ({
          name: row["policyname"] as string,
          table: row["tablename"] as string,
          filter: (row["qual"] as string) ?? "",
          roles: Array.isArray(row["roles"])
            ? (row["roles"] as string[])
            : row["roles"] != null
              ? [row["roles"] as string]
              : undefined,
        }),
      );
    } catch (err) {
      console.error("listRowPolicies failed:", err);
      return [];
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Map a pg numeric dataTypeID (OID) to a human-readable type name.
   * Covers the most common built-in OIDs; falls back to the numeric OID
   * for unknown types. See pg_type system catalog.
   */
  private dataTypeToName(dataTypeID: number): string {
    const PG_TYPE_MAP: Record<number, string> = {
      16: "boolean",
      17: "bytea",
      18: "char",
      19: "name",
      20: "int8",
      21: "int2",
      23: "int4",
      25: "text",
      26: "oid",
      114: "json",
      142: "xml",
      700: "float4",
      701: "float8",
      718: "circle",
      790: "money",
      829: "macaddr",
      869: "inet",
      1042: "bpchar",
      1043: "varchar",
      1082: "date",
      1114: "timestamp",
      1184: "timestamptz",
      1186: "interval",
      1266: "timetz",
      1560: "bit",
      1562: "varbit",
      1700: "numeric",
      2950: "uuid",
      3802: "jsonb",
      3904: "int4range",
      3906: "int8range",
      3908: "numrange",
      3910: "tsrange",
      3912: "tstzrange",
      3926: "daterange",
    };
    return PG_TYPE_MAP[dataTypeID] ?? `type_oid_${dataTypeID}`;
  }

  /**
   * Normalize information_schema.table_type values to deebee's table type strings.
   * e.g. "BASE TABLE" -> "table", "VIEW" -> "view", "FOREIGN" -> "foreign_table".
   */
  private normalizeTableType(tableType: string): string {
    const normalized = tableType.toUpperCase();
    if (normalized === "BASE TABLE") return "table";
    if (normalized === "VIEW") return "view";
    if (normalized === "FOREIGN TABLE") return "foreign_table";
    if (normalized === "LOCAL TEMPORARY") return "temp";
    return tableType.toLowerCase();
  }
}
