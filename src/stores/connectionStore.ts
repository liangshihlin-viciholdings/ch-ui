// src/stores/connectionStore.ts
// Connection management store built on TanStack Store.
//
// Preserves the public API of the former Zustand `useConnectionStore` so
// consumers can continue to call `useConnectionStore()`, destructure fields
// and actions, and use `useConnectionStore.getState()`. Under the hood the
// state lives in a TanStack `Store` and is persisted to localStorage.

import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import {
  SavedConnection,
  ConnectionDisplay,
  Engine,
  ExportData,
  ExportedConnection,
  ExportedSavedQuery,
  createConnection,
  getConnectionById,
  getAllConnections,
  updateConnection,
  deleteConnection as dbDeleteConnection,
  setDefaultConnection,
  getSavedQueriesByConnectionId,
  createSavedQuery,
  deleteSavedQueriesByConnectionId,
} from "@/lib/db";
import type { ImportedConnection, ImportedScript } from "@/lib/dbeaver";

export interface ConnectionState {
  connections: ConnectionDisplay[];
  activeConnectionId: string | null;
  isLoading: boolean;
  error: string | null;
  databasesByConnection: Record<string, string[]>;
  lastSelectedDatabaseByConnection: Record<string, string>;
}

const STORAGE_KEY = "connection-storage";

// Helper to convert SavedConnection to ConnectionDisplay
function toDisplay(conn: SavedConnection): ConnectionDisplay {
  return {
    id: conn.id,
    name: conn.name,
    engine: conn.engine,
    url: conn.url,
    database: conn.database,
    username: conn.username,
    password: conn.password,
    useAdvanced: conn.useAdvanced,
    customPath: conn.customPath,
    requestTimeout: conn.requestTimeout,
    isDistributed: conn.isDistributed,
    clusterName: conn.clusterName,
    isDefault: conn.isDefault,
    filePath: conn.filePath,
    createdAt: conn.createdAt,
    updatedAt: conn.updatedAt,
  };
}

function loadPersisted(): Partial<ConnectionState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Zustand persist stored data under `{ state: {...}, version: ... }`.
    // Support both shapes for a smooth migration.
    const state = parsed?.state ?? parsed;
    return {
      activeConnectionId: state?.activeConnectionId ?? null,
      lastSelectedDatabaseByConnection:
        state?.lastSelectedDatabaseByConnection ?? {},
    };
  } catch {
    return {};
  }
}

const persisted = loadPersisted();

export const connectionStore = new Store<ConnectionState>({
  connections: [],
  activeConnectionId: persisted.activeConnectionId ?? null,
  isLoading: false,
  error: null,
  databasesByConnection: {},
  lastSelectedDatabaseByConnection:
    persisted.lastSelectedDatabaseByConnection ?? {},
});

// Persist a subset of state (matches the old Zustand partialize shape).
connectionStore.subscribe(() => {
  try {
    const { activeConnectionId, lastSelectedDatabaseByConnection } =
      connectionStore.state;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: { activeConnectionId, lastSelectedDatabaseByConnection },
        version: 0,
      }),
    );
  } catch {
    // Ignore quota errors
  }
});

// ─── Actions ────────────────────────────────────────────────────────────────

export function cacheDatabasesForConnection(
  connectionId: string,
  databases: string[],
) {
  connectionStore.setState((prev) => ({
    ...prev,
    databasesByConnection: {
      ...prev.databasesByConnection,
      [connectionId]: databases,
    },
  }));
}

export function getDatabasesForConnection(connectionId: string): string[] {
  return connectionStore.state.databasesByConnection[connectionId] || [];
}

export function setLastSelectedDatabase(
  connectionId: string,
  database: string | null,
) {
  connectionStore.setState((prev) => {
    const updated = { ...prev.lastSelectedDatabaseByConnection };
    if (database === null) {
      delete updated[connectionId];
    } else {
      updated[connectionId] = database;
    }
    return { ...prev, lastSelectedDatabaseByConnection: updated };
  });
}

export function getLastSelectedDatabase(connectionId: string): string | null {
  return (
    connectionStore.state.lastSelectedDatabaseByConnection[connectionId] || null
  );
}

export async function loadConnections(): Promise<void> {
  connectionStore.setState((prev) => ({
    ...prev,
    isLoading: true,
    error: null,
  }));

  try {
    const connections = await getAllConnections();
    const displayConnections = connections.map(toDisplay);
    connectionStore.setState((prev) => ({
      ...prev,
      connections: displayConnections,
      isLoading: false,
    }));
  } catch (err) {
    connectionStore.setState((prev) => ({
      ...prev,
      isLoading: false,
      error:
        err instanceof Error ? err.message : "Failed to load connections",
    }));
  }
}

