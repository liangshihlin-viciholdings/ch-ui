// engineCompletions.ts
// Per-engine completion introspection for the SQL editor. Every engine's
// query returns rows shaped like ClickHouse's system.completions:
//   word    — the completable text
//   context — 'database' | 'table' | 'column' | 'function' | 'keyword'
//   belongs — table rows: owning schema/database; column rows: owning TABLE
//             name (not schema-qualified); NULL otherwise.
// The introspection SQL follows each adapter's listSchemas()/listTables()
// namespace model so inserted "<database>.<table>" text is executable on that
// engine. Exception: the postgres table/column branches additionally exclude
// system schemas (pg_catalog/information_schema/pg_toast*/pg_temp*) and
// non-table relations as completion noise, which the sidebar does not filter.
// Engines whose built-ins can't be enumerated via SQL (MySQL functions and
// keywords, SQLite keywords) get curated static rows appended after fetch.

import type { Engine } from "@/lib/db-adapter/types";
import { DDL_OBJECTS, getAllEngines } from "./clickhouseConstants";

export interface CompletionRow {
  word: string;
  context: string;
  belongs: string | null;
}

// ─── Introspection queries ─────────────────────────────────────────────────

export const COMPLETION_QUERIES: Record<Engine, string> = {
  clickhouse: `SELECT word, context, belongs FROM system.completions`,

  // Validated against Postgres 16. The database branch is deliberately
  // unfiltered to exactly match PostgresAdapter.listSchemas(); the table and
  // column branches exclude system schemas as sidebar-level noise.
  postgres: `SELECT schema_name AS word, 'database' AS context, NULL::text AS belongs
FROM information_schema.schemata

UNION ALL

SELECT table_name AS word, 'table' AS context, table_schema AS belongs
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND table_schema NOT LIKE 'pg_toast%'
  AND table_schema NOT LIKE 'pg_temp%'
  AND table_type IN ('BASE TABLE', 'VIEW')

UNION ALL

SELECT column_name AS word, 'column' AS context, table_name AS belongs
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND table_schema NOT LIKE 'pg_toast%'
  AND table_schema NOT LIKE 'pg_temp%'

UNION ALL

SELECT DISTINCT p.proname AS word, 'function' AS context, NULL::text AS belongs
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'pg_catalog'
  AND p.prokind IN ('f', 'a', 'w')

UNION ALL

SELECT word, 'keyword' AS context, NULL::text AS belongs
FROM pg_get_keywords()`,

  // information_schema only — version/fork-agnostic (MySQL 5.7/8.x, MariaDB).
  // Unfiltered on purpose: MySQLAdapter.listSchemas()/listTables() don't hide
  // information_schema/mysql/performance_schema/sys either. Built-in functions
  // and keywords are not portably enumerable via SQL → static rows below.
  mysql: `SELECT SCHEMA_NAME AS word, 'database' AS context, NULL AS belongs
FROM information_schema.SCHEMATA

UNION ALL

SELECT TABLE_NAME AS word, 'table' AS context, TABLE_SCHEMA AS belongs
FROM information_schema.TABLES

UNION ALL

SELECT COLUMN_NAME AS word, 'column' AS context, TABLE_NAME AS belongs
FROM information_schema.COLUMNS`,

  // SQLiteAdapter.listSchemas() is hardcoded to [{name:"main"}]; the literal
  // 'main' row and the sqlite_% / type IN ('table','view') filters mirror it.
  // pragma_function_list needs SQLite >= 3.30 (better-sqlite3 bundles 3.53).
  // The GLOB filter drops the '->' / '->>' operator entries, which would be
  // rendered incorrectly as 'word(' by the function completion.
  sqlite: `SELECT 'main' AS word, 'database' AS context, NULL AS belongs
UNION ALL
SELECT name AS word, 'table' AS context, 'main' AS belongs
FROM sqlite_master
WHERE type IN ('table', 'view')
  AND name NOT LIKE 'sqlite_%'
UNION ALL
SELECT p.name AS word, 'column' AS context, m.name AS belongs
FROM sqlite_master m
JOIN pragma_table_info(m.name) p
WHERE m.type IN ('table', 'view')
  AND m.name NOT LIKE 'sqlite_%'
UNION ALL
SELECT DISTINCT name AS word, 'function' AS context, NULL AS belongs
FROM pragma_function_list()
WHERE name GLOB '[A-Za-z]*'`,

  // Validated against DuckDB 1.5 via @duckdb/node-api. DISTINCT collapses the
  // duplicate 'main' schema rows information_schema.schemata emits across the
  // memory/system/temp catalogs. The identifier regex drops operator-symbol
  // "functions" ('%', '&&', …); '__'-prefixed internal helpers are excluded.
  duckdb: `SELECT DISTINCT word, context, belongs FROM (
  SELECT schema_name AS word, 'database' AS context, CAST(NULL AS VARCHAR) AS belongs
  FROM information_schema.schemata

  UNION ALL

  SELECT table_name AS word, 'table' AS context, table_schema AS belongs
  FROM information_schema.tables

  UNION ALL

  SELECT column_name AS word, 'column' AS context, table_name AS belongs
  FROM information_schema.columns

  UNION ALL

  SELECT function_name AS word, 'function' AS context, CAST(NULL AS VARCHAR) AS belongs
  FROM duckdb_functions()
  WHERE function_type IN ('scalar', 'aggregate', 'macro')
    AND function_name ~ '^[A-Za-z_][A-Za-z0-9_]*$'
    AND NOT starts_with(function_name, '__')

  UNION ALL

  SELECT keyword_name AS word, 'keyword' AS context, CAST(NULL AS VARCHAR) AS belongs
  FROM duckdb_keywords()
) t`,
};

