// src/features/alerts/components/AlertPreview.tsx
// Preview chart for an alert — runs the builder config against the last
// hour and overlays the threshold as a horizontal reference line.
//
// STUB: there is no server-side alert evaluator. This preview is the only
// indication of whether the alert would fire, and it's computed client-side
// from the most recent bucket value.

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2 } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import { colorAt, TIME_BUCKET_KEY } from "@/features/analytics/charts/types";
import { useChartData } from "@/features/analytics/hooks/useChartData";
import type {
  AlertConfig,
  ThresholdOperator,
} from "@/features/alerts/types";

export interface AlertPreviewProps {
  config: AlertConfig;
  tableName: string;
  thresholdValue: number;
  thresholdOperator: ThresholdOperator;
  connectionId?: string | null;
  /** Time range end-exclusive. Defaults to the last hour. */
  dateRange?: [Date, Date];
  height?: number;
}

function defaultRange(): [Date, Date] {
  const end = new Date();
  const start = new Date(end.getTime() - 60 * 60 * 1000);
  return [start, end];
}

function parseTimestamp(raw: unknown): number {
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const normalized = raw.includes("T") ? raw : raw.replace(" ", "T") + "Z";
    const ts = Date.parse(normalized);
    return Number.isNaN(ts) ? 0 : ts;
  }
  return 0;
}

function checkThreshold(
  value: number,
  op: ThresholdOperator,
  threshold: number,
): boolean {
  switch (op) {
    case ">":
      return value > threshold;
    case "<":
      return value < threshold;
    case ">=":
      return value >= threshold;
    case "<=":
      return value <= threshold;
    case "==":
      return value === threshold;
    case "!=":
      return value !== threshold;
    default:
      return false;
  }
}

export function AlertPreview({
  config,
  tableName,
  thresholdValue,
  thresholdOperator,
  connectionId,
  dateRange,
  height = 220,
}: AlertPreviewProps) {
  const resolvedRange = useMemo(() => dateRange ?? defaultRange(), [dateRange]);

  const { data, isFetching, error } = useChartData({
    config,
    tableName,
    dateRange: resolvedRange,
    connectionId,
    enabled: !!tableName,
  });

  const { chartData, seriesKeys } = useMemo(() => {
    const rows = data?.rows ?? [];
    if (!rows.length) return { chartData: [], seriesKeys: [] as string[] };
    const firstRow = rows[0];
    const keys = Object.keys(firstRow).filter((k) => k !== TIME_BUCKET_KEY);
    const chartData = rows.map((row) => {
      const mapped: Record<string, unknown> = {
        ts: parseTimestamp(row[TIME_BUCKET_KEY]),
      };
      for (const k of keys) mapped[k] = row[k];
      return mapped;
    });
    return { chartData, seriesKeys: keys };
  }, [data]);

  const lastValue = useMemo(() => {
    if (!chartData.length || !seriesKeys.length) return null;
    const v = chartData[chartData.length - 1][seriesKeys[0]];
    return typeof v === "number" ? v : Number(v);
  }, [chartData, seriesKeys]);

  const wouldFire =
    lastValue != null &&
    Number.isFinite(lastValue) &&
    checkThreshold(lastValue, thresholdOperator, thresholdValue);

  if (!tableName) {
    return (
      <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
        Pick a source table to preview this alert.
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 font-mono text-xs text-destructive">
        {error.message}
      </div>
    );
  }

  if (isFetching && !chartData.length) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
        No data in the preview window.
      </div>
    );
  }

  const useArea = config.displayType === "area";
  const ChartRoot = useArea ? AreaChart : LineChart;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          Latest:{" "}
          <span className="font-mono text-foreground">
            {lastValue != null ? formatNumber(lastValue) : "—"}
          </span>
        </span>
        <span
          className={`font-medium ${
            wouldFire ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {wouldFire ? "Would fire" : "Below threshold"}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ChartRoot data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v: number) => new Date(v).toLocaleTimeString()}
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: "hsl(var(--muted-foreground))" }}
            fontSize={10}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: "hsl(var(--muted-foreground))" }}
            fontSize={10}
            tickFormatter={(v: number) => formatNumber(v)}
          />
          <Tooltip
            labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine
            y={thresholdValue}
            stroke="var(--destructive)"
            strokeDasharray="4 4"
            label={{
              value: `${thresholdOperator} ${thresholdValue}`,
              fill: "var(--destructive)",
              fontSize: 10,
              position: "right",
            }}
          />
          {seriesKeys.map((key, idx) =>
            useArea ? (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colorAt(idx)}
                fill={colorAt(idx)}
                fillOpacity={0.2}
              />
            ) : (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colorAt(idx)}
                dot={false}
                strokeWidth={2}
              />
            ),
          )}
        </ChartRoot>
      </ResponsiveContainer>
    </div>
  );
}

export default AlertPreview;
