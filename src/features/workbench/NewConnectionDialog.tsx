// New connection dialog — engine picker drives the form.
import { useState, type FormEvent } from "react";
import { FolderOpen } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { ENGINES } from "./engineMeta";
import type { Engine } from "@/lib/db/schema";
import { saveConnection } from "@/stores/connectionStore";

export default function NewConnectionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [engine, setEngine] = useState<Engine>("clickhouse");
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [filePath, setFilePath] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const meta = ENGINES[engine];

  function reset() {
    setEngine("clickhouse");
    setName("");
    setHost("");
    setPort("");
    setUser("");
    setPass("");
    setFilePath("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const isServer = meta.kind === "server";
      const trimmedHost = host.trim();
      const hasScheme = /^https?:\/\//i.test(trimmedHost);
      const resolvedPort = port.trim() || String(meta.defaultPort ?? "");
      const url = isServer
        ? `${hasScheme ? "" : "http://"}${trimmedHost}${resolvedPort ? `:${resolvedPort}` : ""}`
        : "";
      const resolvedFile =
        filePath.trim() || (engine === "duckdb" ? ":memory:" : "");

      const created = await saveConnection({
        name: name.trim() || `my-${engine}`,
        engine,
        url,
        username: user.trim(),
        password: pass,
        filePath: isServer ? undefined : resolvedFile,
      });

      if (created) {
        toast.success(`Connection "${created.name}" saved`);
        handleOpenChange(false);
      } else {
        toast.error("Failed to save connection");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>New connection</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-5 gap-1.5">
          {Object.values(ENGINES).map((e) => {
            const Icon = e.icon;
            return (
              <button
                key={e.id}
                type="button"
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

        <form className="mt-2 space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="cn">Connection name</Label>
            <Input
              id="cn"
              autoFocus
              placeholder={`my-${engine}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {meta.kind === "server" ? (
            <>
              <div className="grid grid-cols-[1fr_90px] gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="host">Host</Label>
                  <Input
                    id="host"
                    placeholder="localhost"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    placeholder={String(meta.defaultPort ?? "")}
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="user">User</Label>
                  <Input
                    id="user"
                    placeholder="default"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pass">Password</Label>
                  <Input
                    id="pass"
                    type="password"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                  />
                </div>
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
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1.5"
                  disabled
                  title="Native file picker coming soon — type a path for now"
                >
                  <FolderOpen className="size-4" /> Browse
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                File-based engine — enter a path.
                {engine === "duckdb" && " Use :memory: for an ephemeral DB."}
              </p>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
