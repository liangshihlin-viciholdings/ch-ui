// src/db/alerts.ts
// Typed Dexie wrappers around the `alerts` and `savedSearches` tables.
//
// Converts between persisted (Date + opaque blobs) and runtime (ISO strings
// + typed config) shapes. Features should never touch the raw DB rows —
// they import the typed helpers from this module.

import type {
  Alert,
  AlertConfig,
  ThresholdOperator,
  EvaluationInterval,
} from "@/features/alerts/types";
import type { SavedSearchRuntime, SearchFilter } from "@/features/search/types";
import {
  createAlertRow,
  getAlertById,
  getAllAlerts,
  updateAlertRow,
  deleteAlertRow,
  createSavedSearchRow,
  getSavedSearchById,
  getAllSavedSearches,
  updateSavedSearchRow,
  deleteSavedSearchRow,
} from "@/lib/db";
import type { SavedAlert, SavedSearch } from "@/lib/db/schema";

// ─── Alerts ──────────────────────────────────────────────────────────────

function alertToRuntime(row: SavedAlert): Alert {
  return {
    id: row.id,
    name: row.name,
    tableName: row.tableName,
    config: row.config as AlertConfig,
    thresholdOperator: row.thresholdOperator as ThresholdOperator,
    thresholdValue: row.thresholdValue,
    evaluationInterval: row.evaluationInterval as EvaluationInterval,
    enabled: row.enabled,
    lastTriggered: row.lastTriggered?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listAlerts(): Promise<Alert[]> {
  const rows = await getAllAlerts();
  return rows.map(alertToRuntime);
}

export async function getAlert(id: string): Promise<Alert | null> {
  const row = await getAlertById(id);
  return row ? alertToRuntime(row) : null;
}

export interface CreateAlertInput {
  name: string;
  tableName: string;
  config: AlertConfig;
  thresholdOperator: ThresholdOperator;
  thresholdValue: number;
  evaluationInterval: EvaluationInterval;
  enabled?: boolean;
}

export async function createAlert(input: CreateAlertInput): Promise<Alert> {
  const row = await createAlertRow({
    name: input.name,
    tableName: input.tableName,
    config: input.config,
    thresholdOperator: input.thresholdOperator,
    thresholdValue: input.thresholdValue,
    evaluationInterval: input.evaluationInterval,
    enabled: input.enabled ?? true,
  });
  return alertToRuntime(row);
}

export interface UpdateAlertInput {
  name?: string;
  tableName?: string;
  config?: AlertConfig;
  thresholdOperator?: ThresholdOperator;
  thresholdValue?: number;
  evaluationInterval?: EvaluationInterval;
  enabled?: boolean;
  lastTriggered?: Date;
}

export async function updateAlert(
  id: string,
  input: UpdateAlertInput,
): Promise<Alert | null> {
  const patch: Partial<SavedAlert> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.tableName !== undefined) patch.tableName = input.tableName;
  if (input.config !== undefined) patch.config = input.config;
  if (input.thresholdOperator !== undefined)
    patch.thresholdOperator = input.thresholdOperator;
  if (input.thresholdValue !== undefined)
    patch.thresholdValue = input.thresholdValue;
  if (input.evaluationInterval !== undefined)
    patch.evaluationInterval = input.evaluationInterval;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.lastTriggered !== undefined) patch.lastTriggered = input.lastTriggered;

  await updateAlertRow(id, patch);
  return getAlert(id);
}

export async function deleteAlert(id: string): Promise<void> {
  await deleteAlertRow(id);
}

// ─── Saved Searches ──────────────────────────────────────────────────────

function searchToRuntime(row: SavedSearch): SavedSearchRuntime {
  return {
    id: row.id,
    name: row.name,
    query: row.query,
    tableName: row.tableName,
    filters: (row.filters as SearchFilter[]) ?? [],
    connectionId: row.connectionId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listSavedSearches(): Promise<SavedSearchRuntime[]> {
  const rows = await getAllSavedSearches();
  return rows.map(searchToRuntime);
}

export async function getSavedSearch(
  id: string,
): Promise<SavedSearchRuntime | null> {
  const row = await getSavedSearchById(id);
  return row ? searchToRuntime(row) : null;
}

export interface CreateSavedSearchInput {
  name: string;
  query: string;
  tableName: string;
  filters?: SearchFilter[];
  connectionId?: string | null;
}

export async function createSavedSearch(
  input: CreateSavedSearchInput,
): Promise<SavedSearchRuntime> {
  const row = await createSavedSearchRow({
    name: input.name,
    query: input.query,
    tableName: input.tableName,
    filters: input.filters ?? [],
    connectionId: input.connectionId ?? null,
  });
  return searchToRuntime(row);
}

export interface UpdateSavedSearchInput {
  name?: string;
  query?: string;
  tableName?: string;
  filters?: SearchFilter[];
  connectionId?: string | null;
}

export async function updateSavedSearch(
  id: string,
  input: UpdateSavedSearchInput,
): Promise<SavedSearchRuntime | null> {
  const patch: Partial<SavedSearch> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.query !== undefined) patch.query = input.query;
  if (input.tableName !== undefined) patch.tableName = input.tableName;
  if (input.filters !== undefined) patch.filters = input.filters;
  if (input.connectionId !== undefined) patch.connectionId = input.connectionId;

  await updateSavedSearchRow(id, patch);
  return getSavedSearch(id);
}

export async function deleteSavedSearch(id: string): Promise<void> {
  await deleteSavedSearchRow(id);
}
