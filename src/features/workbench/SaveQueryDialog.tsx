// Save query dialog — form with autofocus, Enter saves, Esc cancels.
// Persists the active tab's SQL to Dexie (savedQueries); the sidebar's
// Saved Queries tab picks it up via liveQuery.
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkbenchStore } from "@/stores/workbenchStore";
import { createSavedQuery } from "@/lib/db";

export default function SaveQueryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const tabs = useWorkbenchStore((s) => s.tabs);
  const activeTabId = useWorkbenchStore((s) => s.activeTabId);
  const connections = useWorkbenchStore((s) => s.connections);
  const tab = tabs.find((t) => t.id === activeTabId);
  const [name, setName] = useState("");

  // Prefill with the tab title each time the dialog opens.
  useEffect(() => {
    if (open) setName(tab?.title ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!tab || !trimmed) return;
    try {
      const conn = connections.find((c) => c.id === tab.connectionId);
      await createSavedQuery({
        name: trimmed,
        query: tab.sql,
        connectionId: tab.connectionId,
        databaseName: conn?.database ?? "",
      });
      toast.success(`Saved "${trimmed}"`);
      onOpenChange(false);
    } catch (err) {
      toast.error(
        `Failed to save query: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="size-4" /> Save query
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="qname">Name</Label>
            <Input
              id="qname"
              autoFocus
              placeholder="top pages last 7d"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || !tab}>
              Save
            </Button>
          </DialogFooter>
          <p className="text-center text-[11px] text-muted-foreground">
            Press <kbd className="rounded bg-muted px-1">Enter</kbd> to save ·{" "}
            <kbd className="rounded bg-muted px-1">Esc</kbd> to cancel
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
