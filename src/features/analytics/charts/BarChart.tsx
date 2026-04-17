// src/features/analytics/charts/BarChart.tsx
// Horizontal bar chart — renders the first column as the category axis and
// the second numeric column as bar length.

import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { formatNumber } from "@/lib/formatters";
import { colorAt, type ChartProps } from "./types";

export function BarChart({ data, height = 260 }: ChartProps) {
  const { rows, labelKey, valueKey } = useMemo(() => {
    if (!data.length) return { rows: [], labelKey: "", valueKey: "" };
    const keys = Object.keys(data[0]);
    const label = keys[0];
    const value = keys.find((k) => typeof data[0][k] === "number") ?? keys[1];
    return {
      rows: data.map((row) => ({
        [label]: String(row[label] ?? ""),
        [value]: Number(row[value] ?? 0),
      })),
      labelKey: label ?? "",
      valueKey: value ?? "",
    };
  }, [data]);

  if (!rows.length || !labelKey || !valueKey) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
        No data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ReBarChart data={rows} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          type="number"
          stroke="var(--muted-foreground)"
          fontSize={10}
          tickFormatter={(v: number) => formatNumber(v)}
        />
        <YAxis
          type="category"
          dataKey={labelKey}
          stroke="var(--muted-foreground)"
          fontSize={10}
          width={120}
        />
        <Tooltip
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        <Bar dataKey={valueKey} fill={colorAt(0)} />
      </ReBarChart>
    </ResponsiveContainer>
  );
}

export default BarChart;
