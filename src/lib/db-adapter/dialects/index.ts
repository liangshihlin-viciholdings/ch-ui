// Dialect registry — resolves DialectDescriptor by engine ID.
// Each engine registers its dialect here. The editor reads from this
// registry based on the active tab's connectionId → engine mapping.

import { sql } from "@codemirror/lang-sql";
import type { DialectDescriptor } from "../types";
import { clickhouseDialect } from "../clickhouse";

// Placeholder dialects for engines that don't have adapters yet.
// They use standard SQL with no param extraction.

const standardSqlDialect: DialectDescriptor = {
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
  ["postgres", standardSqlDialect],
  ["mysql", standardSqlDialect],
  ["sqlite", standardSqlDialect],
  ["duckdb", standardSqlDialect],
]);

export function getDialect(engineId: string): DialectDescriptor {
  return dialects.get(engineId) ?? standardSqlDialect;
}

export function registerDialect(engineId: string, dialect: DialectDescriptor): void {
  dialects.set(engineId, dialect);
}
