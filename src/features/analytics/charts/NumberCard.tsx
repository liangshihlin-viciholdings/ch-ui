// src/features/analytics/charts/NumberCard.tsx
// Large single-number display. Uses the first numeric column of the first row.

import { useMemo } from "react";
import { formatNumber } from "@/lib/formatters";
import type { ChartProps } from "./types";

export function NumberCard({ data, height = 160 }: ChartProps) {
  const value = useMemo(() => {
    if (!data.length) return null;
    const row = data[0];
    const keys = Object.keys(row);
    const key = keys.find((k) => typeof row[k] === "number") ?? keys[0];
    if (!key) return null;
    return Number(row[key] ?? 0);
  }, [data]);

  if (value === null) {
    return (
      <div
        className="flex h-full w-full items-center justify-center text-xs text-muted-foreground"
        style={{ height }}
      >
        No data
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center"
      style={{ height }}
    >
      <span className="text-4xl font-semibold tracking-tight text-foreground">
        {formatNumber(value)}
      </span>
    </div>
  );
}

export default NumberCard;
