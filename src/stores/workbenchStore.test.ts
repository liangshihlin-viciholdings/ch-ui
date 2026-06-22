import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock the transport barrel so the store talks to a fake adapter instead of a
// real IPC/in-process transport (mysql2/clickhouse are not available here).
const queryMock = vi.fn();
vi.mock("@/lib/transport", () => ({
  getTransport: () => ({ query: queryMock }),
}));

// The store opens a module-level Dexie liveQuery subscription that emits
// asynchronously and would patch the store outside act() (noisy warnings).
// Stub it to a no-op observable; these tests drive the store directly.
vi.mock("dexie", async (importOriginal) => {
  const actual = await importOriginal<typeof import("dexie")>();
  return {
    ...actual,
    liveQuery: () => ({ subscribe: () => ({ unsubscribe() {} }) }),
  };
});

import {
  openTab,
  closeTab,
  runQuery,
  runAllQueries,
  setActiveResultIndex,
  useWorkbenchStore,
} from "@/stores/workbenchStore";

function ok(rows: Record<string, unknown>[] = []) {
  return {
    meta: [],
    data: rows,
    statistics: { elapsed: 0, rows_read: rows.length, bytes_read: 0 },
    rows: rows.length,
    error: null,
  };
}

describe("workbenchStore multi-query execution", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("runQuery stores exactly one result item for the given statement", async () => {
    const tabId = openTab("conn-1");
    queryMock.mockResolvedValueOnce(ok([{ a: 1 }]));

    await act(async () => {
      await runQuery(tabId, "SELECT 1");
    });

    const { result } = renderHook(() =>
      useWorkbenchStore((s) => ({
        items: s.results[tabId],
        index: s.activeResultIndex[tabId],
        executing: s.executing[tabId],
      })),
    );
    expect(queryMock).toHaveBeenCalledWith("SELECT 1");
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items?.[0].queryText).toBe("SELECT 1");
    expect(result.current.items?.[0].result.data).toEqual([{ a: 1 }]);
    expect(result.current.index).toBe(0);
    expect(result.current.executing).toBe(false);

    closeTab(tabId);
  });

  it("runQuery records a per-statement error instead of throwing", async () => {
    const tabId = openTab("conn-1");
    queryMock.mockRejectedValueOnce(new Error("ER_PARSE_ERROR"));

    await act(async () => {
      await runQuery(tabId, "SELEC 1");
    });

    const { result } = renderHook(() =>
      useWorkbenchStore((s) => s.results[tabId]),
    );
    expect(result.current).toHaveLength(1);
    expect(result.current?.[0].result.error).toContain("ER_PARSE_ERROR");

    closeTab(tabId);
  });

  it("runAllQueries runs each statement, isolates errors, and skips blanks", async () => {
    const tabId = openTab("conn-1");
    queryMock
      .mockResolvedValueOnce(ok([{ a: 1 }]))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(ok([{ b: 2 }]));

    await act(async () => {
      await runAllQueries(tabId, ["SELECT 1", "   ", "BAD SQL", "SELECT 2"]);
    });

    const { result } = renderHook(() =>
      useWorkbenchStore((s) => s.results[tabId]),
    );
    // The blank statement is skipped; the failing one does not abort the rest.
    expect(queryMock).toHaveBeenCalledTimes(3);
    expect(result.current).toHaveLength(3);
    expect(result.current?.[0].result.error).toBeNull();
    expect(result.current?.[1].result.error).toContain("boom");
    expect(result.current?.[2].result.data).toEqual([{ b: 2 }]);

    closeTab(tabId);
  });

  it("setActiveResultIndex selects which statement's result is shown", async () => {
    const tabId = openTab("conn-1");
    queryMock.mockResolvedValue(ok());

    await act(async () => {
      await runAllQueries(tabId, ["SELECT 1", "SELECT 2"]);
    });
    await act(async () => {
      setActiveResultIndex(tabId, 1);
      await Promise.resolve();
    });

    const { result } = renderHook(() =>
      useWorkbenchStore((s) => s.activeResultIndex[tabId]),
    );
    expect(result.current).toBe(1);

    closeTab(tabId);
  });

  it("closeTab clears the tab's results and active index", async () => {
    const tabId = openTab("conn-1");
    queryMock.mockResolvedValueOnce(ok([{ a: 1 }]));
    await act(async () => {
      await runQuery(tabId, "SELECT 1");
    });

    closeTab(tabId);

    const { result } = renderHook(() =>
      useWorkbenchStore((s) => ({
        items: s.results[tabId],
        index: s.activeResultIndex[tabId],
      })),
    );
    expect(result.current.items).toBeUndefined();
    expect(result.current.index).toBeUndefined();
  });
});
