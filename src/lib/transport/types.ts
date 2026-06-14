// Transport types — the seam between renderer and database adapters.
// Web build: calls go in-process. Electron: calls go over IPC.
// Both paths produce the same serializable result envelope.

import type {
  AdapterQueryResult,
  ColumnMeta,
  DatabaseInfo,
  SchemaInfo,
  TableInfo,
  ConnectionConfig,
  AdapterCapabilities,
  AdminUser,
  AdminRole,
  AdminGrant,
  AdminRowPolicy,
} from "@/lib/db-adapter/types";

// ─── Serializable result envelope ─────────────────────────────────────────

export interface TransportError {
  message: string;
  category: string;
}

// ─── Transport interface ──────────────────────────────────────────────────

export interface AdapterTransport {
  /** Connect to a database */
  connect(config: ConnectionConfig): Promise<void>;
  /** Disconnect */
  disconnect(): Promise<void>;
  /** Ping */
  ping(): Promise<boolean>;
  /** Get server version */
  getVersion(): Promise<string>;

  /** Execute a query */
  query(
    sql: string,
    params?: Record<string, string>,
    cancelToken?: string,
  ): Promise<AdapterQueryResult>;

  /** Execute a command (DDL/DML) */
  command(sql: string, cancelToken?: string): Promise<void>;

  /** Cancel a running query by token */
  cancel(cancelToken: string): Promise<void>;

  // Schema introspection
  listSchemas(): Promise<SchemaInfo[]>;
  listTables(schema: string): Promise<TableInfo[]>;
  describeTable(schema: string, table: string): Promise<ColumnMeta[]>;
  listDatabases(): Promise<DatabaseInfo[]>;

  // Admin (optional — only for engines that support it)
  checkIsAdmin?(): Promise<boolean>;
  checkPrivileges?(): Promise<Record<string, boolean>>;
  getCapabilities?(): Promise<AdapterCapabilities>;

  // Admin entity introspection (gated by capabilities.admin)
  listUsers?(): Promise<AdminUser[]>;
  listRoles?(): Promise<AdminRole[]>;
  listGrants?(grantee?: string): Promise<AdminGrant[]>;
  listRowPolicies?(): Promise<AdminRowPolicy[]>;
}
