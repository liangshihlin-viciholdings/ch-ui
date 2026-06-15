// src/features/alerts/components/AlertList.tsx
// Listing + CRUD entry point for alerts. Opens a dialog-based builder for
// create & edit so the page stays single-route. Matches the dashboards
// list UX.

import { useState } from "react";
import { Plus, Loader2, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Alert } from "@/features/alerts/types";
import {
  useAlerts,
  useCreateAlert,
  useUpdateAlert,
  useDeleteAlert,
} from "@/features/alerts/hooks/useAlerts";
import {
  AlertBuilder,
  createDefaultAlertState,
  type AlertBuilderState,
} from "./AlertBuilder";

function alertToBuilderState(alert: Alert): AlertBuilderState {
  return {
    name: alert.name,
    tableName: alert.tableName,
    config: alert.config,
    thresholdOperator: alert.thresholdOperator,
    thresholdValue: alert.thresholdValue,
    evaluationInterval: alert.evaluationInterval,
    enabled: alert.enabled,
    connectionId: alert.connectionId ?? null,
  };
}

export function AlertList() {
  const { data: alerts = [], isLoading } = useAlerts();
  const createAlert = useCreateAlert();
  const updateAlert = useUpdateAlert();
  const deleteAlert = useDeleteAlert();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [builderState, setBuilderState] = useState<AlertBuilderState>(
    createDefaultAlertState(),
  );
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const openNew = () => {
    setEditingId(null);
    setBuilderState(createDefaultAlertState());
    setEditorOpen(true);
  };

  const openEdit = (alert: Alert) => {
    setEditingId(alert.id);
    setBuilderState(alertToBuilderState(alert));
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (!builderState.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!builderState.tableName.trim()) {
      toast.error("Source table is required");
      return;
    }
    try {
      if (editingId) {
        await updateAlert.mutateAsync({
          id: editingId,
          input: builderState,
        });
        toast.success(`Updated "${builderState.name}"`);
      } else {
        await createAlert.mutateAsync(builderState);
        toast.success(`Created "${builderState.name}"`);
      }
      setEditorOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleToggleEnabled = async (alert: Alert, enabled: boolean) => {
    try {
      await updateAlert.mutateAsync({ id: alert.id, input: { enabled } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteAlert.mutateAsync(confirmDelete);
      toast.success("Alert deleted");
      setConfirmDelete(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="flex-1 w-full overflow-auto">
      <div className="container mx-auto px-4 py-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Alerts
            </h1>
            <p className="text-xs text-muted-foreground">
              Threshold alerts on your database queries. Evaluation is
              client-side only — this preview tells you if the alert would
              fire right now.
            </p>
          </div>
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" />
            New alert
          </Button>
        </div>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
            No alerts yet.
          </div>
        ) : (
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Threshold</TableHead>
                  <TableHead>Interval</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last triggered</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell className="font-medium">{alert.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {alert.tableName}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {alert.thresholdOperator} {alert.thresholdValue}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {alert.evaluationInterval}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={alert.enabled}
                          onCheckedChange={(c) =>
                            void handleToggleEnabled(alert, c)
                          }
                          aria-label={`Toggle ${alert.name}`}
                        />
                        <Badge
                          variant={alert.enabled ? "default" : "outline"}
                          className=""
                        >
                          {alert.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {alert.lastTriggered
                        ? new Date(alert.lastTriggered).toLocaleString()
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(alert)}
                          aria-label={`Edit ${alert.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setConfirmDelete(alert.id)}
                          aria-label={`Delete ${alert.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit alert" : "New alert"}
            </DialogTitle>
          </DialogHeader>
          <AlertBuilder
            value={builderState}
            onChange={setBuilderState}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createAlert.isPending || updateAlert.isPending}
            >
              {editingId ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete alert?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the alert from local storage. The underlying
              database data is unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default AlertList;
