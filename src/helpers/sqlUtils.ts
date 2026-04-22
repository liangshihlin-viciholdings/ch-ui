import type { ExplainType } from "@/types/common";

export const isCreateOrInsert = (query: string) => {
  // Remove lines that start with '--'
  const cleanedQuery = query
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
  const lowerQuery = cleanedQuery.toLowerCase();
  const createTableRegex = /\bcreate\s+table\b/;
  const insertRegex = /\binsert\b/;
  const deleteRegex = /\bdelete\b/;
  const alterRegex = /\balter\b/;
  const dropTableRegex = /\bdrop\s+table\b/;
  const dropColumnRegex = /\bdrop\s+column\b/;
  const dropIndexRegex = /\bdrop\s+index\b/;
  const dropDictionaryRegex = /\bdrop\s+dictionary\b/;
  const createDatabase = /\bcreate\s+database\b/;
  const dropDatabase = /\bdrop\s+database\b/;
  const createTableAs = /\bcreate\s+table\s+as\b/;
  const createTableEngine = /\bcreate\s+table\s+engine\b/;
  const createTableIfNotExists = /\bcreate\s+table\s+if\s+not\s+exists\b/;
  const createTableLike = /\bcreate\s+table\s+like\b/;
  const createTableMaterialized = /\bcreate\s+table\s+materialized\b/;
  const createTableTemporary = /\bcreate\s+table\s+temporary\b/;
  const createTableTemporaryEngine = /\bcreate\s+table\s+temporary\s+engine\b/;
  const createTableTemporaryIfNotExists = /\bcreate\s+table\s+temporary\s+if\s+not\s+exists\b/;
  const createTableTemporaryLike = /\bcreate\s+table\s+temporary\s+like\b/;
  const createTableTemporaryMaterialized = /\bcreate\s+table\s+temporary\s+materialized\b/;
  const createTableTemporaryAs = /\bcreate\s+table\s+temporary\s+as\b/;
  const createTemporaryTable = /\bcreate\s+temporary\s+table\b/;
  // ClickHouse-specific patterns
  const createTableOnCluster = /\bcreate\s+table\s+on\s+cluster\b/;
  const createTableDistributed = /\bcreate\s+table\s+.*\bengine\s*=\s*Distributed\b/i;
  const createMaterializedView = /\bcreate\s+materialized\s+view\b/;
  const createView = /\bcreate\s+view\b/;
  const createDictionary = /\bcreate\s+dictionary\b/;
  const attachTable = /\battach\s+table\b/;
  const optimizeTable = /\boptimize\s+table\b/;
  const truncateTable = /\btruncate\s+table\b/;
  const renameTable = /\brename\s+table\b/;
  const createUser = /\bcreate\s+user\b/;
  const createRole = /\bcreate\s+role\b/;
  const dropRole = /\bdrop\s+role\b/;
  const grantRole = /\bgrant\s+role\b/;
  const revokeRole = /\brevoke\s+role\b/;
  const dropUser = /\bdrop\s+user\b/;
  const createQuota = /\bcreate\s+quota\b/;
  const dropQuota = /\bdrop\s+quota\b/;
  const alterQuota = /\balter\s+quota\b/;
  const createSetting = /\bcreate\s+setting\b/;
  const dropSetting = /\bdrop\s+setting\b/;
  const alterSetting = /\balter\s+setting\b/;
  const createFunction = /\bcreate\s+function\b/;
  const dropFunction = /\bdrop\s+function\b/;
  const alterFunction = /\balter\s+function\b/;
  const createAggregateFunction = /\bcreate\s+aggregate\s+function\b/;
  const dropAggregateFunction = /\bdrop\s+aggregate\s+function\b/;
  const alterAggregateFunction = /\balter\s+aggregate\s+function\b/;
  const grant = /\bgrant\b/;
  const revoke = /\brevoke\b/;
  const setAllowPattern = /\bset\s+allow_.*$/i;

  return (
    createTableRegex.test(lowerQuery) ||
    insertRegex.test(lowerQuery) ||
    alterRegex.test(lowerQuery) ||
    deleteRegex.test(lowerQuery) ||
    dropTableRegex.test(lowerQuery) ||
    dropColumnRegex.test(lowerQuery) ||
    dropIndexRegex.test(lowerQuery) ||
    dropDictionaryRegex.test(lowerQuery) ||
    createDatabase.test(lowerQuery) ||
    dropDatabase.test(lowerQuery) ||
    createTableAs.test(lowerQuery) ||
    createTableEngine.test(lowerQuery) ||
    createTableIfNotExists.test(lowerQuery) ||
    createTableLike.test(lowerQuery) ||
    createTableMaterialized.test(lowerQuery) ||
    createTableTemporary.test(lowerQuery) ||
    createTemporaryTable.test(lowerQuery) ||
    createTableTemporaryEngine.test(lowerQuery) ||
    createTableTemporaryIfNotExists.test(lowerQuery) ||
    createTableTemporaryLike.test(lowerQuery) ||
    createTableTemporaryMaterialized.test(lowerQuery) ||
    createTableTemporaryAs.test(lowerQuery) ||
    createTableOnCluster.test(lowerQuery) ||
    createTableDistributed.test(lowerQuery) ||
    createMaterializedView.test(lowerQuery) ||
    createView.test(lowerQuery) ||
    createDictionary.test(lowerQuery) ||
    attachTable.test(lowerQuery) ||
    optimizeTable.test(lowerQuery) ||
    truncateTable.test(lowerQuery) ||
    renameTable.test(lowerQuery) ||
    createUser.test(lowerQuery) ||
    createRole.test(lowerQuery) ||
    dropRole.test(lowerQuery) ||
    grantRole.test(lowerQuery) ||
    revokeRole.test(lowerQuery) ||
    dropUser.test(lowerQuery) ||
    createQuota.test(lowerQuery) ||
    dropQuota.test(lowerQuery) ||
    alterQuota.test(lowerQuery) ||
    createSetting.test(lowerQuery) ||
    dropSetting.test(lowerQuery) ||
    alterSetting.test(lowerQuery) ||
    createFunction.test(lowerQuery) ||
    dropFunction.test(lowerQuery) ||
    alterFunction.test(lowerQuery) ||
    createAggregateFunction.test(lowerQuery) ||
    dropAggregateFunction.test(lowerQuery) ||
    alterAggregateFunction.test(lowerQuery) ||
    grant.test(lowerQuery) ||
    revoke.test(lowerQuery) ||
    setAllowPattern.test(lowerQuery)
  );
};

