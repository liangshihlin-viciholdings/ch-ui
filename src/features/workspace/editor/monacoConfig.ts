//monacoConfig.ts
import { createClient } from "@clickhouse/client-web";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { format } from "sql-formatter";
import useAppStore from "@/stores/workspaceStore";
import { appQueries } from "./appQueries";
import { DDL_OBJECTS, getAllEngines } from "./clickhouseConstants";
import { registerMonacoThemes } from "./monacoThemes";
import {
  type ClauseType,
  generateTableAlias,
  parseSQLContext,
  type SQLContext,
  type TableReference,
} from "./sqlContextParser";
import {
  AutocompleteUsageTracker,
  type SuggestionCategory,
} from "./usageTracker";

// Add this declaration to extend the Window interface
declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker?: () => Worker;
      getWorkerUrl?: () => string;
    };
  }
}

let isInitialized = false;

// Initialize ClickHouse client
let client: any = null;

const appStore = localStorage.getItem("app-storage");
const state = appStore ? JSON.parse(appStore) : {};
const credential = state.state?.credential || {};

function initializeClickHouseClient(
  appStore: any,
  state: any,
  credential: any,
) {
  if (
    credential &&
    typeof credential.url === "string" &&
    credential.url.trim() !== "" &&
    typeof credential.username === "string" &&
    credential.username.trim() !== ""
  ) {
    client = createClient({
      url: credential.url,
      pathname: credential.customPath,
      username: credential.username,
      password: credential.password || "", // Allow empty password
    });
    console.log("Monaco ClickHouse client initialized successfully");
  } else {
    // Only log if this is not the initial empty state
    const hasAnyCredential = credential?.url || credential?.username;
    if (hasAnyCredential) {
      console.warn("Invalid or missing ClickHouse credentials:", credential);
    }
  }
}

// Call this function at the start of your application
try {
  initializeClickHouseClient(appStore, state, credential);
} catch (error) {
  console.error("Error initializing ClickHouse client:", error);
}

// Retry initialization function
export async function retryInitialization(
  retries: number = 3,
  delay: number = 2000,
): Promise<void> {
  for (let i = 0; i < retries; i++) {
    if (client) {
      console.log("ClickHouse client is already initialized.");
      return;
    }
    console.log(`Retrying initialization... Attempt ${i + 1}`);
    // get the latest app store
    const appStore = localStorage.getItem("app-storage");
    const state = appStore ? JSON.parse(appStore) : {};
    const credential = state.state?.credential || {};
    initializeClickHouseClient(appStore, state, credential);
    if (client) {
      console.log("ClickHouse client initialized successfully.");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  console.error(
    "Failed to initialize ClickHouse client after multiple attempts.",
  );
}

// Modify the query execution function
async function executeQuery(query: string): Promise<any> {
  if (!client) {
    throw new Error("ClickHouse client is not initialized");
  }
  try {
    const result = await client.query({
      query,
      format: "JSONEachRow",
    });
    return await result.json();
  } catch (error) {
    console.error("Error executing query:", error);
    throw error;
  }
}

// Define interfaces for the database structure
interface Column {
  name: string;
  type: string;
}

interface Table {
  name: string;
  type: string;
  children: Column[];
}

interface Database {
  name: string;
  type: string;
  children: Table[];
}

// Cache for database structure
let dbStructureCache: Database[] | null = null;

// cache for functions
let functionsCache: string[] | null = null;

// cache for keywords
let keywordsCache: string[] | null = null;

// Usage tracker instance (initialized with connection ID from state)
let usageTracker: AutocompleteUsageTracker | null = null;

function getUsageTracker(): AutocompleteUsageTracker {
  const connectionId = credential?.url || "default";

  if (!usageTracker) {
    usageTracker = new AutocompleteUsageTracker(connectionId);
  } else {
    // Update connection if it changed
    usageTracker.setConnection(connectionId);
  }

  return usageTracker;
}

// Setting up the Monaco Environment to use the editor worker
window.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  },
};

// Ensure the Monaco Environment is initialized
function ensureMonacoEnvironment() {
  if (typeof window.MonacoEnvironment === "undefined") {
    window.MonacoEnvironment = {
      getWorker() {
        return new EditorWorker();
      },
    };
  }
}

async function getDatabasesTablesAndColumns(): Promise<Database[]> {
  if (dbStructureCache) {
    return dbStructureCache;
  }

  try {
    const data = await executeQuery(appQueries.getIntellisense.query);

    // Process the data into the Database structure
    const databaseMap: Record<string, Database> = {};

    data.forEach((item: any) => {
      const { database, table, column_name, column_type } = item;

      if (!databaseMap[database]) {
        databaseMap[database] = {
          name: database,
          type: "database",
          children: [],
        };
      }

      let tableObj = databaseMap[database].children.find(
        (t) => t.name === table,
      );
      if (!tableObj) {
        tableObj = {
          name: table,
          type: "table",
          children: [],
        };
        databaseMap[database].children.push(tableObj);
      }

      tableObj.children.push({
        name: column_name,
        type: column_type,
      });
    });

    // Convert the map to an array
    dbStructureCache = Object.values(databaseMap);
    return dbStructureCache;
  } catch (err) {
    console.error("Error fetching database data:", err);
    return [];
  }
}

