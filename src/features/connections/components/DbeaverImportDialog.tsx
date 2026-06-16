// src/features/connections/components/DbeaverImportDialog.tsx
// Wizard for migrating connections from a DBeaver workspace.
//
// Desktop: auto-detects DBeaver workspaces (or lets the user pick the
// data-sources.json); the Electron main process reads + decrypts.
// Web: the user uploads data-sources.json (+ optional credentials-config.json),
// parsed in the browser.
// Both paths produce a DbeaverParseResult that the user reviews before import.

import { useEffect, useState } from "react";
import {
  Database,
  FileJson,
  Loader2,
  HardDriveDownload,
  ShieldAlert,
  FolderTree,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { importFromDbeaver } from "@/stores/connectionStore";
import {
  isDesktop,
  detectDbeaverWorkspaces,
  readDbeaverWorkspace,
  pickDbeaverFile,
  parseUploadedDbeaver,
} from "@/lib/dbeaver/access";
import type {
  DbeaverParseResult,
  DbeaverWorkspaceInfo,
  ImportedConnection,
} from "@/lib/dbeaver";

interface DbeaverImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names of connections that already exist, to flag duplicates in the preview. */
  existingNames?: Set<string>;
}

type Step = "source" | "preview";

/** Short, readable target for a parsed connection. */
function connTarget(conn: ImportedConnection): string {
  if (conn.filePath) return conn.filePath;
  return conn.url || "—";
}

