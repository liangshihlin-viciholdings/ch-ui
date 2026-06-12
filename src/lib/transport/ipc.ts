// IPC transport — calls routed over Electron contextBridge/IPC.
// Only used when running inside Electron (window.electronAPI exists).

import type {
  ConnectionConfig,
  AdapterQueryResult,
  ColumnMeta,
  DatabaseInfo,
  SchemaInfo,
  TableInfo,
} from "@/lib/db-adapter/types";
import type { AdapterTransport } from "./types";

type ElectronAPI = {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
};

function getAPI(): ElectronAPI {
  const api = (window as any).electronAPI;
  if (!api) {
    throw new Error("Electron API not available");
  }
  return api as ElectronAPI;
}

export class IPCTransport implements AdapterTransport {
  async connect(config: ConnectionConfig): Promise<void> {
    await getAPI().invoke("adapter:connect", config);
  }

  async disconnect(): Promise<void> {
    await getAPI().invoke("adapter:disconnect");
  }

  async ping(): Promise<boolean> {
    return (await getAPI().invoke("adapter:ping")) as Promise<boolean>;
  }

  async getVersion(): Promise<string> {
    return (await getAPI().invoke("adapter:getVersion")) as Promise<string>;
  }

  async query(
    sql: string,
    params?: Record<string, string>,
    cancelToken?: string,
  ): Promise<AdapterQueryResult> {
    return (await getAPI().invoke(
      "adapter:query",
      sql,
      params,
      cancelToken,
    )) as Promise<AdapterQueryResult>;
  }

  async command(sql: string, cancelToken?: string): Promise<void> {
    await getAPI().invoke("adapter:command", sql, cancelToken);
  }

  async cancel(cancelToken: string): Promise<void> {
    await getAPI().invoke("adapter:cancel", cancelToken);
  }

  async listSchemas(): Promise<SchemaInfo[]> {
    return (await getAPI().invoke("adapter:listSchemas")) as Promise<SchemaInfo[]>;
  }

  async listTables(schema: string): Promise<TableInfo[]> {
    return (await getAPI().invoke("adapter:listTables", schema)) as Promise<TableInfo[]>;
  }

  async describeTable(schema: string, table: string): Promise<ColumnMeta[]> {
    return (await getAPI().invoke(
      "adapter:describeTable",
      schema,
      table,
    )) as Promise<ColumnMeta[]>;
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    return (await getAPI().invoke(
      "adapter:listDatabases",
    )) as Promise<DatabaseInfo[]>;
  }

  async checkIsAdmin(): Promise<boolean> {
    return (await getAPI().invoke("adapter:checkIsAdmin")) as Promise<boolean>;
  }

  async checkPrivileges(): Promise<Record<string, boolean>> {
    return (await getAPI().invoke(
      "adapter:checkPrivileges",
    )) as Promise<Record<string, boolean>>;
  }
}
