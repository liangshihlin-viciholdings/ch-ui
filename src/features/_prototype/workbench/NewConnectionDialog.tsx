// PROTOTYPE — throwaway. Engine-aware connection form: server engines vs file engines.
import { useState } from "react";
import { FolderOpen } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { ENGINES, type Engine } from "./mockData";

export default function NewConnectionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [engine, setEngine] = useState<Engine>("clickhouse");
  const meta = ENGINES[engine];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>New connection</DialogTitle>
        </DialogHeader>

        {/* engine picker — drives which fields render below */}
        <div className="grid grid-cols-5 gap-1.5">
          {Object.values(ENGINES).map((e) => {
            const Icon = e.icon;
            return (
              <button
                key={e.id}
                onClick={() => setEngine(e.id)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-[11px]",
                  engine === e.id
                    ? "border-primary bg-accent"
                    : "border-border hover:bg-accent/50",
                )}
              >
                <span className={cn("size-2 rounded-full", e.dot)} />
                <Icon className="size-4" />
                {e.label.replace("PostgreSQL", "Postgres")}
              </button>
            );
          })}
        </div>

        <form
          className="mt-2 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onOpenChange(false);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="cn">Connection name</Label>
            <Input id="cn" autoFocus placeholder={`my-${engine}`} />
          </div>

          {meta.kind === "server" ? (
            <>
              <div className="grid grid-cols-[1fr_90px] gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="host">Host</Label>
                  <Input id="host" placeholder="localhost" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    placeholder={
                      engine === "clickhouse"
                        ? "8443"
                        : engine === "postgres"
                          ? "5432"
                          : "3306"
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="user">User</Label>
                  <Input id="user" placeholder="default" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pass">Password</Label>
                  <Input id="pass" type="password" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="db">Database</Label>
                <Input id="db" placeholder="default" />
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="file">Database file</Label>
              <div className="flex gap-2">
                <Input
                  id="file"
                  placeholder={
                    engine === "duckdb" ? ":memory: or path…" : "/path/to.db"
                  }
                />
                <Button type="button" variant="outline" className="gap-1.5">
                  <FolderOpen className="size-4" /> Browse
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                File-based engine — opens via native file picker. No host or
                credentials.
                {engine === "duckdb" && " Use :memory: for an ephemeral DB."}
              </p>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" variant="outline">
              Test
            </Button>
            {/* Enter anywhere in the form submits this (it's type=submit) */}
            <Button type="submit">Connect</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
