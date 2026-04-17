// src/features/analytics/charts/DeltaCard.tsx
// Period-over-period change indicator. Expects two numeric columns
// (current, previous) — or falls back to the only available numeric value.

import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import type { ChartProps } from "./types";

interface DeltaValues {
  current: number;
  previous: number | null;
  deltaPct: number | null;
}

export function DeltaCard({ data, height = 160 }: ChartProps) {
  const values = useMemo<DeltaValues | null>(() => {
    if (!data.length) return null;
    const row = data[0];
    const numericKeys = Object.keys(row).filter(
      (k) => typeof row[k] === "number",
    );
    if (!numericKeys.length) return null;

    const current = Number(row[numericKeys[0]] ?? 0);
    const previous = numericKeys[1]
      ? Number(row[numericKeys[1]] ?? 0)
      : null;
    const deltaPct =
      previous === null || previous === 0
        ? null
        : ((current - previous) / previous) * 100;
    return { current, previous, deltaPct };
  }, [data]);

  if (!values) {
    return (
      <div
        className="flex h-full w-full items-center justify-center text-xs text-muted-foreground"
        style={{ height }}
      >
        No data
      </div>
    );
  }

  const { current, previous, deltaPct } = values;
  const isUp = deltaPct !== null && deltaPct > 0;
  const isDown = deltaPct !== null && deltaPct < 0;
  const Icon = isUp ? ArrowUpRight : isDown ? ArrowDownRight : Minus;
  const trendColor = isUp
    ? "text-emerald-500"
    : isDown
      ? "text-rose-500"
      : "text-muted-foreground";

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-1"
      style={{ height }}
    >
      <span className="text-4xl font-semibold tracking-tight text-foreground">
        {formatNumber(current)}
      </span>
      {deltaPct !== null && (
        <div className={`flex items-center text-sm ${trendColor}`}>
          <Icon className="mr-1 h-4 w-4" />
          <span>{`${deltaPct.toFixed(1)}%`}</span>
          {previous !== null && (
            <span className="ml-2 text-xs text-muted-foreground">
              vs {formatNumber(previous)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default DeltaCard;
