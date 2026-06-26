// Pure tree + drag-and-drop projection helpers for the nested connections
// sidebar. No React / Dexie imports — everything here is a pure function over
// the two flat DB arrays (folders + connections), so it is trivially testable
// and can be reasoned about in isolation. The component owns all side effects.
//
// Model: folders nest via `parentId`; connections attach via `folderId`. Both
// share one `sortOrder` space per container (interleaved ordering), so a
// connection can sit above or below a folder at the same level. null parent ==
// root level. Only FOLDERS can be parents.

import type { ConnectionFolder, SavedConnection } from "@/lib/db/schema";

/** One indent level, in px. Shared by the renderer and the drag projection. */
export const INDENT_PX = 16;

export type TreeNode =
  | { kind: "folder"; item: ConnectionFolder; children: TreeNode[] }
  | { kind: "connection"; item: SavedConnection };

/** A row in the rendered/flattened list. */
export interface FlatItem {
  id: string;
  kind: "folder" | "connection";
  depth: number;
  parentId: string | null;
  sortOrder: number;
}

/** Where a dragged row will land: its new parent + sort position. */
export interface DropTarget {
  depth: number;
  parentId: string | null;
  sortOrder: number;
}

// ─── Tree shape ──────────────────────────────────────────────────────────────

/**
 * Build the nested tree from the two flat DB arrays. Folders and connections in
 * the same container are interleaved and sorted together by `sortOrder`.
 * O(n²) overall — fine for the handful-to-hundreds of items a sidebar holds.
 * ponytail: no memoization; profile before adding.
 */
export function buildTree(
  folders: ConnectionFolder[],
  connections: SavedConnection[],
  parentId: string | null = null,
): TreeNode[] {
  const here: Array<{ sortOrder: number; node: TreeNode }> = [];

  for (const f of folders) {
    if ((f.parentId ?? null) === parentId) {
      here.push({
        sortOrder: f.sortOrder ?? 0,
        node: {
          kind: "folder",
          item: f,
          children: buildTree(folders, connections, f.id),
        },
      });
    }
  }
  for (const c of connections) {
    if ((c.folderId ?? null) === parentId) {
      here.push({
        sortOrder: c.sortOrder ?? 0,
        node: { kind: "connection", item: c },
      });
    }
  }

  here.sort((a, b) => a.sortOrder - b.sortOrder);
  return here.map((x) => x.node);
}

/**
 * Depth-first flatten into the renderable row list. Children of any folder id in
 * `collapsedIds` are omitted (the folder row itself stays).
 */
export function flattenTree(
  nodes: TreeNode[],
  depth = 0,
  collapsedIds: Set<string> = new Set(),
): FlatItem[] {
  const out: FlatItem[] = [];
  for (const n of nodes) {
    if (n.kind === "folder") {
      out.push({
        id: n.item.id,
        kind: "folder",
        depth,
        parentId: n.item.parentId ?? null,
        sortOrder: n.item.sortOrder ?? 0,
      });
      if (!collapsedIds.has(n.item.id)) {
        out.push(...flattenTree(n.children, depth + 1, collapsedIds));
      }
    } else {
      out.push({
        id: n.item.id,
        kind: "connection",
        depth,
        parentId: n.item.folderId ?? null,
        sortOrder: n.item.sortOrder ?? 0,
      });
    }
  }
  return out;
}

// ─── Drag helpers ──────────────────────────────────────────────────────────────

/** Ids of every descendant of `folderId`, derived from the flat list. */
export function descendantIds(flatItems: FlatItem[], folderId: string): string[] {
  const out: string[] = [];
  const stack = [folderId];
  while (stack.length) {
    const cur = stack.pop() as string;
    for (const it of flatItems) {
      if (it.parentId === cur) {
        out.push(it.id);
        if (it.kind === "folder") stack.push(it.id);
      }
    }
  }
  return out;
}

