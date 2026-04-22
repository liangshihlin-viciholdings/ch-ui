export type DisplayType =
  | "line"
  | "bar"
  | "area"
  | "stacked_bar"
  | "pie"
  | "histogram"
  | "heatmap"
  | "number"
  | "delta"
  | "table"
  | "markdown";

export type AggregateFunction =
  | "count"
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "p50"
  | "p90"
  | "p95"
  | "p99"
  | "count_distinct"
  | "any";

export interface ChartSelect {
  aggFn: AggregateFunction;
  aggCondition?: string;
  valueExpression: string;
}

export interface BuilderChartConfig {
  type: "builder";
  select: ChartSelect[];
  where: string;
  groupBy: string[];
  displayType: DisplayType;
  granularity: string | "auto";
  fillNulls: boolean;
  limit?: number;
}

export interface RawSqlChartConfig {
  type: "rawsql";
  query: string;
  displayType: DisplayType;
}

export type ChartConfig = BuilderChartConfig | RawSqlChartConfig;

export interface DashboardTile {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config: ChartConfig;
  title: string;
}

export interface DashboardFilter {
  field: string;
  operator: "=" | "!=" | ">" | "<" | "contains";
  value: string;
}

export interface Dashboard {
  id: string;
  name: string;
  tiles: DashboardTile[];
  tags: string[];
  filters: DashboardFilter[];
  templateId?: string; // ID of the template this dashboard was created from
  createdAt: string;
  updatedAt: string;
}

export const AGG_FNS: ReadonlyArray<{ value: AggregateFunction; label: string }> = [
  { value: "count", label: "Count" },
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "min", label: "Minimum" },
  { value: "max", label: "Maximum" },
  { value: "p50", label: "Median (P50)" },
  { value: "p90", label: "P90" },
  { value: "p95", label: "P95" },
  { value: "p99", label: "P99" },
  { value: "count_distinct", label: "Count Distinct" },
  { value: "any", label: "Any" },
] as const;

export const DISPLAY_TYPES: ReadonlyArray<{ value: DisplayType; label: string }> = [
  { value: "line", label: "Line" },
  { value: "bar", label: "Bar" },
  { value: "area", label: "Area" },
  { value: "stacked_bar", label: "Stacked Bar" },
  { value: "pie", label: "Pie" },
  { value: "histogram", label: "Histogram" },
  { value: "heatmap", label: "Heatmap" },
  { value: "number", label: "Number" },
  { value: "delta", label: "Delta" },
  { value: "table", label: "Table" },
  { value: "markdown", label: "Markdown" },
] as const;

export type TimeRangePreset =
  | "15m"
  | "1h"
  | "6h"
  | "1d"
  | "7d"
  | "30d"
  | "custom";

export interface TimeRange {
  preset: TimeRangePreset;
  start: Date;
  end: Date;
}
