// In-process transport — direct calls to a DbAdapter in the same JS context.
// Used by the web build and as the fallback when not running in Electron.

import type { DbAdapter, AdapterCapabilities, AdminUser, AdminRole, AdminGrant, AdminRowPolicy } from "@/lib/db-adapter/types";
import type { AdapterTransport } from "./types";

// Cancellation registry — maps cancelTokens to AbortControllers.
const abortControllers = new Map<string, AbortController>();

function getSignal(token?: string): AbortSignal | undefined {
  if (!token) return undefined;
  const controller = new AbortController();
  abortControllers.set(token, controller);
  return controller.signal;
}

export class InProcessTransport implements AdapterTransport {
  private adapter: DbAdapter;

  constructor(adapter: DbAdapter) {
    this.adapter = adapter;
  }

  async connect(config: Parameters<DbAdapter["connect"]>[0]): Promise<void> {
    return this.adapter.connect(config);
  }

  async disconnect(): Promise<void> {
    return this.adapter.disconnect();
  }

  async ping(): Promise<boolean> {
    return this.adapter.ping();
  }

  async getVersion(): Promise<string> {
    return this.adapter.getVersion();
  }

  async query(
    sql: string,
    params?: Record<string, string>,
    cancelToken?: string,
  ) {
    try {
      return await this.adapter.query(sql, params, getSignal(cancelToken));
    } finally {
      if (cancelToken) abortControllers.delete(cancelToken);
    }
  }

  async command(sql: string, cancelToken?: string): Promise<void> {
    try {
      return await this.adapter.command(sql, getSignal(cancelToken));
    } finally {
      if (cancelToken) abortControllers.delete(cancelToken);
    }
  }

  async cancel(cancelToken: string): Promise<void> {
    const controller = abortControllers.get(cancelToken);
    if (controller) {
      controller.abort();
      abortControllers.delete(cancelToken);
    }
  }

  async listSchemas() {
    return this.adapter.listSchemas();
  }

  async listTables(schema: string) {
    return this.adapter.listTables(schema);
  }

  async describeTable(schema: string, table: string) {
    return this.adapter.describeTable(schema, table);
  }

  async listDatabases() {
    if ("listDatabases" in this.adapter) {
      return (this.adapter as any).listDatabases();
    }
    // Fallback: listSchemas → return empty
    const schemas = await this.adapter.listSchemas();
    return schemas.map((s) => ({ name: s.name, tables: [] }));
  }

  async checkIsAdmin(): Promise<boolean> {
    if (this.adapter.checkIsAdmin) {
      return this.adapter.checkIsAdmin();
    }
    return false;
  }

  async checkPrivileges(): Promise<Record<string, boolean>> {
    if (this.adapter.checkPrivileges) {
      return this.adapter.checkPrivileges();
    }
    return {};
  }

  async getCapabilities(): Promise<AdapterCapabilities> {
    return this.adapter.capabilities;
  }

  async listUsers(): Promise<AdminUser[]> {
    if (this.adapter.listUsers) return this.adapter.listUsers();
    return [];
  }

  async listRoles(): Promise<AdminRole[]> {
    if (this.adapter.listRoles) return this.adapter.listRoles();
    return [];
  }

  async listGrants(): Promise<AdminGrant[]> {
    if (this.adapter.listGrants) return this.adapter.listGrants();
    return [];
  }

  async listRowPolicies(): Promise<AdminRowPolicy[]> {
    if (this.adapter.listRowPolicies) return this.adapter.listRowPolicies();
    return [];
  }
}
