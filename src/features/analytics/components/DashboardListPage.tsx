// src/features/analytics/components/DashboardListPage.tsx
// Landing page for dashboards: table of existing dashboards + a create button.

import { useState } from "react";
import { Plus, Loader2, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useDashboards,
  useCreateDashboard,
} from "@/features/analytics/hooks/useDashboard";
import { useWorkbenchStore } from "@/stores/workbenchStore";
import {
  PRESET_DASHBOARDS,
  DASHBOARD_TEMPLATES,
  getDashboardTemplate,
  type DashboardTemplate,
} from "@/features/analytics/dashboardTemplates";

export interface DashboardListPageProps {
  onSelect?: (id: string) => void;
}

export function DashboardListPage({ onSelect }: DashboardListPageProps) {
  const { data: dashboards = [], isLoading } = useDashboards();
  const createDashboard = useCreateDashboard();
  // New dashboards default to the workbench's active connection (null = legacy).
  const activeConnectionId = useWorkbenchStore((s) => s.activeConnectionId);
  const connections = useWorkbenchStore((s) => s.connections);
  const activeEngine =
    connections.find((c) => c.id === activeConnectionId)?.engine ??
    "clickhouse";
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<DashboardTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      const created = await createDashboard.mutateAsync({
        name: name.trim(),
        tiles: [],
        tags: [],
        filters: [],
        connectionId: activeConnectionId,
      });
      toast.success(`Created "${created.name}"`);
      setOpen(false);
      setName("");
      onSelect?.(created.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    }
  };

  const handleSelectTemplate = (templateId: string) => {
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
    setSelectedTemplate(template);
    setTemplateName(template.name);
    setTemplatesOpen(false);
  };

  const handleCreateFromTemplate = async () => {
    if (!selectedTemplate) return;
    if (!templateName.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      const created = await createDashboard.mutateAsync({
        name: templateName.trim(),
        tiles: selectedTemplate.tiles.map((tile) => ({
          ...tile,
          id: crypto.randomUUID(),
        })),
        tags: selectedTemplate.tags,
        filters: [],
        templateId: selectedTemplate.id,
        connectionId: activeConnectionId,
      });
      toast.success(`Created "${created.name}" from template`);
      setSelectedTemplate(null);
      setTemplateName("");
      onSelect?.(created.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    }
  };

  return (
    <div className="flex-1 w-full overflow-auto">
      <div className="container mx-auto py-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Dashboards
            </h1>
            <p className="text-xs text-muted-foreground">
              Build and share dashboards from your ClickHouse tables.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTemplatesOpen(true)}
            >
              <LayoutTemplate className="mr-1 h-4 w-4" />
              Templates
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              New dashboard
            </Button>
          </div>
        </div>

        {PRESET_DASHBOARDS.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              Quick Start
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PRESET_DASHBOARDS.map((preset) => (
                <Card
                  key={preset.id}
                  className="group cursor-pointer transition-colors hover:border-primary/50"
                  onClick={() => handleSelectTemplate(preset.templateId)}
                >
                  <CardHeader className="p-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">
                        {preset.name}
                      </CardTitle>
                      <Plus className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <CardDescription className="text-xs">
                      {preset.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        )}

        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          Your Dashboards
        </h2>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : dashboards.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
            No dashboards yet.
          </div>
        ) : (
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Tiles</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboards.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Link
                        to="/dashboards/$dashboardId"
                        params={{ dashboardId: d.id }}
                        className="text-primary hover:underline"
                      >
                        {d.name}
                      </Link>
                    </TableCell>
                    <TableCell>{d.tiles.length}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(d.updatedAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New dashboard</DialogTitle>
            <DialogDescription>
              Give your dashboard a name — you can add charts once it's open.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="new-dashboard-name">Name</Label>
            <Input
              id="new-dashboard-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My dashboard"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createDashboard.isPending}
            >
              {createDashboard.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dashboard Templates</DialogTitle>
            <DialogDescription>
              Choose a template to preview. You can customize the name before creating.
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
                  incompatible ? undefined : handleSelectTemplate(template.id)
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

      <Dialog open={!!selectedTemplate} onOpenChange={(open) => !open && setSelectedTemplate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Dashboard from Template</DialogTitle>
            <DialogDescription>
              {selectedTemplate?.description}
            </DialogDescription>
          </DialogHeader>
          {selectedTemplate && (
            <div className="space-y-4">
              <div className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{selectedTemplate.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {selectedTemplate.tiles.length} charts
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {selectedTemplate.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="template-dashboard-name">Dashboard Name</Label>
                <Input
                  id="template-dashboard-name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="My dashboard"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateFromTemplate}
              disabled={createDashboard.isPending}
            >
              {createDashboard.isPending ? "Creating..." : "Create Dashboard"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default DashboardListPage;
