// src/features/search/hooks/useSearchData.ts
// Runs the logs/traces search SQL against the workspace connection.
//
// The SQL is generated inline (rather than reusing chartUtils.ts) because
// search results are flat row dumps — no time bucketing, no aggregation.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { runQuery } from "@/lib/queryRunner";
import type { QueryResult } from "@/types/common";
import type {
  SearchFilter,
  SearchQueryInput,
  SearchOperator,
} from "@/features/search/types";
import {
  DEFAULT_LOG_COLUMNS,
  DEFAULT_TIMESTAMP_COLUMN,
} from "@/features/search/types";

function escape(value: string): string {
  return value.replace(/'/g, "''");
}

// Parse a fragment like `level:error` into a filter. Anything that isn't
// `field:value` is returned as a free-text body search.
//
// STUB: we deliberately do NOT implement full Lucene. Supported forms:
//   - `level:error` → equality filter
//   - `count:>5`    → numeric comparison when value starts with > < >= <=
//   - bare words    → OR'd into a `positionCaseInsensitive(Body, …)` match
function parseQueryFragment(
  fragment: string,
): { filter?: SearchFilter; text?: string } {
  const colon = fragment.indexOf(":");
  if (colon <= 0) return { text: fragment };

  const field = fragment.slice(0, colon);
  const rest = fragment.slice(colon + 1);
  const match = rest.match(/^(>=|<=|>|<|!=)?(.*)$/);
  const operator = (match?.[1] as SearchOperator | undefined) ?? "=";
  const value = match?.[2] ?? "";
  if (!value) return { text: fragment };
  return { filter: { field, operator, value } };
}

export function parseSearchQuery(raw: string): {
  filters: SearchFilter[];
  textTerms: string[];
} {
  const filters: SearchFilter[] = [];
  const textTerms: string[] = [];
  // Split on `AND` (case-insensitive) and whitespace. This is the cheapest
  // viable parser — it handles `service:foo AND level:error bar` without
  // dragging in a real grammar.
  const chunks = raw
    .split(/\s+AND\s+|\s+/i)
    .map((c) => c.trim())
    .filter(Boolean);
  for (const chunk of chunks) {
    const parsed = parseQueryFragment(chunk);
    if (parsed.filter) filters.push(parsed.filter);
    else if (parsed.text) textTerms.push(parsed.text);
  }
  return { filters, textTerms };
}

function filterToSql(filter: SearchFilter): string {
  const field = filter.field;
  const raw = filter.value;
  switch (filter.operator) {
    case "=":
      return `${field} = '${escape(raw)}'`;
    case "!=":
      return `${field} != '${escape(raw)}'`;
    case ">":
      return `${field} > ${Number(raw)}`;
    case "<":
      return `${field} < ${Number(raw)}`;
    case ">=":
      return `${field} >= ${Number(raw)}`;
    case "<=":
      return `${field} <= ${Number(raw)}`;
    case "contains":
      return `positionCaseInsensitive(toString(${field}), '${escape(raw)}') > 0`;
    case "exists":
      return `${field} IS NOT NULL`;
    default:
      return "1=1";
  }
}

export function generateSearchSql(input: SearchQueryInput): string {
  const {
    query,
    filters,
    tableName,
    dateRange,
    limit = 500,
    timestampColumn = DEFAULT_TIMESTAMP_COLUMN,
  } = input;
  const [start, end] = dateRange;
  const parsed = parseSearchQuery(query);
  const allFilters = [...filters, ...parsed.filters];

  const where: string[] = [
    `${timestampColumn} >= toDateTime64('${start.toISOString().replace("T", " ").replace("Z", "")}', 3)`,
    `${timestampColumn} <= toDateTime64('${end.toISOString().replace("T", " ").replace("Z", "")}', 3)`,
  ];
  for (const f of allFilters) where.push(filterToSql(f));
  for (const term of parsed.textTerms) {
    where.push(`positionCaseInsensitive(toString(Body), '${escape(term)}') > 0`);
  }

  const columns = DEFAULT_LOG_COLUMNS.join(", ");
  return (
    `SELECT ${columns}\n` +
    `FROM ${tableName}\n` +
    `WHERE ${where.join("\n  AND ")}\n` +
    `ORDER BY ${timestampColumn} DESC\n` +
    `LIMIT ${limit}`
  );
}

export interface UseSearchDataOptions extends SearchQueryInput {
  enabled?: boolean;
}

export interface SearchDataResult {
  result: QueryResult;
  sql: string;
}

export function useSearchData(
  options: UseSearchDataOptions,
): UseQueryResult<SearchDataResult, Error> {
  const { enabled = true, ...input } = options;
  const sql = generateSearchSql(input);
  return useQuery({
    queryKey: ["search-data", sql, input.connectionId ?? "legacy"],
    queryFn: async (): Promise<SearchDataResult> => {
      const result = await runQuery(sql, input.connectionId ?? undefined);
      return { result, sql };
    },
    enabled: enabled && !!input.tableName,
    staleTime: 10_000,
  });
}
