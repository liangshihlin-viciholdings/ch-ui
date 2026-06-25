// Streamed table export (Electron only).
//
// The renderer owns the ClickHouse connection, so it pulls the formatted byte
// stream from `client.exec(... FORMAT ...)` and forwards each chunk to the main
// process, which appends it to a user-chosen file. Memory stays bounded
// regardless of table size.
import type { ClickHouseClient } from "@clickhouse/client-web";

export type ExportFormat = "csv" | "tsv" | "json" | "parquet";
export type ExportScope = "limited" | "all";

interface FormatSpec {
  /** ClickHouse FORMAT clause value. */
  chFormat: string;
  extension: string;
  /** Save-dialog filter label. */
  filterName: string;
}

const FORMAT_SPECS: Record<ExportFormat, FormatSpec> = {
  csv: { chFormat: "CSVWithNames", extension: "csv", filterName: "CSV" },
  tsv: { chFormat: "TSVWithNames", extension: "tsv", filterName: "TSV" },
  // Newline-delimited JSON streams row-by-row, unlike a single JSON array.
  json: { chFormat: "JSONEachRow", extension: "jsonl", filterName: "JSON Lines" },
  parquet: { chFormat: "Parquet", extension: "parquet", filterName: "Parquet" },
};

export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  csv: "CSV (.csv)",
  tsv: "TSV (.tsv)",
  json: "JSON Lines (.jsonl)",
  parquet: "Parquet (.parquet)",
};

/** The default per-statement preview limit, matching click-to-run. */
export const EXPORT_LIMIT = 1000;

export function isExportSupported(): boolean {
  return typeof window !== "undefined" && !!window.electronAPI;
}

export interface ExportTableParams {
  client: ClickHouseClient;
  database: string;
  table: string;
  format: ExportFormat;
  scope: ExportScope;
}

export interface ExportResult {
  cancelled: boolean;
  filePath?: string;
}

export async function exportTableToFile({
  client,
  database,
  table,
  format,
  scope,
}: ExportTableParams): Promise<ExportResult> {
  const api = window.electronAPI;
  if (!api) throw new Error("Export is only available in the desktop app");

  const spec = FORMAT_SPECS[format];
  const limitClause = scope === "limited" ? ` LIMIT ${EXPORT_LIMIT}` : "";
  const query = `SELECT * FROM \`${database}\`.\`${table}\`${limitClause} FORMAT ${spec.chFormat}`;

  const filePath = (await api.invoke("export:saveDialog", {
    defaultFileName: `${table}.${spec.extension}`,
    filters: [{ name: spec.filterName, extensions: [spec.extension] }],
  })) as string | null;

  if (!filePath) return { cancelled: true };

  const exportId = (await api.invoke("export:open", filePath)) as string;

  try {
    const { stream } = await client.exec({ query });
    const reader = (stream as ReadableStream<Uint8Array>).getReader();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) await api.invoke("export:write", exportId, value);
    }
    await api.invoke("export:close", exportId);
    return { cancelled: false, filePath };
  } catch (error) {
    await api.invoke("export:abort", exportId);
    throw error;
  }
}
