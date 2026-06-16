// ClickHouse adapter — ports the logic formerly in workspaceStore into
// a self-contained adapter that implements DbAdapter. The workspaceStore
// now delegates to this instead of importing @clickhouse/client-web directly.

import { createClient } from "@clickhouse/client-web";
import type {
  ClickHouseClient,
  ResponseJSON,
} from "@clickhouse/client-web";
import type { OverflowMode } from "@clickhouse/client-common/dist/settings";
import { sql } from "@codemirror/lang-sql";
import { ClickHouseError } from "@/lib/clickhouseError";
import type {
  DbAdapter,
  ConnectionConfig,
  ServerConnectionConfig,
  AdapterQueryResult,
  ColumnMeta,
  SchemaInfo,
  TableInfo,
  DatabaseInfo,
  AdapterCapabilities,
  DialectDescriptor,
} from "./types";
import {
  isCreateOrInsert,
  isExplainQuery,
  isJsonExplain,
  extractQueryParams,
  stripTrailingFormat,
} from "@/helpers/sqlUtils";
import { ExplainParser } from "@/features/workspace/explain/parser";

// ─── Capabilities ─────────────────────────────────────────────────────────

const CLICKHOUSE_CAPABILITIES: AdapterCapabilities = {
  hasAdminIntrospection: true,
  hasExplain: true,
  hasParameterizedQueries: true,
  isServer: true,
  hasStreaming: false,
  admin: {
    users: true,
    roles: true,
    grants: true,
    rowPolicies: true,
    quotas: true,
    settingsProfiles: true,
  },
};

// ─── Dialect descriptor ───────────────────────────────────────────────────

export const clickhouseDialect: DialectDescriptor = {
  languageSupport: () => sql(),

  extractParams: (query: string) => {
    const { cleanedQuery, queryParams } = extractQueryParams(query);
    return { cleanedQuery, params: queryParams };
  },

  isCommand: (query: string) => isCreateOrInsert(query),

  isExplain: (query: string) => isExplainQuery(query),
};

// ─── Adapter ──────────────────────────────────────────────────────────────

/**
 * Build a valid ClickHouse client URL from a host (which may or may not carry
 * a scheme) and an optional port. @clickhouse/client requires an absolute
 * http(s):// URL, so a bare host is given an http:// scheme defensively.
 */
function buildClickHouseUrl(host: string, port?: number): string {
  const withScheme = /^https?:\/\//i.test(host) ? host : `http://${host}`;
  const base = port ? `${withScheme}:${port}` : withScheme;
  return base.replace(/\/+$/, "");
}

export class ClickHouseAdapter implements DbAdapter {
  readonly engineId = "clickhouse";
  readonly capabilities = CLICKHOUSE_CAPABILITIES;
  readonly dialect = clickhouseDialect;

