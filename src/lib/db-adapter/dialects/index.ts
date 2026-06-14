// Dialect registry — resolves DialectDescriptor by engine ID.
// Each engine registers its dialect here. The editor reads from this
// registry based on the active tab's connectionId → engine mapping.
//
// IMPORTANT: dialect descriptors live in sibling files in this directory
// and must NOT import native database drivers. They only depend on
// @codemirror/lang-sql. This keeps the renderer bundle free of pg,
// mysql2, better-sqlite3, and @duckdb/node-api.

import { sql } from "@codemirror/lang-sql";
import type { DialectDescriptor } from "../types";
import { clickhouseDialect } from "../clickhouse";
import { postgresDialect } from "./postgres";
import { mysqlDialect } from "./mysql";
import { sqliteDialect } from "./sqlite";
import { duckdbDialect } from "./duckdb";

// Fallback dialect for engines without a registered adapter.
const fallbackSqlDialect: DialectDescriptor = {
  languageSupport: () => sql(),
  extractParams: (query: string) => ({ cleanedQuery: query, params: {} }),
  isCommand: (query: string) => {
    const q = query.trim().toLowerCase();
    return /^(create|insert|update|delete|drop|alter|truncate|grant|revoke)\b/.test(q);
  },
  isExplain: (query: string) => {
    return query.trim().toUpperCase().startsWith("EXPLAIN");
  },
};

const dialects = new Map<string, DialectDescriptor>([
  ["clickhouse", clickhouseDialect],
  ["postgres", postgresDialect],
  ["mysql", mysqlDialect],
  ["sqlite", sqliteDialect],
  ["duckdb", duckdbDialect],
]);

export function getDialect(engineId: string): DialectDescriptor {
  return dialects.get(engineId) ?? fallbackSqlDialect;
}

export function registerDialect(engineId: string, dialect: DialectDescriptor): void {
  dialects.set(engineId, dialect);
}
