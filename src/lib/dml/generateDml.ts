/**
 * Generate UPDATE / INSERT / DELETE statements from a staged grid diff.
 * Pure: no I/O. Any doubt becomes an entry in `errors` (which blocks the
 * confirm button) — never a silently wrong statement.
 *
 * Row identity is strict: WHERE clauses target the caller-supplied key
 * columns using the row's ORIGINAL (pre-edit) values.
 */

import {
	type ColumnTypeAst,
	parseClickHouseType,
} from "@/components/common/clickhouseTypes";
import type { Engine } from "@/lib/db-adapter/types";
import type { ResultDiff, RowData } from "@/lib/resultDiff";

export interface DmlPlan {
	statements: string[];
	warnings: string[];
	errors: string[];
}

export interface GenerateDmlOptions {
	engine: Engine;
	database: string | null;
	table: string;
	diff: ResultDiff;
	/** Key columns (from table introspection) identifying physical rows. */
	keyColumns: string[];
	/** Result columns in display order (result meta names). */
	columns: string[];
	/** Result column name → raw type string (from result meta). */
	columnTypes: Record<string, string>;
}

export function quoteIdent(engine: Engine, name: string): string {
	if (engine === "clickhouse" || engine === "mysql") {
		return `\`${name.replace(/`/g, "``")}\``;
	}
	return `"${name.replace(/"/g, '""')}"`;
}

function quoteString(engine: Engine, s: string): string {
	if (engine === "clickhouse" || engine === "mysql") {
		return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
	}
	return `'${s.replace(/'/g, "''")}'`;
}

function unwrapType(raw: string): string {
	let t = raw.trim();
	for (;;) {
		const m = /^(?:Nullable|LowCardinality)\((.*)\)$/i.exec(t);
		if (!m) return t;
		t = m[1].trim();
	}
}

const NUMERIC_RE =
	/^(u?int|float|decimal|numeric|real|double|smallint|bigint|integer|tinyint|mediumint|serial|number|bool)/i;
const NUMERIC_LITERAL_RE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;

function isNumericType(rawType: string): boolean {
	return NUMERIC_RE.test(unwrapType(rawType));
}

type LiteralResult = { sql: string } | { err: string };

/** Format a scalar cell value as a SQL literal, guided by the column type. */
function scalarLiteral(
	engine: Engine,
	value: unknown,
	rawType: string,
): LiteralResult {
	if (value === null || value === undefined) return { sql: "NULL" };
	if (typeof value === "number") {
		return Number.isFinite(value)
			? { sql: String(value) }
			: { err: `non-finite number ${value}` };
	}
	if (typeof value === "boolean") {
		// Postgres/DuckDB booleans reject bare 1/0; the rest accept both.
		return engine === "postgres" || engine === "duckdb"
			? { sql: value ? "TRUE" : "FALSE" }
			: { sql: value ? "1" : "0" };
	}
	if (typeof value === "string") {
		// 64-bit ints (and some decimals) arrive from the server as strings —
		// keep them unquoted for numeric columns when they look like numbers.
		if (isNumericType(rawType) && NUMERIC_LITERAL_RE.test(value.trim())) {
			return { sql: value.trim() };
		}
		return { sql: quoteString(engine, value) };
	}
	return { err: `unsupported ${typeof value} value` };
}

/** ClickHouse literal for structured values (Array/Map/Tuple), AST-guided. */
function chLiteral(value: unknown, ast: ColumnTypeAst): LiteralResult {
	if (value === null || value === undefined) return { sql: "NULL" };
	switch (ast.kind) {
		case "Nullable":
		case "LowCardinality":
			return chLiteral(value, ast.inner);
		case "Array": {
			if (!Array.isArray(value)) return { err: "expected an array value" };
			const items: string[] = [];
			for (const v of value) {
				const r = chLiteral(v, ast.element);
				if ("err" in r) return r;
				items.push(r.sql);
			}
			return { sql: `[${items.join(", ")}]` };
		}
		case "Map": {
			if (typeof value !== "object" || Array.isArray(value)) {
				return { err: "expected an object value for Map" };
			}
			const items: string[] = [];
			for (const [k, v] of Object.entries(value as RowData)) {
				const kr = chLiteral(k, ast.key);
				if ("err" in kr) return kr;
				const vr = chLiteral(v, ast.value);
				if ("err" in vr) return vr;
				items.push(`${kr.sql}: ${vr.sql}`);
			}
			return { sql: `{${items.join(", ")}}` };
		}
		case "Tuple": {
			const vals = Array.isArray(value)
				? value
				: ast.fields.every((f) => f.name !== null) &&
						typeof value === "object"
					? ast.fields.map((f) => (value as RowData)[f.name as string])
					: null;
			if (!vals || vals.length !== ast.fields.length) {
				return { err: "tuple value does not match its type" };
			}
			const items: string[] = [];
			for (let i = 0; i < vals.length; i++) {
				const r = chLiteral(vals[i], ast.fields[i].type);
				if ("err" in r) return r;
				items.push(r.sql);
			}
			return { sql: `(${items.join(", ")})` };
		}
		case "Scalar":
			return scalarLiteral("clickhouse", value, ast.raw);
		default:
			return { err: `${ast.kind} columns cannot be saved` };
	}
}

