// src/features/analytics/charts/HistogramChart.tsx
// Histogram view. Expects rows with a numeric-bucket key and a count column.

import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { formatNumber } from "@/lib/formatters";
import { colorAt, type ChartProps } from "./types";

export function HistogramChart({ data, height = 260 }: ChartProps) {
  const { rows, bucketKey, countKey } = useMemo(() => {
    if (!data.length) return { rows: [], bucketKey: "", countKey: "" };
    const keys = Object.keys(data[0]);
    const bucket = keys[0];
    const count = keys.find((k) => typeof data[0][k] === "number") ?? keys[1];
    return {
      rows: data.map((row) => ({
        [bucket]: String(row[bucket] ?? ""),
        [count]: Number(row[count] ?? 0),
      })),
      bucketKey: bucket ?? "",
      countKey: count ?? "",
    };
  }, [data]);

  if (!rows.length || !bucketKey || !countKey) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
        No data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} barCategoryGap={1}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey={bucketKey}
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
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        <Bar dataKey={countKey} fill={colorAt(0)} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default HistogramChart;
