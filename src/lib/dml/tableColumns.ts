/**
 * Per-engine introspection for the save-to-database flow: one query that
 * returns the target table's columns plus which of them form the row key
 * (primary key; for ClickHouse, primary key falling back to the sorting key).
 * Executed through the connection's transport — DbAdapter/ColumnMeta are
 * intentionally left untouched (no PK concept there today).
 */

import type { Engine } from "@/lib/db-adapter/types";

export interface TableColumns {
	/** All physical columns, in table order. */
	columns: string[];
	/** Key columns used for UPDATE/DELETE row identity. */
	keyColumns: string[];
}

/** Escape a string literal for interpolation into a metadata query. */
function lit(engine: Engine, s: string): string {
	if (engine === "clickhouse" || engine === "mysql") {
		return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
	}
	return `'${s.replace(/'/g, "''")}'`;
}

export function tableColumnsQuery(
	engine: Engine,
	database: string | null,
	table: string,
): string {
	const t = lit(engine, table);
	switch (engine) {
		case "clickhouse":
			return `SELECT name, is_in_primary_key, is_in_sorting_key
FROM system.columns
WHERE database = ${database ? lit(engine, database) : "currentDatabase()"} AND table = ${t}
ORDER BY position`;
		case "postgres":
			return `SELECT c.column_name AS name,
  EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.table_schema = tc.table_schema
     AND kcu.table_name = tc.table_name
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema = c.table_schema
      AND tc.table_name = c.table_name
      AND kcu.column_name = c.column_name
  ) AS is_key
FROM information_schema.columns c
WHERE c.table_name = ${t}
  AND c.table_schema = ${database ? lit(engine, database) : "current_schema()"}
ORDER BY c.ordinal_position`;
		case "mysql":
			return `SELECT COLUMN_NAME AS name, (COLUMN_KEY = 'PRI') AS is_key
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = ${database ? lit(engine, database) : "DATABASE()"} AND TABLE_NAME = ${t}
ORDER BY ORDINAL_POSITION`;
		case "sqlite":
			// Second arg = schema, so ATTACH-qualified tables resolve against
			// the right database instead of silently falling back to main.
			return `SELECT name, (pk > 0) AS is_key FROM pragma_table_info(${t}${
				database ? `, ${lit(engine, database)}` : ""
			})`;
		case "duckdb":
			return `SELECT c.column_name AS name,
  c.column_name IN (
    SELECT unnest(constraint_column_names)
    FROM duckdb_constraints()
    WHERE constraint_type = 'PRIMARY KEY' AND table_name = ${t}
      ${database ? `AND schema_name = ${lit(engine, database)}` : ""}
  ) AS is_key
FROM information_schema.columns c
WHERE c.table_name = ${t}
  ${database ? `AND c.table_schema = ${lit(engine, database)}` : ""}
ORDER BY c.ordinal_position`;
	}
}

function truthy(v: unknown): boolean {
	return v === true || v === 1 || v === "1" || v === "true";
}

export function parseTableColumns(
	engine: Engine,
	data: Record<string, unknown>[],
): TableColumns {
	const columns = data
		.map((r) => r.name)
		.filter((n): n is string => typeof n === "string");
	if (engine === "clickhouse") {
		// Primary key preferred; a MergeTree without an explicit PRIMARY KEY
		// reports the sorting key as both, so the fallback rarely fires.
		const primary = data
			.filter((r) => truthy(r.is_in_primary_key))
			.map((r) => r.name as string);
		const sorting = data
			.filter((r) => truthy(r.is_in_sorting_key))
			.map((r) => r.name as string);
		return { columns, keyColumns: primary.length ? primary : sorting };
	}
	return {
		columns,
		keyColumns: data.filter((r) => truthy(r.is_key)).map((r) => r.name as string),
	};
}