// async function get functions from the API
async function getFunctions(): Promise<string[]> {
  if (functionsCache) {
    return functionsCache || [];
  }

  try {
    const data = await executeQuery(appQueries.getClickHouseFunctions.query);
    functionsCache = data.map((row: any) => row.name);
    return functionsCache || [];
  } catch (err) {
    console.error("Error fetching functions data:", err);
    return [];
  }
}

// async function get keywords from the API
async function getKeywords(): Promise<string[]> {
  if (keywordsCache) {
    return keywordsCache || [];
  }

  try {
    const data = await executeQuery(appQueries.getKeywords.query);
    keywordsCache = data.map((row: any) => row.keyword);
    return keywordsCache || [];
  } catch (err) {
    console.error("Error fetching keywords data:", err);
    return [];
  }
}

/**
 * Helper function to find a table in the database structure
 */
function findTable(
  dbStructure: Database[],
  databaseName: string | null | undefined,
  tableName: string,
): Table | null {
  if (!databaseName) return null;

  const database = dbStructure.find(
    (db) => db.name.toLowerCase() === databaseName.toLowerCase(),
  );
  if (!database) return null;

  return (
    database.children.find(
      (table) => table.name.toLowerCase() === tableName.toLowerCase(),
    ) || null
  );
}

/**
 * Find a table reference by its alias
 */
function findTableByAlias(
  alias: string,
  fromTables: { database: string | null; table: string; alias?: string }[],
): { database: string | null; table: string; alias?: string } | undefined {
  return fromTables.find(
    (ref) => ref.alias?.toLowerCase() === alias.toLowerCase(),
  );
}

/**
 * Find a table reference by its table name
 */
function findTableByName(
  tableName: string,
  fromTables: { database: string | null; table: string; alias?: string }[],
): { database: string | null; table: string; alias?: string } | undefined {
  return fromTables.find(
    (ref) => ref.table.toLowerCase() === tableName.toLowerCase(),
  );
}

/**
 * Get column suggestions based on FROM tables or selected database
 */
function getColumnSuggestions(
  context: SQLContext,
  dbStructure: Database[],
  range: monaco.IRange,
  model: monaco.editor.ITextModel,
): monaco.languages.CompletionItem[] {
  const columns: monaco.languages.CompletionItem[] = [];
  const tracker = getUsageTracker();

  if (context.fromTables.length > 0) {
    // FROM clause present - show columns from referenced tables only
    const hasMultipleTables = context.fromTables.length > 1;

    if (hasMultipleTables) {
      // Multi-table mode: generate aliases for tables without explicit aliases
      // Collect existing aliases
      const existingAliases = new Set<string>();
      for (const ref of context.fromTables) {
        if (ref.alias) existingAliases.add(ref.alias.toLowerCase());
      }

      // Build alias map for tables without explicit aliases
      const aliasMap = new Map<TableReference, string>();
      for (const tableRef of context.fromTables) {
        if (!tableRef.alias) {
          const alias = generateTableAlias(tableRef.table, existingAliases);
          aliasMap.set(tableRef, alias);
          existingAliases.add(alias.toLowerCase());
        }
      }

      // Build additionalTextEdits for ALL tables that need aliases
      // This ensures all aliases are inserted at once when any column is selected
      const allAdditionalTextEdits: monaco.languages.TextEdit[] = [];
      for (const tableRef of context.fromTables) {
        if (!tableRef.alias && tableRef.endPosition !== undefined) {
          const generatedAlias = aliasMap.get(tableRef);
          if (generatedAlias) {
            const insertPos = model.getPositionAt(tableRef.endPosition);
            allAdditionalTextEdits.push({
              range: new monaco.Range(
                insertPos.lineNumber,
                insertPos.column,
                insertPos.lineNumber,
                insertPos.column,
              ),
              text: ` ${generatedAlias}`,
            });
          }
        }
      }

      for (const tableRef of context.fromTables) {
        const db = tableRef.database || context.selectedDatabase;
        const table = findTable(dbStructure, db, tableRef.table);

        if (table && db) {
          // Use explicit alias or generated alias as prefix
          const prefix = tableRef.alias || aliasMap.get(tableRef);

          table.children.forEach((col) => {
            const label = prefix ? `${prefix}.${col.name}` : col.name;
            const insertText = prefix ? `${prefix}.${col.name}` : col.name;
            const detail = `${col.type} - ${db}.${tableRef.table}`;

            columns.push({
              label,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText,
              detail,
              sortText: tracker.getSortText(
                `column:${db}.${tableRef.table}.${col.name}`,
                "column",
              ),
              range,
              additionalTextEdits:
                allAdditionalTextEdits.length > 0
                  ? allAdditionalTextEdits
                  : undefined,
            });
          });
        }
      }
    } else {
      // Single table mode: no prefix needed
      for (const tableRef of context.fromTables) {
        const db = tableRef.database || context.selectedDatabase;
        const table = findTable(dbStructure, db, tableRef.table);

        if (table && db) {
          table.children.forEach((col) => {
            const detail = `${col.type} - ${db}.${tableRef.table}`;

            columns.push({
              label: col.name,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: col.name,
              detail,
              sortText: tracker.getSortText(
                `column:${db}.${tableRef.table}.${col.name}`,
                "column",
              ),
              range,
            });
          });
        }
      }
    }
  } else if (context.selectedDatabase) {
    // No FROM clause but database selected - show ALL columns from ALL tables
    const database = dbStructure.find(
      (db) => db.name.toLowerCase() === context.selectedDatabase?.toLowerCase(),
    );

    if (database) {
      // Check if we should use auto-FROM insertion
      const useAutoFrom =
        context.isSimpleSelect && context.clauseType === "SELECT";
      const usedAliases = new Set<string>();

      for (const table of database.children) {
        // Generate alias if using auto-FROM
        const alias = useAutoFrom
          ? generateTableAlias(table.name, usedAliases)
          : null;
        if (alias) usedAliases.add(alias);

        table.children.forEach((col) => {
          // Build insertText based on whether we're using auto-FROM
          const insertText =
            useAutoFrom && alias
              ? `${alias}.${col.name} FROM ${database.name}.${table.name} ${alias}`
              : col.name;

          columns.push({
            label: col.name,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText,
            detail: `${col.type} - ${database.name}.${table.name}`,
            sortText: tracker.getSortText(
              `column:${database.name}.${table.name}.${col.name}`,
              "column",
            ),
            range,
          });
        });
      }
    }
  }

  return columns;
}