/** True if `candidateAncestorId` is `targetId` or an ancestor of it. */
export function isDescendant(
  folders: ConnectionFolder[],
  targetId: string | null,
  candidateAncestorId: string,
): boolean {
  let cur = targetId;
  while (cur != null) {
    if (cur === candidateAncestorId) return true;
    cur = folders.find((f) => f.id === cur)?.parentId ?? null;
  }
  return false;
}

/** Midpoint sort key for an item dropped between two siblings. */
export function getSortOrderBetween(prev?: FlatItem, next?: FlatItem): number {
  const STEP = 1000;
  if (!prev && !next) return STEP;
  if (!prev) return (next as FlatItem).sortOrder - STEP;
  if (!next) return prev.sortOrder + STEP;
  // ponytail: float midpoint; doubles won't collide for any realistic number of
  // reorders. Add a reindex pass only if a gap ever measurably collapses.
  return (prev.sortOrder + next.sortOrder) / 2;
}

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}

/** Nearest siblings (same parentId) around `index` in the moved list. */
function siblingNeighbors(
  moved: FlatItem[],
  index: number,
  parentId: string | null,
): { prev?: FlatItem; next?: FlatItem } {
  let prev: FlatItem | undefined;
  for (let i = index - 1; i >= 0; i--) {
    if (moved[i].parentId === parentId) {
      prev = moved[i];
      break;
    }
  }
  let next: FlatItem | undefined;
  for (let i = index + 1; i < moved.length; i++) {
    if (moved[i].parentId === parentId) {
      next = moved[i];
      break;
    }
  }
  return { prev, next };
}

/**
 * Compute where a dragged row lands, given the over-row and the horizontal drag
 * offset. Returns null if either id is missing. Depth is clamped to the valid
 * range: you can nest one level under a preceding FOLDER, sit beside a preceding
 * connection, but never deeper than the next row allows. The active row's own
 * descendants must already be removed from `flatItems` before calling.
 */
export function getDropTarget(
  flatItems: FlatItem[],
  activeId: string,
  overId: string,
  dragOffsetX: number,
  indentPx = INDENT_PX,
): DropTarget | null {
  const overIndex = flatItems.findIndex((i) => i.id === overId);
  const activeIndex = flatItems.findIndex((i) => i.id === activeId);
  if (overIndex === -1 || activeIndex === -1) return null;

  const activeItem = flatItems[activeIndex];
  const moved = arrayMove(flatItems, activeIndex, overIndex);
  const prev = moved[overIndex - 1];
  const next = moved[overIndex + 1];

  const dragDepth = Math.round(dragOffsetX / indentPx);
  const projected = activeItem.depth + dragDepth;

  // Only a folder can gain a child; a preceding connection caps you to its level.
  const maxDepth = prev ? (prev.kind === "folder" ? prev.depth + 1 : prev.depth) : 0;
  const minDepth = next ? next.depth : 0;
  let depth = projected;
  if (depth > maxDepth) depth = maxDepth;
  if (depth < minDepth) depth = minDepth;

  const parentId = parentIdAtDepth(moved, overIndex, depth, prev);
  const { prev: prevSib, next: nextSib } = siblingNeighbors(moved, overIndex, parentId);
  return { depth, parentId, sortOrder: getSortOrderBetween(prevSib, nextSib) };
}

function parentIdAtDepth(
  moved: FlatItem[],
  overIndex: number,
  depth: number,
  prev: FlatItem | undefined,
): string | null {
  if (depth === 0 || !prev) return null;
  if (depth === prev.depth) return prev.parentId;
  if (depth > prev.depth) return prev.id; // prev is a folder (maxDepth allowed it)
  // depth < prev.depth: adopt the parent of the nearest preceding row at `depth`.
  for (let i = overIndex - 1; i >= 0; i--) {
    if (moved[i].depth === depth) return moved[i].parentId;
  }
  return null;
}