export async function saveConnection(connection: {
  name: string;
  engine?: Engine;
  url: string;
  database?: string;
  username: string;
  password: string;
  useAdvanced?: boolean;
  customPath?: string;
  requestTimeout?: number;
  isDistributed?: boolean;
  clusterName?: string;
  isDefault?: boolean;
  filePath?: string;
}): Promise<SavedConnection | null> {
  connectionStore.setState((prev) => ({
    ...prev,
    isLoading: true,
    error: null,
  }));

  try {
    const newConnection = await createConnection({
      name: connection.name,
      engine: connection.engine ?? "clickhouse",
      url: connection.url,
      database: connection.database,
      username: connection.username,
      password: connection.password,
      useAdvanced: connection.useAdvanced ?? false,
      customPath: connection.customPath ?? "",
      requestTimeout: connection.requestTimeout ?? 30000,
      isDistributed: connection.isDistributed ?? false,
      clusterName: connection.clusterName ?? "",
      isDefault: connection.isDefault ?? false,
      filePath: connection.filePath,
    });

    if (connection.isDefault) {
      await setDefaultConnection(newConnection.id);
    }

    await loadConnections();
    connectionStore.setState((prev) => ({ ...prev, isLoading: false }));
    return newConnection;
  } catch (err) {
    connectionStore.setState((prev) => ({
      ...prev,
      isLoading: false,
      error:
        err instanceof Error ? err.message : "Failed to save connection",
    }));
    return null;
  }
}

export async function updateConnectionById(
  id: string,
  updates: {
    name?: string;
    engine?: Engine;
    url?: string;
    database?: string;
    username?: string;
    password?: string;
    useAdvanced?: boolean;
    customPath?: string;
    requestTimeout?: number;
    isDistributed?: boolean;
    clusterName?: string;
    isDefault?: boolean;
    filePath?: string;
  },
): Promise<boolean> {
  connectionStore.setState((prev) => ({
    ...prev,
    isLoading: true,
    error: null,
  }));

  try {
    const connection = await getConnectionById(id);
    if (!connection) {
      connectionStore.setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Connection not found",
      }));
      return false;
    }

    const updateData: Partial<SavedConnection> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.engine !== undefined) updateData.engine = updates.engine;
    if (updates.url !== undefined) updateData.url = updates.url;
    if (updates.database !== undefined) updateData.database = updates.database;
    if (updates.username !== undefined) updateData.username = updates.username;
    if (updates.password !== undefined) updateData.password = updates.password;
    if (updates.useAdvanced !== undefined)
      updateData.useAdvanced = updates.useAdvanced;
    if (updates.customPath !== undefined)
      updateData.customPath = updates.customPath;
    if (updates.requestTimeout !== undefined)
      updateData.requestTimeout = updates.requestTimeout;
    if (updates.isDistributed !== undefined)
      updateData.isDistributed = updates.isDistributed;
    if (updates.clusterName !== undefined)
      updateData.clusterName = updates.clusterName;
    if (updates.filePath !== undefined) updateData.filePath = updates.filePath;

    await updateConnection(id, updateData);

    if (updates.isDefault) {
      await setDefaultConnection(id);
    }

    await loadConnections();
    connectionStore.setState((prev) => ({ ...prev, isLoading: false }));
    return true;
  } catch (err) {
    connectionStore.setState((prev) => ({
      ...prev,
      isLoading: false,
      error:
        err instanceof Error ? err.message : "Failed to update connection",
    }));
    return false;
  }
}

export async function deleteConnectionById(id: string): Promise<boolean> {
  connectionStore.setState((prev) => ({
    ...prev,
    isLoading: true,
    error: null,
  }));

  try {
    const connection = await getConnectionById(id);
    if (!connection) {
      connectionStore.setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Connection not found",
      }));
      return false;
    }

    // Cascade delete saved queries first, then the connection itself
    await deleteSavedQueriesByConnectionId(id);
    await dbDeleteConnection(id);

    connectionStore.setState((prev) => {
      const updatedDbs = { ...prev.lastSelectedDatabaseByConnection };
      delete updatedDbs[id];
      return {
        ...prev,
        activeConnectionId:
          prev.activeConnectionId === id ? null : prev.activeConnectionId,
        lastSelectedDatabaseByConnection: updatedDbs,
      };
    });

    await loadConnections();
    connectionStore.setState((prev) => ({ ...prev, isLoading: false }));
    return true;
  } catch (err) {
    connectionStore.setState((prev) => ({
      ...prev,
      isLoading: false,
      error:
        err instanceof Error ? err.message : "Failed to delete connection",
    }));
    return false;
  }
}

/**
 * Delete every saved connection and its saved queries. Returns the number of
 * connections removed. A liveQuery in workbenchStore keeps the sidebar in sync.
 */
