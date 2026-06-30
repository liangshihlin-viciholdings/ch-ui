import { TreeNodeData } from "../components/TreeNode";
import { DatabaseInfo } from "@/types/common";

/**
 * Sum on-disk bytes across a flat list of leaf nodes. ClickHouse can return
 * total_bytes as a numeric string (UInt64) or null, so coerce defensively.
 */
export const sumBytes = (nodes: TreeNodeData[]): number =>
  nodes.reduce((acc, n) => acc + (Number(n.total_bytes) || 0), 0);

/**
 * Group a database's children into Tables/Views/Dictionaries folders, each
 * annotated with an aggregate disk size (sum of its leaves), mirroring
 * ClickHouse Cloud's sidebar totals. Empty groups are omitted. Materialized
 * views are grouped under Views.
 */
export const buildFolders = (
  children: DatabaseInfo["children"],
): TreeNodeData[] => {
  const pick = (match: (type: string) => boolean): TreeNodeData[] =>
    children
      .filter((c) => match(c.type))
      .sort((a, b) => a.name.localeCompare(b.name)) as TreeNodeData[];

  const groups = [
    { name: "Tables", type: "table" as const, items: pick((t) => t === "table") },
    {
      name: "Views",
      type: "view" as const,
      items: pick((t) => t === "view" || t === "materialized_view"),
    },
    {
      name: "Dictionaries",
      type: "dictionary" as const,
      items: pick((t) => t === "dictionary"),
    },
  ];

  return groups
    .filter((g) => g.items.length > 0)
    .map((g) => ({
      name: g.name,
      type: g.type,
      children: g.items,
      total_bytes: sumBytes(g.items),
    }));
};
