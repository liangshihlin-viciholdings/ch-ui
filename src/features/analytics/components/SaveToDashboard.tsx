// src/features/analytics/components/SaveToDashboard.tsx
// Modal that lets the user save a chart config as a new tile on either an
// existing dashboard or a brand-new one.

import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ChartConfig,
  DashboardTile,
} from "@/features/analytics/types";
import {
  useDashboards,
  useCreateDashboard,
  useUpdateDashboard,
} from "@/features/analytics/hooks/useDashboard";

export interface SaveToDashboardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chartTitle: string;
  chartConfig: ChartConfig;
}

function makeTile(title: string, config: ChartConfig): DashboardTile {
  return {
    id: crypto.randomUUID(),
    title,
    config,
    x: 0,
    y: Infinity, // grid auto-places at bottom
    w: 6,
    h: 4,
  };
}

export function SaveToDashboard({
  open,
  onOpenChange,
  chartTitle,
  chartConfig,
}: SaveToDashboardProps) {
  const { data: dashboards = [] } = useDashboards();
  const createDashboard = useCreateDashboard();
  const updateDashboard = useUpdateDashboard();

  const [mode, setMode] = useState<"existing" | "new">(
    dashboards.length ? "existing" : "new",
  );
  const [selectedId, setSelectedId] = useState<string>("");
  const [newName, setNewName] = useState("");

  const isSaving = createDashboard.isPending || updateDashboard.isPending;

  const handleSave = async () => {
    const tile = makeTile(chartTitle || "Untitled", chartConfig);

    try {
      if (mode === "new") {
        if (!newName.trim()) {
          toast.error("Dashboard name is required");
          return;
        }
        await createDashboard.mutateAsync({
          name: newName.trim(),
          tiles: [tile],
          tags: [],
          filters: [],
        });
        toast.success(`Saved to "${newName.trim()}"`);
      } else {
        if (!selectedId) {
          toast.error("Select a dashboard");
          return;
        }
        const existing = dashboards.find((d) => d.id === selectedId);
        if (!existing) {
          toast.error("Dashboard not found");
          return;
        }
        await updateDashboard.mutateAsync({
          id: existing.id,
          input: { tiles: [...existing.tiles, tile] },
        });
        toast.success(`Added to "${existing.name}"`);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save to dashboard</DialogTitle>
          <DialogDescription>
            Add this chart to an existing dashboard or create a new one.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as "existing" | "new")}
          className="space-y-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="existing" id="save-existing" />
            <Label htmlFor="save-existing">Existing dashboard</Label>
          </div>
          {mode === "existing" && (
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="ml-6">
                <SelectValue placeholder="Choose a dashboard" />
              </SelectTrigger>
              <SelectContent>
                {dashboards.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center space-x-2">
            <RadioGroupItem value="new" id="save-new" />
            <Label htmlFor="save-new">New dashboard</Label>
          </div>
          {mode === "new" && (
            <Input
              className="ml-6"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Dashboard name"
            />
          )}
        </RadioGroup>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SaveToDashboard;
