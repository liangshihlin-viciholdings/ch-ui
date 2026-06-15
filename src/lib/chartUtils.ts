import type {
  BuilderChartConfig,
  ChartConfig,
  AggregateFunction,
  DashboardFilter,
} from "@/features/analytics/types";
import type { Engine } from "@/lib/db/schema";
import {
  interpolateQuery,
  hasTemplateVariables,
} from "@/features/analytics/utils/queryInterpolation";

// ─────────────────────────────────────────────────────────────────────────
// Builder-mode SQL generation, dialect-aware.
//
// ClickHouse output is preserved BYTE-FOR-BYTE (engine === "clickhouse" branch)
// so existing dashboards are unaffected. Other engines get standard-SQL
// equivalents. A few constructs have no portable form on every engine
// (percentiles on MySQL/SQLite) — those emit NULL with an inline note rather
// than producing invalid SQL.
// ─────────────────────────────────────────────────────────────────────────

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

const UNIT_SECONDS: Record<string, number> = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
};

/** Parse a granularity like "5 minute" into total seconds (for MySQL/SQLite bucketing). */
function granularitySeconds(granularity: string): number {
  const m = granularity.trim().match(/(\d+)\s*(second|minute|hour|day|week)s?/i);
  if (!m) return 60;
  return parseInt(m[1], 10) * (UNIT_SECONDS[m[2].toLowerCase()] ?? 60);
}

/** Engines that support the SQL-standard `agg(...) FILTER (WHERE ...)` clause. */
const FILTER_ENGINES: Engine[] = ["postgres", "duckdb", "sqlite"];

function timeBucketExpr(
  engine: Engine,
  col: string,
  granularity: string
): string {
  switch (engine) {
    case "clickhouse":
      return `toStartOfInterval(${col}, INTERVAL ${granularity})`;
    case "postgres":
      // date_bin handles arbitrary intervals (PostgreSQL 14+).
      return `date_bin(INTERVAL '${granularity}', ${col}, TIMESTAMP '1970-01-01')`;
    case "duckdb":
      return `time_bucket(INTERVAL '${granularity}', ${col})`;
    case "mysql": {
      const s = granularitySeconds(granularity);
      return `FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(${col}) / ${s}) * ${s})`;
    }
    case "sqlite": {
      const s = granularitySeconds(granularity);
      return `datetime(CAST(strftime('%s', ${col}) AS INTEGER) / ${s} * ${s}, 'unixepoch')`;
    }
    default:
      return `toStartOfInterval(${col}, INTERVAL ${granularity})`;
  }
}

const QUANTILE_P: Partial<Record<AggregateFunction, number>> = {
  p50: 0.5,
  p90: 0.9,
  p95: 0.95,
  p99: 0.99,
};

function aggFnToSql(
  engine: Engine,
  fn: AggregateFunction,
  expr: string,
  condition?: string
): string {
  // ── ClickHouse: preserve the exact original output. ──
  if (engine === "clickhouse") {
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

  // ── Standard-SQL engines. ──
  const p = QUANTILE_P[fn];
  if (p !== undefined) {
    // Percentiles: ordered-set aggregate on PG/DuckDB; unsupported on MySQL/SQLite.
    if (engine === "postgres" || engine === "duckdb") {
      const base = `percentile_cont(${p}) WITHIN GROUP (ORDER BY ${expr})`;
      return condition ? `${base} FILTER (WHERE ${condition})` : base;
    }
    return `NULL /* p-quantile not supported on ${engine} */`;
  }

  // Base aggregate (no condition).
  let base: string;
  switch (fn) {
    case "count":
      base = "count(*)";
      break;
    case "sum":
      base = `sum(${expr})`;
      break;
    case "avg":
      base = `avg(${expr})`;
      break;
    case "min":
      base = `min(${expr})`;
      break;
    case "max":
      base = `max(${expr})`;
      break;
    case "count_distinct":
      base = `count(distinct ${expr})`;
      break;
    case "any":
      base =
        engine === "duckdb"
          ? `any_value(${expr})`
          : engine === "mysql"
            ? `ANY_VALUE(${expr})`
            : `min(${expr})`; // postgres / sqlite have no ANY aggregate
      break;
    default:
      base = "count(*)";
  }

  if (!condition) return base;

  // Conditional aggregate.
  if (FILTER_ENGINES.includes(engine)) {
    return `${base} FILTER (WHERE ${condition})`;
  }
  // MySQL: rewrite with CASE WHEN.
  switch (fn) {
    case "count":
      return `SUM(CASE WHEN ${condition} THEN 1 ELSE 0 END)`;
    case "count_distinct":
      return `COUNT(DISTINCT CASE WHEN ${condition} THEN ${expr} END)`;
    case "any":
      return `ANY_VALUE(CASE WHEN ${condition} THEN ${expr} END)`;
    default:
      return `${fn.toUpperCase()}(CASE WHEN ${condition} THEN ${expr} END)`;
  }
}

function filterToSqlClause(engine: Engine, filter: DashboardFilter): string {
  const field = filter.field;
  const value = filter.value;
  const esc = value.replace(/'/g, "''");
  switch (filter.operator) {
    case "=":
      return `${field} = '${esc}'`;
    case "!=":
      return `${field} != '${esc}'`;
    case ">":
      return `${field} > ${Number(value)}`;
    case "<":
      return `${field} < ${Number(value)}`;
    case "contains":
      if (engine === "clickhouse")
        return `positionCaseInsensitive(${field}, '${esc}') > 0`;
      if (engine === "postgres" || engine === "duckdb")
        return `${field} ILIKE '%${esc}%'`;
      // mysql / sqlite: case-insensitive LIKE via LOWER().
      return `LOWER(${field}) LIKE LOWER('%${esc}%')`;
    default:
      return "1=1";
  }
}

function generateBuilderSql(
  config: BuilderChartConfig,
  dateRange: [Date, Date],
  tableName: string,
  timestampColumn: string,
  filters: DashboardFilter[],
  engine: Engine
): string {
  const [start, end] = dateRange;
  const granularity = resolveGranularity(config.granularity, dateRange);

  const selectClauses = config.select.map((s) =>
    aggFnToSql(engine, s.aggFn, s.valueExpression || "*", s.aggCondition)
  );

  const timeBucket = `${timeBucketExpr(engine, timestampColumn, granularity)} AS time_bucket`;

  const select = [
    timeBucket,
    ...selectClauses,
    ...(config.groupBy.length ? [config.groupBy.join(", ")] : []),
  ].join(",\n  ");

  const whereClauses = [
    `${timestampColumn} >= '${start.toISOString()}'`,
    `${timestampColumn} <= '${end.toISOString()}'`,
    ...(config.where ? [config.where] : []),
    ...filters.map((f) => filterToSqlClause(engine, f)),
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
  filters: DashboardFilter[] = [],
  engine: Engine = "clickhouse"
): string {
  if (config.type === "rawsql") {
    // Raw SQL is authored by the user; template macros remain ClickHouse-only.
    return hasTemplateVariables(config.query)
      ? interpolateQuery(config.query, dateRange)
      : config.query;
  }
  return generateBuilderSql(
    config,
    dateRange,
    tableName,
    timestampColumn,
    filters,
    engine
  );
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
