// src/features/analytics/charts/PieChart.tsx
// Pie / donut rendering. Expects rows shaped like { label, value } (or any two
// columns where the first is a category and the second is numeric).

import { useMemo } from "react";
import {
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";
import { formatNumber } from "@/lib/formatters";
import { colorAt, type ChartProps } from "./types";

export function PieChart({ data, height = 260 }: ChartProps) {
  const pieData = useMemo(() => {
    if (!data.length) return [] as { name: string; value: number }[];
    const keys = Object.keys(data[0]);
    const labelKey = keys[0];
    const valueKey = keys.find((k) => typeof data[0][k] === "number") ?? keys[1];
    if (!labelKey || !valueKey) return [];

    return data.map((row) => ({
      name: String(row[labelKey] ?? ""),
      value: Number(row[valueKey] ?? 0),
    }));
  }, [data]);

  if (!pieData.length) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
        No data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RePieChart>
        <Tooltip
          formatter={(value) => formatNumber(Number(value))}
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Pie
          data={pieData}
          dataKey="value"
          nameKey="name"
          outerRadius="70%"
          innerRadius="40%"
          paddingAngle={2}
        >
          {pieData.map((_entry, idx) => (
            <Cell key={idx} fill={colorAt(idx)} />
          ))}
        </Pie>
      </RePieChart>
    </ResponsiveContainer>
  );
}

export default PieChart;
