import { describe, expect, it } from "vitest";
import type { ResultDiff } from "@/lib/resultDiff";
import { generateDml, quoteIdent } from "./generateDml";
import { extractSourceTable } from "./sourceTable";
import { parseTableColumns, tableColumnsQuery } from "./tableColumns";

// ── extractSourceTable ──────────────────────────────────────────────────────

describe("extractSourceTable", () => {
	const ok = (sql: string) => {
		const r = extractSourceTable(sql);
		if (!("ok" in r) || !r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`);
		return r.ok;
	};
	const err = (sql: string) => {
		const r = extractSourceTable(sql);
		expect(r.ok).toBeUndefined();
		return (r as { error: string }).error;
	};

	it("accepts plain single-table selects", () => {
		expect(ok("SELECT a, b FROM t")).toEqual({ database: null, table: "t" });
		expect(ok("select * from db.events where a = 1 order by b limit 10;")).toEqual(
			{ database: "db", table: "events" },
		);
		expect(ok("SELECT x FROM `my db`.`my table` FINAL")).toEqual({
			database: "my db",
			table: "my table",
		});
		expect(ok('SELECT x FROM "sch"."tbl" LIMIT 5')).toEqual({
			database: "sch",
			table: "tbl",
		});
	});

	it("is not fooled by strings and comments", () => {
		expect(
			ok("SELECT a FROM t WHERE b = 'JOIN me' -- GROUP BY nothing"),
		).toEqual({ database: null, table: "t" });
	});

	it("rejects everything that is not a simple single-table SELECT", () => {
		expect(err("SELECT a FROM t JOIN u ON 1")).toMatch(/JOIN/);
		expect(err("SELECT a, count() FROM t GROUP BY a")).toMatch(/GROUP BY/);
		expect(err("SELECT DISTINCT a FROM t")).toMatch(/DISTINCT/);
		expect(err("SELECT a FROM (SELECT 1)")).toMatch(/Subqueries/);
		expect(err("WITH x AS (SELECT 1) SELECT * FROM x")).toMatch(/SELECT/);
		expect(err("SELECT a FROM t1, t2")).toMatch(/Clauses after/);
		expect(err("SELECT a FROM t AS x WHERE x.a = 1")).toMatch(/Clauses after/);
		expect(err("INSERT INTO t VALUES (1)")).toMatch(/SELECT/);
	});

	it("rejects expressions, aliases and aggregates in the SELECT list", () => {
		expect(err("SELECT id, upper(name) AS name FROM t")).toMatch(
			/plain columns/,
		);
		expect(err("SELECT max(id) AS id, name FROM t")).toMatch(/plain columns/);
		expect(err("SELECT id + 1 AS id FROM t")).toMatch(/plain columns/);
		expect(err("SELECT id AS other FROM t")).toMatch(/plain columns/);
		expect(err("SELECT t.id FROM t")).toMatch(/plain columns/);
	});

	it("is not fooled by dollar-quoted strings hiding forbidden clauses", () => {
		expect(
			err(
				"SELECT id, name FROM t WHERE bio = $$it's fine$$ AND id IN (SELECT u.id FROM u JOIN v ON u.id = v.id)",
			),
		).toMatch(/Subqueries|JOIN/);
	});

	it("rejects queries with unterminated strings instead of guessing", () => {
		expect(err("SELECT id, name FROM t WHERE x = 'oops")).toMatch(
			/Unterminated/,
		);
	});
});

// ── tableColumns ────────────────────────────────────────────────────────────

describe("tableColumns", () => {
	it("escapes literals in the metadata query", () => {
		const q = tableColumnsQuery("clickhouse", "d'b", "ta'ble");
		expect(q).toContain("'d\\'b'");
		expect(q).toContain("'ta\\'ble'");
		const pg = tableColumnsQuery("postgres", null, "ta'ble");
		expect(pg).toContain("'ta''ble'");
		expect(pg).toContain("current_schema()");
	});

	it("parses ClickHouse keys preferring primary over sorting", () => {
		const data = [
			{ name: "id", is_in_primary_key: 1, is_in_sorting_key: 1 },
			{ name: "ts", is_in_primary_key: 0, is_in_sorting_key: 1 },
			{ name: "val", is_in_primary_key: 0, is_in_sorting_key: 0 },
		];
		expect(parseTableColumns("clickhouse", data)).toEqual({
			columns: ["id", "ts", "val"],
			keyColumns: ["id"],
		});
	});

	it("falls back to the sorting key when no primary key exists", () => {
		const data = [
			{ name: "ts", is_in_primary_key: 0, is_in_sorting_key: 1 },
			{ name: "val", is_in_primary_key: 0, is_in_sorting_key: 0 },
		];
		expect(parseTableColumns("clickhouse", data).keyColumns).toEqual(["ts"]);
	});

	it("parses generic engines via is_key (handling driver truthiness)", () => {
		expect(
			parseTableColumns("postgres", [
				{ name: "id", is_key: true },
				{ name: "x", is_key: false },
			]).keyColumns,
		).toEqual(["id"]);
		expect(
			parseTableColumns("mysql", [
				{ name: "id", is_key: 1 },
				{ name: "x", is_key: 0 },
			]).keyColumns,
		).toEqual(["id"]);
	});
});

// ── generateDml ─────────────────────────────────────────────────────────────

const BASE = { id: 1, name: "a", score: 1.5 };

function plan(engine: "clickhouse" | "postgres", diff: Partial<ResultDiff>) {
	return generateDml({
		engine,
		database: "db",
		table: "t",
		diff: { updates: [], inserts: [], deletes: [], ...diff },
		keyColumns: ["id"],
		columns: ["id", "name", "score"],
		columnTypes: { id: "UInt64", name: "String", score: "Float64" },
	});
}

describe("generateDml", () => {
	it("generates ClickHouse ALTER UPDATE with key WHERE from base values", () => {
		const p = plan("clickhouse", {
			updates: [
				{
					baseIndex: 0,
					base: BASE,
					row: { ...BASE, name: "b'c" },
					changedCols: ["name"],
				},
			],
		});
		expect(p.errors).toEqual([]);
		expect(p.statements).toEqual([
			"ALTER TABLE `db`.`t` UPDATE `name` = 'b\\'c' WHERE `id` = 1 SETTINGS mutations_sync = 1",
		]);
		expect(p.warnings[0]).toMatch(/not unique/);
	});

	it("generates standard UPDATE for postgres with doubled-quote escaping", () => {
		const p = plan("postgres", {
			updates: [
				{
					baseIndex: 0,
					base: BASE,
					row: { ...BASE, name: "b'c" },
					changedCols: ["name"],
				},
			],
		});
		expect(p.statements).toEqual([
			`UPDATE "db"."t" SET "name" = 'b''c' WHERE "id" = 1`,
		]);
		expect(p.warnings).toEqual([]);
	});

	it("uses ORIGINAL key values in WHERE when a non-key edit rides along", () => {
		const p = plan("postgres", {
			updates: [
				{
					baseIndex: 0,
					base: BASE,
					row: { ...BASE, id: 1, score: 9 },
					changedCols: ["score"],
				},
			],
		});
		expect(p.statements[0]).toContain(`WHERE "id" = 1`);
	});

	it("refuses key-column updates on ClickHouse", () => {
		const p = plan("clickhouse", {
			updates: [
				{
					baseIndex: 0,
					base: BASE,
					row: { ...BASE, id: 2 },
					changedCols: ["id"],
				},
			],
		});
		expect(p.statements).toEqual([]);
		expect(p.errors[0]).toMatch(/cannot UPDATE key column id/);
	});

	it("generates deletes and a single multi-row insert", () => {
		const p = plan("clickhouse", {
			deletes: [{ baseIndex: 0, base: BASE }],
			inserts: [
				{ id: 7, name: "x", score: null },
				{ id: "9007199254740993", name: "big", score: 0 },
			],
		});
		expect(p.errors).toEqual([]);
		expect(p.statements).toEqual([
			"ALTER TABLE `db`.`t` DELETE WHERE `id` = 1 SETTINGS mutations_sync = 1",
			"INSERT INTO `db`.`t` (`id`, `name`, `score`) VALUES (7, 'x', NULL), (9007199254740993, 'big', 0)",
		]);
	});

	it("NULL keys become IS NULL", () => {
		const p = plan("postgres", {
			deletes: [{ baseIndex: 0, base: { ...BASE, id: null } }],
		});
		expect(p.statements[0]).toBe(`DELETE FROM "db"."t" WHERE "id" IS NULL`);
	});

	it("formats ClickHouse Array/Map values from their type AST", () => {
		const p = generateDml({
			engine: "clickhouse",
			database: null,
			table: "t",
			diff: {
				updates: [
					{
						baseIndex: 0,
						base: { id: 1, tags: ["a"], m: { x: 1 } },
						row: { id: 1, tags: ["a", "b'c"], m: { x: 2 } },
						changedCols: ["tags", "m"],
					},
				],
				inserts: [],
				deletes: [],
			},
			keyColumns: ["id"],
			columns: ["id", "tags", "m"],
			columnTypes: {
				id: "UInt64",
				tags: "Array(String)",
				m: "Map(String, UInt8)",
			},
		});
		expect(p.errors).toEqual([]);
		expect(p.statements[0]).toContain("`tags` = ['a', 'b\\'c']");
		expect(p.statements[0]).toContain("`m` = {'x': 2}");
	});

	it("rejects structured values on engines without literal support", () => {
		const p = generateDml({
			engine: "postgres",
			database: null,
			table: "t",
			diff: {
				updates: [
					{
						baseIndex: 0,
						base: { id: 1, tags: ["a"] },
						row: { id: 1, tags: ["b"] },
						changedCols: ["tags"],
					},
				],
				inserts: [],
				deletes: [],
			},
			keyColumns: ["id"],
			columns: ["id", "tags"],
			columnTypes: { id: "integer", tags: "text[]" },
		});
		expect(p.statements).toEqual([]);
		expect(p.errors[0]).toMatch(/structured values/);
	});

	it("refuses UPDATE/DELETE when a key column is floating-point", () => {
		const p = generateDml({
			engine: "clickhouse",
			database: null,
			table: "t",
			diff: {
				updates: [],
				inserts: [],
				deletes: [{ baseIndex: 0, base: { f: 1.1, x: "a" } }],
			},
			keyColumns: ["f"],
			columns: ["f", "x"],
			columnTypes: { f: "Float32", x: "String" },
		});
		expect(p.statements).toEqual([]);
		expect(p.errors[0]).toMatch(/floating-point/);
	});

	it("still allows INSERT-only diffs on float-keyed tables", () => {
		const p = generateDml({
			engine: "clickhouse",
			database: null,
			table: "t",
			diff: { updates: [], inserts: [{ f: 1.1, x: "a" }], deletes: [] },
			keyColumns: ["f"],
			columns: ["f", "x"],
			columnTypes: { f: "Float32", x: "String" },
		});
		expect(p.errors).toEqual([]);
		expect(p.statements).toHaveLength(1);
	});

	it("errors on named-tuple values with missing fields instead of writing NULL", () => {
		const p = generateDml({
			engine: "clickhouse",
			database: null,
			table: "t",
			diff: {
				updates: [
					{
						baseIndex: 0,
						base: { id: 1, pt: { x: 1, y: 2 } },
						row: { id: 1, pt: { x: 1 } },
						changedCols: ["pt"],
					},
				],
				inserts: [],
				deletes: [],
			},
			keyColumns: ["id"],
			columns: ["id", "pt"],
			columnTypes: { id: "UInt64", pt: "Tuple(x Int32, y Int32)" },
		});
		expect(p.statements).toEqual([]);
		expect(p.errors[0]).toMatch(/missing field y/);
	});

	it("passes the schema to sqlite pragma_table_info", () => {
		expect(tableColumnsQuery("sqlite", "aux", "t")).toContain(
			"pragma_table_info('t', 'aux')",
		);
		expect(tableColumnsQuery("sqlite", null, "t")).toContain(
			"pragma_table_info('t')",
		);
	});

	it("refuses UPDATE/DELETE with an empty key set (empty WHERE guard)", () => {
		const p = generateDml({
			engine: "postgres",
			database: null,
			table: "t",
			diff: {
				updates: [],
				inserts: [],
				deletes: [{ baseIndex: 0, base: BASE }],
			},
			keyColumns: [],
			columns: ["id"],
			columnTypes: { id: "integer" },
		});
		expect(p.statements).toEqual([]);
		expect(p.errors[0]).toMatch(/No key columns/);
	});

	it("quotes identifiers per engine", () => {
		expect(quoteIdent("clickhouse", "we`ird")).toBe("`we``ird`");
		expect(quoteIdent("postgres", 'we"ird')).toBe('"we""ird"');
	});
});