// ─── Static rows (engines whose built-ins aren't SQL-enumerable) ───────────

function staticRows(context: string, words: string[]): CompletionRow[] {
  return words.map((word) => ({ word, context, belongs: null }));
}

// ponytail: curated lists, not exhaustive — extend when users miss something.
// Note: LEFT/RIGHT string functions are deliberately absent — they collide
// with the LEFT/RIGHT join keywords and the label-based dedup would keep the
// function entry, whose apply inserts "LEFT(" mid-JOIN.
const MYSQL_FUNCTIONS = [
  "COUNT", "SUM", "AVG", "MIN", "MAX", "GROUP_CONCAT", "STDDEV", "VARIANCE",
  "CONCAT", "CONCAT_WS", "SUBSTRING", "SUBSTR", "LENGTH",
  "CHAR_LENGTH", "LOWER", "UPPER", "TRIM", "LTRIM", "RTRIM", "REPLACE",
  "REVERSE", "REPEAT", "LPAD", "RPAD", "INSTR", "LOCATE", "POSITION",
  "SUBSTRING_INDEX", "FORMAT", "FIELD", "ELT", "ABS", "CEIL", "CEILING",
  "FLOOR", "ROUND", "TRUNCATE", "MOD", "POW", "POWER", "SQRT", "RAND", "SIGN",
  "GREATEST", "LEAST", "NOW", "CURDATE", "CURTIME", "DATE", "DATE_ADD",
  "DATE_SUB", "DATEDIFF", "DATE_FORMAT", "STR_TO_DATE", "YEAR", "MONTH", "DAY",
  "DAYOFWEEK", "DAYNAME", "HOUR", "MINUTE", "SECOND", "TIMESTAMPDIFF",
  "TIMESTAMPADD", "UNIX_TIMESTAMP", "FROM_UNIXTIME", "LAST_DAY", "IF",
  "IFNULL", "NULLIF", "COALESCE", "ISNULL", "CAST", "CONVERT", "JSON_EXTRACT",
  "JSON_OBJECT", "JSON_ARRAY", "JSON_VALID", "JSON_ARRAYAGG", "JSON_OBJECTAGG",
  "JSON_CONTAINS", "JSON_KEYS", "MD5", "SHA1", "SHA2", "UUID",
  "LAST_INSERT_ID", "DATABASE", "USER", "VERSION", "ROW_NUMBER", "RANK",
  "DENSE_RANK", "LAG", "LEAD", "NTILE", "FIRST_VALUE", "LAST_VALUE",
];

const MYSQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "EXISTS", "BETWEEN",
  "LIKE", "IS", "NULL", "ORDER", "BY", "GROUP", "HAVING", "LIMIT", "OFFSET",
  "JOIN", "INNER", "LEFT", "RIGHT", "OUTER", "CROSS", "ON", "AS", "DISTINCT",
  "UNION", "ALL", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE",
  "CREATE", "TABLE", "ALTER", "DROP", "INDEX", "VIEW", "PRIMARY", "KEY",
  "FOREIGN", "REFERENCES", "UNIQUE", "DEFAULT", "AUTO_INCREMENT", "CONSTRAINT",
  "CHECK", "CASCADE", "TRIGGER", "PROCEDURE", "FUNCTION", "BEGIN", "END",
  "CASE", "WHEN", "THEN", "ELSE", "WITH", "RECURSIVE", "PARTITION", "OVER",
  "ASC", "DESC", "USING", "NATURAL",
];

