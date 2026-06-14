// DbAdapter barrel — re-export types and the ClickHouse adapter.
// Additional adapters (Postgres, MySQL, SQLite, DuckDB) will be added
// here when the desktop build lands.

export type {
  DbAdapter,
  ConnectionConfig,
  ServerConnectionConfig,
  FileConnectionConfig,
  AdapterQueryResult,
  ColumnMeta,
  QueryStatistics,
  SchemaInfo,
  TableInfo,
  DatabaseInfo,
  AdapterCapabilities,
  AdminCapabilities,
  AdminUser,
  AdminRole,
  AdminGrant,
  AdminRowPolicy,
  DialectDescriptor,
} from "./types";

export { ClickHouseAdapter } from "./clickhouse";
export { getDialect, registerDialect } from "./dialects";