/**
 * Get table suggestions for a specific database
 */
function getTableSuggestions(
  databaseName: string,
  dbStructure: Database[],
  range: monaco.IRange,
  isAfterDot: boolean = false,
  existingAliases: Set<string> = new Set(),
  includeAlias: boolean = false,
): monaco.languages.CompletionItem[] {
  const database = dbStructure.find(
    (db) => db.name.toLowerCase() === databaseName.toLowerCase(),
  );

  if (!database) return [];

  const tracker = getUsageTracker();

  // Build a local set of aliases for this batch to avoid conflicts
  const usedAliases = new Set(existingAliases);

  return database.children.map((table) => {
    let insertText: string;

    if (isAfterDot) {
      // User typed "db." - just complete the table name
      insertText = table.name;
    } else if (includeAlias) {
      // Generate unique alias
      const alias = generateTableAlias(table.name, usedAliases);
      usedAliases.add(alias);
      insertText = `${database.name}.${table.name} ${alias}`;
    } else {
      // Just database.table without alias
      insertText = `${database.name}.${table.name}`;
    }

    return {
      label: table.name,
      kind: monaco.languages.CompletionItemKind.Struct,
      insertText,
      detail: `Table in ${database.name}`,
      sortText: tracker.getSortText(
        `table:${database.name}.${table.name}`,
        "table",
      ),
      range,
    };
  });
}

/**
 * Get database suggestions
 */
function getDatabaseSuggestions(
  dbStructure: Database[],
  range: monaco.IRange,
): monaco.languages.CompletionItem[] {
  const tracker = getUsageTracker();

  return dbStructure.map((database) => ({
    label: database.name,
    kind: monaco.languages.CompletionItemKind.Module,
    insertText: database.name,
    detail: "Database",
    sortText: tracker.getSortText(`database:${database.name}`, "database"),
    range,
  }));
}

/**
 * Get context-aware suggestions based on SQL clause type
 */
