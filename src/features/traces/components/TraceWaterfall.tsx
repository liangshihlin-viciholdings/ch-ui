// src/features/traces/components/TraceWaterfall.tsx
// Custom SVG waterfall — each span is a horizontal bar positioned by
// (start - traceStart) / traceDuration with a fixed row height. Stacked
// vertically in the DFS order of the span hierarchy, so a row's position
// doubles as its chronological position within its parent.
//
// Recharts / uPlot would be heavier than necessary here — this is literally
// N rects and N labels.

import { useMemo } from "react";
import { colorAt } from "@/features/analytics/charts/types";
import { formatDuration } from "@/lib/formatters";
import type { Span, Trace } from "@/features/traces/types";

const ROW_HEIGHT = 22;
const ROW_GAP = 2;
const LABEL_WIDTH = 220;
const BAR_MIN_WIDTH = 2;
const AXIS_HEIGHT = 18;

interface WaterfallRow {
  span: Span;
  depth: number;
  startMs: number;
  endMs: number;
}

function sortChronological(spans: Span[]): Span[] {
  return [...spans].sort(
    (a, b) => Date.parse(a.startTime) - Date.parse(b.startTime),
  );
}

function buildRows(spans: Span[]): WaterfallRow[] {
  const byId = new Map<string, Span>();
  for (const s of spans) byId.set(s.spanId, s);

  const childrenByParent = new Map<string, Span[]>();
  const roots: Span[] = [];
  for (const s of spans) {
    const parent = s.parentSpanId && byId.has(s.parentSpanId) ? s.parentSpanId : "";
    if (!parent) roots.push(s);
    else {
      const list = childrenByParent.get(parent) ?? [];
      list.push(s);
      childrenByParent.set(parent, list);
    }
  }

  const rows: WaterfallRow[] = [];
  const dfs = (span: Span, depth: number): void => {
    const startMs = Date.parse(span.startTime);
    const endMs = startMs + span.durationNs / 1_000_000;
    rows.push({ span, depth, startMs, endMs });
    const children = childrenByParent.get(span.spanId);
    if (children) {
      for (const child of sortChronological(children)) dfs(child, depth + 1);
    }
  };
  for (const root of sortChronological(roots)) dfs(root, 0);
  return rows;
}

export interface TraceWaterfallProps {
  trace: Trace;
  selectedSpanId?: string;
  onSelectSpan: (span: Span) => void;
  /** Visible width in pixels. Defaults to 720 — the container is expected
   * to horizontally-scroll smaller viewports. */
  width?: number;
}

export function TraceWaterfall({
  trace,
  selectedSpanId,
  onSelectSpan,
  width = 720,
}: TraceWaterfallProps) {
  const rows = useMemo(() => buildRows(trace.spans), [trace.spans]);

  if (!rows.length) {
    return (
      <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
        No spans in this trace.
      </div>
    );
  }

  const traceStartMs = Math.min(...rows.map((r) => r.startMs));
  const traceEndMs = Math.max(...rows.map((r) => r.endMs));
  const totalDurationMs = Math.max(1, traceEndMs - traceStartMs);
  const chartWidth = Math.max(200, width - LABEL_WIDTH);
  const totalHeight = AXIS_HEIGHT + rows.length * (ROW_HEIGHT + ROW_GAP);

  const serviceColor = new Map<string, string>();
  let colorIdx = 0;
  for (const row of rows) {
    if (!serviceColor.has(row.span.serviceName)) {
      serviceColor.set(row.span.serviceName, colorAt(colorIdx++));
    }
  }

  // Axis ticks at 0%, 25%, 50%, 75%, 100%.
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="overflow-auto rounded-md border border-border bg-background">
      <svg
        width={width}
        height={totalHeight}
        role="img"
        aria-label="Trace waterfall"
      >
        {/* Axis */}
        <g>
          {ticks.map((t) => {
            const x = LABEL_WIDTH + t * chartWidth;
            const durationMs = totalDurationMs * t;
            return (
              <g key={t}>
                <line
                  x1={x}
                  x2={x}
                  y1={0}
                  y2={totalHeight}
                  stroke="var(--border)"
                  strokeDasharray="2 2"
                />
                <text
                  x={x + 2}
                  y={12}
                  fontSize={10}
                  fill="var(--muted-foreground)"
                >
                  {formatDuration(durationMs / 1000)}
                </text>
              </g>
            );
          })}
        </g>

        {/* Rows */}
        {rows.map((row, i) => {
          const y = AXIS_HEIGHT + i * (ROW_HEIGHT + ROW_GAP);
          const relStart = (row.startMs - traceStartMs) / totalDurationMs;
          const relDur = (row.endMs - row.startMs) / totalDurationMs;
          const x = LABEL_WIDTH + relStart * chartWidth;
          const w = Math.max(BAR_MIN_WIDTH, relDur * chartWidth);
          const color = serviceColor.get(row.span.serviceName) ?? colorAt(0);
          const isSelected = row.span.spanId === selectedSpanId;
          const isError = row.span.statusCode === "ERROR";

          return (
            <g
              key={row.span.spanId}
              style={{ cursor: "pointer" }}
              onClick={() => onSelectSpan(row.span)}
            >
              <rect
                x={0}
                y={y}
                width={width}
                height={ROW_HEIGHT}
                fill={isSelected ? "var(--muted)" : "transparent"}
              />
              <text
                x={8 + row.depth * 8}
                y={y + ROW_HEIGHT / 2 + 3}
                fontSize={11}
                fill={
                  isError ? "var(--destructive)" : "var(--foreground)"
                }
                style={{ fontFamily: "var(--font-mono, monospace)" }}
              >
                {row.span.name.length > 28
                  ? `${row.span.name.slice(0, 26)}…`
                  : row.span.name}
              </text>
              <rect
                x={x}
                y={y + 4}
                width={w}
                height={ROW_HEIGHT - 8}
                rx={2}
                fill={color}
                fillOpacity={isError ? 1 : 0.75}
                stroke={isError ? "var(--destructive)" : "none"}
                strokeWidth={isError ? 1 : 0}
              />
              <text
                x={x + w + 4}
                y={y + ROW_HEIGHT / 2 + 3}
                fontSize={10}
                fill="var(--muted-foreground)"
              >
                {formatDuration((row.endMs - row.startMs) / 1000)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default TraceWaterfall;
