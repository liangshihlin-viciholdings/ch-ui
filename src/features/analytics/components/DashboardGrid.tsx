// src/features/analytics/components/DashboardGrid.tsx
// Thin wrapper over react-grid-layout that renders one ChartContainer per tile.

import { useMemo, useCallback } from "react";
import {
  Responsive,
  WidthProvider,
  type Layout,
  type LayoutItem,
} from "react-grid-layout/legacy";
import type {
  DashboardTile,
  DashboardFilter,
} from "@/features/analytics/types";
import { DashboardSyncProvider } from "@/features/analytics/contexts/DashboardSyncContext";
import { ChartContainer } from "./ChartContainer";

import "react-grid-layout/css/styles.css";

const ResponsiveGrid = WidthProvider(Responsive);

export interface DashboardGridProps {
  tiles: DashboardTile[];
  dateRange: [Date, Date];
  tableName: string;
  timestampColumn?: string;
  filters?: DashboardFilter[];
  onLayoutChange?: (tiles: DashboardTile[]) => void;
  onEditTile?: (id: string) => void;
  onDuplicateTile?: (id: string) => void;
  onDeleteTile?: (id: string) => void;
}

const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
const COLS = { lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 };
const ROW_HEIGHT = 50;
const HEADER_HEIGHT = 28; // header + border
const MARGIN = 6;

export function DashboardGrid({
  tiles,
  dateRange,
  tableName,
  timestampColumn,
  filters,
  onLayoutChange,
  onEditTile,
  onDuplicateTile,
  onDeleteTile,
}: DashboardGridProps) {
  const layout = useMemo<LayoutItem[]>(
    () =>
      tiles.map((t) => ({
        i: t.id,
        x: t.x,
        y: Number.isFinite(t.y) ? t.y : 0,
        w: t.w,
        h: t.h,
      })),
    [tiles],
  );

  const handleLayoutChange = useCallback(
    (next: Layout) => {
      if (!onLayoutChange) return;
      const byId = new Map(next.map((l) => [l.i, l]));
      const merged = tiles.map((t) => {
        const l = byId.get(t.id);
        if (!l) return t;
        return { ...t, x: l.x, y: l.y, w: l.w, h: l.h };
      });
      onLayoutChange(merged);
    },
    [tiles, onLayoutChange],
  );

  if (!tiles.length) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
        No tiles yet. Add a chart to get started.
      </div>
    );
  }

  return (
    <DashboardSyncProvider>
    <ResponsiveGrid
      className="layout"
      layouts={{ lg: layout, md: layout, sm: layout, xs: layout, xxs: layout }}
      breakpoints={BREAKPOINTS}
      cols={COLS}
      rowHeight={ROW_HEIGHT}
      margin={[6, 6]}
      containerPadding={[0, 0]}
      isDraggable={!!onLayoutChange}
      isResizable={!!onLayoutChange}
      resizeHandles={["s", "e", "se"]}
      draggableHandle=".dashboard-tile-drag-handle"
      onLayoutChange={handleLayoutChange}
    >
      {tiles.map((tile) => {
        // Calculate chart height: tile height - header - padding
        const tileHeight = tile.h * ROW_HEIGHT + (tile.h - 1) * MARGIN;
        const chartHeight = tileHeight - HEADER_HEIGHT - 8; // 8px for body padding
        return (
          <div key={tile.id} className="h-full overflow-hidden">
            <ChartContainer
              title={tile.title}
              config={tile.config}
              dateRange={dateRange}
              tableName={tableName}
              timestampColumn={timestampColumn}
              filters={filters}
              height={chartHeight}
              onEdit={onEditTile ? () => onEditTile(tile.id) : undefined}
              onDuplicate={
                onDuplicateTile ? () => onDuplicateTile(tile.id) : undefined
              }
              onDelete={onDeleteTile ? () => onDeleteTile(tile.id) : undefined}
            />
          </div>
        );
      })}
    </ResponsiveGrid>
    </DashboardSyncProvider>
  );
}

export default DashboardGrid;
