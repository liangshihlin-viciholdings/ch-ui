// src/db/dashboards.ts
// Typed Dexie wrappers that map SavedDashboard (persistence shape) to
// Dashboard (runtime shape in src/features/analytics/types.ts).
//
// The runtime Dashboard uses ISO date strings and typed tile/filter shapes
// while Dexie stores Date objects + opaque unknown[] blobs. These helpers
// centralise that conversion so feature code never touches the raw DB row.

import type {
  Dashboard,
  DashboardTile,
  DashboardFilter,
} from "@/features/analytics/types";
import {
  createDashboard as dbCreate,
  getAllDashboards as dbList,
  getDashboardById as dbGet,
  updateDashboard as dbUpdate,
  deleteDashboard as dbDelete,
} from "@/lib/db";
import type { SavedDashboard } from "@/lib/db/schema";

function toRuntime(row: SavedDashboard): Dashboard {
  return {
    id: row.id,
    name: row.name,
    tiles: (row.tiles as DashboardTile[]) ?? [],
    tags: row.tags ?? [],
    filters: (row.filters as DashboardFilter[]) ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listDashboards(): Promise<Dashboard[]> {
  const rows = await dbList();
  return rows.map(toRuntime);
}

export async function getDashboard(id: string): Promise<Dashboard | null> {
  const row = await dbGet(id);
  return row ? toRuntime(row) : null;
}

export interface CreateDashboardInput {
  name: string;
  description?: string;
  tiles?: DashboardTile[];
  tags?: string[];
  filters?: DashboardFilter[];
}

export async function createDashboard(
  input: CreateDashboardInput,
): Promise<Dashboard> {
  const row = await dbCreate({
    name: input.name,
    description: input.description,
    tiles: input.tiles ?? [],
    tags: input.tags ?? [],
    filters: input.filters ?? [],
  });
  return toRuntime(row);
}

export interface UpdateDashboardInput {
  name?: string;
  description?: string;
  tiles?: DashboardTile[];
  tags?: string[];
  filters?: DashboardFilter[];
}

export async function updateDashboard(
  id: string,
  input: UpdateDashboardInput,
): Promise<Dashboard | null> {
  // Only include defined keys so Dexie doesn't wipe existing values.
  const patch: Partial<SavedDashboard> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.tiles !== undefined) patch.tiles = input.tiles;
  if (input.tags !== undefined) patch.tags = input.tags;
  if (input.filters !== undefined) patch.filters = input.filters;

  await dbUpdate(id, patch);
  return getDashboard(id);
}

export async function deleteDashboard(id: string): Promise<void> {
  await dbDelete(id);
}
