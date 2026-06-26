import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import { liveQuery } from "dexie";
import { toast } from "sonner";

import type {
  Engine,
  SavedConnection,
  ConnectionFolder,
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

/**
 * One executed statement and its result. A tab holds an array of these:
 * a single entry for Ctrl+Enter (statement under the cursor) or one entry
 * per statement for Ctrl+Shift+Enter (run-all). Each entry carries its own
 * error so a failure in one statement does not hide the others.
 */
export interface WorkbenchResultItem {
  queryText: string;
  result: AdapterQueryResult;
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
  /** Sidebar folders (nested tree). Kept in sync with Dexie alongside connections. */
  connectionFolders: ConnectionFolder[];
  activeConnectionId: string | null;
  statuses: Record<string, ConnectionStatus>;
  capabilities: Record<string, AdapterCapabilities>;
  admin: Record<string, AdminCache>;
  adminView: boolean;
  tabs: WorkbenchTab[];
  activeTabId: string | null;
  schemas: Record<string, SchemaCache>;
  results: Record<string, WorkbenchResultItem[]>;
  activeResultIndex: Record<string, number>;
  executing: Record<string, boolean>;
  error: string;
}

// ─── Session persistence ──────────────────────────────────────────────────
// Restore the user's open query tabs across reloads so the app reopens to the
// last session instead of an empty "New Query" page. Only the durable slice —
// the open tabs, the active tab, and the active connection pointer — is saved
// to localStorage (mirroring workspaceStore's "app-storage" and
// connectionStore's "connection-storage"). Query results, execution flags,
// schemas, and the connection list are transient/re-derivable and are NOT
// persisted; tabs reference a connectionId only, so no password is duplicated
// here (connections — and their secrets — are re-read from Dexie/keychain).
const SESSION_STORAGE_KEY = "deebee-workbench-session";
const SESSION_VERSION = 1;
const SESSION_PERSIST_DEBOUNCE_MS = 400;

export interface PersistedSession {
  tabs: WorkbenchTab[];
  activeTabId: string | null;
  activeConnectionId: string | null;
}

/** Serialise the durable session slice into a versioned envelope. */
function serializeSession(s: WorkbenchState): string {
  return JSON.stringify({
    version: SESSION_VERSION,
    state: {
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      activeConnectionId: s.activeConnectionId,
    } satisfies PersistedSession,
  });
}

/**
 * Read the persisted session from localStorage, tolerating missing, partial,
 * or older shapes (returns null when there is nothing valid to restore). Tab
 * ids are kept verbatim — the results/executing/activeResultIndex maps are
 * keyed by them — and the active tab is repointed to a surviving tab if the
 * stored one is gone. A restored activeConnectionId that references a
 * since-deleted connection is self-correcting: the Dexie liveQuery below calls
 * applyConnections(), which falls back to the default/first connection.
 */
function loadPersistedSession(): PersistedSession | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      version?: number;
      state?: Partial<PersistedSession>;
    };
    // Gate on the schema version: an envelope from a different version may use
    // a changed shape, so discard it rather than risk partially hydrating
    // garbled state. We do NOT removeItem here — a newer client's data should
    // survive an older client reading it (forward-compat over a downgrade).
    if (parsed?.version !== SESSION_VERSION) return null;

    const state = parsed.state;
    if (!state || !Array.isArray(state.tabs)) return null;

    const tabs: WorkbenchTab[] = state.tabs
      .filter(
        (t): t is WorkbenchTab =>
          !!t &&
          typeof t.id === "string" &&
          typeof t.title === "string" &&
          typeof t.connectionId === "string" &&
          typeof t.sql === "string",
      )
      .map((t) => ({
        id: t.id,
        title: t.title,
        connectionId: t.connectionId,
        sql: t.sql,
        ...(t.dirty === true ? { dirty: true as const } : {}),
      }));

    // No usable tabs survived (corrupt/all-malformed, or a genuinely empty
    // session). The version already matched, so this entry is ours and unusable
    // — clear it so a stale blob doesn't suppress restore on every future boot.
    if (tabs.length === 0) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }

    const storedActive = state.activeTabId;
    const activeTabId =
      typeof storedActive === "string" && tabs.some((t) => t.id === storedActive)
        ? storedActive
        : (tabs[tabs.length - 1]?.id ?? null);

    const activeConnectionId =
      typeof state.activeConnectionId === "string"
        ? state.activeConnectionId
        : (tabs.find((t) => t.id === activeTabId)?.connectionId ?? null);

    return { tabs, activeTabId, activeConnectionId };
  } catch {
    return null;
  }
}

