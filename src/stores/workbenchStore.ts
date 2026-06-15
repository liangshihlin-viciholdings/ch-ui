import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import { liveQuery } from "dexie";
import { toast } from "sonner";

import type {
  Engine,
  SavedConnection,
} from "@/lib/db/schema";
import { db } from "@/lib/db";
import type {
  ConnectionConfig,
  ServerConnectionConfig,
  FileConnectionConfig,
  AdapterQueryResult,
  AdapterCapabilities,
  SchemaInfo,
  TableInfo,
  ColumnMeta,
  AdminUser,
  AdminRole,
  AdminGrant,
  AdminRowPolicy,
} from "@/lib/db-adapter/types";
import { getTransport } from "@/lib/transport";
import { getDialect } from "@/lib/db-adapter/dialects";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ConnectionStatus = "connected" | "idle" | "disconnected";

export interface WorkbenchTab {
  id: string;
  title: string;
  connectionId: string;
  sql: string;
  dirty?: boolean;
}

interface SchemaCache {
  schemas: SchemaInfo[];
  tables: Record<string, TableInfo[]>;
  columns: Record<string, ColumnMeta[]>;
}

interface AdminCache {
  users: AdminUser[];
  roles: AdminRole[];
  grants: AdminGrant[];
  rowPolicies: AdminRowPolicy[];
}

interface WorkbenchState {
  connections: SavedConnection[];
  activeConnectionId: string | null;
  statuses: Record<string, ConnectionStatus>;
  capabilities: Record<string, AdapterCapabilities>;
  admin: Record<string, AdminCache>;
  adminView: boolean;
  tabs: WorkbenchTab[];
  activeTabId: string | null;
  schemas: Record<string, SchemaCache>;
  results: Record<string, AdapterQueryResult | null>;
  executing: Record<string, boolean>;
  error: string;
}

const initialState: WorkbenchState = {
  connections: [],
  activeConnectionId: null,
  statuses: {},
  capabilities: {},
  admin: {},
  adminView: false,
  tabs: [],
  activeTabId: null,
  schemas: {},
  results: {},
  executing: {},
  error: "",
};

const store = new Store<WorkbenchState>(initialState);

// ─── Helpers ────────────────────────────────────────────────────────────────

function patch(partial: Partial<WorkbenchState>): void {
  store.setState((prev) => ({ ...prev, ...partial }));
}