function cellLiteral(
	engine: Engine,
	value: unknown,
	rawType: string,
): LiteralResult {
	if (typeof value === "object" && value !== null) {
		if (engine === "clickhouse") {
			return chLiteral(value, parseClickHouseType(rawType));
		}
		return { err: `structured values are not supported for ${engine}` };
	}
	if (engine === "clickhouse") {
		return chLiteral(value, parseClickHouseType(rawType));
	}
	return scalarLiteral(engine, value, rawType);
}

export function generateDml(opts: GenerateDmlOptions): DmlPlan {
	const { engine, database, table, diff, keyColumns, columns, columnTypes } =
		opts;
	const statements: string[] = [];
	const warnings: string[] = [];
	const errors: string[] = [];
	const qi = (n: string) => quoteIdent(engine, n);
	const target = database ? `${qi(database)}.${qi(table)}` : qi(table);
	const isCH = engine === "clickhouse";
	const chSettings = " SETTINGS mutations_sync = 1";

	const lit = (col: string, value: unknown, ctx: string): string | null => {
		const r = cellLiteral(engine, value, columnTypes[col] ?? "");
		if ("err" in r) {
			errors.push(`${ctx}: column ${col}: ${r.err}`);
			return null;
		}
		return r.sql;
	};

	const whereFor = (base: RowData, ctx: string): string | null => {
		const parts: string[] = [];
		for (const k of keyColumns) {
			const v = base[k];
			if (v === null || v === undefined) {
				parts.push(`${qi(k)} IS NULL`);
				continue;
			}
			const l = lit(k, v, ctx);
			if (l === null) return null;
			parts.push(`${qi(k)} = ${l}`);
		}
		return parts.join(" AND ");
	};

	// ── UPDATEs ──────────────────────────────────────────────────────────────
	for (const u of diff.updates) {
		const ctx = `update of row ${u.baseIndex + 1}`;
		if (isCH) {
			const keyEdit = u.changedCols.find((c) => keyColumns.includes(c));
			if (keyEdit) {
				errors.push(
					`${ctx}: ClickHouse cannot UPDATE key column ${keyEdit}. Delete and re-insert the row instead.`,
				);
				continue;
			}
		}
		const sets: string[] = [];
		for (const c of u.changedCols) {
			const l = lit(c, u.row[c], ctx);
			if (l === null) {
				sets.length = 0;
				break;
			}
			sets.push(`${qi(c)} = ${l}`);
		}
		if (!sets.length) continue;
		const where = whereFor(u.base, ctx);
		if (where === null) continue;
		statements.push(
			isCH
				? `ALTER TABLE ${target} UPDATE ${sets.join(", ")} WHERE ${where}${chSettings}`
				: `UPDATE ${target} SET ${sets.join(", ")} WHERE ${where}`,
		);
	}

	// ── DELETEs ──────────────────────────────────────────────────────────────
	for (const d of diff.deletes) {
		const ctx = `delete of row ${d.baseIndex + 1}`;
		const where = whereFor(d.base, ctx);
		if (where === null) continue;
		statements.push(
			isCH
				? `ALTER TABLE ${target} DELETE WHERE ${where}${chSettings}`
				: `DELETE FROM ${target} WHERE ${where}`,
		);
	}

	// ── INSERTs (added + duplicated rows), one multi-row statement ──────────
	if (diff.inserts.length) {
		const rowsSql: string[] = [];
		for (let i = 0; i < diff.inserts.length; i++) {
			const ctx = `insert of new row ${i + 1}`;
			const vals: string[] = [];
			let failed = false;
			for (const c of columns) {
				const l = lit(c, diff.inserts[i][c], ctx);
				if (l === null) {
					failed = true;
					break;
				}
				vals.push(l);
			}
			if (!failed) rowsSql.push(`(${vals.join(", ")})`);
		}
		if (rowsSql.length === diff.inserts.length) {
			statements.push(
				`INSERT INTO ${target} (${columns.map(qi).join(", ")}) VALUES ${rowsSql.join(", ")}`,
			);
		}
	}

	if (isCH && (diff.updates.length || diff.deletes.length)) {
		warnings.push(
			"ClickHouse keys are not unique: each UPDATE/DELETE affects every row matching the key values, and mutations rewrite data asynchronously (mutations_sync = 1 waits for this replica).",
		);
	}

	return { statements, warnings, errors };
}
