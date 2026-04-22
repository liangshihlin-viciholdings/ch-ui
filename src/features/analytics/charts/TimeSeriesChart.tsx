// src/features/analytics/charts/TimeSeriesChart.tsx
// Line / bar / area / stacked-bar chart keyed on the `time_bucket` column
// produced by generateChartSql.

import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
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
    // ClickHouse returns "YYYY-MM-DD HH:mm:ss" — make it ISO.
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

export function TimeSeriesChart({ data, config, height = 200 }: ChartProps) {
  const { chartData, seriesKeys } = useMemo(() => {
    if (!data.length) return { chartData: [], seriesKeys: [] as string[] };

    const firstRow = data[0];
    const keys = Object.keys(firstRow).filter((k) => k !== TIME_BUCKET_KEY);

    const chartData = data.map((row) => {
      const mapped: Record<string, unknown> = {
        ts: parseTimestamp(row[TIME_BUCKET_KEY]),
      };
      for (const key of keys) mapped[key] = row[key];
      return mapped;
    });

    return { chartData, seriesKeys: keys };
  }, [data]);

  if (!chartData.length) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
        No data
      </div>
    );
  }

  const displayType = config.displayType;

  const commonAxes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      <XAxis
        dataKey="ts"
        type="number"
        scale="time"
        domain={["dataMin", "dataMax"]}
        tickFormatter={formatTick}
        stroke="var(--muted-foreground)"
        fontSize={10}
      />
      <YAxis
        stroke="var(--muted-foreground)"
        fontSize={10}
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

  if (displayType === "bar" || displayType === "stacked_bar") {
    const stackId = displayType === "stacked_bar" ? "a" : undefined;
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chartData}>
          {commonAxes}
          {seriesKeys.map((key, idx) => (
            <Bar
              key={key}
              dataKey={key}
              fill={colorAt(idx)}
              stackId={stackId}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (displayType === "area") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData}>
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
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData}>
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