function uid(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function resolvePassword(conn: SavedConnection): Promise<string> {
  const electronAPI = (window as any).electronAPI;
  if (electronAPI?.invoke) {
    try {
      const stored = await electronAPI.invoke("secrets:retrieve", conn.id);
      if (stored) return stored as string;
    } catch {
      // fall through
    }
  }
  return conn.password ?? "";
}

function toConnectionConfig(
  conn: SavedConnection,
  password: string,
): ConnectionConfig {
  const engineMeta = getEngineKind(conn.engine);
  if (engineMeta === "server") {
    const [host, portStr] = splitHostPort(conn.url);
    // ClickHouse connects via an HTTP(S) URL, so it needs the scheme; the
    // Postgres/MySQL adapters take a bare host. Preserve the original scheme
    // (default http) only for ClickHouse.
    const resolvedHost =
      conn.engine === "clickhouse" ? `${schemeOf(conn.url)}${host}` : host;
    const config: ServerConnectionConfig = {
      kind: "server",
      engine: conn.engine,
      host: resolvedHost,
      port: portStr ? parseInt(portStr, 10) : defaultPort(conn.engine),
      username: conn.username,
      password,
      requestTimeout: conn.requestTimeout || 30000,
    };
    return config;
  }
  const fileConfig: FileConnectionConfig = {
    kind: "file",
    engine: conn.engine,
    filePath: conn.filePath ?? ":memory:",
    memory: !conn.filePath,
  };
  return fileConfig;
}

function getEngineKind(engine: Engine): "server" | "file" {
  return engine === "sqlite" || engine === "duckdb" ? "file" : "server";
}

function splitHostPort(url: string): [string, string | undefined] {
  const cleaned = url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const idx = cleaned.lastIndexOf(":");
  if (idx > 0 && /^\d+$/.test(cleaned.slice(idx + 1))) {
    return [cleaned.slice(0, idx), cleaned.slice(idx + 1)];
  }
  return [cleaned, undefined];
}

/** Extract the URL scheme (e.g. "http://") from a stored URL, defaulting to http. */
function schemeOf(url: string): string {
  const match = url.match(/^(https?):\/\//i);
  return match ? `${match[1].toLowerCase()}://` : "http://";
}

function defaultPort(engine: Engine): number {
  switch (engine) {
    case "clickhouse":
      return 8443;
    case "postgres":
      return 5432;
    case "mysql":
      return 3306;
    default:
      return 0;
  }
}

// ─── Actions ────────────────────────────────────────────────────────────────

/**
 * Apply a fresh connection list to the store while preserving the user's
 * current active connection. The active id is only (re)chosen when the
 * current one is missing (initial load, or the active connection was
 * deleted) — preferring the default connection, then the first one. This
 * avoids the old behaviour of resetting the active connection to conns[0]
 * on every refresh.
 */
function applyConnections(conns: SavedConnection[]): void {
  const current = store.state.activeConnectionId;
  const stillExists = current != null && conns.some((c) => c.id === current);
  patch({
    connections: conns,
    activeConnectionId: stillExists
      ? current
      : (conns.find((c) => c.isDefault)?.id ?? conns[0]?.id ?? null),
  });
}

export async function loadConnections(): Promise<void> {
  try {
    applyConnections(await db.connections.toArray());
  } catch (error) {
    patch({ error: `Failed to load connections: ${String(error)}` });
  }
}

// Keep the workbench connection list in sync with the shared Dexie table,
// regardless of which store/route performs the write (the workbench "+"
// dialog, the Settings ConnectionManager, or import). This is what makes a
// newly added connection appear in the sidebar immediately without a reload.
try {
  liveQuery(() => db.connections.toArray()).subscribe({
    next: (conns) => applyConnections(conns),
    error: () => {
      /* observable errors are non-fatal; explicit loadConnections() remains */
    },
  });
} catch {
  // Environments without IndexedDB (e.g. unit tests) simply skip live sync.
}

export async function connectConnection(connectionId: string): Promise<void> {
  const conn = store.state.connections.find((c) => c.id === connectionId);
  if (!conn) return;

  const password = await resolvePassword(conn);
  const config = toConnectionConfig(conn, password);
  const transport = getTransport(connectionId);

  try {
    await transport.connect(config);
    patch({
      statuses: { ...store.state.statuses, [connectionId]: "connected" },
    });
    await loadSchema(connectionId);
    await loadCapabilities(connectionId);
  } catch (error) {
    toast.error(`Connection failed: ${String(error)}`);
    patch({
      statuses: { ...store.state.statuses, [connectionId]: "disconnected" },
      error: String(error),
    });
  }
}

export async function disconnectConnection(connectionId: string): Promise<void> {
  const transport = getTransport(connectionId);
  try {
    await transport.disconnect();
  } catch {
    // best-effort
  }
  patch({
    statuses: { ...store.state.statuses, [connectionId]: "disconnected" },
  });
}

export function selectConnection(connectionId: string): void {
  patch({ activeConnectionId: connectionId });
}

export async function loadSchema(connectionId: string): Promise<void> {
  const transport = getTransport(connectionId);
  try {
    const schemas = await transport.listSchemas();
    const tablesBySchema: Record<string, TableInfo[]> = {};
    for (const s of schemas) {
      tablesBySchema[s.name] = await transport.listTables(s.name);
    }
    patch({
      schemas: {
        ...store.state.schemas,
        [connectionId]: {
          schemas,
          tables: tablesBySchema,
          columns: {},
        },
      },
    });
  } catch (error) {
    toast.error(`Schema load failed: ${String(error)}`);
  }
}

export async function expandTable(
  connectionId: string,
  schema: string,
  table: string,
): Promise<void> {
  const cache = store.state.schemas[connectionId];
  if (!cache) return;
  const key = `${schema}.${table}`;
  if (cache.columns[key]) return;

  const transport = getTransport(connectionId);
  try {
    const cols = await transport.describeTable(schema, table);
    patch({
      schemas: {
        ...store.state.schemas,
        [connectionId]: {
          ...cache,
          columns: { ...cache.columns, [key]: cols },
        },
      },
    });
  } catch (error) {
    toast.error(`Failed to describe ${table}: ${String(error)}`);
  }
}

export async function loadCapabilities(connectionId: string): Promise<void> {
  const transport = getTransport(connectionId);
  if (!transport.getCapabilities) return;
  try {
    const caps = await transport.getCapabilities();
    patch({
      capabilities: { ...store.state.capabilities, [connectionId]: caps },
    });
  } catch {
    // capabilities optional
  }
}

export async function loadAdmin(connectionId: string): Promise<void> {
  const transport = getTransport(connectionId);
  const caps = store.state.capabilities[connectionId]?.admin;
  if (!caps) return;

  const [users, roles, grants, rowPolicies] = await Promise.all([
    caps.users && transport.listUsers ? transport.listUsers() : Promise.resolve([]),
    caps.roles && transport.listRoles ? transport.listRoles() : Promise.resolve([]),
    caps.grants && transport.listGrants ? transport.listGrants() : Promise.resolve([]),
    caps.rowPolicies && transport.listRowPolicies
      ? transport.listRowPolicies()
      : Promise.resolve([]),
  ]);

  patch({
    admin: {
      ...store.state.admin,
      [connectionId]: { users, roles, grants, rowPolicies },
    },
  });
}

export function setAdminView(enabled: boolean): void {
  patch({ adminView: enabled });
}

export function openTab(
  connectionId: string,
  opts?: { title?: string; sql?: string },
): string {
  const tab: WorkbenchTab = {
    id: uid(),
    title: opts?.title ?? "Query",
    connectionId,
    sql: opts?.sql ?? "",
  };
  patch({
    tabs: [...store.state.tabs, tab],
    activeTabId: tab.id,
    activeConnectionId: connectionId,
  });
  return tab.id;
}

export function closeTab(tabId: string): void {
  const tabs = store.state.tabs.filter((t) => t.id !== tabId);
  const activeTabId =
    store.state.activeTabId === tabId
      ? (tabs[tabs.length - 1]?.id ?? null)
      : store.state.activeTabId;
  const { [tabId]: _r, ...results } = store.state.results;
  const { [tabId]: _e, ...executing } = store.state.executing;
  patch({ tabs, activeTabId, results, executing });
}

export function setActiveTab(tabId: string): void {
  const tab = store.state.tabs.find((t) => t.id === tabId);
  patch({
    activeTabId: tabId,
    activeConnectionId: tab?.connectionId ?? store.state.activeConnectionId,
  });
}

export function updateTabSql(tabId: string, sql: string): void {
  patch({
    tabs: store.state.tabs.map((t) =>
      t.id === tabId ? { ...t, sql, dirty: true } : t,
    ),
  });
}

/**
 * Re-bind a tab to a different connection and make it active. Callers should
 * restrict the choice to the same engine so the editor's SQL dialect does not
 * change underneath the user.
 */
export function setTabConnection(tabId: string, connectionId: string): void {
  patch({
    tabs: store.state.tabs.map((t) =>
      t.id === tabId ? { ...t, connectionId } : t,
    ),
    activeConnectionId: connectionId,
  });
}

export async function runQuery(tabId: string): Promise<void> {
  const tab = store.state.tabs.find((t) => t.id === tabId);
  if (!tab) return;
  const transport = getTransport(tab.connectionId);

  patch({
    executing: { ...store.state.executing, [tabId]: true },
  });

  try {
    const result = await transport.query(tab.sql);
    patch({
      results: { ...store.state.results, [tabId]: result },
      executing: { ...store.state.executing, [tabId]: false },
    });
  } catch (error) {
    patch({
      results: {
        ...store.state.results,
        [tabId]: {
          meta: [],
          data: [],
          statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
          rows: 0,
          error: String(error),
        },
      },
      executing: { ...store.state.executing, [tabId]: false },
    });
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useWorkbenchStore<T>(selector: (s: WorkbenchState) => T): T {
  return useStore(store, selector);
}

/**
 * The active connection id when it's a ClickHouse connection, else undefined.
 * CH/OTel feature pages (Logs, Traces, Services, Sessions) use this to route
 * their queries to the active ClickHouse connection, falling back to the
 * legacy default (undefined → runQuery's legacy path) otherwise.
 */
export function useActiveClickHouseConnectionId(): string | undefined {
  return useStore(store, (s) => {
    const id = s.activeConnectionId;
    if (!id) return undefined;
    return s.connections.find((c) => c.id === id)?.engine === "clickhouse"
      ? id
      : undefined;
  });
}

export function useDialectForTab(tabId: string | null) {
  return useStore(store, (s) => {
    if (!tabId) return getDialect("clickhouse");
    const tab = s.tabs.find((t) => t.id === tabId);
    if (!tab) return getDialect("clickhouse");
    const conn = s.connections.find((c) => c.id === tab.connectionId);
    return getDialect(conn?.engine ?? "clickhouse");
  });
}
