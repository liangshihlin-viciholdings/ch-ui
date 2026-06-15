// src/features/analytics/components/DashboardPage.tsx
// Full dashboard view — header (title + actions), filter strip, time picker,
// and a responsive grid of ChartContainer tiles.

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Loader2, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type {
  DashboardTile,
  ChartConfig,
} from "@/features/analytics/types";
import {
  useDashboard,
  useUpdateDashboard,
  useDeleteDashboard,
} from "@/features/analytics/hooks/useDashboard";
import { useTimeRange } from "@/features/analytics/hooks/useTimeRange";
import { useDashboardFilters } from "@/features/analytics/hooks/useDashboardFilters";
import { DashboardGrid } from "./DashboardGrid";
import { ConnectionPicker } from "@/components/common/ConnectionPicker";
import { useWorkbenchStore } from "@/stores/workbenchStore";
import { DashboardFilters } from "./DashboardFilters";
import { TimePicker } from "./TimePicker";
import { ChartBuilder } from "./ChartBuilder";
import { createDefaultBuilderConfig } from "@/features/analytics/hooks/useChartConfig";
import {
  DASHBOARD_TEMPLATES,
  getDashboardTemplate,
} from "@/features/analytics/dashboardTemplates";
import { SetupGuideCard } from "./SetupGuideCard";
import { AutoRefreshControl } from "./AutoRefreshControl";

export interface DashboardPageProps {
  dashboardId: string;
  onNavigateToList: () => void;
}

interface TileEditorState {
  tile: DashboardTile;
  tableName: string;
  isNew: boolean;
}

function makeNewTile(): TileEditorState {
  return {
    tile: {
      id: crypto.randomUUID(),
      title: "Untitled chart",
      x: 0,
      y: Infinity,
      w: 6,
      h: 4,
      config: createDefaultBuilderConfig(),
    },
    tableName: "",
    isNew: true,
  };
}

