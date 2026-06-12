// IPC handler registration for Electron main process.
// Bridges renderer adapter:xxx IPC calls to the connection pool.

import { ipcMain } from "electron";
import type { ConnectionConfig } from "../src/lib/db-adapter/types";
import {
  getOrCreateAdapter,
  getAdapter,
  disconnectAdapter,
  disconnectAll,
} from "./connection-pool";

// Cancel token → AbortController mapping.
const cancelControllers = new Map<string, AbortController>();

function getSignal(cancelToken?: string): AbortSignal | undefined {
  if (!cancelToken) return undefined;
  const controller = new AbortController();
  cancelControllers.set(cancelToken, controller);
  return controller.signal;
}

export function registerAdapterIPC(): void {
  ipcMain.handle(
    "adapter:connect",
    async (_event, connectionId: string, config: ConnectionConfig) => {
      await getOrCreateAdapter(connectionId, config);
    },
  );

  ipcMain.handle(
    "adapter:disconnect",
    async (_event, connectionId: string) => {
      await disconnectAdapter(connectionId);
    },
  );

  ipcMain.handle("adapter:ping", async (_event, connectionId: string) => {
    const adapter = getAdapter(connectionId);
    if (!adapter) throw new Error(`No connection: ${connectionId}`);
    return adapter.ping();
  });

  ipcMain.handle(
    "adapter:getVersion",
    async (_event, connectionId: string) => {
      const adapter = getAdapter(connectionId);
      if (!adapter) throw new Error(`No connection: ${connectionId}`);
      return adapter.getVersion();
    },
  );

  ipcMain.handle(
    "adapter:query",
    async (
      _event,
      connectionId: string,
      sql: string,
      params?: Record<string, string>,
      cancelToken?: string,
    ) => {
      const adapter = getAdapter(connectionId);
      if (!adapter) throw new Error(`No connection: ${connectionId}`);
      return adapter.query(sql, params, getSignal(cancelToken));
    },
  );

  ipcMain.handle(
    "adapter:command",
    async (_event, connectionId: string, sql: string, cancelToken?: string) => {
      const adapter = getAdapter(connectionId);
      if (!adapter) throw new Error(`No connection: ${connectionId}`);
      return adapter.command(sql, getSignal(cancelToken));
    },
  );

  ipcMain.handle("adapter:cancel", async (_event, cancelToken: string) => {
    const controller = cancelControllers.get(cancelToken);
    if (controller) {
      controller.abort();
      cancelControllers.delete(cancelToken);
    }
  });

  ipcMain.handle(
    "adapter:listSchemas",
    async (_event, connectionId: string) => {
      const adapter = getAdapter(connectionId);
      if (!adapter) throw new Error(`No connection: ${connectionId}`);
      return adapter.listSchemas();
    },
  );

  ipcMain.handle(
    "adapter:listTables",
    async (_event, connectionId: string, schema: string) => {
      const adapter = getAdapter(connectionId);
      if (!adapter) throw new Error(`No connection: ${connectionId}`);
      return adapter.listTables(schema);
    },
  );

  ipcMain.handle(
    "adapter:describeTable",
    async (_event, connectionId: string, schema: string, table: string) => {
      const adapter = getAdapter(connectionId);
      if (!adapter) throw new Error(`No connection: ${connectionId}`);
      return adapter.describeTable(schema, table);
    },
  );

  ipcMain.handle(
    "adapter:listDatabases",
    async (_event, connectionId: string) => {
      const adapter = getAdapter(connectionId) as any;
      if (!adapter) throw new Error(`No connection: ${connectionId}`);
      if (adapter.listDatabases) return adapter.listDatabases();
      const schemas = await adapter.listSchemas();
      return schemas.map((s: { name: string }) => ({
        name: s.name,
        tables: [],
      }));
    },
  );

  ipcMain.handle(
    "adapter:checkIsAdmin",
    async (_event, connectionId: string) => {
      const adapter = getAdapter(connectionId);
      if (!adapter || !adapter.checkIsAdmin) return false;
      return adapter.checkIsAdmin();
    },
  );

  ipcMain.handle(
    "adapter:checkPrivileges",
    async (_event, connectionId: string) => {
      const adapter = getAdapter(connectionId);
      if (!adapter || !adapter.checkPrivileges) return {};
      return adapter.checkPrivileges();
    },
  );
}

// Clean up all connections on quit.
import { app } from "electron";
app.on("before-quit", () => {
  disconnectAll();
});
