// src/lib/queryRunner.ts
// Standalone entry points for running queries outside of React components.
//
// The underlying implementation lives in the workspace store so that query
// execution can read/write tab state. This module re-exports the high-level
// entry points (`runQuery`, `runAllQueries`, `cancelQuery`) and the
// `ClickHouseError` class for direct consumption by non-React code.

export {
  runQuery,
  runAllQueries,
  cancelQuery,
} from "@/stores/workspaceStore";

export { ClickHouseError } from "@/lib/clickhouseError";
export type { ClickHouseErrorCategory } from "@/lib/clickhouseError";
