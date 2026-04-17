// src/features/analytics/charts/types.ts
// Shared prop types for all chart components. All charts are pure presenters
// — they receive fully-resolved rows and render SVG/DOM.

import type { ChartConfig } from "@/features/analytics/types";

export interface ChartProps {
  /** Rows returned by the ClickHouse query (JSON objects). */
  data: Record<string, unknown>[];
  /** Chart configuration — informs series names & display. */
  config: ChartConfig;
  /** Visible time window. Used by time-based charts for axis domain. */
  dateRange: [Date, Date];
  /** Container height in pixels. Defaults to a sensible chart height. */
  height?: number;
}

/** Palette variables declared in src/index.css (chart-1 … chart-10). */
export const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
  "hsl(var(--chart-7))",
  "hsl(var(--chart-8))",
  "hsl(var(--chart-9))",
  "hsl(var(--chart-10))",
] as const;

export function colorAt(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

/** Detect the time-bucket column produced by generateChartSql. */
export const TIME_BUCKET_KEY = "time_bucket";
