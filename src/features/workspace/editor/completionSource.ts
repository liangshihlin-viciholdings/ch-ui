// completionSource.ts
// ClickHouse-aware CodeMirror CompletionSource backed by system.completions.
// A single query returns all databases/tables/columns/functions/keywords; rows
// are filtered at suggestion time based on the parsed SQL context so suggestions
// always reflect what the user has already typed (database prefix, FROM tables, etc.).

import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";

import useAppStore from "@/stores/workspaceStore";
import { getTransport } from "@/lib/transport";
import { appQueries } from "./appQueries";
import { DDL_OBJECTS, getAllEngines } from "./clickhouseConstants";
import {
  parseSQLContext,
  type SQLContext,
  type TableReference,
} from "./sqlContextParser";
import {
  AutocompleteUsageTracker,
  type SuggestionCategory,
} from "./usageTracker";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CompletionRow {
  word: string;
  context: string;
  belongs: string | null;
}

/**
 * Identifies which connection's schema the completion should reflect. Supplied
 * by the multi-connection workbench (per active tab). When omitted, the source
 * falls back to the legacy single-connection workspaceStore client, preserving
 * the original behaviour for any caller that does not pass context.
 */
export interface CompletionConnectionContext {
  connectionId?: string;
  engine?: string;
  selectedDatabase?: string;
}

// ─── Cache ──────────────────────────────────────────────────────────────────

// Keyed per connection so multiple workbench connections (each potentially a
// different ClickHouse cluster) never serve each other's stale completions.
// The legacy single-connection editor uses the "default" key.
const completionsCache = new Map<string, CompletionRow[]>();
// Coalesce concurrent fetches per connection so rapid keystrokes (or a
// not-yet-connected connection that returns []) don't fan out into many
// identical system.completions queries. Shared promise, cleared on settle.
const inFlightCompletions = new Map<string, Promise<CompletionRow[]>>();
let usageTracker: AutocompleteUsageTracker | null = null;

function cacheKeyFor(connectionId?: string): string {
  return connectionId || "default";
}

export function resetCompletionCaches(connectionId?: string): void {
  if (connectionId) {
    const key = cacheKeyFor(connectionId);
    completionsCache.delete(key);
    inFlightCompletions.delete(key);
  } else {
    completionsCache.clear();
    inFlightCompletions.clear();
  }
}

export async function prewarmCompletionCaches(
  connectionId?: string,
): Promise<void> {
  await getAllCompletions(connectionId);
}

/**
 * Point the (singleton) usage tracker at a connection before suggestions are
 * built. Called once per completion request; the synchronous suggestion
 * builders then read the already-positioned tracker via getTracker().
 */
function ensureTracker(connectionId: string): AutocompleteUsageTracker {
  if (!usageTracker) {
    usageTracker = new AutocompleteUsageTracker(connectionId);
  } else {
    usageTracker.setConnection(connectionId);
  }
  return usageTracker;
}

function getTracker(): AutocompleteUsageTracker {
  if (!usageTracker) {
    usageTracker = new AutocompleteUsageTracker("default");
  }
  return usageTracker;
}

async function runIntrospection(
  query: string,
  connectionId?: string,
): Promise<unknown[]> {
  // Workbench path: route through the active connection's transport (IPC on
  // desktop, in-process ClickHouse adapter on web) so completions reflect the
  // connection the editor tab actually targets — not the legacy singleton.
  if (connectionId) {
    try {
      const result = await getTransport(connectionId).query(query);
      return (result?.data ?? []) as unknown[];
    } catch (err) {
      console.error("Autocomplete introspection failed (transport):", err);
      return [];
    }
  }

  // Legacy path: the single-connection workspaceStore ClickHouse client.
  const client = useAppStore.getState().clickHouseClient;
  if (!client) return [];
  try {
    const result = await client.query({ query, format: "JSONEachRow" });
    return (await result.json()) as unknown[];
  } catch (err) {
    console.error("Autocomplete introspection failed:", err);
    return [];
  }
}

async function getAllCompletions(
  connectionId?: string,
): Promise<CompletionRow[]> {
  const key = cacheKeyFor(connectionId);
  const cached = completionsCache.get(key);
  if (cached) return cached;
  const existing = inFlightCompletions.get(key);
  if (existing) return existing;
  const fetchPromise = (async () => {
    const rows = (await runIntrospection(
      appQueries.getCompletions.query,
      connectionId,
    )) as CompletionRow[];
    // Don't cache empty results: a connection that isn't ready yet would
    // otherwise be pinned to "no completions" until an explicit reset.
    if (rows.length > 0) completionsCache.set(key, rows);
    return rows;
  })();
  inFlightCompletions.set(key, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightCompletions.delete(key);
  }
}

// ─── Completion helpers ────────────────────────────────────────────────────

type Kind = Completion["type"];

