// src/lib/queryRunner.ts
// Standalone entry points for running queries outside of React components.
//
// `runQuery` routes by connection:
//   • no connectionId  → the legacy single-ClickHouse path (workspaceStore),
//     i.e. the existing behavior for every current caller.
//   • with connectionId → the workbench transport for that connection
//     (getTransport), so features can target any saved connection. On the web
//     build this still reaches only ClickHouse; on the desktop build it reaches
//     the connection's real engine. The connection must already be connected
//     in the workbench (connectConnection); otherwise the call resolves with an
//     `error` (the contract never throws).
//
// This is the seam the per-feature multi-DB epics (dashboards, search, alerts,
// …) opt into by passing a connectionId.

import {
  runQuery as runQueryLegacy,
  runAllQueries,
  cancelQuery,
} from "@/stores/workspaceStore";
import { getTransport } from "@/lib/transport";
import type { QueryResult } from "@/types/common";

export async function runQuery(
  query: string,
  connectionId?: string,
): Promise<QueryResult> {
  if (!connectionId) {
    return runQueryLegacy(query);
  }

  try {
    const result = await getTransport(connectionId).query(query);
    return {
      meta: result.meta,
      data: result.data,
      statistics: result.statistics,
      rows: result.rows,
      error: result.error,
    };
  } catch (error: unknown) {
    return {
      meta: [],
      data: [],
      statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
      rows: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export { runAllQueries, cancelQuery };

export { ClickHouseError } from "@/lib/clickhouseError";
export type { ClickHouseErrorCategory } from "@/lib/clickhouseError";
