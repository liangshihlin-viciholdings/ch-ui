// src/features/analytics/charts/index.ts
// Central chart registry. Consumers import `renderChart` rather than each
// chart component individually so adding a new display type only requires
// editing this one file.

import type { ChartConfig, DisplayType } from "@/features/analytics/types";
import { TimeSeriesChart } from "./TimeSeriesChart";
import { PieChart } from "./PieChart";
import { HistogramChart } from "./HistogramChart";
import { HeatmapChart } from "./HeatmapChart";
import { BarChart } from "./BarChart";
import { NumberCard } from "./NumberCard";
import { DeltaCard } from "./DeltaCard";
import { TableChart } from "./TableChart";
import type { ChartProps } from "./types";

export type { ChartProps } from "./types";
export {
  TimeSeriesChart,
  PieChart,
  HistogramChart,
  HeatmapChart,
  BarChart,
  NumberCard,
  DeltaCard,
  TableChart,
};

const REGISTRY: Record<DisplayType, (props: ChartProps) => React.ReactNode> = {
  line: TimeSeriesChart,
  bar: TimeSeriesChart,
  area: TimeSeriesChart,
  stacked_bar: TimeSeriesChart,
  pie: PieChart,
  histogram: HistogramChart,
  heatmap: HeatmapChart,
  number: NumberCard,
  delta: DeltaCard,
  table: TableChart,
  // `markdown` is intentionally unsupported here — dashboards render it in
  // ChartContainer directly, not via the chart pipeline.
  markdown: () => null,
};

export function getChartComponent(config: ChartConfig) {
  return REGISTRY[config.displayType] ?? TimeSeriesChart;
}
