// SQLite dialect descriptor — web-safe (no driver imports).
// The adapter class lives in ../sqlite.ts and imports this.

import { sql, SQLite } from "@codemirror/lang-sql";
import type { DialectDescriptor } from "../types";

export const sqliteDialect: DialectDescriptor = {
  languageSupport: () => sql({ dialect: SQLite }),

  // SQLite uses ?-style positional params — no named-param extraction.
  extractParams: (query: string) => ({ cleanedQuery: query, params: {} }),

  isCommand: (query: string) => {
    const q = query.trim().toLowerCase();
    return /^(create|insert|update|delete|drop|alter|truncate|grant|revoke|attach|detach|reindex|vacuum|pragma)\b/.test(q);
  },

  isExplain: (query: string) =>
    query.trim().toUpperCase().startsWith("EXPLAIN"),
};