export default function DbeaverImportDialog({
  open,
  onOpenChange,
  existingNames,
}: DbeaverImportDialogProps) {
  const desktop = isDesktop();

  const [step, setStep] = useState<Step>("source");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);

  const [workspaces, setWorkspaces] = useState<DbeaverWorkspaceInfo[]>([]);
  const [result, setResult] = useState<DbeaverParseResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [skipExisting, setSkipExisting] = useState(true);
  const [importScripts, setImportScripts] = useState(true);

  // Web upload inputs
  const [dataSourcesFile, setDataSourcesFile] = useState<File | null>(null);
  const [credentialsFile, setCredentialsFile] = useState<File | null>(null);

  // Reset + (on desktop) auto-detect whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setStep("source");
    setResult(null);
    setSelected(new Set());
    setSkipExisting(true);
    setImportScripts(true);
    setDataSourcesFile(null);
    setCredentialsFile(null);
    if (desktop) {
      setBusy(true);
      detectDbeaverWorkspaces()
        .then(setWorkspaces)
        .catch(() => setWorkspaces([]))
        .finally(() => setBusy(false));
    } else {
      setWorkspaces([]);
    }
  }, [open, desktop]);

  function showResult(res: DbeaverParseResult) {
    setResult(res);
    setSelected(new Set(res.connections.map((c) => c.sourceId)));
    setStep("preview");
  }

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(
        "Could not read DBeaver config: " +
          (err instanceof Error ? err.message : "Unknown error"),
      );
    } finally {
      setBusy(false);
    }
  }

  const handlePickDetected = (ws: DbeaverWorkspaceInfo) =>
    withBusy(async () => {
      showResult(await readDbeaverWorkspace(ws.dataSourcesPath));
    });

  const handleBrowse = () =>
    withBusy(async () => {
      const path = await pickDbeaverFile();
      if (!path) return;
      showResult(await readDbeaverWorkspace(path));
    });

  const handleParseUpload = () =>
    withBusy(async () => {
      if (!dataSourcesFile) return;
      showResult(
        await parseUploadedDbeaver(dataSourcesFile, credentialsFile ?? undefined),
      );
    });

  const toggle = (sourceId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
  };

  const handleImport = async () => {
    if (!result) return;
    const chosen = result.connections.filter((c) => selected.has(c.sourceId));
    if (chosen.length === 0) {
      toast.error("Select at least one connection to import");
      return;
    }
    setImporting(true);
    try {
      const { success, failed, skipped, scriptsImported } =
        await importFromDbeaver(chosen, {
          skipExisting,
          scripts: importScripts ? result.scripts ?? [] : [],
        });
      if (success > 0 || scriptsImported > 0) {
        if (success > 0)
          toast.success(`Imported ${success} connection(s) from DBeaver`);
        if (scriptsImported > 0)
          toast.success(`Imported ${scriptsImported} saved query(ies)`);
        if (skipped > 0)
          toast.info(`${skipped} connection(s) already existed and were skipped`);
        if (failed > 0) toast.warning(`${failed} connection(s) failed to import`);
        onOpenChange(false);
      } else if (skipped > 0 && failed === 0) {
        toast.info(`All ${skipped} selected connection(s) already exist`);
        onOpenChange(false);
      } else {
        toast.error("No connections were imported");
      }
    } finally {
      setImporting(false);
    }
  };

  const selectedNeedingPassword =
    result?.connections.filter(
      (c) => selected.has(c.sourceId) && c.engine !== "sqlite" && c.engine !== "duckdb" && !c.hasPassword,
    ).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardDriveDownload className="h-5 w-5" />
            Migrate from DBeaver
          </DialogTitle>
          <DialogDescription>
            {step === "source"
              ? desktop
                ? "Pick a detected DBeaver workspace, or choose a data-sources.json file."
                : "Upload your DBeaver data-sources.json (and optionally credentials-config.json)."
              : "Review the connections to import."}
          </DialogDescription>
        </DialogHeader>

        {step === "source" && (
          <div className="space-y-4 pt-2 min-w-0">
            {desktop ? (
              <>
                {busy ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Looking for DBeaver workspaces…
                  </div>
                ) : workspaces.length > 0 ? (
                  <div className="space-y-2">
                    <Label>Detected workspaces</Label>
                    <div className="border rounded-md divide-y max-h-[220px] overflow-y-auto">
                      {workspaces.map((ws) => (
                        <button
                          key={ws.dataSourcesPath}
                          type="button"
                          onClick={() => void handlePickDetected(ws)}
                          className="flex w-full min-w-0 items-start gap-3 p-3 text-left hover:bg-accent transition-colors"
                        >
                          <Database className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">{ws.label}</div>
                            <div className="truncate text-xs text-muted-foreground font-mono">
                              {ws.dataSourcesPath}
                            </div>
                            {!ws.hasCredentials && (
                              <div className="text-xs text-amber-500">
                                No saved credentials file — passwords may be blank
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-2">
                    No DBeaver workspace found in the default locations.
                  </p>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void handleBrowse()}
                >
                  <FileJson className="h-4 w-4 mr-2" />
                  Choose data-sources.json…
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="dbeaver-datasources">data-sources.json (required)</Label>
                  <input
                    id="dbeaver-datasources"
                    type="file"
                    accept=".json"
                    onChange={(e) => setDataSourcesFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dbeaver-credentials">
                    credentials-config.json (optional, for passwords)
                  </Label>
                  <input
                    id="dbeaver-credentials"
                    type="file"
                    accept=".json"
                    onChange={(e) => setCredentialsFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={busy || !dataSourcesFile}
                  onClick={() => void handleParseUpload()}
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Reading…
                    </>
                  ) : (
                    <>
                      <FileJson className="h-4 w-4 mr-2" />
                      Continue
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        )}

        {step === "preview" && result && (
          <div className="space-y-4 pt-2 min-w-0">
            {result.connections.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No importable connections found in this workspace.
              </p>
            ) : (
              <>
                <div className="border rounded-md divide-y max-h-[260px] overflow-y-auto">
                  {result.connections.map((conn) => {
                    const isDup = existingNames?.has(conn.name) ?? false;
                    return (
                      <div
                        key={conn.sourceId}
                        className="flex items-start gap-3 p-3"
                      >
                        <Checkbox
                          checked={selected.has(conn.sourceId)}
                          onCheckedChange={() => toggle(conn.sourceId)}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {conn.folderPath && (
                              <FolderTree className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span className="font-medium truncate">{conn.name}</span>
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                              {conn.engine}
                            </span>
                          </div>
                          <div className="truncate text-xs text-muted-foreground font-mono">
                            {conn.username ? `${conn.username}@` : ""}
                            {connTarget(conn)}
                          </div>
                          <div className="flex gap-3 text-[11px]">
                            {conn.engine !== "sqlite" && conn.engine !== "duckdb" && (
                              <span
                                className={
                                  conn.hasPassword
                                    ? "text-emerald-500"
                                    : "text-amber-500"
                                }
                              >
                                {conn.hasPassword ? "password recovered" : "no password"}
                              </span>
                            )}
                            {isDup && (
                              <span className="text-muted-foreground">
                                already exists
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {result.skipped.length > 0 && (
                  <Alert variant="default">
                    <ShieldAlert className="h-4 w-4" />
                    <AlertTitle>
                      {result.skipped.length} connection(s) skipped
                    </AlertTitle>
                    <AlertDescription>
                      Unsupported engine(s):{" "}
                      {Array.from(
                        new Set(result.skipped.map((s) => s.driver)),
                      ).join(", ")}
                    </AlertDescription>
                  </Alert>
                )}

                {selectedNeedingPassword > 0 && (
                  <Alert variant="default">
                    <ShieldAlert className="h-4 w-4" />
                    <AlertTitle>Passwords needed</AlertTitle>
                    <AlertDescription>
                      {selectedNeedingPassword} selected connection(s) have no
                      recoverable password. You can enter it after import.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="dbeaver-skip-existing"
                    checked={skipExisting}
                    onCheckedChange={(c) => setSkipExisting(c === true)}
                  />
                  <Label htmlFor="dbeaver-skip-existing" className="cursor-pointer">
                    Skip connections that already exist (by name)
                  </Label>
                </div>

                {(result.scripts?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="dbeaver-import-scripts"
                      checked={importScripts}
                      onCheckedChange={(c) => setImportScripts(c === true)}
                    />
                    <Label
                      htmlFor="dbeaver-import-scripts"
                      className="cursor-pointer"
                    >
                      Also import {result.scripts?.length} SQL script(s) as saved
                      queries
                    </Label>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setStep("source")}
                    disabled={importing}
                  >
                    Back
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => void handleImport()}
                    disabled={importing || selected.size === 0}
                  >
                    {importing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Importing…
                      </>
                    ) : (
                      <>
                        <HardDriveDownload className="h-4 w-4 mr-2" />
                        Import {selected.size} connection(s)
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
