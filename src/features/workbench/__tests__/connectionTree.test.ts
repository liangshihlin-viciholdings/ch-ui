import { describe, expect, it } from "vitest";
import type { ConnectionFolder, SavedConnection } from "@/lib/db/schema";
import {
  buildTree,
  descendantIds,
  flattenTree,
  getDropTarget,
  getSortOrderBetween,
  isDescendant,
  type FlatItem,
} from "../connectionTree";

// Minimal fixtures — the pure helpers only read id/parentId/folderId/sortOrder.
const folder = (
  id: string,
  parentId: string | null,
  sortOrder: number,
): ConnectionFolder =>
  ({ id, name: id, parentId, sortOrder, createdAt: new Date(0), updatedAt: new Date(0) });
const conn = (id: string, folderId: string | null, sortOrder: number): SavedConnection =>
  ({ id, folderId, sortOrder } as unknown as SavedConnection);

describe("buildTree", () => {
  it("interleaves folders and connections by shared sortOrder", () => {
    const tree = buildTree([folder("A", null, 2000)], [conn("c1", null, 1000), conn("c2", "A", 500)]);
    expect(tree[0].kind).toBe("connection"); // c1 (1000) before folder A (2000)
    expect((tree[0] as Extract<typeof tree[0], { kind: "connection" }>).item.id).toBe("c1");
    expect(tree[1].kind).toBe("folder");
    const a = tree[1] as Extract<typeof tree[1], { kind: "folder" }>;
    expect(a.children).toHaveLength(1);
    expect((a.children[0] as Extract<typeof a.children[0], { kind: "connection" }>).item.id).toBe("c2");
  });
});

describe("flattenTree", () => {
  const tree = buildTree([folder("A", null, 2000)], [conn("c1", null, 1000), conn("c2", "A", 500)]);
  it("flattens depth-first with depth", () => {
    const flat = flattenTree(tree);
    expect(flat.map((f) => f.id)).toEqual(["c1", "A", "c2"]);
    expect(flat.find((f) => f.id === "c2")?.depth).toBe(1);
  });
  it("omits children of collapsed folders", () => {
    const flat = flattenTree(tree, 0, new Set(["A"]));
    expect(flat.map((f) => f.id)).toEqual(["c1", "A"]);
  });
});

describe("isDescendant / descendantIds", () => {
  const folders = [folder("A", null, 0), folder("B", "A", 0), folder("C", "B", 0)];
  it("detects an ancestor up the chain", () => {
    expect(isDescendant(folders, "C", "A")).toBe(true);
    expect(isDescendant(folders, "A", "C")).toBe(false);
  });
  it("collects all descendant ids", () => {
    const flat: FlatItem[] = [
      { id: "A", kind: "folder", depth: 0, parentId: null, sortOrder: 0 },
      { id: "B", kind: "folder", depth: 1, parentId: "A", sortOrder: 0 },
      { id: "x", kind: "connection", depth: 2, parentId: "B", sortOrder: 0 },
    ];
    expect(descendantIds(flat, "A").sort()).toEqual(["B", "x"]);
  });
});

describe("getSortOrderBetween", () => {
  it("midpoints between neighbours, steps past edges", () => {
    expect(getSortOrderBetween(undefined, undefined)).toBe(1000);
    expect(getSortOrderBetween({ sortOrder: 1000 } as FlatItem, { sortOrder: 2000 } as FlatItem)).toBe(1500);
    expect(getSortOrderBetween({ sortOrder: 1000 } as FlatItem, undefined)).toBe(2000);
    expect(getSortOrderBetween(undefined, { sortOrder: 1000 } as FlatItem)).toBe(0);
  });
});

describe("getDropTarget", () => {
  // A(folder) > a1(conn child); then B, C at root.
  const items: FlatItem[] = [
    { id: "A", kind: "folder", depth: 0, parentId: null, sortOrder: 1000 },
    { id: "a1", kind: "connection", depth: 1, parentId: "A", sortOrder: 1000 },
    { id: "B", kind: "connection", depth: 0, parentId: null, sortOrder: 2000 },
    { id: "C", kind: "connection", depth: 0, parentId: null, sortOrder: 3000 },
  ];

  it("nests a root connection under a folder when dragged right", () => {
    const t = getDropTarget(items, "B", "a1", 16);
    expect(t?.parentId).toBe("A");
    expect(t?.depth).toBe(1);
  });

  it("reorders at root, interleaving between a folder and a connection", () => {
    const t = getDropTarget(items, "C", "B", 0);
    expect(t?.parentId).toBeNull();
    expect(t?.depth).toBe(0);
    expect(t?.sortOrder).toBe(1500); // between A(1000) and B(2000)
  });

  it("clamps depth: cannot nest under a connection, only beside it", () => {
    const t = getDropTarget(items, "C", "B", 100); // far right
    expect(t?.depth).toBe(1);
    expect(t?.parentId).toBe("A"); // becomes a1's sibling inside A, not a1's child
  });
});
