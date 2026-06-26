// src/lib/db/index.ts
// Dexie.js Database Configuration for Deebee

import Dexie, { Table } from "dexie";
import {
  SavedConnection,
  ConnectionFolder,
  CreateConnectionFolder,
  SavedQuery,
  SavedDashboard,
  SavedSearch,
  SavedAlert,
} from "./schema";

export class DeebeeDatabase extends Dexie {
  connections!: Table<SavedConnection, string>;
  connectionFolders!: Table<ConnectionFolder, string>;
  savedQueries!: Table<SavedQuery, string>;
  dashboards!: Table<SavedDashboard, string>;
  savedSearches!: Table<SavedSearch, string>;
  alerts!: Table<SavedAlert, string>;

  constructor() {
    super("deebee-db");

    this.version(1).stores({
      connections: "id, name, isDefault, createdAt",
    });

    this.version(2).stores({
      connections: "id, name, isDefault, createdAt",
      savedQueries: "id, name, connectionId, createdAt",
    });

    this.version(3).stores({
      connections: "id, name, isDefault, createdAt",
      savedQueries: "id, name, connectionId, createdAt",
      dashboards: "id, name, createdAt, updatedAt",
    });

    this.version(4).stores({
      connections: "id, name, isDefault, createdAt",
      savedQueries: "id, name, connectionId, createdAt",
      dashboards: "id, name, createdAt, updatedAt",
      savedSearches: "id, name, createdAt, updatedAt",
      alerts: "id, name, enabled, createdAt, updatedAt",
    });

    // v5: add engine field, default existing connections to clickhouse
    this.version(5).stores({
      connections: "id, name, engine, isDefault, createdAt",
    }).upgrade((tx) => {
      return tx
        .table("connections")
        .toCollection()
        .modify((conn: any) => {
          if (!conn.engine) conn.engine = "clickhouse";
        });
    });

    // v6: dashboards gain an optional connectionId (which saved connection the
    // dashboard queries). Existing dashboards backfill to null = legacy default.
    this.version(6).stores({
      dashboards: "id, name, connectionId, createdAt, updatedAt",
    }).upgrade((tx) => {
      return tx
        .table("dashboards")
        .toCollection()
        .modify((d: any) => {
          if (d.connectionId === undefined) d.connectionId = null;
        });
    });

    // v7: saved searches gain an optional connectionId (which saved
    // connection they run against). Existing rows backfill to null = legacy.
    this.version(7).stores({
      savedSearches: "id, name, connectionId, createdAt, updatedAt",
    }).upgrade((tx) => {
      return tx
        .table("savedSearches")
        .toCollection()
        .modify((s: any) => {
          if (s.connectionId === undefined) s.connectionId = null;
        });
    });

    // v8: alerts gain an optional connectionId (which saved connection the
    // alert evaluates against). Existing rows backfill to null = legacy.
    this.version(8).stores({
      alerts: "id, name, enabled, connectionId, createdAt, updatedAt",
    }).upgrade((tx) => {
      return tx
        .table("alerts")
        .toCollection()
        .modify((a: any) => {
          if (a.connectionId === undefined) a.connectionId = null;
        });
    });

    // v9: nested connection folders + per-item sortOrder.
    //   New table: connectionFolders (id, parentId indexed for cascade/move).
    //   connections gains folderId (indexed) + sortOrder. Existing connections
    //   backfill to root (folderId=null) with sortOrder by current iteration
    //   order, preserving creation order as the initial layout.
    this.version(9).stores({
      connections: "id, name, engine, isDefault, folderId, createdAt",
      connectionFolders: "id, parentId, createdAt",
    }).upgrade((tx) => {
      let i = 0;
      return tx
        .table("connections")
        .toCollection()
        .modify((conn: any) => {
          if (conn.folderId === undefined) conn.folderId = null;
          if (conn.sortOrder === undefined) conn.sortOrder = i++ * 1000;
        });
      // connectionFolders starts empty — no backfill needed.
    });
  }
}

export const db = new DeebeeDatabase();

// Helper to generate UUIDs
export function generateId(): string {
  return crypto.randomUUID();
}

