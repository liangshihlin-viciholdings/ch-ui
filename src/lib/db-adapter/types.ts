// Database adapter types — the abstraction layer that lets deebee support
// multiple database engines (ClickHouse, Postgres, MySQL, SQLite, DuckDB)
// behind a single interface. The web build only uses ClickHouseAdapter;
// the desktop build can instantiate adapters per connection.

// Avoid importing LanguageSupport directly — @codemirror/language's package.json
// doesn't declare types in its exports map, which breaks TS moduleResolution: "bundler".
// Instead we infer the type from @codemirror/lang-sql's sql() return type.
import type { sql } from "@codemirror/lang-sql";

export type Engine = "clickhouse" | "postgres" | "mysql" | "sqlite" | "duckdb";

// ─── Connection config ────────────────────────────────────────────────────

export interface ServerConnectionConfig {
  kind: "server";
  engine: Engine;
  host: string;
  port: number;
  username: string;
  password: string;
  database?: string;
  /** request-level timeout in ms */
  requestTimeout?: number;
  /** extra connection options (e.g. custom path for ClickHouse) */
  extra?: Record<string, unknown>;
}

export interface FileConnectionConfig {
  kind: "file";
  engine: Engine;
  filePath: string;
  /** DuckDB supports ":memory:" */
  memory?: boolean;
}

export type ConnectionConfig = ServerConnectionConfig | FileConnectionConfig;

// ─── Query results ────────────────────────────────────────────────────────

export interface ColumnMeta {
  name: string;
  type: string;
}

export interface QueryStatistics {
  elapsed: number;
  rows_read: number;
  bytes_read: number;
}

export interface AdapterQueryResult {
  meta: ColumnMeta[];
  data: Record<string, unknown>[];
  statistics: QueryStatistics;
  rows: number;
  error: string | null;
}

// ─── Schema introspection ─────────────────────────────────────────────────

export interface SchemaInfo {
  name: string;
}

export interface TableInfo {
  name: string;
  type: string;
  totalBytes?: number;
  /** optional column list — populated when table is expanded */
  columns?: ColumnMeta[];
}

export interface DatabaseInfo {
  name: string;
  tables: TableInfo[];
}

// ─── Capabilities ─────────────────────────────────────────────────────────

export interface AdminCapabilities {
  users: boolean;
  roles: boolean;
  grants: boolean;
  rowPolicies: boolean;
  quotas: boolean;
  settingsProfiles: boolean;
}

export interface AdapterCapabilities {
  /** supports admin/privilege introspection */
  hasAdminIntrospection: boolean;
  /** supports EXPLAIN variants */
  hasExplain: boolean;
  /** supports parameterized queries */
  hasParameterizedQueries: boolean;
  /** server-based (host/port/creds) vs file-based */
  isServer: boolean;
  /** supports streaming results */
  hasStreaming: boolean;
  /** admin features available per engine (undefined = no admin) */
  admin?: AdminCapabilities;
}

// ─── Dialect descriptor ───────────────────────────────────────────────────

type LanguageSupport = ReturnType<typeof sql>;

export interface DialectDescriptor {
  /** CodeMirror language support for the SQL dialect */
  languageSupport: () => LanguageSupport;
  /** Extract named parameters from a query string */
  extractParams(query: string): {
    cleanedQuery: string;
    params: Record<string, string>;
  };
  /** Detect whether a query is a command (DDL/DML that doesn't return rows) */
  isCommand(query: string): boolean;
  /** Detect EXPLAIN queries */
  isExplain(query: string): boolean;
}

// ─── Admin entities ────────────────────────────────────────────────────────

export interface AdminUser {
  name: string;
  login?: boolean;
  superuser?: boolean;
  defaultRoles?: string[];
  settingsProfile?: string;
  host?: string;
  readonly?: boolean;
}

export interface AdminRole {
  name: string;
  members?: string[];
  readonly?: boolean;
}

export interface AdminGrant {
  grantee: string;
  privilege: string;
  object?: string;
  grantOption?: boolean;
}

export interface AdminRowPolicy {
  name: string;
  table: string;
  filter: string;
  roles?: string[];
}

// ─── DbAdapter ────────────────────────────────────────────────────────────

export interface DbAdapter {
  readonly engineId: string;
  readonly capabilities: AdapterCapabilities;
  readonly dialect: DialectDescriptor;

  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  ping(): Promise<boolean>;

  /** Execute a query that returns rows */
  query(
    sql: string,
    params?: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<AdapterQueryResult>;

  /** Execute a command (DDL/DML) that doesn't return rows */
  command(sql: string, signal?: AbortSignal): Promise<void>;

  /** Server version string */
  getVersion(): Promise<string>;

  // Schema introspection
  listSchemas(): Promise<SchemaInfo[]>;
  listTables(schema: string): Promise<TableInfo[]>;
  describeTable(schema: string, table: string): Promise<ColumnMeta[]>;

  // Admin introspection (only when capabilities.hasAdminIntrospection)
  checkIsAdmin?(): Promise<boolean>;
  checkPrivileges?(): Promise<Record<string, boolean>>;

  // Admin entity introspection (gated by capabilities.admin)
  listUsers?(): Promise<AdminUser[]>;
  listRoles?(): Promise<AdminRole[]>;
  listGrants?(grantee?: string): Promise<AdminGrant[]>;
  listRowPolicies?(): Promise<AdminRowPolicy[]>;
}