function makeCompletion(
  label: string,
  kind: Kind,
  category: SuggestionCategory,
  usageKey: string,
  extras: Partial<Completion> = {},
): Completion {
  const tracker = getTracker();
  return {
    label,
    type: kind,
    boost: usageBoost(tracker.getUsageCount(usageKey), category),
    ...extras,
  };
}

function usageBoost(count: number, category: SuggestionCategory): number {
  const base: Record<SuggestionCategory, number> = {
    column: 50,
    table: 40,
    database: 35,
    function: 25,
    operator: 15,
    keyword: 10,
  };
  return base[category] + Math.min(40, Math.floor(Math.log2(count + 1)) * 5);
}

function findTableByAlias(
  alias: string,
  fromTables: TableReference[],
): TableReference | undefined {
  return fromTables.find(
    (ref) => ref.alias?.toLowerCase() === alias.toLowerCase(),
  );
}

function findTableByName(
  tableName: string,
  fromTables: TableReference[],
): TableReference | undefined {
  return fromTables.find(
    (ref) => ref.table.toLowerCase() === tableName.toLowerCase(),
  );
}

// ─── Row-level filters ─────────────────────────────────────────────────────

function columnsFor(rows: CompletionRow[], tableNames: string[]): Completion[] {
  const lower = new Set(tableNames.map((n) => n.toLowerCase()));
  return rows
    .filter(
      (r) =>
        r.context === "column" &&
        r.belongs !== null &&
        lower.has(r.belongs.toLowerCase()),
    )
    .map((r) =>
      makeCompletion(r.word, "property", "column", `column:${r.belongs}.${r.word}`, {
        detail: r.belongs ?? undefined,
      }),
    );
}

function tablesFor(
  rows: CompletionRow[],
  databaseName: string,
  isAfterDot: boolean,
): Completion[] {
  const lower = databaseName.toLowerCase();
  return rows
    .filter(
      (r) =>
        r.context === "table" && r.belongs?.toLowerCase() === lower,
    )
    .map((r) =>
      makeCompletion(
        r.word,
        "type",
        "table",
        `table:${databaseName}.${r.word}`,
        {
          apply: isAfterDot ? r.word : `${databaseName}.${r.word}`,
          detail: `Table in ${databaseName}`,
        },
      ),
    );
}

function allDatabases(rows: CompletionRow[]): Completion[] {
  return rows
    .filter((r) => r.context === "database")
    .map((r) =>
      makeCompletion(r.word, "namespace", "database", `database:${r.word}`, {
        detail: "Database",
      }),
    );
}

function allTables(rows: CompletionRow[]): Completion[] {
  return rows
    .filter((r) => r.context === "table")
    .map((r) =>
      makeCompletion(
        r.word,
        "type",
        "table",
        `table:${r.belongs}.${r.word}`,
        {
          apply: r.belongs ? `${r.belongs}.${r.word}` : r.word,
          detail: r.belongs ? `Table in ${r.belongs}` : "Table",
        },
      ),
    );
}

function allFunctions(rows: CompletionRow[]): Completion[] {
  return rows
    .filter((r) => r.context === "function")
    .map((r) =>
      makeCompletion(r.word, "function", "function", `function:${r.word}`, {
        apply: `${r.word}(`,
      }),
    );
}

function allKeywords(rows: CompletionRow[]): Completion[] {
  return rows
    .filter((r) => r.context === "keyword")
    .map((r) => makeCompletion(r.word, "keyword", "keyword", `keyword:${r.word}`));
}

// ─── Context-driven suggestion builder ────────────────────────────────────

