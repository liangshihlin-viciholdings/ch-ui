// Postgres dialect descriptor — web-safe (no driver imports).
// The adapter class lives in ../postgres.ts and imports this.

import { sql, PostgreSQL } from "@codemirror/lang-sql";
import type { DialectDescriptor } from "../types";

export const postgresDialect: DialectDescriptor = {
  languageSupport: () => sql({ dialect: PostgreSQL }),

  // Postgres uses $1, $2, ... natively — no extraction needed.
  extractParams: (query: string) => ({ cleanedQuery: query, params: {} }),

  isCommand: (query: string) => {
    const q = query.trim().toLowerCase();
    return /^(create|insert|update|delete|drop|alter|truncate|grant|revoke|begin|commit|rollback|vacuum|reindex|cluster|copy|set)\b/.test(q);
  },

  isExplain: (query: string) =>
    query.trim().toUpperCase().startsWith("EXPLAIN"),
};