const SQLITE_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "LIMIT",
  "OFFSET", "JOIN", "INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "CROSS JOIN",
  "ON", "AS", "AND", "OR", "NOT", "IN", "LIKE", "GLOB", "BETWEEN", "IS",
  "NULL", "DISTINCT", "ALL", "UNION", "UNION ALL", "EXCEPT", "INTERSECT",
  "CASE", "WHEN", "THEN", "ELSE", "END", "ASC", "DESC", "INSERT INTO",
  "VALUES", "UPDATE", "SET", "DELETE FROM", "CREATE TABLE", "CREATE VIEW",
  "CREATE INDEX", "CREATE TRIGGER", "DROP TABLE", "DROP VIEW", "DROP INDEX",
  "ALTER TABLE", "ADD COLUMN", "RENAME TO", "PRIMARY KEY", "FOREIGN KEY",
  "REFERENCES", "UNIQUE", "DEFAULT", "CHECK", "AUTOINCREMENT", "WITH",
  "RECURSIVE", "EXISTS", "CAST", "COLLATE", "PRAGMA", "ATTACH", "DETACH",
  "VACUUM", "BEGIN", "COMMIT", "ROLLBACK", "TRANSACTION", "CONFLICT",
  "REPLACE", "IF NOT EXISTS", "IF EXISTS", "TEMP", "TEMPORARY", "WINDOW",
  "OVER", "PARTITION BY", "RETURNING", "USING", "NATURAL",
];

export const STATIC_COMPLETION_ROWS: Partial<Record<Engine, CompletionRow[]>> =
  {
    mysql: [
      ...staticRows("function", MYSQL_FUNCTIONS),
      ...staticRows("keyword", MYSQL_KEYWORDS),
    ],
    sqlite: staticRows("keyword", SQLITE_KEYWORDS),
  };

// ─── Per-engine clause suggestions ─────────────────────────────────────────

/** Object types suggested after CREATE / ALTER / DROP. */
export const DDL_OBJECTS_BY_ENGINE: Record<Engine, string[]> = {
  clickhouse: DDL_OBJECTS,
  postgres: [
    "TABLE", "VIEW", "MATERIALIZED VIEW", "INDEX", "SCHEMA", "DATABASE",
    "SEQUENCE", "FUNCTION", "TRIGGER", "TYPE", "EXTENSION", "ROLE", "USER",
  ],
  mysql: [
    "TABLE", "VIEW", "INDEX", "DATABASE", "SCHEMA", "FUNCTION", "PROCEDURE",
    "TRIGGER", "EVENT", "USER",
  ],
  sqlite: ["TABLE", "VIEW", "INDEX", "TRIGGER", "VIRTUAL TABLE"],
  duckdb: [
    "TABLE", "VIEW", "INDEX", "SCHEMA", "SEQUENCE", "MACRO", "TYPE", "SECRET",
  ],
};

// DuckDB's WHERE-clause surface intentionally tracks Postgres.
const POSTGRES_STYLE_OPERATORS = [
  "AND", "OR", "NOT", "IN", "LIKE", "ILIKE", "BETWEEN", "IS NULL",
  "IS NOT NULL", "EXISTS", "ANY", "ALL", "SIMILAR TO",
];

/** Operator keywords suggested inside WHERE / PREWHERE / HAVING. */
export const WHERE_OPERATORS_BY_ENGINE: Record<Engine, string[]> = {
  clickhouse: [
    "AND", "OR", "NOT", "IN", "LIKE", "BETWEEN",
    "GLOBAL IN", "GLOBAL NOT IN", "ANY", "ALL", "ILIKE",
  ],
  postgres: POSTGRES_STYLE_OPERATORS,
  mysql: [
    "AND", "OR", "NOT", "IN", "LIKE", "BETWEEN", "IS NULL", "IS NOT NULL",
    "EXISTS", "REGEXP",
  ],
  sqlite: [
    "AND", "OR", "NOT", "IN", "LIKE", "GLOB", "BETWEEN", "IS NULL",
    "IS NOT NULL", "EXISTS",
  ],
  duckdb: POSTGRES_STYLE_OPERATORS,
};

/** ENGINE = … clause values. Only ClickHouse and MySQL have the clause. */
export const TABLE_ENGINES_BY_ENGINE: Partial<Record<Engine, string[]>> = {
  clickhouse: getAllEngines(),
  mysql: [
    "InnoDB", "MyISAM", "MEMORY", "CSV", "ARCHIVE", "BLACKHOLE", "FEDERATED",
    "NDB",
  ],
};
