// completionSource.ts
// ClickHouse-aware CodeMirror CompletionSource ported from monacoConfig.ts.
// Produces database/table/column/function/keyword suggestions based on the
// SQL context at the cursor, pulling live schema metadata from the app's
// configured ClickHouse client (via workspaceStore) and caching per session.

import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from "@codemirror/autocomplete";

import useAppStore from "@/stores/workspaceStore";
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

// ─── Schema types (mirror monacoConfig internal shape) ─────────────────────

interface ColumnMeta {
  name: string;
  type: string;
}

interface TableMeta {
  name: string;
  children: ColumnMeta[];
}

interface DatabaseMeta {
  name: string;
  children: TableMeta[];
}

// ─── Caches ────────────────────────────────────────────────────────────────

let dbStructureCache: DatabaseMeta[] | null = null;
let functionsCache: string[] | null = null;
let keywordsCache: string[] | null = null;
let usageTracker: AutocompleteUsageTracker | null = null;

/**
 * Reset cached metadata. Call when the active ClickHouse connection changes
 * so the next completion request refreshes the schema/function lists.
 */
export function resetCompletionCaches(): void {
  dbStructureCache = null;
  functionsCache = null;
  keywordsCache = null;
}

function getTracker(): AutocompleteUsageTracker {
  const connectionId =
    useAppStore.getState().credential?.url || "default";
  if (!usageTracker) {
    usageTracker = new AutocompleteUsageTracker(connectionId);
  } else {
    usageTracker.setConnection(connectionId);
  }
  return usageTracker;
}

async function runIntrospection(query: string): Promise<unknown[]> {
  const client = useAppStore.getState().clickHouseClient;
  if (!client) return [];
  try {
    const result = await client.query({
      query,
      format: "JSONEachRow",
    });
    return (await result.json()) as unknown[];
  } catch (err) {
    console.error("Autocomplete introspection failed:", err);
    return [];
  }
}

async function getDatabaseStructure(): Promise<DatabaseMeta[]> {
  if (dbStructureCache) return dbStructureCache;

  const rows = (await runIntrospection(appQueries.getIntellisense.query)) as Array<{
    database: string;
    table: string;
    column_name: string;
    column_type: string;
  }>;

  const map: Record<string, DatabaseMeta> = {};
  for (const row of rows) {
    if (!map[row.database]) {
      map[row.database] = { name: row.database, children: [] };
    }
    let table = map[row.database].children.find((t) => t.name === row.table);
    if (!table) {
      table = { name: row.table, children: [] };
      map[row.database].children.push(table);
    }
    table.children.push({ name: row.column_name, type: row.column_type });
  }

  dbStructureCache = Object.values(map);
  return dbStructureCache;
}

async function getFunctions(): Promise<string[]> {
  if (functionsCache) return functionsCache;
  const rows = (await runIntrospection(
    appQueries.getClickHouseFunctions.query,
  )) as Array<{ name: string }>;
  functionsCache = rows.map((r) => r.name);
  return functionsCache;
}

async function getKeywords(): Promise<string[]> {
  if (keywordsCache) return keywordsCache;
  const rows = (await runIntrospection(appQueries.getKeywords.query)) as Array<{
    keyword: string;
  }>;
  keywordsCache = rows.map((r) => r.keyword);
  return keywordsCache;
}

// ─── Completion helpers ────────────────────────────────────────────────────

