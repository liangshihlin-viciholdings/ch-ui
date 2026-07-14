// completionSource.test.ts
// Engine-aware completion source: per-engine introspection query selection,
// static-row merging, and gating of ClickHouse-only clauses.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";

const queryMock = vi.fn();

vi.mock("@/lib/transport", () => ({
  getTransport: () => ({ query: queryMock }),
}));

vi.mock("@/stores/workspaceStore", () => ({
  default: {
    getState: () => ({
      clickHouseClient: null,
      credential: null,
      selectedDatabase: null,
    }),
  },
}));

import {
  sqlCompletionSource,
  resetCompletionCaches,
  type CompletionConnectionContext,
} from "./completionSource";

function makeContext(doc: string): CompletionContext {
  const state = EditorState.create({ doc });
  return new CompletionContext(state, doc.length, true);
}

async function labelsFor(
  doc: string,
  conn: CompletionConnectionContext,
): Promise<string[]> {
  const result = await sqlCompletionSource(makeContext(doc), conn);
  return (result?.options ?? []).map((o) => o.label);
}

beforeEach(() => {
  resetCompletionCaches();
  queryMock.mockReset();
});

describe("sqlCompletionSource engine awareness", () => {
  it("postgres tab introspects via the postgres query and suggests its schema", async () => {
    queryMock.mockResolvedValue({
      data: [
        { word: "public", context: "database", belongs: null },
        { word: "users", context: "table", belongs: "public" },
        { word: "id", context: "column", belongs: "users" },
      ],
    });

    const labels = await labelsFor("SELECT * FROM ", {
      connectionId: "pg-1",
      engine: "postgres",
    });

    expect(queryMock.mock.calls[0][0]).toContain("pg_get_keywords");
    expect(labels).toContain("public");
    expect(labels).toContain("users");
  });

  it("mysql merges static functions/keywords with introspected rows", async () => {
    queryMock.mockResolvedValue({
      data: [{ word: "orders", context: "table", belongs: "shop" }],
    });

    const labels = await labelsFor("SELECT ", {
      connectionId: "my-1",
      engine: "mysql",
    });

    expect(queryMock.mock.calls[0][0]).toContain("information_schema");
    expect(labels).toContain("COUNT"); // static function
    expect(labels).toContain("SELECT"); // static keyword
  });

  it("re-introspects when the same connection switches engine", async () => {
    queryMock.mockResolvedValue({
      data: [{ word: "t1", context: "table", belongs: "db" }],
    });

    await labelsFor("SELECT * FROM ", { connectionId: "c-1", engine: "postgres" });
    await labelsFor("SELECT * FROM ", { connectionId: "c-1", engine: "mysql" });

    // Engine is part of the cache key: the mysql request must not reuse the
    // postgres rows cached under the same connectionId.
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[1][0]).toContain("information_schema");
  });

  it("suggests ClickHouse table engines only for clickhouse tabs", async () => {
    queryMock.mockResolvedValue({
      data: [{ word: "SELECT", context: "keyword", belongs: null }],
    });

    const ch = await labelsFor("CREATE TABLE t ENGINE = ", {
      connectionId: "ch-1",
      engine: "clickhouse",
    });
    const duck = await labelsFor("CREATE TABLE t ENGINE = ", {
      connectionId: "duck-1",
      engine: "duckdb",
    });

    expect(ch).toContain("MergeTree");
    expect(duck).not.toContain("MergeTree");
  });
});