const persistedSession = loadPersistedSession();

const initialState: WorkbenchState = {
  connections: [],
  connectionFolders: [],
  activeConnectionId: persistedSession?.activeConnectionId ?? null,
  statuses: {},
  capabilities: {},
  admin: {},
  adminView: false,
  tabs: persistedSession?.tabs ?? [],
  activeTabId: persistedSession?.activeTabId ?? null,
  schemas: {},
  results: {},
  activeResultIndex: {},
  executing: {},
  error: "",
};

const store = new Store<WorkbenchState>(initialState);

// Persist the durable session slice (debounced) whenever it changes. The store
// fires on every setState — schema loads, status changes, query runs, and every
// keystroke via updateTabSql (which has no debounce of its own) — so we coalesce
// bursts behind a short timer and re-read state at fire time, writing only when
// the serialised slice actually changed. localStorage writes never trigger
// setState, so there is no feedback loop.
let lastSessionSerialized = serializeSession(initialState);
let sessionPersistTimer: ReturnType<typeof setTimeout> | null = null;

/** Write the current durable slice now, skipping a no-op write. */
function writeSessionNow(): void {
  try {
    if (typeof localStorage === "undefined") return;
    const serialized = serializeSession(store.state);
    if (serialized === lastSessionSerialized) return;
    localStorage.setItem(SESSION_STORAGE_KEY, serialized);
    lastSessionSerialized = serialized;
  } catch {
    // best-effort: ignore quota errors / unavailable storage
  }
}

/** Cancel the pending debounce and persist synchronously (used on unload). */
function flushSession(): void {
  if (sessionPersistTimer) {
    clearTimeout(sessionPersistTimer);
    sessionPersistTimer = null;
  }
  writeSessionNow();
}

try {
  store.subscribe(() => {
    if (sessionPersistTimer) clearTimeout(sessionPersistTimer);
    sessionPersistTimer = setTimeout(() => {
      sessionPersistTimer = null;
      writeSessionNow();
    }, SESSION_PERSIST_DEBOUNCE_MS);
  });

  // The debounce timer is discarded if the page is torn down before it fires —
  // a fast edit immediately before reload/close would be lost. Flush
  // synchronously when the page is hidden or unloaded so the last burst of
  // edits is always captured. `pagehide` covers close/navigation (incl. the
  // Electron renderer); `visibilitychange → hidden` covers minimise/tab-switch
  // and is the most broadly reliable signal.
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flushSession);
  }
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushSession();
    });
  }
} catch {
  // environments without a working Store subscription skip persistence
}

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
      database: conn.database || undefined,
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
  maybeAutoConnectRestoredSession(conns);
}

// ── Session-restore auto-connect (one-shot) ─────────────────────────────────
// After a restored session's connections first become available, connect the
// active tab's connection so the user can run queries immediately — mirroring
// AppInit's auto-connect of the last connection. Only the active tab's
// connection is auto-connected; other restored tabs surface a "disconnected"
// badge in the editor toolbar and connect on demand. The guard makes this run
// at most once, and only when there was a session to restore.
let sessionAutoConnectPending = persistedSession != null;

/**
 * Decide which connection to auto-connect on restore: the active tab's
 * connection (falling back to the persisted active connection), but only if it
 * still exists in `conns` and is currently disconnected. Pure, for testability.
 */
export function pickSessionAutoConnect(
  session: PersistedSession | null,
  conns: Pick<SavedConnection, "id">[],
  statuses: Record<string, ConnectionStatus>,
): string | null {
  if (!session || conns.length === 0) return null;
  const activeTab = session.tabs.find((t) => t.id === session.activeTabId);
  const targetId = activeTab?.connectionId ?? session.activeConnectionId;
  if (!targetId || !conns.some((c) => c.id === targetId)) return null;
  return (statuses[targetId] ?? "disconnected") === "disconnected"
    ? targetId
    : null;
}