export function DashboardPage({
  dashboardId,
  onNavigateToList,
}: DashboardPageProps) {
  const { data: dashboard, isLoading } = useDashboard(dashboardId);
  const updateDashboard = useUpdateDashboard();
  const connections = useWorkbenchStore((s) => s.connections);
  const activeEngine =
    connections.find((c) => c.id === dashboard?.connectionId)?.engine ??
    "clickhouse";
  const deleteDashboard = useDeleteDashboard();

  const { range, setPreset, setCustom } = useTimeRange("1h");
  const { filters, addFilter, removeFilter, setFilters } = useDashboardFilters(
    dashboard?.filters ?? [],
  );

  const [editor, setEditor] = useState<TileEditorState | null>(null);
  const [confirmDeleteDashboard, setConfirmDeleteDashboard] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  // Default table used for newly-created tiles. Each tile currently shares a
  // single table — matches the HyperDX dashboard pattern.
  const [defaultTable, setDefaultTable] = useState<string>("");

  // Sync filters when a new dashboard loads. We only re-sync on id change so
  // local filter edits don't get clobbered by the same dashboard arriving
  // again from the query cache.
  useEffect(() => {
    if (dashboard?.filters) setFilters(dashboard.filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard?.id]);

  const tiles = dashboard?.tiles ?? [];
  const dateRange: [Date, Date] = [range.start, range.end];

  const persistTiles = useCallback(
    async (next: DashboardTile[]) => {
      if (!dashboard) return;
      try {
        await updateDashboard.mutateAsync({
          id: dashboard.id,
          input: { tiles: next },
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed");
      }
    },
    [dashboard, updateDashboard],
  );

  const handleLayoutChange = useCallback(
    (next: DashboardTile[]) => {
      void persistTiles(next);
    },
    [persistTiles],
  );

  const handleAddTile = () => setEditor(makeNewTile());

  const handleImportTemplate = async (templateId: string) => {
    const template = getDashboardTemplate(templateId);
    if (!template) {
      toast.error("Template not found");
      return;
    }
    if (template.requiredEngine && template.requiredEngine !== activeEngine) {
      toast.error(
        `"${template.name}" requires a ${template.requiredEngine} connection`,
      );
      return;
    }
    const newTiles = template.tiles.map((tile) => ({
      ...tile,
      id: crypto.randomUUID(),
      y: Infinity,
    }));
    await persistTiles([...tiles, ...newTiles]);
    setTemplatesOpen(false);
    toast.success(`Added ${newTiles.length} charts from "${template.name}"`);
  };

  const handleEditTile = (id: string) => {
    const tile = tiles.find((t) => t.id === id);
    if (!tile) return;
    setEditor({ tile, tableName: defaultTable, isNew: false });
  };

  const handleDuplicateTile = (id: string) => {
    const tile = tiles.find((t) => t.id === id);
    if (!tile) return;
    const copy: DashboardTile = {
      ...tile,
      id: crypto.randomUUID(),
      title: `${tile.title} (copy)`,
      y: Infinity,
    };
    void persistTiles([...tiles, copy]);
  };

  const handleDeleteTile = (id: string) => {
    void persistTiles(tiles.filter((t) => t.id !== id));
  };

  const handleSaveTile = async () => {
    if (!editor || !dashboard) return;
    if (!editor.tableName.trim()) {
      toast.error("Source table is required");
      return;
    }
    const nextTiles = editor.isNew
      ? [...tiles, editor.tile]
      : tiles.map((t) => (t.id === editor.tile.id ? editor.tile : t));
    setDefaultTable(editor.tableName.trim());
    await persistTiles(nextTiles);
    setEditor(null);
  };

  const handleConfigChange = (config: ChartConfig) => {
    setEditor((prev) =>
      prev ? { ...prev, tile: { ...prev.tile, config } } : prev,
    );
  };

  const handleDeleteDashboard = async () => {
    if (!dashboard) return;
    try {
      await deleteDashboard.mutateAsync(dashboard.id);
      toast.success(`Deleted "${dashboard.name}"`);
      onNavigateToList();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  // Persist filters when they change.
  const handleFilterAdd = useCallback(
    (filter: Parameters<typeof addFilter>[0]) => {
      addFilter(filter);
      if (dashboard) {
        void updateDashboard.mutateAsync({
          id: dashboard.id,
          input: { filters: [...filters, filter] },
        });
      }
    },
    [addFilter, dashboard, filters, updateDashboard],
  );
  const handleFilterRemove = useCallback(
    (index: number) => {
      removeFilter(index);
      if (dashboard) {
        const next = filters.filter((_, i) => i !== index);
        void updateDashboard.mutateAsync({
          id: dashboard.id,
          input: { filters: next },
        });
      }
    },
    [removeFilter, dashboard, filters, updateDashboard],
  );

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        Dashboard not found.
      </div>
    );
  }

  return (
    <div className="flex-1 w-full overflow-auto">
      <div className="container mx-auto space-y-4 px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
              {dashboard.name}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <ConnectionPicker
              value={dashboard.connectionId}
              onChange={(id) =>
                updateDashboard.mutate({
                  id: dashboard.id,
                  input: { connectionId: id },
                })
              }
            />
            <AutoRefreshControl />
            <TimePicker
              range={range}
              onPresetChange={setPreset}
              onCustomChange={setCustom}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTemplatesOpen(true)}
            >
              <LayoutTemplate className="mr-1 h-4 w-4" />
              Templates
            </Button>
            <Button size="sm" onClick={handleAddTile}>
              <Plus className="mr-1 h-4 w-4" />
              Add chart
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDeleteDashboard(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <DashboardFilters
          filters={filters}
          onAdd={handleFilterAdd}
          onRemove={handleFilterRemove}
        />

        {dashboard.templateId && (() => {
          const template = getDashboardTemplate(dashboard.templateId);
          return template?.setupGuide ? (
            <SetupGuideCard guide={template.setupGuide} />
          ) : null;
        })()}

        <DashboardGrid
          tiles={tiles}
          dateRange={dateRange}
          tableName={defaultTable}
          filters={filters}
          connectionId={dashboard.connectionId}
          onLayoutChange={handleLayoutChange}
          onEditTile={handleEditTile}
          onDuplicateTile={handleDuplicateTile}
          onDeleteTile={handleDeleteTile}
        />
      </div>

      <Dialog
        open={!!editor}
        onOpenChange={(open) => !open && setEditor(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editor?.isNew ? "Add chart" : "Edit chart"}
            </DialogTitle>
          </DialogHeader>
          {editor && (
            <ChartBuilder
              config={editor.tile.config}
              onChange={handleConfigChange}
              tableName={editor.tableName}
              onTableNameChange={(name) =>
                setEditor((prev) => (prev ? { ...prev, tableName: name } : prev))
              }
              title={editor.tile.title}
              onTitleChange={(title) =>
                setEditor((prev) =>
                  prev ? { ...prev, tile: { ...prev.tile, title } } : prev,
                )
              }
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTile}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDeleteDashboard}
        onOpenChange={setConfirmDeleteDashboard}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete dashboard?</AlertDialogTitle>
            <AlertDialogDescription>
              "{dashboard.name}" and all its tiles will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDashboard}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Template Charts</DialogTitle>
            <DialogDescription>
              Add pre-built charts from a template to this dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4 sm:grid-cols-2">
            {DASHBOARD_TEMPLATES.map((template) => {
              const incompatible =
                !!template.requiredEngine &&
                template.requiredEngine !== activeEngine;
              return (
              <Card
                key={template.id}
                className={`transition-colors ${
                  incompatible
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer hover:border-primary/50"
                }`}
                onClick={() =>
                  incompatible ? undefined : handleImportTemplate(template.id)
                }
              >
                <CardHeader className="p-4">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    {template.name}
                    {incompatible && (
                      <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-normal text-amber-600 dark:text-amber-400">
                        Requires {template.requiredEngine}
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {template.description}
                  </CardDescription>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {template.tiles.length} charts
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {template.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </CardHeader>
              </Card>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplatesOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default DashboardPage;
