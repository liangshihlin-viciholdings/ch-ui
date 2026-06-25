// Streamed table-export IPC.
//
// The renderer owns the ClickHouse (client-web) connection, so the formatted
// bytes originate there. To keep memory bounded for large tables we stream:
// the renderer pulls chunks from `client.exec(... FORMAT ...)` and forwards
// each chunk over IPC; the main process appends them to a file handle opened
// against a user-chosen path. This avoids buffering the whole export in the
// renderer.
import { BrowserWindow, dialog, ipcMain } from "electron";
import { createWriteStream, unlink, type WriteStream } from "node:fs";
import { randomUUID } from "node:crypto";

interface OpenExport {
  stream: WriteStream;
  filePath: string;
}

const exports = new Map<string, OpenExport>();

function waitForDrain(stream: WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.once("drain", resolve);
    stream.once("error", reject);
  });
}

export function registerExportIPC(): void {
  // Ask the user where to save. Returns the chosen path, or null if cancelled.
  ipcMain.handle(
    "export:saveDialog",
    async (
      _event,
      opts: {
        defaultFileName?: string;
        filters?: { name: string; extensions: string[] }[];
      },
    ): Promise<string | null> => {
      const options: Electron.SaveDialogOptions = {
        title: "Export table",
        defaultPath: opts.defaultFileName,
        filters: opts.filters,
      };
      const win = BrowserWindow.getFocusedWindow();
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);
      return result.canceled || !result.filePath ? null : result.filePath;
    },
  );

  // Open a write stream against the chosen path. Returns a handle id.
  ipcMain.handle(
    "export:open",
    async (_event, filePath: string): Promise<string> => {
      const id = randomUUID();
      const stream = createWriteStream(filePath);
      await new Promise<void>((resolve, reject) => {
        stream.once("open", () => resolve());
        stream.once("error", reject);
      });
      exports.set(id, { stream, filePath });
      return id;
    },
  );

  // Append a chunk, honoring backpressure.
  ipcMain.handle(
    "export:write",
    async (_event, id: string, chunk: Uint8Array): Promise<void> => {
      const entry = exports.get(id);
      if (!entry) throw new Error(`No open export: ${id}`);
      const ok = entry.stream.write(Buffer.from(chunk));
      if (!ok) await waitForDrain(entry.stream);
    },
  );

  // Flush and close the file.
  ipcMain.handle("export:close", async (_event, id: string): Promise<void> => {
    const entry = exports.get(id);
    if (!entry) return;
    exports.delete(id);
    await new Promise<void>((resolve, reject) => {
      entry.stream.end((err?: Error | null) =>
        err ? reject(err) : resolve(),
      );
    });
  });

  // Abort: destroy the stream and remove the partial file.
  ipcMain.handle("export:abort", async (_event, id: string): Promise<void> => {
    const entry = exports.get(id);
    if (!entry) return;
    exports.delete(id);
    entry.stream.destroy();
    await new Promise<void>((resolve) =>
      unlink(entry.filePath, () => resolve()),
    );
  });
}