// Connection operations
export async function createConnection(
  connection: Omit<SavedConnection, "id" | "createdAt" | "updatedAt">
): Promise<SavedConnection> {
  const now = new Date();
  const newConnection: SavedConnection = {
    ...connection,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  await db.connections.add(newConnection);
  return newConnection;
}

export async function getConnectionById(
  id: string
): Promise<SavedConnection | undefined> {
  return db.connections.get(id);
}

export async function getAllConnections(): Promise<SavedConnection[]> {
  return db.connections.toArray();
}

export async function updateConnection(
  id: string,
  updates: Partial<Omit<SavedConnection, "id" | "createdAt">>
): Promise<void> {
  await db.connections.update(id, {
    ...updates,
    updatedAt: new Date(),
  });
}

export async function deleteConnection(id: string): Promise<void> {
  await db.connections.delete(id);
}

export async function setDefaultConnection(connectionId: string): Promise<void> {
  // Clear all existing defaults
  const allConnections = await getAllConnections();
  await Promise.all(
    allConnections
      .filter((c) => c.isDefault)
      .map((c) => updateConnection(c.id, { isDefault: false }))
  );
  // Set new default
  await updateConnection(connectionId, { isDefault: true });
}

export async function getDefaultConnection(): Promise<SavedConnection | undefined> {
  return db.connections.filter((c) => c.isDefault).first();
}

// Connection folder operations (nested tree for the sidebar)
export async function getAllConnectionFolders(): Promise<ConnectionFolder[]> {
  return db.connectionFolders.toArray();
}

export async function createConnectionFolder(
  input: CreateConnectionFolder
): Promise<ConnectionFolder> {
  const now = new Date();
  const folder: ConnectionFolder = {
    ...input,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  await db.connectionFolders.add(folder);
  return folder;
}

export async function updateConnectionFolder(
  id: string,
  updates: Partial<Omit<ConnectionFolder, "id" | "createdAt">>
): Promise<void> {
  await db.connectionFolders.update(id, {
    ...updates,
    updatedAt: new Date(),
  });
}

/**
 * Delete a folder, moving its DIRECT children (sub-folders and connections) up
 * one level to the folder's own parent. Never deletes connections. Runs in a
 * single transaction so the sidebar never observes orphaned rows.
 */
export async function deleteConnectionFolder(id: string): Promise<void> {
  await db.transaction("rw", db.connectionFolders, db.connections, async () => {
    const folder = await db.connectionFolders.get(id);
    const newParent = folder?.parentId ?? null;
    await db.connectionFolders
      .where("parentId")
      .equals(id)
      .modify({ parentId: newParent });
    await db.connections
      .where("folderId")
      .equals(id)
      .modify({ folderId: newParent });
    await db.connectionFolders.delete(id);
  });
}

// SavedQuery operations
export async function createSavedQuery(
  query: Omit<SavedQuery, "id" | "createdAt" | "updatedAt">
): Promise<SavedQuery> {
  const now = new Date();
  const newQuery: SavedQuery = {
    ...query,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  await db.savedQueries.add(newQuery);
  return newQuery;
}

export async function getSavedQueryById(
  id: string
): Promise<SavedQuery | undefined> {
  return db.savedQueries.get(id);
}

export async function getSavedQueriesByConnectionId(
  connectionId: string
): Promise<SavedQuery[]> {
  return db.savedQueries.where("connectionId").equals(connectionId).toArray();
}

export async function updateSavedQuery(
  id: string,
  updates: Partial<Omit<SavedQuery, "id" | "createdAt" | "connectionId">>
): Promise<void> {
  await db.savedQueries.update(id, {
    ...updates,
    updatedAt: new Date(),
  });
}

export async function deleteSavedQuery(id: string): Promise<void> {
  await db.savedQueries.delete(id);
}

export async function deleteSavedQueriesByConnectionId(
  connectionId: string
): Promise<void> {
  const queries = await getSavedQueriesByConnectionId(connectionId);
  await Promise.all(queries.map((q) => deleteSavedQuery(q.id)));
}

// Dashboard operations
export async function createDashboard(
  dashboard: Omit<SavedDashboard, "id" | "createdAt" | "updatedAt">
): Promise<SavedDashboard> {
  const now = new Date();
  const newDashboard: SavedDashboard = {
    ...dashboard,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  await db.dashboards.add(newDashboard);
  return newDashboard;
}

export async function getDashboardById(
  id: string
): Promise<SavedDashboard | undefined> {
  return db.dashboards.get(id);
}

export async function getAllDashboards(): Promise<SavedDashboard[]> {
  return db.dashboards.toArray();
}

export async function updateDashboard(
  id: string,
  updates: Partial<Omit<SavedDashboard, "id" | "createdAt">>
): Promise<void> {
  await db.dashboards.update(id, {
    ...updates,
    updatedAt: new Date(),
  });
}

export async function deleteDashboard(id: string): Promise<void> {
  await db.dashboards.delete(id);
}

// SavedSearch operations
export async function createSavedSearchRow(
  input: Omit<SavedSearch, "id" | "createdAt" | "updatedAt">,
): Promise<SavedSearch> {
  const now = new Date();
  const row: SavedSearch = {
    ...input,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  await db.savedSearches.add(row);
  return row;
}

export async function getSavedSearchById(
  id: string,
): Promise<SavedSearch | undefined> {
  return db.savedSearches.get(id);
}

export async function getAllSavedSearches(): Promise<SavedSearch[]> {
  return db.savedSearches.toArray();
}

export async function updateSavedSearchRow(
  id: string,
  updates: Partial<Omit<SavedSearch, "id" | "createdAt">>,
): Promise<void> {
  await db.savedSearches.update(id, {
    ...updates,
    updatedAt: new Date(),
  });
}

export async function deleteSavedSearchRow(id: string): Promise<void> {
  await db.savedSearches.delete(id);
}

// Alert operations
export async function createAlertRow(
  input: Omit<SavedAlert, "id" | "createdAt" | "updatedAt">,
): Promise<SavedAlert> {
  const now = new Date();
  const row: SavedAlert = {
    ...input,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  await db.alerts.add(row);
  return row;
}

export async function getAlertById(id: string): Promise<SavedAlert | undefined> {
  return db.alerts.get(id);
}

export async function getAllAlerts(): Promise<SavedAlert[]> {
  return db.alerts.toArray();
}

export async function updateAlertRow(
  id: string,
  updates: Partial<Omit<SavedAlert, "id" | "createdAt">>,
): Promise<void> {
  await db.alerts.update(id, {
    ...updates,
    updatedAt: new Date(),
  });
}

export async function deleteAlertRow(id: string): Promise<void> {
  await db.alerts.delete(id);
}

// Export re-exports schema types
export * from "./schema";
