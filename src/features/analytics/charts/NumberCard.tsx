// src/features/analytics/charts/NumberCard.tsx
// Large single-number display. Uses the first numeric column of the first row.

import { useMemo } from "react";
import { formatNumber } from "@/lib/formatters";
import type { ChartProps } from "./types";

export function NumberCard({ data }: ChartProps) {
  const { value, label } = useMemo(() => {
    if (!data.length) return { value: null, label: null };
    const row = data[0];
    const keys = Object.keys(row);
    const key = keys.find((k) => typeof row[k] === "number") ?? keys[0];
    if (!key) return { value: null, label: null };
    const val = row[key];
    // Handle string values (e.g., formatted sizes like "3.71 TiB")
    if (typeof val === "string") {
      return { value: val, label: key };
    }
    return { value: Number(val ?? 0), label: key };
  }, [data]);

  if (value === null) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
        No data
      </div>
    );
  }

  const displayValue = typeof value === "string" ? value : formatNumber(value);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-2">
      <span className="font-mono text-3xl font-semibold tracking-tighter text-foreground tabular-nums md:text-4xl lg:text-5xl">
        {displayValue}
      </span>
    </div>
  );
}

export default NumberCard;
