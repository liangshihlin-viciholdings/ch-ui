// DuckDB dialect descriptor — web-safe (no driver imports).
// The adapter class lives in ../duckdb.ts and imports this.

import { sql } from "@codemirror/lang-sql";
import type { DialectDescriptor } from "../types";

export const duckdbDialect: DialectDescriptor = {
  languageSupport: () => sql(),

  // DuckDB uses $1, $2, ... positional parameters.
  extractParams: (query: string) => ({ cleanedQuery: query, params: {} }),

  isCommand: (query: string) => {
    const q = query.trim().toLowerCase();
    return /^(create|insert|update|delete|drop|alter|truncate|grant|revoke|attach|detach|use|set|copy|load|install|vacuum|checkpoint)\b/.test(q);
  },

  isExplain: (query: string) =>
    query.trim().toUpperCase().startsWith("EXPLAIN"),
};
