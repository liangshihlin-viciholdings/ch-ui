import type {
  BuilderChartConfig,
  ChartConfig,
  AggregateFunction,
  DashboardFilter,
} from "@/features/analytics/types";
import {
  interpolateQuery,
  hasTemplateVariables,
} from "@/features/analytics/utils/queryInterpolation";

export function resolveGranularity(
  granularity: string | "auto",
  dateRange: [Date, Date]
): string {
  if (granularity !== "auto") return granularity;
  const diffSeconds =
    (dateRange[1].getTime() - dateRange[0].getTime()) / 1000;
  if (diffSeconds <= 3600) return "1 minute";
  if (diffSeconds <= 86400) return "5 minute";
  if (diffSeconds <= 604800) return "1 hour";
  if (diffSeconds <= 2592000) return "1 day";
  return "1 day";
}

function aggFnToSql(
  fn: AggregateFunction,
  expr: string,
  condition?: string
): string {
  const cond = condition ? `If(${condition})` : "";
  switch (fn) {
    case "count":
      return `count${cond}()`;
    case "sum":
      return `sum${cond}(${expr})`;
    case "avg":
      return `avg${cond}(${expr})`;
    case "min":
      return `min${cond}(${expr})`;
    case "max":
      return `max${cond}(${expr})`;
    case "p50":
      return `quantile${cond}(0.5)(${expr})`;
    case "p90":
      return `quantile${cond}(0.9)(${expr})`;
    case "p95":
      return `quantile${cond}(0.95)(${expr})`;
    case "p99":
      return `quantile${cond}(0.99)(${expr})`;
    case "count_distinct":
      return `uniq${cond}(${expr})`;
    case "any":
      return `any${cond}(${expr})`;
    default:
      return "count()";
  }
}

function filterToSqlClause(filter: DashboardFilter): string {
  const field = filter.field;
  const value = filter.value;
  switch (filter.operator) {
    case "=":
      return `${field} = '${value.replace(/'/g, "''")}'`;
    case "!=":
      return `${field} != '${value.replace(/'/g, "''")}'`;
    case ">":
      return `${field} > ${Number(value)}`;
    case "<":
      return `${field} < ${Number(value)}`;
    case "contains":
      return `positionCaseInsensitive(${field}, '${value.replace(/'/g, "''")}') > 0`;
    default:
      return "1=1";
  }
}

function generateBuilderSql(
  config: BuilderChartConfig,
  dateRange: [Date, Date],
  tableName: string,
  timestampColumn: string,
  filters: DashboardFilter[]
): string {
  const [start, end] = dateRange;
  const granularity = resolveGranularity(config.granularity, dateRange);

  const selectClauses = config.select.map((s) =>
    aggFnToSql(s.aggFn, s.valueExpression || "*", s.aggCondition)
  );

  const timeBucket = `toStartOfInterval(${timestampColumn}, INTERVAL ${granularity}) AS time_bucket`;

  const select = [
    timeBucket,
    ...selectClauses,
    ...(config.groupBy.length ? [config.groupBy.join(", ")] : []),
  ].join(",\n  ");

  const whereClauses = [
    `${timestampColumn} >= '${start.toISOString()}'`,
    `${timestampColumn} <= '${end.toISOString()}'`,
    ...(config.where ? [config.where] : []),
    ...filters.map(filterToSqlClause),
  ];
  const where = whereClauses.join("\n  AND ");

  const groupBy = ["time_bucket", ...config.groupBy].join(", ");
  const limit = config.limit ? `LIMIT ${config.limit}` : "";

  return `SELECT\n  ${select}\nFROM ${tableName}\nWHERE ${where}\nGROUP BY ${groupBy}\nORDER BY time_bucket ASC\n${limit}`.trim();
}

export function generateChartSql(
  config: ChartConfig,
  dateRange: [Date, Date],
  tableName: string,
  timestampColumn: string = "timestamp",
  filters: DashboardFilter[] = []
): string {
  if (config.type === "rawsql") {
    return hasTemplateVariables(config.query)
      ? interpolateQuery(config.query, dateRange)
      : config.query;
  }
  return generateBuilderSql(config, dateRange, tableName, timestampColumn, filters);
}

export function resolveTimeRange(preset: string): [Date, Date] {
  const now = new Date();
  const end = now;
  const start = new Date(now);
  switch (preset) {
    case "15m":
      start.setMinutes(start.getMinutes() - 15);
      break;
    case "1h":
      start.setHours(start.getHours() - 1);
      break;
    case "6h":
      start.setHours(start.getHours() - 6);
      break;
    case "1d":
      start.setDate(start.getDate() - 1);
      break;
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      break;
    default:
      start.setHours(start.getHours() - 1);
  }
  return [start, end];
}
