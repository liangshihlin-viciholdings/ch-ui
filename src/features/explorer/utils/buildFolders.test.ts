import { describe, it, expect } from "vitest";
import { buildFolders, sumBytes } from "./buildFolders";

describe("sumBytes", () => {
  it("coerces numeric strings and treats null/undefined/missing as 0", () => {
    const total = sumBytes([
      { name: "a", type: "table", total_bytes: 100 },
      { name: "b", type: "table", total_bytes: "200" as unknown as number },
      { name: "c", type: "table", total_bytes: undefined },
      { name: "d", type: "table" },
    ]);
    expect(total).toBe(300);
  });
});

describe("buildFolders", () => {
  const children = [
    { name: "zeta", type: "table", total_bytes: 10 },
    { name: "alpha", type: "table", total_bytes: 5 },
    { name: "v1", type: "view" }, // no storage -> contributes 0
    { name: "mv1", type: "materialized_view", total_bytes: 7 },
    { name: "dict1", type: "dictionary", total_bytes: 3 },
  ];

  it("groups by type, with materialized views under Views", () => {
    const folders = buildFolders(children);
    expect(folders.map((f) => f.name)).toEqual([
      "Tables",
      "Views",
      "Dictionaries",
    ]);
  });

  it("sorts leaves by name and aggregates group disk size", () => {
    const [tables, views, dicts] = buildFolders(children);
    expect((tables.children ?? []).map((c) => c.name)).toEqual([
      "alpha",
      "zeta",
    ]);
    expect(tables.total_bytes).toBe(15);
    expect(views.total_bytes).toBe(7); // mv counted; plain view (null) ignored
    expect(dicts.total_bytes).toBe(3);
  });

  it("omits empty groups", () => {
    const folders = buildFolders([
      { name: "t", type: "table", total_bytes: 1 },
    ]);
    expect(folders.map((f) => f.name)).toEqual(["Tables"]);
  });
});