/**
 * Extracts SET param_xxx = 'value' statements from SQL and returns
 * the cleaned query (without those lines) plus a query_params map for
 * the ClickHouse client SDK.
 *
 * ClickHouse supports parameterized queries via {paramName: Type} placeholders.
 * In the HTTP interface each request is a separate session, so SET param_xxx
 * statements in one request don't carry over to the next. This helper extracts
 * them client-side and returns them for use as query_params on the SDK call.
 */
export function extractQueryParams(query: string): {
  cleanedQuery: string;
  queryParams: Record<string, string>;
} {
  const params: Record<string, string> = {};
  const setParamRegex = /^\s*SET\s+param_(\w+)\s*=\s*(.+)$/gim;

  let match;
  while ((match = setParamRegex.exec(query)) !== null) {
    const paramName = match[1];
    let paramValue = match[2].trim().replace(/;\s*$/, '');
    if (
      (paramValue.startsWith("'") && paramValue.endsWith("'")) ||
      (paramValue.startsWith('"') && paramValue.endsWith('"'))
    ) {
      paramValue = paramValue.slice(1, -1);
    }
    params[paramName] = paramValue;
  }

  const cleanedQuery = query
    .split('\n')
    .filter(line => !/^\s*SET\s+param_\w+\s*=/i.test(line))
    .join('\n')
    .trim();

  return { cleanedQuery, queryParams: params };
}

/**
 * Detects if a query is an EXPLAIN query
 */
export function isExplainQuery(query: string): boolean {
  const trimmed = query.trim().toUpperCase();
  return trimmed.startsWith('EXPLAIN');
}

/**
 * Extracts the EXPLAIN type from a query.
 * Multi-word types (TABLE OVERRIDE, QUERY TREE) are checked first
 * to avoid partial matches.
 */
export function getExplainType(query: string): ExplainType | null {
  const trimmed = query.trim().toUpperCase();

  if (!trimmed.startsWith('EXPLAIN')) {
    return null;
  }

  // Multi-word types first to avoid partial matches
  if (/^EXPLAIN\s+TABLE\s+OVERRIDE\b/.test(trimmed)) return 'TABLE OVERRIDE';
  if (/^EXPLAIN\s+QUERY\s+TREE\b/.test(trimmed)) return 'QUERY TREE';

  // Single-word types
  if (/^EXPLAIN\s+PIPELINE\b/.test(trimmed)) return 'PIPELINE';
  if (/^EXPLAIN\s+PLAN\b/.test(trimmed)) return 'PLAN';
  if (/^EXPLAIN\s+AST\b/.test(trimmed)) return 'AST';
  if (/^EXPLAIN\s+SYNTAX\b/.test(trimmed)) return 'SYNTAX';
  if (/^EXPLAIN\s+ESTIMATE\b/.test(trimmed)) return 'ESTIMATE';
  if (/^EXPLAIN\s+INDEXES\b/.test(trimmed)) return 'INDEXES';

  // Default to PLAN if just "EXPLAIN SELECT ..." or "EXPLAIN json=1 ..."
  return 'PLAN';
}

/**
 * Checks if EXPLAIN query requests JSON output
 */
export function isJsonExplain(query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  return /explain\s+(?:\w+\s+)*json\s*=\s*1/i.test(trimmed);
}

/**
 * Extracts placeholder names from a ClickHouse parameterized query.
 * Placeholders use the format {paramName: Type}.
 */
export function extractPlaceholderNames(query: string): string[] {
  const regex = /\{(\w+):\s*\w+\}/g;
  const names: string[] = [];
  let match;
  while ((match = regex.exec(query)) !== null) {
    names.push(match[1].toLowerCase());
  }
  return [...new Set(names)];
}

/**
 * Returns only the SET param_xxx lines from fullDoc that are actually
 * referenced by placeholders in the query.
 */
export function getRelevantSetStatements(
  query: string,
  fullDoc: string
): string[] {
  const placeholders = extractPlaceholderNames(query);
  if (placeholders.length === 0) return [];

  const allSetLines: { name: string; line: string }[] = [];

  for (const line of fullDoc.split('\n')) {
    const match = /^\s*SET\s+param_(\w+)\s*=/i.exec(line);
    if (match) {
      allSetLines.push({ name: match[1].toLowerCase(), line: line.trim() });
    }
  }

  return allSetLines
    .filter(({ name }) => placeholders.includes(name))
    .map(({ line }) => line);
}
