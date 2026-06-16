import { describe, it, expect } from "vitest";
import {
  isJsonExplain,
  getExplainType,
  isExplainQuery,
  stripTrailingFormat,
} from "../sqlUtils";

describe("stripTrailingFormat", () => {
  it("removes a trailing FORMAT clause", () => {
    expect(stripTrailingFormat("SELECT 1 FORMAT JSON")).toBe("SELECT 1");
    expect(stripTrailingFormat("SELECT 1 FORMAT PrettyCompact")).toBe("SELECT 1");
  });

  it("removes a trailing FORMAT clause with a semicolon", () => {
    expect(stripTrailingFormat("SELECT 1 FORMAT TSV;")).toBe("SELECT 1");
  });

  it("removes a trailing FORMAT across newlines", () => {
    expect(
      stripTrailingFormat("SELECT a, b\nFROM t\nGROUP BY a\nFORMAT PrettyCompact"),
    ).toBe("SELECT a, b\nFROM t\nGROUP BY a");
  });

  it("leaves a query without a trailing FORMAT unchanged", () => {
    expect(stripTrailingFormat("SELECT 1")).toBe("SELECT 1");
    expect(stripTrailingFormat("SELECT count() FROM t")).toBe(
      "SELECT count() FROM t",
    );
  });

  it("does not strip FORMAT inside a trailing string literal", () => {
    expect(stripTrailingFormat("SELECT 'FORMAT JSON' AS x")).toBe(
      "SELECT 'FORMAT JSON' AS x",
    );
  });
});

describe("isExplainQuery", () => {
  it("detects bare EXPLAIN", () => {
    expect(isExplainQuery("EXPLAIN SELECT 1")).toBe(true);
  });

  it("detects typed EXPLAIN", () => {
    expect(isExplainQuery("EXPLAIN PIPELINE SELECT 1")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isExplainQuery("explain select 1")).toBe(true);
  });

  it("rejects non-EXPLAIN queries", () => {
    expect(isExplainQuery("SELECT 1")).toBe(false);
  });
});

describe("getExplainType", () => {
  it("returns null for non-EXPLAIN queries", () => {
    expect(getExplainType("SELECT 1")).toBeNull();
  });

  it("defaults to PLAN for bare EXPLAIN", () => {
    expect(getExplainType("EXPLAIN SELECT 1")).toBe("PLAN");
  });

  it("detects PIPELINE", () => {
    expect(getExplainType("EXPLAIN PIPELINE SELECT 1")).toBe("PIPELINE");
  });

  it("detects PLAN", () => {
    expect(getExplainType("EXPLAIN PLAN SELECT 1")).toBe("PLAN");
  });

  it("detects AST", () => {
    expect(getExplainType("EXPLAIN AST SELECT 1")).toBe("AST");
  });

  it("detects SYNTAX", () => {
    expect(getExplainType("EXPLAIN SYNTAX SELECT 1")).toBe("SYNTAX");
  });

  it("detects ESTIMATE", () => {
    expect(getExplainType("EXPLAIN ESTIMATE SELECT 1")).toBe("ESTIMATE");
  });

  it("detects INDEXES", () => {
    expect(getExplainType("EXPLAIN INDEXES SELECT 1")).toBe("INDEXES");
  });

  it("detects TABLE OVERRIDE (multi-word)", () => {
    expect(getExplainType("EXPLAIN TABLE OVERRIDE SELECT 1")).toBe(
      "TABLE OVERRIDE",
    );
  });

  it("detects QUERY TREE (multi-word)", () => {
    expect(getExplainType("EXPLAIN QUERY TREE SELECT 1")).toBe("QUERY TREE");
  });

  it("is case-insensitive", () => {
    expect(getExplainType("explain pipeline select 1")).toBe("PIPELINE");
    expect(getExplainType("explain query tree select 1")).toBe("QUERY TREE");
  });

  it("defaults to PLAN for EXPLAIN json=1 SELECT ...", () => {
    expect(getExplainType("EXPLAIN json=1 SELECT 1")).toBe("PLAN");
  });
});

describe("isJsonExplain", () => {
  it("detects json=1 with one word between EXPLAIN and json", () => {
    expect(isJsonExplain("EXPLAIN PLAN json=1 SELECT 1")).toBe(true);
  });

  it("detects json=1 with no word between EXPLAIN and json", () => {
    expect(isJsonExplain("EXPLAIN json=1 SELECT 1")).toBe(true);
  });

  it("detects json=1 with two words (QUERY TREE)", () => {
    expect(isJsonExplain("EXPLAIN QUERY TREE json=1 SELECT 1")).toBe(true);
  });

  it("detects json=1 with TABLE OVERRIDE", () => {
    expect(isJsonExplain("EXPLAIN TABLE OVERRIDE json=1 SELECT 1")).toBe(true);
  });

  it("handles spaces around =", () => {
    expect(isJsonExplain("EXPLAIN PLAN json = 1 SELECT 1")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isJsonExplain("explain plan JSON=1 SELECT 1")).toBe(true);
  });

  it("returns false when json=1 is absent", () => {
    expect(isJsonExplain("EXPLAIN SELECT 1")).toBe(false);
  });

  it("returns false for non-EXPLAIN queries", () => {
    expect(isJsonExplain("SELECT 1")).toBe(false);
  });
});
