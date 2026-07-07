// New / edit connection dialog — engine picker drives the form.
import { useEffect, useState, type FormEvent } from "react";
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
import type { Engine, SavedConnection } from "@/lib/db/schema";
import { saveConnection, updateConnectionById } from "@/stores/connectionStore";
import { disconnectConnection } from "@/stores/workbenchStore";

/** Split a stored connection URL into host (scheme kept) + port. */
function parseUrl(url: string): { host: string; port: string } {
  const cleaned = url.replace(/\/+$/, "");
  const idx = cleaned.lastIndexOf(":");
  if (idx > 0 && /^\d+$/.test(cleaned.slice(idx + 1))) {
    return { host: cleaned.slice(0, idx), port: cleaned.slice(idx + 1) };
  }
  return { host: cleaned, port: "" };
}

export default function NewConnectionDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: SavedConnection | null;
}) {
  const [engine, setEngine] = useState<Engine>("clickhouse");
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [database, setDatabase] = useState("");
  const [filePath, setFilePath] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const meta = ENGINES[engine];

  // Prefill the form when opened in edit mode.
  useEffect(() => {
    if (!open || !editing) return;
    const { host: h, port: p } = parseUrl(editing.url ?? "");
    setEngine(editing.engine);
    setName(editing.name);
    setHost(h);
    setPort(p);
    setUser(editing.username ?? "");
    setPass(editing.password ?? "");
    setDatabase(editing.database ?? "");
    setFilePath(editing.filePath ?? "");
  }, [open, editing]);

  function reset() {
    setEngine("clickhouse");
    setName("");
    setHost("");
    setPort("");
    setUser("");
    setPass("");
    setDatabase("");
    setFilePath("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  // Native open-file dialog (Electron only). The Browse button is disabled on
  // the web build, where users type a path instead.
  const electronAPI = (window as { electronAPI?: { invoke?: (c: string, ...a: unknown[]) => Promise<unknown> } }).electronAPI;
  async function handleBrowse() {
    if (!electronAPI?.invoke) return;
    const extensions =
      engine === "sqlite" ? ["db", "sqlite", "sqlite3"] : ["duckdb", "db"];
    const picked = await electronAPI.invoke("dialog:open", {
      title: "Select database file",
      filters: [
        { name: "Database", extensions },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (typeof picked === "string") setFilePath(picked);
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
      const payload = {
        name: name.trim() || `my-${engine}`,
        engine,
        url,
        username: user.trim(),
        password: pass,
        database: isServer ? database.trim() : "",
        filePath: isServer ? undefined : resolvedFile,
      };

      if (editing) {
        const ok = await updateConnectionById(editing.id, payload);
        if (ok) {
          // Drop the pooled adapter — it was opened with the old config and
          // would otherwise keep serving it (e.g. the old database) until the
          // idle timeout. Reconnect picks up the new settings.
          void disconnectConnection(editing.id);
          toast.success(`Connection "${payload.name}" updated`);
          handleOpenChange(false);
        } else {
          toast.error("Failed to update connection");
        }
      } else {
        const created = await saveConnection(payload);
        if (created) {
          toast.success(`Connection "${created.name}" saved`);
          handleOpenChange(false);
        } else {
          toast.error("Failed to save connection");
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit connection" : "New connection"}</DialogTitle>
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
              {engine !== "clickhouse" && (
                <div className="space-y-1.5">
                  <Label htmlFor="db">Database</Label>
                  <Input
                    id="db"
                    placeholder={engine === "postgres" ? "postgres" : "mysql"}
                    value={database}
                    onChange={(e) => setDatabase(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Database to connect to. Leave empty to use the driver
                    default — your tables may live in a different database.
                  </p>
                </div>
              )}
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
                  onClick={handleBrowse}
                  disabled={!electronAPI?.invoke}
                  title={
                    electronAPI?.invoke
                      ? "Browse for a database file"
                      : "Native file picker is desktop-only — type a path on web"
                  }
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
              {submitting ? "Saving…" : editing ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