export async function deleteAllConnections(): Promise<number> {
  connectionStore.setState((prev) => ({ ...prev, isLoading: true, error: null }));
  try {
    const existing = await getAllConnections();
    for (const conn of existing) {
      await deleteSavedQueriesByConnectionId(conn.id);
      await dbDeleteConnection(conn.id);
    }
    connectionStore.setState((prev) => ({
      ...prev,
      activeConnectionId: null,
      databasesByConnection: {},
      lastSelectedDatabaseByConnection: {},
      isLoading: false,
    }));
    await loadConnections();
    return existing.length;
  } catch (err) {
    connectionStore.setState((prev) => ({
      ...prev,
      isLoading: false,
      error:
        err instanceof Error ? err.message : "Failed to remove connections",
    }));
    return 0;
  }
}

export function setActiveConnection(id: string | null) {
  connectionStore.setState((prev) => ({ ...prev, activeConnectionId: id }));
}

export async function setAsDefault(id: string): Promise<boolean> {
  try {
    await setDefaultConnection(id);
    await loadConnections();
    return true;
  } catch (err) {
    connectionStore.setState((prev) => ({
      ...prev,
      error: err instanceof Error ? err.message : "Failed to set default",
    }));
    return false;
  }
}

export async function getPassword(
  connectionId: string,
): Promise<string | null> {
  try {
    const connection = await getConnectionById(connectionId);
    return connection?.password ?? null;
  } catch {
    connectionStore.setState((prev) => ({
      ...prev,
      error: "Failed to get password",
    }));
    return null;
  }
}

