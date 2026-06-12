// IPC transport — calls routed over Electron contextBridge/IPC.
// Each call includes the connectionId so the main-process pool routes correctly.

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
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
};

function getAPI(): ElectronAPI {
  const api = (window as any).electronAPI;
  if (!api) {
    throw new Error("Electron API not available");
  }
  return api as ElectronAPI;
}

export class IPCTransport implements AdapterTransport {
  private connectionId: string;

  constructor(connectionId: string) {
    this.connectionId = connectionId;
  }

  /** Update the connectionId (e.g. when switching active connection). */
  setConnectionId(id: string): void {
    this.connectionId = id;
  }

  async connect(config: ConnectionConfig): Promise<void> {
    await getAPI().invoke("adapter:connect", this.connectionId, config);
  }

  async disconnect(): Promise<void> {
    await getAPI().invoke("adapter:disconnect", this.connectionId);
  }

  async ping(): Promise<boolean> {
    return (await getAPI().invoke(
      "adapter:ping",
      this.connectionId,
    )) as Promise<boolean>;
  }

  async getVersion(): Promise<string> {
    return (await getAPI().invoke(
      "adapter:getVersion",
      this.connectionId,
    )) as Promise<string>;
  }

  async query(
    sql: string,
    params?: Record<string, string>,
    cancelToken?: string,
  ): Promise<AdapterQueryResult> {
    return (await getAPI().invoke(
      "adapter:query",
      this.connectionId,
      sql,
      params,
      cancelToken,
    )) as Promise<AdapterQueryResult>;
  }

  async command(sql: string, cancelToken?: string): Promise<void> {
    await getAPI().invoke(
      "adapter:command",
      this.connectionId,
      sql,
      cancelToken,
    );
  }

  async cancel(cancelToken: string): Promise<void> {
    await getAPI().invoke("adapter:cancel", cancelToken);
  }

  async listSchemas(): Promise<SchemaInfo[]> {
    return (await getAPI().invoke(
      "adapter:listSchemas",
      this.connectionId,
    )) as Promise<SchemaInfo[]>;
  }

  async listTables(schema: string): Promise<TableInfo[]> {
    return (await getAPI().invoke(
      "adapter:listTables",
      this.connectionId,
      schema,
    )) as Promise<TableInfo[]>;
  }

  async describeTable(schema: string, table: string): Promise<ColumnMeta[]> {
    return (await getAPI().invoke(
      "adapter:describeTable",
      this.connectionId,
      schema,
      table,
    )) as Promise<ColumnMeta[]>;
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    return (await getAPI().invoke(
      "adapter:listDatabases",
      this.connectionId,
    )) as Promise<DatabaseInfo[]>;
  }

  async checkIsAdmin(): Promise<boolean> {
    return (await getAPI().invoke(
      "adapter:checkIsAdmin",
      this.connectionId,
    )) as Promise<boolean>;
  }

  async checkPrivileges(): Promise<Record<string, boolean>> {
    return (await getAPI().invoke(
      "adapter:checkPrivileges",
      this.connectionId,
    )) as Promise<Record<string, boolean>>;
  }
}