function getSuggestionsForContext(
  context: SQLContext,
  rows: CompletionRow[],
): Completion[] {
  const out: Completion[] = [];

  switch (context.clauseType) {
    case "SELECT":
    case "WHERE":
    case "PREWHERE":
    case "GROUP_BY":
    case "ORDER_BY":
    case "HAVING": {
      if (context.isAfterDot && context.databasePrefix) {
        // Resolve alias → table, table name → table, or fall back to db → tables
        const ref =
          findTableByAlias(context.databasePrefix, context.fromTables) ??
          findTableByName(context.databasePrefix, context.fromTables);
        if (ref) {
          out.push(...columnsFor(rows, [ref.table]));
        } else {
          out.push(...tablesFor(rows, context.databasePrefix, true));
        }
      } else if (context.fromTables.length > 0) {
        out.push(...columnsFor(rows, context.fromTables.map((t) => t.table)));
      } else if (context.selectedDatabase) {
        // No FROM clause yet — show columns from the selected database
        const dbTables = rows
          .filter(
            (r) =>
              r.context === "table" &&
              r.belongs?.toLowerCase() === context.selectedDatabase!.toLowerCase(),
          )
          .map((r) => r.word);
        out.push(...columnsFor(rows, dbTables));
      }

      if (context.clauseType === "SELECT") {
        out.push(
          makeCompletion("*", "keyword", "keyword", "keyword:*", {
            detail: "All columns",
          }),
        );
      }

      out.push(...allFunctions(rows));

      if (
        context.clauseType === "WHERE" ||
        context.clauseType === "HAVING" ||
        context.clauseType === "PREWHERE"
      ) {
        for (const op of [
          "AND", "OR", "NOT", "IN", "LIKE", "BETWEEN",
          "GLOBAL IN", "GLOBAL NOT IN", "ANY", "ALL", "ILIKE",
        ]) {
          out.push(makeCompletion(op, "keyword", "operator", `operator:${op}`));
        }
      }

      if (context.clauseType === "ORDER_BY") {
        out.push(
          makeCompletion("ASC", "keyword", "keyword", "keyword:ASC"),
          makeCompletion("DESC", "keyword", "keyword", "keyword:DESC"),
        );
      }
      break;
    }

    case "FROM":
    case "JOIN":
    case "INSERT":
    case "UPDATE":
    case "DELETE":
    case "TO": {
      if (context.isAfterDot && context.databasePrefix) {
        out.push(...tablesFor(rows, context.databasePrefix, true));
      } else {
        out.push(...allDatabases(rows));
        out.push(...allTables(rows));
      }
      break;
    }

    case "FORMAT": {
      for (const fmt of [
        "TabSeparated", "TabSeparatedWithNames", "TabSeparatedWithNamesAndTypes",
        "CSV", "CSVWithNames", "CSVWithNamesAndTypes",
        "JSON", "JSONEachRow", "JSONCompact", "JSONCompactEachRow",
        "Pretty", "PrettyCompact", "PrettySpace", "Vertical", "Values",
        "XML", "Parquet", "Arrow", "ORC",
      ]) {
        out.push(
          makeCompletion(fmt, "enum", "keyword", `keyword:${fmt}`, {
            detail: "Output format",
          }),
        );
      }
      break;
    }

    case "CREATE":
    case "ALTER":
    case "DROP": {
      for (const obj of DDL_OBJECTS) {
        out.push(
          makeCompletion(obj, "keyword", "keyword", `keyword:${obj}`, {
            detail: "DDL object type",
          }),
        );
      }
      out.push(...allDatabases(rows));
      break;
    }

    case "ENGINE": {
      for (const engine of getAllEngines()) {
        out.push(
          makeCompletion(engine, "class", "keyword", `keyword:${engine}`, {
            detail: "Table engine",
          }),
        );
      }
      break;
    }

    default: {
      out.push(...allDatabases(rows));
      out.push(...allTables(rows));
      out.push(...allFunctions(rows));
      break;
    }
  }

  out.push(...allKeywords(rows));

  // Deduplicate: columns with same name from different tables keep separate entries
  const seen = new Set<string>();
  const deduped: Completion[] = [];
  for (const c of out) {
    const key =
      c.type === "property" && c.detail
        ? `${c.label}\x00${c.detail}`
        : c.label;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }
  return deduped;
}

// ─── Main CompletionSource ─────────────────────────────────────────────────

const IDENTIFIER_BEFORE = /[\w.]+/;
const IDENTIFIER_VALID = /^[\w.]*$/;

export async function clickhouseCompletionSource(
  context: CompletionContext,
  conn?: CompletionConnectionContext,
): Promise<CompletionResult | null> {
  // Engine guard: system.completions is ClickHouse-specific. Non-ClickHouse
  // workbench tabs (postgres/mysql/sqlite/duckdb) get no completions for now
  // rather than a doomed ClickHouse query (engine-aware completions tracked
  // as a separate follow-up).
  if (conn?.engine && conn.engine !== "clickhouse") return null;

  const prefix = context.matchBefore(IDENTIFIER_BEFORE);

  const charBefore =
    context.pos > 0
      ? context.state.doc.sliceString(context.pos - 1, context.pos)
      : "";
  const triggerAfterParen = charBefore === "(" || charBefore === ",";

  if (!prefix && !context.explicit && !triggerAfterParen) return null;

  const trackerId =
    conn?.connectionId || useAppStore.getState().credential?.url || "default";

  const selectedDatabase =
    conn?.selectedDatabase ?? useAppStore.getState().selectedDatabase;
  const sqlContext = parseSQLContext(
    context.state.doc.toString(),
    context.pos,
    selectedDatabase,
  );

  const from =
    sqlContext.isAfterDot || triggerAfterParen
      ? (context.matchBefore(/\w*/)?.from ?? context.pos)
      : (prefix?.from ?? context.pos);
  const to = context.pos;

  const rows = await getAllCompletions(conn?.connectionId);
  if (context.aborted) return null;

  // Re-assert the tracker connection AFTER the await: getSuggestionsForContext
  // is fully synchronous, so positioning the (singleton) tracker here keeps it
  // correct for the whole build even if another editor's completion ran during
  // the await (e.g. split panes on different connections).
  ensureTracker(trackerId);
  const options = getSuggestionsForContext(sqlContext, rows);

  return { from, to, options, validFor: IDENTIFIER_VALID };
}
