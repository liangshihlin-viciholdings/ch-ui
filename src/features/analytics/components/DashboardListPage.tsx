// src/features/analytics/components/DashboardListPage.tsx
// Landing page for dashboards: table of existing dashboards + a create button.

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export interface DashboardListPageProps {
  onSelect?: (id: string) => void;
}

export function DashboardListPage({ onSelect }: DashboardListPageProps) {
  const { data: dashboards = [], isLoading } = useDashboards();
  const createDashboard = useCreateDashboard();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

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
      });
      toast.success(`Created "${created.name}"`);
      setOpen(false);
      setName("");
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
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            New dashboard
          </Button>
        </div>

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
    </div>
  );
}

export default DashboardListPage;
