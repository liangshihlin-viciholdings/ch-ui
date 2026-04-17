// src/features/analytics/charts/HeatmapChart.tsx
// Simple SVG heatmap. Rows are expected to have [xKey, yKey, valueKey]; if
// fewer columns are present the component renders a placeholder.

import { useMemo } from "react";
import { formatNumber } from "@/lib/formatters";
import type { ChartProps } from "./types";

interface Cell {
  x: string;
  y: string;
  v: number;
}

export function HeatmapChart({ data, height = 260 }: ChartProps) {
  const { cells, xs, ys, max } = useMemo(() => {
    if (!data.length) {
      return { cells: [] as Cell[], xs: [] as string[], ys: [] as string[], max: 0 };
    }
    const keys = Object.keys(data[0]);
    if (keys.length < 3) {
      return { cells: [], xs: [], ys: [], max: 0 };
    }
    const [xKey, yKey, vKey] = keys;

    const xSet = new Set<string>();
    const ySet = new Set<string>();
    const cells: Cell[] = data.map((row) => {
      const x = String(row[xKey] ?? "");
      const y = String(row[yKey] ?? "");
      const v = Number(row[vKey] ?? 0);
      xSet.add(x);
      ySet.add(y);
      return { x, y, v };
    });

    let max = 0;
    for (const c of cells) if (c.v > max) max = c.v;

    return {
      cells,
      xs: Array.from(xSet),
      ys: Array.from(ySet),
      max,
    };
  }, [data]);

  if (!cells.length) {
    return (
      <div
        className="flex h-full w-full items-center justify-center text-xs text-muted-foreground"
        style={{ height }}
      >
        Heatmap requires 3 columns (x, y, value)
      </div>
    );
  }

  // Simple grid layout — cells sized to fit. Uses --chart-1 hue as the high
  // end, with opacity scaled by value / max.
  const cellWidth = 100 / Math.max(xs.length, 1);
  const cellHeight = 100 / Math.max(ys.length, 1);

  return (
    <div className="relative w-full" style={{ height }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        {cells.map((cell, i) => {
          const xi = xs.indexOf(cell.x);
          const yi = ys.indexOf(cell.y);
          const opacity = max === 0 ? 0 : cell.v / max;
          return (
            <rect
              key={i}
              x={xi * cellWidth}
              y={yi * cellHeight}
              width={cellWidth}
              height={cellHeight}
              fill="hsl(var(--chart-1))"
              fillOpacity={opacity}
              stroke="var(--border)"
              strokeWidth={0.1}
            >
              <title>{`${cell.x} / ${cell.y}: ${formatNumber(cell.v)}`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

export default HeatmapChart;
