// IPC handler registration for Electron main process.
// Bridges renderer adapter:xxx IPC calls to actual DbAdapter instances.

import { ipcMain } from "electron";
import type { DbAdapter, ConnectionConfig } from "../src/lib/db-adapter/types";
import { ClickHouseAdapter } from "../src/lib/db-adapter";

// Connection pool keyed by connectionId.
const pool = new Map<string, DbAdapter>();

// Cancel token → AbortController mapping.
const cancelControllers = new Map<string, AbortController>();

function getSignal(cancelToken?: string): AbortSignal | undefined {
  if (!cancelToken) return undefined;
  const controller = new AbortController();
  cancelControllers.set(cancelToken, controller);
  return controller.signal;
}

function getAdapter(): DbAdapter {
  // For now, single-connection — use the first adapter in the pool.
  const adapter = pool.values().next().value;
  if (!adapter) throw new Error("No active connection");
  return adapter;
}

export function registerAdapterIPC(): void {
  ipcMain.handle("adapter:connect", async (_event, config: ConnectionConfig) => {
    const adapter = new ClickHouseAdapter();
    await adapter.connect(config);
    pool.set("default", adapter);
  });

  ipcMain.handle("adapter:disconnect", async () => {
    const adapter = pool.get("default");
    if (adapter) {
      await adapter.disconnect();
      pool.delete("default");
    }
  });

  ipcMain.handle("adapter:ping", async () => {
    return getAdapter().ping();
  });

  ipcMain.handle("adapter:getVersion", async () => {
    return getAdapter().getVersion();
  });

  ipcMain.handle("adapter:query", async (_event, sql: string, params?: Record<string, string>, cancelToken?: string) => {
    return getAdapter().query(sql, params, getSignal(cancelToken));
  });

  ipcMain.handle("adapter:command", async (_event, sql: string, cancelToken?: string) => {
    return getAdapter().command(sql, getSignal(cancelToken));
  });

  ipcMain.handle("adapter:cancel", async (_event, cancelToken: string) => {
    const controller = cancelControllers.get(cancelToken);
    if (controller) {
      controller.abort();
      cancelControllers.delete(cancelToken);
    }
  });

  ipcMain.handle("adapter:listSchemas", async () => {
    return getAdapter().listSchemas();
  });

  ipcMain.handle("adapter:listTables", async (_event, schema: string) => {
    return getAdapter().listTables(schema);
  });

  ipcMain.handle("adapter:describeTable", async (_event, schema: string, table: string) => {
    return getAdapter().describeTable(schema, table);
  });

  ipcMain.handle("adapter:listDatabases", async () => {
    const adapter = getAdapter() as any;
    if (adapter.listDatabases) return adapter.listDatabases();
    const schemas = await getAdapter().listSchemas();
    return schemas.map((s) => ({ name: s.name, tables: [] }));
  });

  ipcMain.handle("adapter:checkIsAdmin", async () => {
    const adapter = getAdapter();
    if (adapter.checkIsAdmin) return adapter.checkIsAdmin();
    return false;
  });

  ipcMain.handle("adapter:checkPrivileges", async () => {
    const adapter = getAdapter();
    if (adapter.checkPrivileges) return adapter.checkPrivileges();
    return {};
  });
}
