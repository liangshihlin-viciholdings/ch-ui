// MySQL dialect descriptor — web-safe (no driver imports).
// The adapter class lives in ../mysql.ts and imports this.

import { sql, MySQL as MySQLDialect } from "@codemirror/lang-sql";
import type { DialectDescriptor } from "../types";

const COMMAND_RE =
  /^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|RENAME|GRANT|REVOKE|SET|USE|BEGIN|COMMIT|ROLLBACK|START|LOCK|UNLOCK)\b/i;

const EXPLAIN_RE = /^\s*EXPLAIN\b/i;

export const mysqlDialect: DialectDescriptor = {
  languageSupport: () => sql({ dialect: MySQLDialect }),

  // mysql2 handles ?-style placeholders natively; no extraction needed.
  extractParams: (query: string) => ({ cleanedQuery: query, params: {} }),

  isCommand: (query: string) => COMMAND_RE.test(query),

  isExplain: (query: string) => EXPLAIN_RE.test(query),
};