export async function exportConnections(
  connectionIds: string[],
  includePasswords: boolean,
  includeSavedQueries: boolean,
): Promise<Blob | null> {
  try {
    const connections: ExportedConnection[] = [];
    const savedQueries: Record<string, ExportedSavedQuery[]> = {};

    for (const id of connectionIds) {
      const conn = await getConnectionById(id);
      if (!conn) continue;

      connections.push({
        name: conn.name,
        engine: conn.engine,
        url: conn.url,
        database: conn.database,
        username: conn.username,
        password: includePasswords ? conn.password : undefined,
        useAdvanced: conn.useAdvanced,
        customPath: conn.customPath,
        requestTimeout: conn.requestTimeout,
        isDistributed: conn.isDistributed,
        clusterName: conn.clusterName,
        filePath: conn.filePath,
      });

      if (includeSavedQueries) {
        const queries = await getSavedQueriesByConnectionId(id);
        if (queries.length > 0) {
          savedQueries[conn.name] = queries.map((q) => ({
            name: q.name,
            query: q.query,
            databaseName: q.databaseName,
          }));
        }
      }
    }

    const exportData: ExportData = {
      version: "2.0",
      exportedAt: new Date().toISOString(),
      connections,
      savedQueries:
        Object.keys(savedQueries).length > 0 ? savedQueries : undefined,
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    return new Blob([jsonString], { type: "application/json" });
  } catch (err) {
    connectionStore.setState((prev) => ({
      ...prev,
      error: err instanceof Error ? err.message : "Export failed",
    }));
    return null;
  }
}

export async function importConnections(
  file: File,
): Promise<{ success: number; failed: number }> {
  try {
    const content = await file.text();
    const data: ExportData = JSON.parse(content);

    if (!data.connections || !Array.isArray(data.connections)) {
      connectionStore.setState((prev) => ({
        ...prev,
        error: "Invalid export file format",
      }));
      return { success: 0, failed: 0 };
    }

    let success = 0;
    let failed = 0;
    const connectionNameToIdMap: Record<string, string> = {};

    for (const conn of data.connections) {
      try {
        const savedConn = await saveConnection({
          name: conn.name,
          engine: conn.engine,
          url: conn.url,
          database: conn.database,
          username: conn.username,
          password: conn.password || "",
          useAdvanced: conn.useAdvanced,
          customPath: conn.customPath,
          requestTimeout: conn.requestTimeout,
          isDistributed: conn.isDistributed,
          clusterName: conn.clusterName,
          filePath: conn.filePath,
        });

        if (savedConn) {
          connectionNameToIdMap[conn.name] = savedConn.id;
        }
        success++;
      } catch {
        failed++;
      }
    }

    if (data.savedQueries && data.version === "2.0") {
      for (const [connectionName, queries] of Object.entries(data.savedQueries)) {
        const connectionId = connectionNameToIdMap[connectionName];
        if (!connectionId) continue;

        for (const query of queries) {
          try {
            await createSavedQuery({
              name: query.name,
              query: query.query,
              connectionId,
              databaseName: query.databaseName,
            });
          } catch (err) {
            console.error(`Failed to import query "${query.name}":`, err);
          }
        }
      }
    }

    await loadConnections();
    return { success, failed };
  } catch (err) {
    connectionStore.setState((prev) => ({
      ...prev,
      error: err instanceof Error ? err.message : "Import failed",
    }));
    return { success: 0, failed: 0 };
  }
}

export interface DbeaverImportResult {
  success: number;
  failed: number;
  /** Connections skipped because a connection with the same name already exists. */
  skipped: number;
  /** SQL scripts imported as saved queries. */
  scriptsImported: number;
  /** Scripts skipped (no resolvable target connection, or a create error). */
  scriptsSkipped: number;
}

/**
 * Import connections parsed from a DBeaver workspace. Skips connections whose
 * name already exists (when skipExisting, the default) so re-imports are
 * idempotent rather than creating duplicates.
 */
export async function importFromDbeaver(
  connections: ImportedConnection[],
  options?: { skipExisting?: boolean; scripts?: ImportedScript[] },
): Promise<DbeaverImportResult> {
  const skipExisting = options?.skipExisting ?? true;
  let success = 0;
  let failed = 0;
  let skipped = 0;
  let scriptsImported = 0;
  let scriptsSkipped = 0;

  try {
    const existing = await getAllConnections();
    const idByName = new Map(existing.map((c) => [c.name, c.id]));
    // DBeaver source connection id -> deebee connection id, so imported scripts
    // can be linked to the connection they belong to.
    const idBySourceId = new Map<string, string>();

    for (const conn of connections) {
      const existingId = idByName.get(conn.name);
      if (existingId) {
        // Link scripts to the existing same-named connection even when skipped.
        idBySourceId.set(conn.sourceId, existingId);
        if (skipExisting) {
          skipped++;
          continue;
        }
      }
      try {
        const saved = await saveConnection({
          name: conn.name,
          engine: conn.engine,
          url: conn.url,
          database: conn.database,
          username: conn.username,
          password: conn.password,
          filePath: conn.filePath,
        });
        if (saved) {
          success++;
          idByName.set(conn.name, saved.id);
          idBySourceId.set(conn.sourceId, saved.id);
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    // Import SQL scripts as saved queries, linked to their resolved connection.
    for (const script of options?.scripts ?? []) {
      const connectionId = script.sourceConnectionId
        ? idBySourceId.get(script.sourceConnectionId)
        : undefined;
      if (!connectionId) {
        scriptsSkipped++;
        continue;
      }
      try {
        await createSavedQuery({
          name: script.name,
          query: script.query,
          connectionId,
          databaseName: script.databaseName ?? "",
        });
        scriptsImported++;
      } catch {
        scriptsSkipped++;
      }
    }

    await loadConnections();
  } catch (err) {
    connectionStore.setState((prev) => ({
      ...prev,
      error: err instanceof Error ? err.message : "DBeaver import failed",
    }));
  }

  return { success, failed, skipped, scriptsImported, scriptsSkipped };
}

export function clearError() {
  connectionStore.setState((prev) => ({ ...prev, error: null }));
}

// ─── Hooks / Public API shim ────────────────────────────────────────────────

// Full action bundle. Re-exposed on the hook for backwards compatibility with
// destructuring patterns used throughout the codebase.
const actions = {
  loadConnections,
  cacheDatabasesForConnection,
  getDatabasesForConnection,
  setLastSelectedDatabase,
  getLastSelectedDatabase,
  saveConnection,
  updateConnectionById,
  deleteConnectionById,
  deleteAllConnections,
  setActiveConnection,
  setAsDefault,
  getPassword,
  exportConnections,
  importConnections,
  importFromDbeaver,
  clearError,
};

export type ConnectionStoreValue = ConnectionState & typeof actions;

const identity = (v: ConnectionStoreValue) => v;

/**
 * Hook returning the combined connection state + actions. Mirrors the old
 * Zustand API so consumers can keep destructuring as before.
 *
 * Supports both `useConnectionStore()` (returns everything) and
 * `useConnectionStore((s) => s.field)` (selector).
 */
export function useConnectionStore<T = ConnectionStoreValue>(
  selector?: (state: ConnectionStoreValue) => T,
): T {
  const sel = (selector ?? identity) as (s: ConnectionStoreValue) => T;
  return useStore(connectionStore, (rawState) =>
    sel({ ...rawState, ...actions } as ConnectionStoreValue),
  );
}

/**
 * Imperative access to the current state + actions, e.g. inside effects.
 */
useConnectionStore.getState = (): ConnectionStoreValue => ({
  ...connectionStore.state,
  ...actions,
});

useConnectionStore.subscribe = (
  listener: (state: ConnectionStoreValue) => void,
) =>
  connectionStore.subscribe(() => {
    listener({ ...connectionStore.state, ...actions });
  });

// Default export matches legacy `import useConnectionStore from "@/store/connectionStore"`.
export default useConnectionStore;
