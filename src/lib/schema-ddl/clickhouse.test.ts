import { describe, it, expect } from "vitest";
import {
  buildColumnEditDDL,
  buildIndexEditDDL,
  buildConstraintEditDDL,
  buildViewEditDDL,
} from "./clickhouse";

describe("buildColumnEditDDL", () => {
  const cols = [
    { name: "id", type: "UInt64" },
    { name: "name", type: "String" },
  ];

  it("targets the qualified table and lists current columns", () => {
    const ddl = buildColumnEditDDL("db", "events", cols);
    expect(ddl).toContain("`db`.`events`");
    expect(ddl).toContain("--   id  UInt64");
    expect(ddl).toContain("--   name  String");
  });

  it("emits no uncommented mutating statement (safe to run verbatim)", () => {
    const ddl = buildColumnEditDDL("db", "events", cols);
    // every ALTER must be on a commented line
    for (const line of ddl.split("\n")) {
      if (/\bALTER\s+TABLE\b/i.test(line)) {
        expect(line.trimStart().startsWith("--")).toBe(true);
      }
    }
  });

  it("escapes backticks in identifiers", () => {
    const ddl = buildColumnEditDDL("d`b", "t`bl", cols);
    expect(ddl).toContain("`d``b`.`t``bl`");
  });

  it("handles an empty column list", () => {
    const ddl = buildColumnEditDDL("db", "t", []);
    expect(ddl).toContain("(no columns found)");
  });
});

describe("buildIndexEditDDL", () => {
  it("includes ADD/MATERIALIZE/DROP INDEX templates and existing indices", () => {
    const ddl = buildIndexEditDDL("db", "t", [
      { name: "idx_ts", type: "minmax", expr: "ts" },
    ]);
    expect(ddl).toMatch(/ADD INDEX/);
    expect(ddl).toMatch(/MATERIALIZE INDEX/);
    expect(ddl).toMatch(/DROP INDEX/);
    expect(ddl).toContain("idx_ts");
  });

  it("notes when there are no indices", () => {
    expect(buildIndexEditDDL("db", "t")).toContain("(no data-skipping indices)");
  });
});

describe("buildConstraintEditDDL", () => {
  it("includes ADD/DROP CONSTRAINT templates and existing constraints", () => {
    const ddl = buildConstraintEditDDL("db", "t", [
      { name: "c_positive", expr: "x > 0" },
    ]);
    expect(ddl).toMatch(/ADD CONSTRAINT/);
    expect(ddl).toMatch(/DROP CONSTRAINT/);
    expect(ddl).toContain("c_positive");
  });
});

describe("buildViewEditDDL", () => {
  it("rewrites a plain view to CREATE OR REPLACE VIEW", () => {
    const ddl = buildViewEditDDL(
      "db",
      "v",
      "CREATE VIEW db.v AS SELECT 1",
      "view",
    );
    expect(ddl).toContain("CREATE OR REPLACE VIEW db.v AS SELECT 1");
    expect(ddl).not.toMatch(/^CREATE VIEW/m);
  });

  it("keeps an already-replaceable view normalized", () => {
    const ddl = buildViewEditDDL(
      "db",
      "v",
      "CREATE OR REPLACE VIEW db.v AS SELECT 1",
      "view",
    );
    expect(ddl).toContain("CREATE OR REPLACE VIEW db.v AS SELECT 1");
  });

  it("offers MODIFY QUERY and a commented DROP for materialized views", () => {
    const ddl = buildViewEditDDL(
      "db",
      "mv",
      "CREATE MATERIALIZED VIEW db.mv TO db.dst AS SELECT 1",
      "materialized_view",
    );
    expect(ddl).toContain("MODIFY QUERY");
    expect(ddl).toContain("DROP TABLE IF EXISTS `db`.`mv`");
    // the destructive DROP must be commented out
    for (const line of ddl.split("\n")) {
      if (/\bDROP\s+TABLE\b/i.test(line)) {
        expect(line.trimStart().startsWith("--")).toBe(true);
      }
    }
  });
});
