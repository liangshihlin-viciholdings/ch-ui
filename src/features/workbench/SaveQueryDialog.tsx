// Save query dialog — form with autofocus, Enter saves, Esc cancels.
import { Save } from "lucide-react";
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

export default function SaveQueryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="size-4" /> Save query
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onOpenChange(false);
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="qname">Name</Label>
            <Input id="qname" autoFocus placeholder="top pages last 7d" />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Save</Button>
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