function getSuggestionsForContext(
  context: SQLContext,
  dbStructure: Database[],
  range: monaco.IRange,
  keywords: string[],
  functions: string[],
  model: monaco.editor.ITextModel,
): monaco.languages.CompletionItem[] {
  const suggestions: monaco.languages.CompletionItem[] = [];

  switch (context.clauseType) {
    case "SELECT":
    case "WHERE":
    case "PREWHERE":
    case "GROUP_BY":
    case "ORDER_BY":
    case "HAVING": {
      // Check if user is typing after a dot (for alias.column or table.column)
      if (context.isAfterDot && context.databasePrefix) {
        // Priority 1: Check if it's an alias
        const aliasRef = findTableByAlias(
          context.databasePrefix,
          context.fromTables,
        );
        if (aliasRef) {
          const db = aliasRef.database || context.selectedDatabase;
          const table = findTable(dbStructure, db, aliasRef.table);
          if (table && db) {
            suggestions.push(
              ...table.children.map((col) => ({
                label: col.name,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: col.name,
                detail: `${col.type} - ${db}.${aliasRef.table}`,
                range,
              })),
            );
          }
        }
        // Priority 2: Check if it's a table name
        else {
          const tableRef = findTableByName(
            context.databasePrefix,
            context.fromTables,
          );
          if (tableRef) {
            const db = tableRef.database || context.selectedDatabase;
            const table = findTable(dbStructure, db, tableRef.table);
            if (table && db) {
              suggestions.push(
                ...table.children.map((col) => ({
                  label: col.name,
                  kind: monaco.languages.CompletionItemKind.Field,
                  insertText: col.name,
                  detail: `${col.type} - ${db}.${tableRef.table}`,
                  range,
                })),
              );
            }
          }
          // Priority 3: Treat as database name for database.table pattern
          else {
            suggestions.push(
              ...getTableSuggestions(
                context.databasePrefix,
                dbStructure,
                range,
                true,
                new Set(),
                false,
              ),
            );
          }
        }
      } else {
        // No dot - show columns from tables or selected database
        const columnSuggestions = getColumnSuggestions(
          context,
          dbStructure,
          range,
          model,
        );
        suggestions.push(...columnSuggestions);
      }

      // Also show functions in SELECT clause
      if (context.clauseType === "SELECT") {
        const tracker = getUsageTracker();
        suggestions.push(
          {
            label: "*",
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: "*",
            detail: "All columns",
            sortText: tracker.getSortText("keyword:*", "keyword"),
            range,
          },
          ...functions.map((func) => ({
            label: func,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: `${func}()`,
            sortText: tracker.getSortText(`function:${func}`, "function"),
            range,
          })),
        );
      }

      // Show operators in WHERE/HAVING/PREWHERE
      if (
        context.clauseType === "WHERE" ||
        context.clauseType === "HAVING" ||
        context.clauseType === "PREWHERE"
      ) {
        const tracker = getUsageTracker();
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
        suggestions.push(
          ...operators.map((op) => ({
            label: op,
            kind: monaco.languages.CompletionItemKind.Operator,
            insertText: op,
            sortText: tracker.getSortText(`operator:${op}`, "operator"),
            range,
          })),
        );
      }

      // Show ASC/DESC in ORDER BY
      if (context.clauseType === "ORDER_BY") {
        const tracker = getUsageTracker();
        suggestions.push(
          {
            label: "ASC",
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: "ASC",
            sortText: tracker.getSortText("keyword:ASC", "keyword"),
            range,
          },
          {
            label: "DESC",
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: "DESC",
            sortText: tracker.getSortText("keyword:DESC", "keyword"),
            range,
          },
        );
      }

      break;
    }

    case "FROM":
    case "JOIN": {
      // Collect existing aliases from fromTables
      const existingAliases = new Set(
        context.fromTables
          .map((ref) => ref.alias)
          .filter((alias): alias is string => !!alias),
      );

      if (context.isAfterDot && context.databasePrefix) {
        // After dot: show tables from the specified database (user typed "db.")
        // Don't add alias here since user is manually typing the database
        suggestions.push(
          ...getTableSuggestions(
            context.databasePrefix,
            dbStructure,
            range,
            true,
            existingAliases,
            false,
          ),
        );
      } else {
        // No dot or before dot: show databases and tables with db prefix + alias
        suggestions.push(...getDatabaseSuggestions(dbStructure, range));

        // Also show tables from selected database if any - WITH aliases
        if (context.selectedDatabase) {
          suggestions.push(
            ...getTableSuggestions(
              context.selectedDatabase,
              dbStructure,
              range,
              false,
              existingAliases,
              true,
            ),
          );
        }
      }
      break;
    }

    case "INSERT":
    case "UPDATE":
    case "DELETE": {
      // Check if user typed "DB." - only show tables from that database
      if (context.isAfterDot && context.databasePrefix) {
        suggestions.push(
          ...getTableSuggestions(
            context.databasePrefix,
            dbStructure,
            range,
            true,
            new Set(),
            false,
          ),
        );
      } else {
        // No dot - show databases and tables with db prefix (no aliases for DML)
        suggestions.push(...getDatabaseSuggestions(dbStructure, range));

        if (context.selectedDatabase) {
          suggestions.push(
            ...getTableSuggestions(
              context.selectedDatabase,
              dbStructure,
              range,
              false,
              new Set(),
              false,
            ),
          );
        }
      }
      break;
    }

    case "FORMAT": {
      // Show ClickHouse output formats
      const tracker = getUsageTracker();
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
      suggestions.push(
        ...formats.map((format) => ({
          label: format,
          kind: monaco.languages.CompletionItemKind.EnumMember,
          insertText: format,
          detail: "Output format",
          sortText: tracker.getSortText(`keyword:${format}`, "keyword"),
          range,
        })),
      );
      break;
    }

    case "CREATE":
    case "ALTER":
    case "DROP": {
      // Show DDL object keywords (TABLE, VIEW, DATABASE, etc.)
      suggestions.push(
        ...DDL_OBJECTS.map((obj) => ({
          label: obj,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: obj,
          detail: "DDL object type",
          range,
        })),
      );
      // Also show databases for fully qualified names
      suggestions.push(...getDatabaseSuggestions(dbStructure, range));
      break;
    }

    case "ENGINE": {
      // Show ClickHouse table engines
      const allEngines = getAllEngines();
      suggestions.push(
        ...allEngines.map((engine) => ({
          label: engine,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: engine,
          detail: "Table engine",
          range,
        })),
      );
      break;
    }

    case "TO": {
      // For CREATE MATERIALIZED VIEW ... TO - show target tables
      if (context.isAfterDot && context.databasePrefix) {
        suggestions.push(
          ...getTableSuggestions(
            context.databasePrefix,
            dbStructure,
            range,
            true,
            new Set(),
            false,
          ),
        );
      } else {
        suggestions.push(...getDatabaseSuggestions(dbStructure, range));
        if (context.selectedDatabase) {
          suggestions.push(
            ...getTableSuggestions(
              context.selectedDatabase,
              dbStructure,
              range,
              false,
              new Set(),
              false,
            ),
          );
        }
      }
      break;
    }

    default: {
      // For unknown contexts, show everything with db prefix (no aliases)
      suggestions.push(...getDatabaseSuggestions(dbStructure, range));

      if (context.selectedDatabase) {
        suggestions.push(
          ...getTableSuggestions(
            context.selectedDatabase,
            dbStructure,
            range,
            false,
            new Set(),
            false,
          ),
        );
      }
      break;
    }
  }

  return suggestions;
}

