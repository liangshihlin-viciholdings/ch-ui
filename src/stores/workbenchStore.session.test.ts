import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { pickSessionAutoConnect } from "@/stores/workbenchStore";

// The store opens a module-level Dexie liveQuery and talks to a transport at
// import time. Stub both so importing the store is side-effect-free here and we
// can assert purely on session hydration from localStorage.
vi.mock("@/lib/transport", () => ({
  getTransport: () => ({ query: vi.fn() }),
}));
vi.mock("dexie", async (importOriginal) => {
  const actual = await importOriginal<typeof import("dexie")>();
  return {
    ...actual,
    liveQuery: () => ({ subscribe: () => ({ unsubscribe() {} }) }),
  };
});

const SESSION_STORAGE_KEY = "deebee-workbench-session";

type UseWorkbenchStore = <U>(selector: (s: any) => U) => U;

/** Freshly import the store after seeding localStorage so module-load
 * hydration (loadPersistedSession → initialState) runs against our fixture. */
async function importStoreFresh(): Promise<UseWorkbenchStore> {
  vi.resetModules();
  const mod = await import("@/stores/workbenchStore");
  return mod.useWorkbenchStore as UseWorkbenchStore;
}

/** Read a snapshot of store state through the selector hook. */
function readState<T>(use: UseWorkbenchStore, selector: (s: any) => T): T {
  const { result } = renderHook(() => use(selector));
  return result.current;
}

function seedSession(state: unknown, version = 1) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ version, state }));
}

describe("workbenchStore session resume", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts with no tabs when nothing is persisted", async () => {
    const use = await importStoreFresh();
    expect(readState(use, (s) => s.tabs)).toEqual([]);
    expect(readState(use, (s) => s.activeTabId)).toBeNull();
  });

  it("restores persisted tabs, active tab, and active connection verbatim", async () => {
    seedSession({
      tabs: [
        { id: "tab-1", title: "Users", connectionId: "conn-a", sql: "SELECT 1" },
        {
          id: "tab-2",
          title: "Orders",
          connectionId: "conn-b",
          sql: "SELECT 2",
          dirty: true,
        },
      ],
      activeTabId: "tab-2",
      activeConnectionId: "conn-b",
    });

    const use = await importStoreFresh();
    const tabs = readState(use, (s) => s.tabs);
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toEqual({
      id: "tab-1",
      title: "Users",
      connectionId: "conn-a",
      sql: "SELECT 1",
    });
    expect(tabs[1].dirty).toBe(true);
    expect(readState(use, (s) => s.activeTabId)).toBe("tab-2");
    expect(readState(use, (s) => s.activeConnectionId)).toBe("conn-b");
  });

  it("repoints activeTabId to the last tab when the stored one is gone", async () => {
    seedSession({
      tabs: [
        { id: "tab-1", title: "A", connectionId: "conn-a", sql: "" },
        { id: "tab-2", title: "B", connectionId: "conn-a", sql: "" },
      ],
      activeTabId: "tab-missing",
      activeConnectionId: "conn-a",
    });

    const use = await importStoreFresh();
    expect(readState(use, (s) => s.activeTabId)).toBe("tab-2");
  });

  it("drops malformed tab entries and ignores a session with no valid tabs", async () => {
    seedSession({
      tabs: [
        { id: "tab-1", title: "Good", connectionId: "conn-a", sql: "SELECT 1" },
        { id: 42, title: "bad id" },
        null,
        { title: "no id", connectionId: "conn-a", sql: "" },
      ],
      activeTabId: "tab-1",
      activeConnectionId: "conn-a",
    });

    const use = await importStoreFresh();
    const tabs = readState(use, (s) => s.tabs);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].id).toBe("tab-1");
  });

  it("ignores corrupt JSON without throwing", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, "{not json");
    const use = await importStoreFresh();
    expect(readState(use, (s) => s.tabs)).toEqual([]);
  });

  it("derives activeConnectionId from the active tab when absent", async () => {
    seedSession({
      tabs: [{ id: "tab-1", title: "A", connectionId: "conn-x", sql: "" }],
      activeTabId: "tab-1",
      // activeConnectionId intentionally omitted
    });

    const use = await importStoreFresh();
    expect(readState(use, (s) => s.activeConnectionId)).toBe("conn-x");
  });

  it("ignores a session written under a different schema version", async () => {
    seedSession(
      {
        tabs: [{ id: "tab-1", title: "A", connectionId: "conn-a", sql: "SELECT 1" }],
        activeTabId: "tab-1",
        activeConnectionId: "conn-a",
      },
      2, // future/unknown version
    );

    const use = await importStoreFresh();
    expect(readState(use, (s) => s.tabs)).toEqual([]);
  });

  it("clears a stale entry whose tabs are all malformed", async () => {
    seedSession({
      tabs: [{ id: 1, title: 2 }, null],
      activeTabId: "x",
      activeConnectionId: "y",
    });

    const use = await importStoreFresh();
    expect(readState(use, (s) => s.tabs)).toEqual([]);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });
});

describe("pickSessionAutoConnect", () => {
  const session = {
    tabs: [
      { id: "tab-1", title: "A", connectionId: "conn-a", sql: "" },
      { id: "tab-2", title: "B", connectionId: "conn-b", sql: "" },
    ],
    activeTabId: "tab-2",
    activeConnectionId: "conn-b",
  };
  const conns = [{ id: "conn-a" }, { id: "conn-b" }];

  it("returns the active tab's connection when it exists and is disconnected", () => {
    expect(pickSessionAutoConnect(session, conns, {})).toBe("conn-b");
  });

  it("returns null when there is no session", () => {
    expect(pickSessionAutoConnect(null, conns, {})).toBeNull();
  });

  it("returns null when the connection list is empty", () => {
    expect(pickSessionAutoConnect(session, [], {})).toBeNull();
  });

  it("returns null when the active tab's connection is already connected", () => {
    expect(pickSessionAutoConnect(session, conns, { "conn-b": "connected" })).toBeNull();
  });

  it("returns null when the active tab's connection no longer exists", () => {
    expect(pickSessionAutoConnect(session, [{ id: "conn-a" }], {})).toBeNull();
  });

  it("falls back to activeConnectionId when the active tab is missing", () => {
    const orphan = { ...session, activeTabId: "gone", activeConnectionId: "conn-a" };
    expect(pickSessionAutoConnect(orphan, conns, {})).toBe("conn-a");
  });
});