function maybeAutoConnectRestoredSession(conns: SavedConnection[]): void {
  // Wait for a real (non-empty) connection list — the liveQuery can emit []
  // transiently before Dexie resolves — and act only once.
  if (!sessionAutoConnectPending || conns.length === 0) return;
  sessionAutoConnectPending = false;
  const targetId = pickSessionAutoConnect(
    persistedSession,
    conns,
    store.state.statuses,
  );
  if (targetId) void connectConnection(targetId);
}

export async function loadConnections(): Promise<void> {
  try {
    const [conns, folders] = await Promise.all([
      db.connections.toArray(),
      db.connectionFolders.toArray(),
    ]);
    patch({ connectionFolders: folders });
    applyConnections(conns);
  } catch (error) {
    patch({ error: `Failed to load connections: ${String(error)}` });
  }
}

// Keep the workbench connection list + folders in sync with the shared Dexie
// tables, regardless of which store/route performs the write (the workbench "+"
// dialog, the Settings ConnectionManager, import, or a drag-and-drop reorder).
// Both tables are read inside one liveQuery via Promise.all so they emit
// atomically — a connection move and its folder never land in separate frames,
// which would let buildTree see an orphaned item or a phantom folder.
try {
  liveQuery(() =>
    Promise.all([db.connections.toArray(), db.connectionFolders.toArray()]),
  ).subscribe({
    next: ([conns, folders]) => {
      patch({ connectionFolders: folders });
      applyConnections(conns);
    },
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
  const { [tabId]: _a, ...activeResultIndex } = store.state.activeResultIndex;
  const { [tabId]: _e, ...executing } = store.state.executing;
  patch({ tabs, activeTabId, results, activeResultIndex, executing });
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

function errorResult(error: unknown): AdapterQueryResult {
  return {
    meta: [],
    data: [],
    statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
    rows: 0,
    error: String(error),
  };
}

/**
 * Run a single statement (the statement under the cursor for Ctrl+Enter, or a
 * selection). When `sql` is omitted the whole tab buffer is used. The result
 * replaces the tab's result set with a single entry.
 */
export async function runQuery(tabId: string, sql?: string): Promise<void> {
  const tab = store.state.tabs.find((t) => t.id === tabId);
  if (!tab) return;
  const queryText = (sql ?? tab.sql).trim();
  const transport = getTransport(tab.connectionId);

  patch({
    executing: { ...store.state.executing, [tabId]: true },
  });

  let item: WorkbenchResultItem;
  try {
    const result = await transport.query(queryText);
    item = { queryText, result };
  } catch (error) {
    item = { queryText, result: errorResult(error) };
  }
  patch({
    results: { ...store.state.results, [tabId]: [item] },
    activeResultIndex: { ...store.state.activeResultIndex, [tabId]: 0 },
    executing: { ...store.state.executing, [tabId]: false },
  });
}

/**
 * Run every statement (Ctrl+Shift+Enter) sequentially, collecting one result
 * per statement so each can be shown in its own result tab. A statement that
 * throws records its error and does not abort the remaining statements —
 * matching the behaviour the deprecated workspace shipped.
 */
export async function runAllQueries(
  tabId: string,
  queries: string[],
): Promise<void> {
  const tab = store.state.tabs.find((t) => t.id === tabId);
  if (!tab) return;
  const transport = getTransport(tab.connectionId);

  patch({
    executing: { ...store.state.executing, [tabId]: true },
  });

  const items: WorkbenchResultItem[] = [];
  for (const raw of queries) {
    const queryText = raw.trim();
    if (!queryText) continue;
    try {
      const result = await transport.query(queryText);
      items.push({ queryText, result });
    } catch (error) {
      items.push({ queryText, result: errorResult(error) });
    }
  }

  patch({
    results: { ...store.state.results, [tabId]: items },
    activeResultIndex: { ...store.state.activeResultIndex, [tabId]: 0 },
    executing: { ...store.state.executing, [tabId]: false },
  });
}

/** Select which statement's result is shown in the results panel. */
export function setActiveResultIndex(tabId: string, index: number): void {
  patch({
    activeResultIndex: { ...store.state.activeResultIndex, [tabId]: index },
  });
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
