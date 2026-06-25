import React, { useEffect, useState } from "react";
import type { ClickHouseClient } from "@clickhouse/client-web";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatNumber } from "@/lib/utils";
import {
  EXPORT_FORMAT_LABELS,
  EXPORT_LIMIT,
  exportTableToFile,
  type ExportFormat,
  type ExportScope,
} from "@/features/explorer/utils/exportTable";

interface ExportTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  database: string;
  table: string;
  client: ClickHouseClient | null;
}

// Above this, warn the user that an "entire table" export may be large/slow.
const LARGE_ROW_THRESHOLD = 1_000_000;

const ExportTableDialog: React.FC<ExportTableDialogProps> = ({
  open,
  onOpenChange,
  database,
  table,
  client,
}) => {
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [scope, setScope] = useState<ExportScope>("all");
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Fetch an instant row estimate when the dialog opens (for the size warning).
  useEffect(() => {
    if (!open || !client) return;
    let cancelled = false;
    (async () => {
      try {
        const rs = await client.query({
          query: `SELECT total_rows FROM system.tables WHERE database = '${database}' AND name = '${table}'`,
          format: "JSONEachRow",
        });
        const rows = (await rs.json()) as { total_rows: string | null }[];
        const raw = rows[0]?.total_rows;
        if (!cancelled) setRowCount(raw == null ? null : Number(raw));
      } catch {
        if (!cancelled) setRowCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, client, database, table]);

  const showLargeWarning =
    scope === "all" && rowCount !== null && rowCount > LARGE_ROW_THRESHOLD;

  const handleExport = async () => {
    if (!client) {
      toast.error("No active connection");
      return;
    }
    setIsExporting(true);
    try {
      const result = await exportTableToFile({
        client,
        database,
        table,
        format,
        scope,
      });
      if (!result.cancelled) {
        toast.success(`Exported ${table} to ${result.filePath}`);
        onOpenChange(false);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : `Failed to export ${table}`,
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !isExporting && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export {table}</DialogTitle>
          <DialogDescription>
            Streamed directly to a file — safe for large tables.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Format</Label>
            <RadioGroup
              value={format}
              onValueChange={(v) => setFormat(v as ExportFormat)}
              className="grid grid-cols-2 gap-2"
            >
              {(
                Object.keys(EXPORT_FORMAT_LABELS) as ExportFormat[]
              ).map((f) => (
                <div key={f} className="flex items-center space-x-2">
                  <RadioGroupItem value={f} id={`fmt-${f}`} />
                  <Label htmlFor={`fmt-${f}`} className="text-sm font-normal">
                    {EXPORT_FORMAT_LABELS[f]}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Rows</Label>
            <RadioGroup
              value={scope}
              onValueChange={(v) => setScope(v as ExportScope)}
              className="space-y-1"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="scope-all" />
                <Label htmlFor="scope-all" className="text-sm font-normal">
                  Entire table
                  {rowCount !== null && (
                    <span className="text-muted-foreground">
                      {" "}
                      (≈ {formatNumber(rowCount)} rows)
                    </span>
                  )}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="limited" id="scope-limited" />
                <Label htmlFor="scope-limited" className="text-sm font-normal">
                  First {formatNumber(EXPORT_LIMIT)} rows
                </Label>
              </div>
            </RadioGroup>
          </div>

          {showLargeWarning && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This table has roughly {formatNumber(rowCount!)} rows. The export
                may take a while.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportTableDialog;