  private client: ClickHouseClient | null = null;
  private config: ServerConnectionConfig | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    if (config.kind !== "server") {
      throw new ClickHouseError(
        "ClickHouse adapter requires a server connection config",
      );
    }
    this.config = config;
    const url = buildClickHouseUrl(config.host, config.port);
    this.client = createClient({
      url,
      pathname: (config.extra?.customPath as string) || undefined,
      username: config.username,
      password: config.password || "",
      request_timeout: config.requestTimeout || 30000,
      database: config.database,
      clickhouse_settings: {
        max_result_rows: "200",
        max_result_bytes: "0",
        result_overflow_mode: "break" as OverflowMode,
      },
    });
    await this.ping();
  }

  async disconnect(): Promise<void> {
    this.client = null;
    this.config = null;
  }

  async ping(): Promise<boolean> {
    if (!this.client) {
      throw new ClickHouseError(
        "ClickHouse client is not initialized",
        null,
        "connection",
        ["Please enter your connection details and try again"],
      );
    }
    await this.client.ping();
    return true;
  }

  getClient(): ClickHouseClient | null {
    return this.client;
  }

  /** Re-create the client with updated settings (e.g. clickhouse_settings). */
  async updateSettings(
    settings: Record<string, unknown>,
  ): Promise<void> {
    if (!this.config) {
      throw new ClickHouseError("No active connection to reconfigure");
    }
    this.client = createClient({
      url: buildClickHouseUrl(this.config.host, this.config.port),
      pathname:
        (this.config.extra?.customPath as string) || undefined,
      username: this.config.username,
      password: this.config.password || "",
      request_timeout: this.config.requestTimeout || 30000,
      database: this.config.database,
      clickhouse_settings: settings as any,
    });
    await this.ping();
  }

  async query(
    sql: string,
    params?: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<AdapterQueryResult> {
    if (!this.client) {
      throw new ClickHouseError("ClickHouse client is not initialized");
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

    if (this.dialect.isCommand(trimmedQuery)) {
      await this.client.command({
        query: trimmedQuery,
        abort_signal: signal,
      });
      return {
        meta: [],
        data: [],
        statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
        rows: 0,
        error: null,
      };
    }

    // The client appends `FORMAT JSON` for parsing; drop any trailing FORMAT
    // the user wrote so we don't end up with two FORMAT clauses (which errors).
    const queryForClient = stripTrailingFormat(trimmedQuery);
    const result = await this.client.query({
      query: queryForClient,
      ...(params && Object.keys(params).length > 0 && { query_params: params }),
      abort_signal: signal,
    });

    if (
      this.dialect.isExplain(trimmedQuery) &&
      !isJsonExplain(trimmedQuery)
    ) {
      const textResult = await result.text();
      const rows = textResult
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => ({ explain: line }));
      const syntheticJson = {
        meta: [{ name: "explain", type: "String" }],
        data: rows,
        rows: rows.length,
        statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
      };
      const explainResult = ExplainParser.parse(trimmedQuery, syntheticJson);
      return {
        meta: syntheticJson.meta as ColumnMeta[],
        data: syntheticJson.data as Record<string, unknown>[],
        statistics: syntheticJson.statistics,
        rows: syntheticJson.rows,
        error: null,
        explainResult,
      } as AdapterQueryResult & { explainResult: unknown };
    }

    const jsonResult = (await result.json()) as any;
    const processed: AdapterQueryResult = {
      meta: jsonResult.meta || [],
      data: jsonResult.data || [],
      statistics: jsonResult.statistics || {
        elapsed: 0,
        rows_read: 0,
        bytes_read: 0,
      },
      rows: jsonResult.rows || 0,
      error: null,
    };

    if (this.dialect.isExplain(trimmedQuery)) {
      (processed as AdapterQueryResult & { explainResult: unknown }).explainResult =
        ExplainParser.parse(trimmedQuery, jsonResult);
    }

    return processed;
  }

  async command(sql: string, signal?: AbortSignal): Promise<void> {
    if (!this.client) {
      throw new ClickHouseError("ClickHouse client is not initialized");
    }
    await this.client.command({ query: sql, abort_signal: signal });
  }

  async getVersion(): Promise<string> {
    if (!this.client) {
      throw new ClickHouseError("ClickHouse client is not initialized");
    }
    const result = await this.client.query({ query: "SELECT version()" });
    const data = (await result.json()) as {
      data: { "version()": string }[];
    };
    return data.data[0]["version()"];
  }

  async listSchemas(): Promise<SchemaInfo[]> {
    const dbs = await this.listDatabases();
    return dbs.map((d) => ({ name: d.name }));
  }

  async listTables(schema: string): Promise<TableInfo[]> {
    const dbs = await this.listDatabases();
    const db = dbs.find((d) => d.name === schema);
    return db?.tables ?? [];
  }

  async describeTable(schema: string, table: string): Promise<ColumnMeta[]> {
    if (!this.client) {
      throw new ClickHouseError("ClickHouse client is not initialized");
    }
    const result = await this.client.query({
      query: `SELECT name, type FROM system.columns WHERE database = '${schema}' AND table = '${table}' ORDER BY position`,
    });
    const data = (await result.json()) as {
      data: { name: string; type: string }[];
    };
    return data.data.map((row) => ({
      name: row.name,
      type: row.type,
    }));
  }

  async checkIsAdmin(): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    try {
      const result = await this.client.query({
        query: `
          SELECT if(grant_option = 1, true, false) AS is_admin
          FROM system.grants
          WHERE user_name = currentUser()
          LIMIT 1
        `,
      });
      const response = (await result.json()) as {
        data: Array<{ is_admin: boolean }>;
      };
      if (!Array.isArray(response.data) || response.data.length === 0) {
        return false;
      }
      return response.data[0].is_admin;
    } catch {
      return false;
    }
  }

  async checkPrivileges(): Promise<Record<string, boolean>> {
    if (!this.client) {
      return {};
    }
    try {
      const result = await this.client.query({
        query: `
          SELECT DISTINCT access_type, grant_option
          FROM system.grants
          WHERE user_name = currentUser()
             OR role_name IN (
               SELECT granted_role_name
               FROM system.role_grants
               WHERE user_name = currentUser()
             )
        `,
      });
      const response = (await result.json()) as ResponseJSON<{
        access_type: string;
        grant_option: number;
      }>;

      const grantedPrivileges = new Set(
        response.data.map((row) => row.access_type.toUpperCase()),
      );
      const hasGrantOption = response.data.some(
        (row) => row.grant_option === 1,
      );

      const hasPrivilege = (privilege: string): boolean =>
        grantedPrivileges.has(privilege.toUpperCase()) ||
        grantedPrivileges.has("ALL");

      return {
        canShowUsers:
          hasPrivilege("SHOW USERS") || hasPrivilege("SHOW ACCESS"),
        canShowRoles:
          hasPrivilege("SHOW ROLES") || hasPrivilege("SHOW ACCESS"),
        canShowQuotas:
          hasPrivilege("SHOW QUOTAS") || hasPrivilege("SHOW ACCESS"),
        canShowRowPolicies:
          hasPrivilege("SHOW ROW POLICIES") || hasPrivilege("SHOW ACCESS"),
        canShowSettingsProfiles:
          hasPrivilege("SHOW SETTINGS PROFILES") ||
          hasPrivilege("SHOW ACCESS"),
        canAlterUser:
          hasPrivilege("ALTER USER") || hasPrivilege("ACCESS MANAGEMENT"),
        canCreateUser:
          hasPrivilege("CREATE USER") || hasPrivilege("ACCESS MANAGEMENT"),
        canDropUser:
          hasPrivilege("DROP USER") || hasPrivilege("ACCESS MANAGEMENT"),
        canAlterRole:
          hasPrivilege("ALTER ROLE") ||
          hasPrivilege("ROLE ADMIN") ||
          hasPrivilege("ACCESS MANAGEMENT"),
        canCreateRole:
          hasPrivilege("CREATE ROLE") ||
          hasPrivilege("ROLE ADMIN") ||
          hasPrivilege("ACCESS MANAGEMENT"),
        canDropRole:
          hasPrivilege("DROP ROLE") ||
          hasPrivilege("ROLE ADMIN") ||
          hasPrivilege("ACCESS MANAGEMENT"),
        canAlterQuota:
          hasPrivilege("ALTER QUOTA") || hasPrivilege("ACCESS MANAGEMENT"),
        canCreateQuota:
          hasPrivilege("CREATE QUOTA") || hasPrivilege("ACCESS MANAGEMENT"),
        canDropQuota:
          hasPrivilege("DROP QUOTA") || hasPrivilege("ACCESS MANAGEMENT"),
        canAlterRowPolicy:
          hasPrivilege("ALTER ROW POLICY") ||
          hasPrivilege("ACCESS MANAGEMENT"),
        canCreateRowPolicy:
          hasPrivilege("CREATE ROW POLICY") ||
          hasPrivilege("ACCESS MANAGEMENT"),
        canDropRowPolicy:
          hasPrivilege("DROP ROW POLICY") ||
          hasPrivilege("ACCESS MANAGEMENT"),
        canAlterSettingsProfile:
          hasPrivilege("ALTER SETTINGS PROFILE") ||
          hasPrivilege("ACCESS MANAGEMENT"),
        canCreateSettingsProfile:
          hasPrivilege("CREATE SETTINGS PROFILE") ||
          hasPrivilege("ACCESS MANAGEMENT"),
        canDropSettingsProfile:
          hasPrivilege("DROP SETTINGS PROFILE") ||
          hasPrivilege("ACCESS MANAGEMENT"),
        hasGrantOption,
      };
    } catch {
      return {};
    }
  }

  /** Fetch all databases with their tables (used by the explorer). */
  async listDatabases(): Promise<DatabaseInfo[]> {
    if (!this.client) {
      throw new ClickHouseError("ClickHouse client is not initialized");
    }
    const query = `
      SELECT
        databases.name AS database_name,
        tables.name AS table_name,
        tables.engine AS table_type,
        tables.total_bytes AS total_bytes
      FROM system.databases AS databases
      LEFT JOIN system.tables AS tables
        ON databases.name = tables.database

      UNION ALL

      SELECT
        database AS database_name,
        name AS table_name,
        'Dictionary' AS table_type,
        bytes_allocated AS total_bytes
      FROM system.dictionaries

      ORDER BY database_name, table_name;
    `;
    const result = await this.client.query({ query });
    const resultJSON = (await result.json()) as {
      data: Array<{
        database_name: string;
        table_name?: string;
        table_type?: string;
        total_bytes?: number;
      }>;
    };

    const MAPPED_TABLE_TYPE: Record<string, string> = {
      view: "view",
      dictionary: "dictionary",
      materializedview: "materialized_view",
    };

    const databases: Record<string, DatabaseInfo> = {};
    resultJSON.data.forEach((row) => {
      const { database_name, table_name, table_type, total_bytes } = row;
      if (!databases[database_name]) {
        databases[database_name] = {
          name: database_name,
          tables: [],
        };
      }
      if (table_name) {
        const mappedType =
          (table_type && MAPPED_TABLE_TYPE[table_type.toLowerCase()]) || "table";
        databases[database_name].tables.push({
          name: table_name,
          type: mappedType,
          totalBytes: total_bytes ?? 0,
        });
      }
    });

    return Object.values(databases);
  }
}
