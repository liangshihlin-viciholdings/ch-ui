// src/features/analytics/components/ChartContainer.tsx
// Tile wrapper — owns the title bar, loading state, error surface, and
// toolbar (edit/duplicate/delete) around a single chart.

import { useMemo } from "react";
import { MoreHorizontal, Pencil, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type {
  ChartConfig,
  DashboardFilter,
} from "@/features/analytics/types";
import { useChartData } from "@/features/analytics/hooks/useChartData";
import { getChartComponent } from "@/features/analytics/charts";

export interface ChartContainerProps {
  title: string;
  config: ChartConfig;
  dateRange: [Date, Date];
  tableName: string;
  timestampColumn?: string;
  filters?: DashboardFilter[];
  height?: number;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

export function ChartContainer({
  title,
  config,
  dateRange,
  tableName,
  timestampColumn,
  filters,
  height,
  onEdit,
  onDuplicate,
  onDelete,
}: ChartContainerProps) {
  const query = useChartData({
    config,
    dateRange,
    tableName,
    timestampColumn,
    filters,
  });

  const ChartBody = useMemo(() => getChartComponent(config), [config]);

  return (
    <div className="flex h-full w-full flex-col rounded-md border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-2 py-1">
        <h3 className="truncate text-xs font-medium text-foreground" title={title}>
          {title || "Untitled"}
        </h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label="Chart actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onEdit && (
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
            )}
            {onDuplicate && (
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 min-h-0 p-1">
        {query.isLoading && (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            Loading…
          </div>
        )}
        {query.error && (
          <Alert variant="destructive" className="m-2">
            <AlertTitle className="text-xs">Query failed</AlertTitle>
            <AlertDescription className="text-xs">
              {query.error.message}
            </AlertDescription>
          </Alert>
        )}
        {query.data && (
          <ChartBody
            data={query.data.rows}
            config={config}
            dateRange={dateRange}
            height={height}
          />
        )}
      </div>
    </div>
  );
}

export default ChartContainer;