// Initialize Monaco editor with ClickHouse SQL language features
export const initializeMonacoGlobally = async () => {
  if (isInitialized) return;

  ensureMonacoEnvironment();

  // Register custom Monaco themes (dracula, nord, tokyo-night, etc.)
  registerMonacoThemes();

  // Register the SQL language
  monaco.languages.register({ id: "sql" });

  // Set language configuration for SQL
  monaco.languages.setLanguageConfiguration("sql", {
    brackets: [
      ["(", ")"],
      ["[", "]"],
    ],
    autoClosingPairs: [
      { open: "(", close: ")" },
      { open: "[", close: "]" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  });

  // Set monarch tokens provider for SQL syntax highlighting
  monaco.languages.setMonarchTokensProvider("sql", {
    keywords: [
      // DQL
      "SELECT",
      "FROM",
      "WHERE",
      "LIMIT",
      "OFFSET",
      "AS",
      "ALIAS",
      "DISTINCT",
      "ALL",
      "TOP",
      // DML
      "INSERT",
      "UPDATE",
      "DELETE",
      "UPSERT",
      // DDL
      "CREATE",
      "ALTER",
      "DROP",
      "TRUNCATE",
      "RENAME",
      "ATTACH",
      "DETACH",
      "OPTIMIZE",
      "ADD",
      "COLUMN",
      "TABLE",
      "DATABASE",
      "VIEW",
      "INDEX",
      "DICTIONARY",
      "FUNCTION",
      "USER",
      "ROLE",
      "QUOTA",
      "TRIGGER",
      "PROCEDURE",
      "PROJECTION",
      "TYPE",
      // Joins
      "JOIN",
      "INNER",
      "LEFT",
      "RIGHT",
      "FULL",
      "CROSS",
      "OUTER",
      "NATURAL",
      "USING",
      "ON",
      // Clauses
      "GROUP",
      "BY",
      "ORDER",
      "HAVING",
      "PARTITION",
      "CLUSTER",
      "ENGINE",
      "TTL",
      "SETTINGS",
      "FORMAT",
      "INTO",
      "VALUES",
      "SET",
      "FINAL",
      "SAMPLE",
      "PREWHERE",
      "TO",
      "CODEC",
      "GRANULARITY",
      // Window functions
      "OVER",
      "ROWS",
      "RANGE",
      "PRECEDING",
      "FOLLOWING",
      "UNBOUNDED",
      "CURRENT",
      "ROW",
      // Logical
      "AND",
      "OR",
      "NOT",
      "IN",
      "LIKE",
      "ILIKE",
      "BETWEEN",
      "EXISTS",
      "ANY",
      "ALL",
      "CASE",
      "WHEN",
      "THEN",
      "ELSE",
      "END",
      "NULL",
      "TRUE",
      "FALSE",
      // ClickHouse-specific
      "SYNC",
      "ASYNC",
      "FINAL",
      "DEDUPLICATE",
      "POPULATE",
      "LIVE",
      "WINDOW",
      "MATERIALIZED",
      "TEMPORARY",
      "REPLACE",
      "GLOBAL",
      "LOCAL",
      "TOTALS",
      "ROLLUP",
      "CUBE",
      "WITH",
      "RECURSIVE",
      "ARRAY",
      "TUPLE",
      "MAP",
      // Compression codecs
      "NONE",
      "LZ4",
      "LZ4HC",
      "ZSTD",
      "Delta",
      "DoubleDelta",
      "Gorilla",
      "T64",
      "FPC",
      // Mutation
      "KILL",
      "MUTATION",
      "QUERY",
      "SYSTEM",
      "RELOAD",
      "FLUSH",
      "STOP",
      "START",
    ],
    typeKeywords: [
      // Integer
      "UInt8",
      "UInt16",
      "UInt32",
      "UInt64",
      "UInt128",
      "UInt256",
      "Int8",
      "Int16",
      "Int32",
      "Int64",
      "Int128",
      "Int256",
      // Float/Decimal
      "Float32",
      "Float64",
      "Decimal",
      "Decimal32",
      "Decimal64",
      "Decimal128",
      "Decimal256",
      // String
      "String",
      "FixedString",
      // Date/Time
      "Date",
      "Date32",
      "DateTime",
      "DateTime64",
      // Special
      "UUID",
      "IPv4",
      "IPv6",
      "Bool",
      "Boolean",
      // Wrappers
      "Nullable",
      "LowCardinality",
      "Array",
      "Tuple",
      "Map",
      "Nested",
      "Enum",
      "Enum8",
      "Enum16",
      "AggregateFunction",
      "SimpleAggregateFunction",
      // Index types
      "set",
      "minmax",
      "bloom_filter",
      "ngrambf_v1",
      "tokenbf_v1",
    ],
    builtinFunctions: [
      // String functions
      "concat",
      "concatAssumeInjective",
      "substring",
      "substringUTF8",
      "lower",
      "upper",
      "lowerUTF8",
      "upperUTF8",
      "reverse",
      "reverseUTF8",
      "format",
      "trim",
      "trimLeft",
      "trimRight",
      "replace",
      "replaceAll",
      "replaceOne",
      "replaceRegexpAll",
      "replaceRegexpOne",
      "length",
      "lengthUTF8",
      "empty",
      "notEmpty",
      "startsWith",
      "endsWith",
      "match",
      "extract",
      "toString",
      "toStringCutToZero",
      "CAST",
      "accurateCast",
      "accurateCastOrNull",
      "toInt8",
      "toInt16",
      "toInt32",
      "toInt64",
      "toUInt8",
      "toUInt16",
      "toUInt32",
      "toUInt64",
      "toFloat32",
      "toFloat64",
      "toDecimal32",
      "toDecimal64",
      "toDecimal128",
      "toDecimal256",
      // Date functions
      "now",
      "today",
      "yesterday",
      "toDate",
      "toDateTime",
      "toDateTime64",
      "toYear",
      "toQuarter",
      "toMonth",
      "toDayOfYear",
      "toDayOfMonth",
      "toDayOfWeek",
      "toHour",
      "toMinute",
      "toSecond",
      "toYYYYMM",
      "toYYYYMMDD",
      "toYYYYMMDDhhmmss",
      "formatDateTime",
      "dateDiff",
      "dateAdd",
      "dateSub",
      "addYears",
      "addMonths",
      "addWeeks",
      "addDays",
      "addHours",
      "addMinutes",
      "addSeconds",
      "subtractYears",
      "subtractMonths",
      "subtractWeeks",
      "subtractDays",
      "subtractHours",
      "subtractMinutes",
      "subtractSeconds",
      // Array functions
      "array",
      "arrayElement",
      "has",
      "hasAll",
      "hasAny",
      "indexOf",
      "arrayCount",
      "countEqual",
      "arrayEnumerate",
      "arrayEnumerateUniq",
      "arrayPopBack",
      "arrayPopFront",
      "arrayPushBack",
      "arrayPushFront",
      "arrayResize",
      "arraySlice",
      "arraySort",
      "arrayReverseSort",
      "arrayUniq",
      "arrayJoin",
      "arrayDifference",
      "arrayDistinct",
      "arrayIntersect",
      "arrayReduce",
      "arrayMap",
      "arrayFilter",
      "arrayFill",
      "arraySplit",
      "arrayReverseFill",
      "arrayReverseSplit",
      "arrayZip",
      "arrayConcat",
      "arrayStringConcat",
      // Null handling
      "isNull",
      "isNotNull",
      "coalesce",
      "ifNull",
      "nullIf",
      "assumeNotNull",
      "toNullable",
      // Aggregate functions
      "count",
      "sum",
      "avg",
      "min",
      "max",
      "any",
      "stddevPop",
      "stddevSamp",
      "varPop",
      "varSamp",
      "groupArray",
      "groupUniqArray",
      "groupArrayInsertAt",
      "groupArrayMovingAvg",
      "groupArrayMovingSum",
      "groupBitAnd",
      "groupBitOr",
      "groupBitXor",
      "groupBitmap",
      "uniq",
      "uniqExact",
      "uniqCombined",
      "uniqHLL12",
      "quantile",
      "quantiles",
      "quantileExact",
      "quantileExactWeighted",
      "quantileTiming",
      "quantileTDigest",
      "quantileDeterministic",
      // Conditional
      "if",
      "multiIf",
      // Math functions
      "abs",
      "negate",
      "round",
      "roundToExp2",
      "floor",
      "ceil",
      "trunc",
      "exp",
      "log",
      "ln",
      "log2",
      "log10",
      "sqrt",
      "cbrt",
      "pow",
      "power",
      "sin",
      "cos",
      "tan",
      "asin",
      "acos",
      "atan",
      // Hash functions
      "halfMD5",
      "MD5",
      "sipHash64",
      "sipHash128",
      "cityHash64",
      "xxHash32",
      "xxHash64",
      // Type info
      "toTypeName",
      "toColumnTypeName",
      // Other common functions
      "tuple",
      "tupleElement",
      "JSONExtract",
      "JSONExtractString",
      "JSONExtractInt",
      "JSONExtractFloat",
      "JSONExtractBool",
      "position",
      "splitByChar",
      "splitByString",
      "base64Encode",
      "base64Decode",
      "tryBase64Decode",
    ],
    operators: [
      "=",
      ">",
      "<",
      "<=",
      ">=",
      "<>",
      "!=",
      "AND",
      "OR",
      "NOT",
      "LIKE",
      "IN",
      "BETWEEN",
    ],
    tokenizer: {
      root: [
        // Multi-word keywords (must come first)
        [/\b(GROUP|ORDER|PARTITION|PRIMARY|SAMPLE)\s+BY\b/i, "keyword"],
        [/\b(IF)\s+(NOT\s+)?EXISTS\b/i, "keyword"],
        [/\b(ON)\s+CLUSTER\b/i, "keyword"],
        [/\b(INNER|LEFT|RIGHT|FULL|CROSS|OUTER|NATURAL)\s+JOIN\b/i, "keyword"],
        [/\b(LEFT|RIGHT)\s+ARRAY\s+JOIN\b/i, "keyword"],
        [/\b(ARRAY)\s+JOIN\b/i, "keyword"],
        [/\b(GLOBAL)\s+(NOT\s+)?IN\b/i, "keyword"],
        [/\b(INSERT)\s+INTO\b/i, "keyword"],
        [/\b(UNION)\s+ALL\b/i, "keyword"],
        [/\b(WITH)\s+(TOTALS|ROLLUP|CUBE)\b/i, "keyword"],
        [/\b(MATERIALIZED|LIVE|WINDOW)\s+VIEW\b/i, "keyword"],
        [
          /\b(CREATE|DROP|ALTER|TRUNCATE|RENAME|OPTIMIZE)\s+(TABLE|DATABASE|VIEW|DICTIONARY)\b/i,
          "keyword",
        ],
        [/\b(SETTINGS)\s+PROFILE\b/i, "keyword"],
        [/\b(ROW)\s+POLICY\b/i, "keyword"],

        // Comments (before identifiers to avoid conflict)
        [/--.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],

        // Single-word tokens
        [
          /[a-zA-Z_]\w*/,
          {
            cases: {
              "@typeKeywords": "type.identifier",
              "@keywords": "keyword",
              "@builtinFunctions": "predefined",
              "@operators": "operator",
              "@default": "identifier",
            },
          },
        ],

        // Operators and numbers
        [/[<>!=]=?|<>/, "operator"],
        [/[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?/, "number"],

        // Strings
        [/"/, { token: "string.quote", bracket: "@open", next: "@string" }],
        [/'/, { token: "string.quote", bracket: "@open", next: "@string2" }],

        // Backtick identifiers
        [
          /`/,
          {
            token: "identifier.quote",
            bracket: "@open",
            next: "@quotedIdentifier",
          },
        ],
      ],
      string: [
        [/[^"]+/, "string"],
        [/""/, "string.escape"],
        [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }],
      ],
      string2: [
        [/[^']+/, "string"],
        [/''/, "string.escape"],
        [/'/, { token: "string.quote", bracket: "@close", next: "@pop" }],
      ],
      quotedIdentifier: [
        [/[^`]+/, "identifier"],
        [/``/, "identifier.escape"],
        [/`/, { token: "identifier.quote", bracket: "@close", next: "@pop" }],
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"],
      ],
    },
  });

  // Register completion item provider for SQL
  monaco.languages.registerCompletionItemProvider("sql", {
    provideCompletionItems: async (model, position, context, token) => {
      try {
        // Early exit if cancelled
        if (token.isCancellationRequested) {
          return { suggestions: [] };
        }

        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        // Get selected database from app store
        const selectedDatabase = useAppStore.getState().selectedDatabase;

        // Parse SQL context using the new context-aware parser
        const cursorOffset = model.getOffsetAt(position);
        const sqlContext = parseSQLContext(
          model.getValue(),
          cursorOffset,
          selectedDatabase,
        );

        // Fetch database structure, functions, and keywords
        const dbStructure = await getDatabasesTablesAndColumns();
        const clickHouseFunctionsArray = await getFunctions();
        const clickHouseKeywordsArray = await getKeywords();

        // Check cancellation after async calls
        if (token.isCancellationRequested) {
          return { suggestions: [] };
        }

        // Get context-aware suggestions
        const contextSuggestions = getSuggestionsForContext(
          sqlContext,
          dbStructure,
          range,
          clickHouseKeywordsArray,
          clickHouseFunctionsArray,
          model,
        );

        // Add SQL keyword suggestions
        const tracker = getUsageTracker();
        const keywordSuggestions = clickHouseKeywordsArray.map((keyword) => ({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: keyword,
          sortText: tracker.getSortText(`keyword:${keyword}`, "keyword"),
          range: range,
        }));

        // Combine all suggestions
        const allSuggestions = [...contextSuggestions, ...keywordSuggestions];

        // Remove duplicates based on label
        const uniqueSuggestions = Array.from(
          new Map(allSuggestions.map((s) => [s.label, s])).values(),
        );

        // Record pending suggestions for usage tracking
        const suggestionData = uniqueSuggestions.map((s) => {
          // Determine category from kind
          let category: SuggestionCategory = "keyword";
          switch (s.kind) {
            case monaco.languages.CompletionItemKind.Field:
              category = "column";
              break;
            case monaco.languages.CompletionItemKind.Struct:
              category = "table";
              break;
            case monaco.languages.CompletionItemKind.Module:
              category = "database";
              break;
            case monaco.languages.CompletionItemKind.Function:
              category = "function";
              break;
            case monaco.languages.CompletionItemKind.Operator:
              category = "operator";
              break;
            default:
              category = "keyword";
          }

          return {
            label: typeof s.label === "string" ? s.label : s.label.label,
            category,
          };
        });

        tracker.recordPendingSuggestions(suggestionData, range);

        return {
          suggestions: uniqueSuggestions,
        };
      } catch (error) {
        // Silently return empty on disposal/cancellation
        console.error("Monaco completion error:", error);
        return { suggestions: [] };
      }
    },
  });

  // Use sql formatter for formatting SQL code using import { format } from "sql-formatter";
  monaco.languages.registerDocumentFormattingEditProvider("sql", {
    provideDocumentFormattingEdits: (model) => {
      const formatted = format(model.getValue(), { language: "sql" });
      return [
        {
          range: model.getFullModelRange(),
          text: formatted,
        },
      ];
    },
  });

  isInitialized = true;
};

// Font family mappings
const FONT_FAMILY_MAP: Record<string, string> = {
  system: "monospace",
  "jetbrains-mono": "'JetBrains Mono', monospace",
  "fira-code": "'Fira Code', monospace",
  "cascadia-code": "'Cascadia Code', monospace",
  "source-code-pro": "'Source Code Pro', monospace",
  monaco: "'Monaco', monospace",
  consolas: "'Consolas', monospace",
  "ibm-plex-mono": "'IBM Plex Mono', monospace",
};

// Create a Monaco Editor instance
export const createMonacoEditor = (
  container: HTMLElement,
  theme: string,
  fontSize: number = 14,
  fontFamily: string = "system",
): monaco.editor.IStandaloneCodeEditor => {
  const fontFamilyValue =
    FONT_FAMILY_MAP[fontFamily] || FONT_FAMILY_MAP["system"];

  const editor = monaco.editor.create(container, {
    language: "sql",
    theme: theme || "vs-dark",
    automaticLayout: true,
    tabSize: 2,
    folding: true,
    minimap: { enabled: true },
    padding: { top: 10 },
    suggestOnTriggerCharacters: true,
    quickSuggestions: true,
    wordBasedSuggestions: "off",
    fontSize: fontSize,
    fontFamily: fontFamilyValue,
    fontLigatures: true,
  });

  return editor;
};
