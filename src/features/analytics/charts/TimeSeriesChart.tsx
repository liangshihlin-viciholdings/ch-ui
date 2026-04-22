// src/features/analytics/charts/TimeSeriesChart.tsx
// Line / bar / area / stacked-bar chart keyed on the `time_bucket` column
// produced by generateChartSql. Falls back to category bar chart when no
// time_bucket column is present.

import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  BarChart as ReBarChart,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
  Bar,
  Area,
} from "recharts";
import { formatNumber } from "@/lib/formatters";
import { colorAt, TIME_BUCKET_KEY, type ChartProps } from "./types";

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

function formatTick(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TimeSeriesChart({ data, config, height }: ChartProps) {
  const chartHeight = height ?? 200;
  const { chartData, seriesKeys, hasTimeBucket, categoryKey, valueKey } = useMemo(() => {
    if (!data.length) return { chartData: [], seriesKeys: [] as string[], hasTimeBucket: false, categoryKey: "", valueKey: "" };

    const firstRow = data[0];
    const allKeys = Object.keys(firstRow);
    const hasTimeBucket = TIME_BUCKET_KEY in firstRow;

    if (hasTimeBucket) {
      const keys = allKeys.filter((k) => k !== TIME_BUCKET_KEY);
      const chartData = data.map((row) => {
        const mapped: Record<string, unknown> = {
          ts: parseTimestamp(row[TIME_BUCKET_KEY]),
        };
        for (const key of keys) mapped[key] = row[key];
        return mapped;
      });
      return { chartData, seriesKeys: keys, hasTimeBucket: true, categoryKey: "", valueKey: "" };
    }

    // No time_bucket - treat as category chart
    const categoryKey = allKeys[0] ?? "";
    const valueKey = allKeys.find((k) => typeof firstRow[k] === "number") ?? allKeys[1] ?? "";
    const chartData = data.map((row) => ({
      category: String(row[categoryKey] ?? ""),
      value: Number(row[valueKey] ?? 0),
    }));
    return { chartData, seriesKeys: [], hasTimeBucket: false, categoryKey, valueKey };
  }, [data]);

  if (!chartData.length) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
        No data
      </div>
    );
  }

  const displayType = config.displayType;

  // Category bar chart (no time bucket)
  if (!hasTimeBucket && (displayType === "bar" || displayType === "stacked_bar")) {
    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <ReBarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            type="number"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: "hsl(var(--muted-foreground))" }}
            fontSize={10}
            tickFormatter={(v: number) => formatNumber(v)}
          />
          <YAxis
            type="category"
            dataKey="category"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: "hsl(var(--muted-foreground))" }}
            fontSize={10}
            width={100}
            tickFormatter={(v: string) => v.length > 15 ? v.slice(0, 15) + "…" : v}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v) => formatNumber(Number(v))}
          />
          <Bar dataKey="value" fill={colorAt(0)} name={valueKey} />
        </ReBarChart>
      </ResponsiveContainer>
    );
  }

  const commonAxes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis
        dataKey="ts"
        type="number"
        scale="time"
        domain={["dataMin", "dataMax"]}
        tickFormatter={formatTick}
        stroke="hsl(var(--muted-foreground))"
        tick={{ fill: "hsl(var(--muted-foreground))" }}
        fontSize={10}
      />
      <YAxis
        stroke="hsl(var(--muted-foreground))"
        tick={{ fill: "hsl(var(--muted-foreground))" }}
        fontSize={10}
        width={45}
        tickFormatter={(v: number) => formatNumber(v)}
      />
      <Tooltip
        labelFormatter={(v) => formatTick(Number(v))}
        contentStyle={{
          background: "var(--popover)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          fontSize: 12,
        }}
      />
      <Legend wrapperStyle={{ fontSize: 12 }} />
    </>
  );

  const chartMargin = { top: 10, right: 10, left: 0, bottom: 20 };

  if (displayType === "bar" || displayType === "stacked_bar") {
    const stackId = displayType === "stacked_bar" ? "a" : undefined;
    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <ReBarChart data={chartData} margin={chartMargin}>
          {commonAxes}
          {seriesKeys.map((key, idx) => (
            <Bar
              key={key}
              dataKey={key}
              fill={colorAt(idx)}
              stackId={stackId}
            />
          ))}
        </ReBarChart>
      </ResponsiveContainer>
    );
  }

  if (displayType === "area") {
    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <AreaChart data={chartData} margin={chartMargin}>
          {commonAxes}
          {seriesKeys.map((key, idx) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stroke={colorAt(idx)}
              fill={colorAt(idx)}
              fillOpacity={0.2}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // default: line
  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <LineChart data={chartData} margin={chartMargin}>
        {commonAxes}
        {seriesKeys.map((key, idx) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={colorAt(idx)}
            dot={false}
            strokeWidth={2}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export default TimeSeriesChart;