function findTable(
  dbStructure: DatabaseMeta[],
  databaseName: string | null | undefined,
  tableName: string,
): TableMeta | null {
  if (!databaseName) return null;
  const db = dbStructure.find(
    (d) => d.name.toLowerCase() === databaseName.toLowerCase(),
  );
  if (!db) return null;
  return (
    db.children.find(
      (t) => t.name.toLowerCase() === tableName.toLowerCase(),
    ) ?? null
  );
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

/**
 * Convert the usage-tracker sort hint into a CodeMirror `boost` value.
 * Higher boost = shown earlier. Columns are preferred over tables, etc.
 */
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

function getColumnSuggestions(
  context: SQLContext,
  dbStructure: DatabaseMeta[],
): Completion[] {
  const columns: Completion[] = [];

  if (context.fromTables.length > 0) {
    const hasMultipleTables = context.fromTables.length > 1;

    if (hasMultipleTables) {
      // Multi-table: show bare column names; table context visible in detail.
      for (const tableRef of context.fromTables) {
        const db = tableRef.database || context.selectedDatabase;
        const table = findTable(dbStructure, db, tableRef.table);
        if (!table || !db) continue;

        for (const col of table.children) {
          columns.push(
            makeCompletion(
              col.name,
              "property",
              "column",
              `column:${db}.${tableRef.table}.${col.name}`,
              { detail: `${col.type} • ${db}.${tableRef.table}` },
            ),
          );
        }
      }
    } else {
      for (const tableRef of context.fromTables) {
        const db = tableRef.database || context.selectedDatabase;
        const table = findTable(dbStructure, db, tableRef.table);
        if (!table || !db) continue;

        for (const col of table.children) {
          columns.push(
            makeCompletion(
              col.name,
              "property",
              "column",
              `column:${db}.${tableRef.table}.${col.name}`,
              { detail: `${col.type} • ${db}.${tableRef.table}` },
            ),
          );
        }
      }
    }
  } else if (context.selectedDatabase) {
    const db = dbStructure.find(
      (d) =>
        d.name.toLowerCase() === context.selectedDatabase?.toLowerCase(),
    );
    if (db) {
      for (const table of db.children) {
        for (const col of table.children) {
          columns.push(
            makeCompletion(
              col.name,
              "property",
              "column",
              `column:${db.name}.${table.name}.${col.name}`,
              { detail: `${col.type} • ${db.name}.${table.name}` },
            ),
          );
        }
      }
    }
  }

  return columns;
}

function getTableSuggestions(
  databaseName: string,
  dbStructure: DatabaseMeta[],
  isAfterDot: boolean,
): Completion[] {
  const db = dbStructure.find(
    (d) => d.name.toLowerCase() === databaseName.toLowerCase(),
  );
  if (!db) return [];

  return db.children.map((table) => {
    const insertText = isAfterDot
      ? table.name
      : `${db.name}.${table.name}`;
    return makeCompletion(
      table.name,
      "type",
      "table",
      `table:${db.name}.${table.name}`,
      {
        apply: insertText,
        detail: `Table in ${db.name}`,
      },
    );
  });
}

function getDatabaseSuggestions(dbStructure: DatabaseMeta[]): Completion[] {
  return dbStructure.map((db) =>
    makeCompletion(db.name, "namespace", "database", `database:${db.name}`, {
      detail: "Database",
    }),
  );
}

function getSuggestionsForContext(
  context: SQLContext,
  dbStructure: DatabaseMeta[],
  keywords: string[],
  functions: string[],
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
        const aliasRef = findTableByAlias(
          context.databasePrefix,
          context.fromTables,
        );
        if (aliasRef) {
          const db = aliasRef.database || context.selectedDatabase;
          const table = findTable(dbStructure, db, aliasRef.table);
          if (table && db) {
            for (const col of table.children) {
              out.push(
                makeCompletion(
                  col.name,
                  "property",
                  "column",
                  `column:${db}.${aliasRef.table}.${col.name}`,
                  { detail: `${col.type} • ${db}.${aliasRef.table}` },
                ),
              );
            }
          }
        } else {
          const tableRef = findTableByName(
            context.databasePrefix,
            context.fromTables,
          );
          if (tableRef) {
            const db = tableRef.database || context.selectedDatabase;
            const table = findTable(dbStructure, db, tableRef.table);
            if (table && db) {
              for (const col of table.children) {
                out.push(
                  makeCompletion(
                    col.name,
                    "property",
                    "column",
                    `column:${db}.${tableRef.table}.${col.name}`,
                    { detail: `${col.type} • ${db}.${tableRef.table}` },
                  ),
                );
              }
            }
          } else {
            out.push(
              ...getTableSuggestions(
                context.databasePrefix,
                dbStructure,
                true,
              ),
            );
          }
        }
      } else {
        out.push(...getColumnSuggestions(context, dbStructure));
      }

      if (context.clauseType === "SELECT") {
        out.push(
          makeCompletion("*", "keyword", "keyword", "keyword:*", {
            detail: "All columns",
          }),
        );
        for (const fn of functions) {
          out.push(
            makeCompletion(fn, "function", "function", `function:${fn}`, {
              apply: `${fn}(`,
            }),
          );
        }
      }

      if (
        context.clauseType === "WHERE" ||
        context.clauseType === "HAVING" ||
        context.clauseType === "PREWHERE"
      ) {
        const operators = [
          "AND",
          "OR",
          "NOT",
          "IN",
          "LIKE",
          "BETWEEN",
          "GLOBAL IN",
          "GLOBAL NOT IN",
          "ANY",
          "ALL",
          "ILIKE",
        ];
        for (const op of operators) {
          out.push(
            makeCompletion(op, "keyword", "operator", `operator:${op}`),
          );
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
    case "JOIN": {
      if (context.isAfterDot && context.databasePrefix) {
        out.push(
          ...getTableSuggestions(context.databasePrefix, dbStructure, true),
        );
      } else {
        out.push(...getDatabaseSuggestions(dbStructure));
        if (context.selectedDatabase) {
          out.push(
            ...getTableSuggestions(
              context.selectedDatabase,
              dbStructure,
              false,
            ),
          );
        }
      }
      break;
    }

    case "INSERT":
    case "UPDATE":
    case "DELETE": {
      if (context.isAfterDot && context.databasePrefix) {
        out.push(
          ...getTableSuggestions(context.databasePrefix, dbStructure, true),
        );
      } else {
        out.push(...getDatabaseSuggestions(dbStructure));
        if (context.selectedDatabase) {
          out.push(
            ...getTableSuggestions(
              context.selectedDatabase,
              dbStructure,
              false,
            ),
          );
        }
      }
      break;
    }

    case "FORMAT": {
      const formats = [
        "TabSeparated",
        "TabSeparatedWithNames",
        "TabSeparatedWithNamesAndTypes",
        "CSV",
        "CSVWithNames",
        "CSVWithNamesAndTypes",
        "JSON",
        "JSONEachRow",
        "JSONCompact",
        "JSONCompactEachRow",
        "Pretty",
        "PrettyCompact",
        "PrettySpace",
        "Vertical",
        "Values",
        "XML",
        "Parquet",
        "Arrow",
        "ORC",
      ];
      for (const fmt of formats) {
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
      out.push(...getDatabaseSuggestions(dbStructure));
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

    case "TO": {
      if (context.isAfterDot && context.databasePrefix) {
        out.push(
          ...getTableSuggestions(context.databasePrefix, dbStructure, true),
        );
      } else {
        out.push(...getDatabaseSuggestions(dbStructure));
        if (context.selectedDatabase) {
          out.push(
            ...getTableSuggestions(
              context.selectedDatabase,
              dbStructure,
              false,
            ),
          );
        }
      }
      break;
    }

    default: {
      out.push(...getDatabaseSuggestions(dbStructure));
      if (context.selectedDatabase) {
        out.push(
          ...getTableSuggestions(
            context.selectedDatabase,
            dbStructure,
            false,
          ),
        );
      }
      break;
    }
  }

  // Always append base SQL keywords (deduped below).
  for (const kw of keywords) {
    out.push(makeCompletion(kw, "keyword", "keyword", `keyword:${kw}`));
  }

  // De-duplicate: columns with the same name from different tables each get
  // their own row (keyed by label + detail); keywords/functions dedup by label.
  const seen = new Set<string>();
  const deduped: Completion[] = [];
  for (const c of out) {
    const key =
      c.type === "property" && c.detail ? `${c.label}\x00${c.detail}` : c.label;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }
  return deduped;
}

// ─── Main CompletionSource ─────────────────────────────────────────────────

const IDENTIFIER_BEFORE = /[\w.]+/;
const IDENTIFIER_VALID = /^[\w.]*$/;

/**
 * CodeMirror CompletionSource that returns ClickHouse-aware suggestions
 * (databases, tables, columns, functions, keywords) based on the SQL
 * context at the cursor.
 */
export const clickhouseCompletionSource: CompletionSource = async (
  context: CompletionContext,
): Promise<CompletionResult | null> => {
  const prefix = context.matchBefore(IDENTIFIER_BEFORE);
  if (!prefix && !context.explicit) return null;

  const from = prefix?.from ?? context.pos;
  const to = context.pos;

  const selectedDatabase = useAppStore.getState().selectedDatabase;
  const sqlContext = parseSQLContext(
    context.state.doc.toString(),
    context.pos,
    selectedDatabase,
  );

  // Fetch metadata in parallel. Each call is cached per connection so this
  // is cheap after the first hit.
  const [dbStructure, functions, keywords] = await Promise.all([
    getDatabaseStructure(),
    getFunctions(),
    getKeywords(),
  ]);

  if (context.aborted) return null;

  const options = getSuggestionsForContext(
    sqlContext,
    dbStructure,
    keywords,
    functions,
  );

  return {
    from,
    to,
    options,
    validFor: IDENTIFIER_VALID,
  };
};
