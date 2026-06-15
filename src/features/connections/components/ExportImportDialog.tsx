// src/features/connections/components/ExportImportDialog.tsx
// Dialog for exporting and importing connections

import { useEffect, useRef, useState } from "react";
import {
  Download,
  Upload,
  Loader2,
  FileJson,
  AlertTriangle,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { useConnectionStore } from "@/stores/connectionStore";
import { ConnectionDisplay } from "@/lib/db";

interface ExportImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connections: ConnectionDisplay[];
  /** Which tab to open on. Defaults to "export". */
  defaultTab?: "export" | "import";
}

/** Display host for a connection, tolerant of file engines / empty URLs. */
function connHost(conn: ConnectionDisplay): string {
  if (conn.filePath) return conn.filePath;
  try {
    return conn.url ? new URL(conn.url).host : "—";
  } catch {
    return conn.url || "—";
  }
}

export default function ExportImportDialog({
  open,
  onOpenChange,
  connections,
  defaultTab = "export",
}: ExportImportDialogProps) {
  const [activeTab, setActiveTab] = useState<"export" | "import">(defaultTab);

  // Re-sync the active tab whenever the dialog is (re)opened.
  useEffect(() => {
    if (open) setActiveTab(defaultTab);
  }, [open, defaultTab]);

  // Export state
  const [selectedConnections, setSelectedConnections] = useState<Set<string>>(
    new Set()
  );
  const [includePasswords, setIncludePasswords] = useState(false);
  const [includeSavedQueries, setIncludeSavedQueries] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { exportConnections, importConnections } = useConnectionStore();

  const handleSelectAll = () => {
    if (selectedConnections.size === connections.length) {
      setSelectedConnections(new Set());
    } else {
      setSelectedConnections(new Set(connections.map((c) => c.id)));
    }
  };

  const handleToggleConnection = (id: string) => {
    const newSelected = new Set(selectedConnections);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedConnections(newSelected);
  };

  const handleExport = async () => {
    if (selectedConnections.size === 0) {
      toast.error("Please select at least one connection to export");
      return;
    }

    setIsExporting(true);

    try {
      const blob = await exportConnections(
        Array.from(selectedConnections),
        includePasswords,
        includeSavedQueries
      );

      if (blob) {
        // Download the file
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ch-ui-connections-${new Date().toISOString().split("T")[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success("Connections exported successfully");
        onOpenChange(false);
      }
    } catch (err) {
      toast.error(
        "Export failed: " + (err instanceof Error ? err.message : "Unknown error")
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      toast.error("Please select a file to import");
      return;
    }

    setIsImporting(true);

    try {
      const { success, failed } = await importConnections(importFile);

      if (success > 0) {
        toast.success(`Imported ${success} connection(s)`);
        if (failed > 0) {
          toast.warning(`${failed} connection(s) failed to import`);
        }
        onOpenChange(false);
      } else if (failed > 0) {
        toast.error(`All ${failed} connection(s) failed to import`);
      } else {
        toast.error("No connections found in file");
      }
    } catch (err) {
      toast.error(
        "Import failed: " + (err instanceof Error ? err.message : "Unknown error")
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            Export / Import Connections
          </DialogTitle>
          <DialogDescription>
            Transfer your connections between devices
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "export" | "import")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="export">
              <Download className="h-4 w-4 mr-2" />
              Export
            </TabsTrigger>
            <TabsTrigger value="import">
              <Upload className="h-4 w-4 mr-2" />
              Import
            </TabsTrigger>
          </TabsList>

          <TabsContent value="export" className="space-y-4 pt-4">
            {connections.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                No connections to export
              </p>
            ) : (
              <>
                {/* Connection selection */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Select connections to export</Label>
                    <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                      {selectedConnections.size === connections.length
                        ? "Deselect All"
                        : "Select All"}
                    </Button>
                  </div>

                  <div className="border rounded-md max-h-[200px] overflow-y-auto">
                    {connections.map((conn) => (
                      <div
                        key={conn.id}
                        className="flex items-center gap-3 p-3 border-b last:border-b-0"
                      >
                        <Checkbox
                          checked={selectedConnections.has(conn.id)}
                          onCheckedChange={() => handleToggleConnection(conn.id)}
                        />
                        <div className="flex-1">
                          <span className="font-medium">{conn.name}</span>
                          <p className="text-xs text-muted-foreground font-mono">
                            {conn.username ? `${conn.username}@` : ""}
                            {connHost(conn)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Export options */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="include-passwords"
                      checked={includePasswords}
                      onCheckedChange={(checked) =>
                        setIncludePasswords(checked === true)
                      }
                    />
                    <Label htmlFor="include-passwords" className="cursor-pointer">
                      Include passwords
                    </Label>
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="include-saved-queries"
                      checked={includeSavedQueries}
                      onCheckedChange={(checked) =>
                        setIncludeSavedQueries(checked === true)
                      }
                    />
                    <Label htmlFor="include-saved-queries" className="cursor-pointer">
                      Include saved queries
                    </Label>
                  </div>

                  {includePasswords && (
                    <Alert variant="default">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Note</AlertTitle>
                      <AlertDescription>
                        Passwords will be included in the export file in plain text.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                <Button
                  className="w-full"
                  onClick={handleExport}
                  disabled={isExporting || selectedConnections.size === 0}
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Export {selectedConnections.size} Connection(s)
                    </>
                  )}
                </Button>
              </>
            )}
          </TabsContent>

          <TabsContent value="import" className="space-y-4 pt-4">
            <div className="space-y-3">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <FileJson className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  {importFile
                    ? importFile.name
                    : "Click to select a file or drag and drop"}
                </p>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handleImport}
              disabled={isImporting || !importFile}
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Connections
                </>
              )}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
