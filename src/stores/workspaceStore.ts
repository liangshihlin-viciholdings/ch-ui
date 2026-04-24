// src/stores/workspaceStore.ts
// Primary application store (credentials, tabs, explorer, admin, saved queries).
//
// Replaces the previous Zustand `useAppStore`. The store is backed by TanStack
// Store and exposes a hook that mirrors the old API shape, so destructuring
// consumers (and `useAppStore.getState()` callers) keep working unchanged.

import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import { createClient } from "@clickhouse/client-web";
import type { ClickHouseClient, ResponseJSON } from "@clickhouse/client-web";
import type { OverflowMode } from "@clickhouse/client-common/dist/settings";
import { toast } from "sonner";

import {
  AppState,
  Credential,
  DatabaseInfo,
  ClickHouseSettings,
  QueryResult,
  SavedQuery,
  MultiQueryResult,
} from "@/types/common";
import {
  isCreateOrInsert,
  isExplainQuery,
  isJsonExplain,
  extractQueryParams,
} from "@/helpers/sqlUtils";
import { ExplainParser } from "@/features/workspace/explain/parser";
import { appQueries } from "@/features/workspace/editor/appQueries";
import { connectionStore } from "@/stores/connectionStore";
import { ClickHouseError } from "@/lib/clickhouseError";
import {
  createSavedQuery,
  getSavedQueriesByConnectionId,
  updateSavedQuery as dbUpdateSavedQuery,
  deleteSavedQuery as dbDeleteSavedQuery,
} from "@/lib/db";

// Re-export ClickHouseError from the legacy location for backwards compatibility
// with consumers that import `{ ClickHouseError }` from the store module.
export { ClickHouseError } from "@/lib/clickhouseError";

const MAPPED_TABLE_TYPE: Record<string, string> = {
  view: "view",
  dictionary: "dictionary",
  materializedview: "materialized_view",
};

// AbortControllers for in-flight queries, keyed by tabId. Kept outside the
// store to avoid serialization issues.
const queryAbortControllers = new Map<string, AbortController>();

interface AdminCheckResponse {
  data: Array<{ is_admin: boolean }>;
}

// ─── Initial State ──────────────────────────────────────────────────────────

const DEFAULT_CREDENTIAL: Credential = {
  url: "",
  username: "",
  password: "",
  useAdvanced: false,
  customPath: "",
  requestTimeout: 30000,
};

const DEFAULT_SETTINGS: ClickHouseSettings = {
  max_result_rows: "200",
  max_result_bytes: "0",
  result_overflow_mode: "break" as OverflowMode,
};

type PersistedState = {
  credential: Credential;
  activeTab: string;
  tabs: AppState["tabs"];
  clickhouseSettings: ClickHouseSettings;
  isAdmin: boolean;
};

const STORAGE_KEY = "app-storage";

function loadPersisted(): Partial<PersistedState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const state = parsed?.state ?? parsed;
    return state ?? {};
  } catch {
    return {};
  }
}

const persisted = loadPersisted();

// Core in-memory state. We intentionally don't type the store as AppState
// because AppState includes the action methods; those are defined separately
// and re-merged in the hook.
export interface WorkspaceStateData {
  // Core / credentials
  credential: Credential;
  clickHouseClient: ClickHouseClient | null;
  isLoadingCredentials: boolean;
  isServerAvailable: boolean;
  isInitialized: boolean;
  version: string;
  error: string;
  credentialSource: "env" | "app" | null;
  updatedSavedQueriesTrigger: string;
  clickhouseSettings: ClickHouseSettings;

  // Workspace
  tabs: AppState["tabs"];
  activeTab: string;
  tabError: string | null;
  isTabLoading: boolean;

  // Explorer
  dataBaseExplorer: DatabaseInfo[];
  isLoadingDatabase: boolean;
  isCreateTableModalOpen: boolean;
  isCreateDatabaseModalOpen: boolean;
  isUploadFileModalOpen: boolean;
  selectedDatabaseForCreateTable: string;
  selectedDatabaseForCreateDatabase: string | null;
  selectedTableForCreateTable: string | null;
  selectedTableForCreateDatabase: string | null;
  selectedDatabaseForDelete: string | null;
  selectedTableForDelete: string | null;
  selectedDatabaseForUpload: string;
  selectedDatabase: string | null;

  // Admin
  isAdmin: boolean;
  userPrivileges: AppState["userPrivileges"];
}

export const workspaceStore = new Store<WorkspaceStateData>({
  credential: persisted.credential ?? DEFAULT_CREDENTIAL,
  clickHouseClient: null,
  isLoadingCredentials: false,
  isServerAvailable: false,
  isInitialized: false,
  version: "",
  error: "",
  credentialSource: null,
  updatedSavedQueriesTrigger: "",
  clickhouseSettings: persisted.clickhouseSettings ?? DEFAULT_SETTINGS,

  tabs: persisted.tabs ?? [],
  activeTab: persisted.activeTab ?? "home",
  tabError: null,
  isTabLoading: false,

  dataBaseExplorer: [],
  isLoadingDatabase: false,
  isCreateTableModalOpen: false,
  isCreateDatabaseModalOpen: false,
  isUploadFileModalOpen: false,
  selectedDatabaseForCreateTable: "",
  selectedDatabaseForCreateDatabase: null,
  selectedTableForCreateTable: null,
  selectedTableForCreateDatabase: null,
  selectedDatabaseForDelete: null,
  selectedTableForDelete: null,
  selectedDatabaseForUpload: "",
  selectedDatabase: null,

  isAdmin: persisted.isAdmin ?? false,
  userPrivileges: null,
});

// DEBUG: Log state size on changes
workspaceStore.subscribe(() => {
  const s = workspaceStore.state;
  const tabsWithResults = s.tabs.filter((t) => t.result?.data?.length);
  console.log("[Store] state change", {
    tabCount: s.tabs.length,
    tabsWithResults: tabsWithResults.length,
    totalRows: tabsWithResults.reduce(
      (sum, t) => sum + (t.result?.data?.length ?? 0),
      0
    ),
  });
});

// Persist a subset of state (mirrors the old Zustand `partialize`).
workspaceStore.subscribe(() => {
  try {
    const s = workspaceStore.state;
    const payload: PersistedState = {
      credential: s.credential,
      activeTab: s.activeTab,
      tabs: s.tabs.map((t) => ({
        ...t,
        // Avoid persisting heavy query results.
        result: undefined,
        isLoading: false,
        error: null,
      })),
      clickhouseSettings: s.clickhouseSettings,
      isAdmin: s.isAdmin,
    };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: payload, version: 0 }),
    );
  } catch {
    // Ignore quota errors
  }
});

// ─── Internal helpers ───────────────────────────────────────────────────────

function patch(updates: Partial<WorkspaceStateData>) {
  workspaceStore.setState((prev) => ({ ...prev, ...updates }));
}

// ─── Actions: Credentials / Connection ─────────────────────────────────────

export function setCredentialSource(source: "env" | "app" | null) {
  patch({ credentialSource: source });
}

export async function setCredential(credential: Credential): Promise<void> {
  patch({ credential, isLoadingCredentials: true, error: "" });
  try {
    const client = createClient({
      url: credential.url.replace(/\/+$/, ""),
      pathname: credential.useAdvanced ? credential.customPath : undefined,
      username: credential.username,
      password: credential.password || "",
      request_timeout: credential.requestTimeout || 30000,
      database: credential.database,
      clickhouse_settings: {
        ...workspaceStore.state.clickhouseSettings,
        result_overflow_mode: "break",
      },
    });
    patch({ clickHouseClient: client });
    await checkServerStatus();
    await checkIsAdmin();
    await checkUserPrivileges();
  } catch (error) {
    const enhancedError = ClickHouseError.fromError(
      error,
      "Failed to set connection credentials",
    );

    patch({
      error: `${enhancedError.message}\n\nTroubleshooting tips:\n${enhancedError.troubleshootingTips.join(
        "\n",
      )}`,
      isServerAvailable: false,
    });

    toast.error(`Connection error: ${enhancedError.message}`, {
      description:
        "Please check the troubleshooting tips in the settings panel.",
    });
  } finally {
    patch({ isLoadingCredentials: false });
  }
}

export async function updateConfiguration(
  clickhouseSettings: ClickHouseSettings,
): Promise<void> {
  try {
    const credentials = workspaceStore.state.credential;
    const client = createClient({
      url: credentials.url.replace(/\/+$/, ""),
      pathname: credentials.useAdvanced ? credentials.customPath : undefined,
      username: credentials.username,
      password: credentials.password || "",
      request_timeout: credentials.requestTimeout || 30000,
      clickhouse_settings: clickhouseSettings,
    });
    patch({ clickHouseClient: client, clickhouseSettings });
    await checkServerStatus();
  } catch (error) {
    const enhancedError = ClickHouseError.fromError(
      error,
      "Failed to update ClickHouse configuration",
    );

    toast.error(`Configuration error: ${enhancedError.message}`, {
      description: "Check the troubleshooting tips for possible solutions.",
    });

    throw enhancedError;
  }
}

export async function clearCredentials(): Promise<void> {
  patch({
    credential: DEFAULT_CREDENTIAL,
    clickhouseSettings: DEFAULT_SETTINGS,
    clickHouseClient: null,
    isServerAvailable: false,
    version: "",
    error: "",
  });
}

export async function checkServerStatus(): Promise<void> {
  const { clickHouseClient } = workspaceStore.state;
  patch({ isLoadingCredentials: true, error: "" });
  try {
    if (!clickHouseClient) {
      throw new ClickHouseError(
        "ClickHouse client is not initialized",
        null,
        "connection",
        ["Please enter your connection details and try again"],
      );
    }
    await clickHouseClient.ping();
    const versionResult = await clickHouseClient.query({
      query: "SELECT version()",
    });
    const versionData = (await versionResult.json()) as {
      data: { "version()": string }[];
    };
    const version = versionData.data[0]["version()"];
    patch({ isServerAvailable: true, version });
  } catch (error: any) {
    const enhancedError = ClickHouseError.fromError(
      error,
      "Failed to connect to ClickHouse server",
    );

    patch({
      isServerAvailable: false,
      error: `${enhancedError.message}\n\nTroubleshooting tips:\n${enhancedError.troubleshootingTips.join(
        "\n",
      )}`,
    });

    if (
      enhancedError.category === "connection" ||
      enhancedError.category === "authentication"
    ) {
      await clearCredentials();
      toast.error(`Connection failed: ${enhancedError.message}`, {
        description:
          "Your credentials have been cleared. Please try again with correct information.",
      });
    } else {
      toast.error(`Connection error: ${enhancedError.message}`, {
        description:
          "Check the troubleshooting tips for suggestions to resolve this issue.",
      });
    }
  } finally {
    patch({ isLoadingCredentials: false });
  }
}

// ─── Actions: Query Execution ──────────────────────────────────────────────

export async function runQuery(
  query: string,
  tabId?: string,
): Promise<QueryResult> {
  const { clickHouseClient } = workspaceStore.state;
  if (!clickHouseClient) {
    throw new Error("ClickHouse client is not initialized");
  }

  const abortController = new AbortController();
  if (tabId) {
    queryAbortControllers.get(tabId)?.abort();
    queryAbortControllers.set(tabId, abortController);
    workspaceStore.setState((state) => ({
      ...state,
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, isLoading: true, error: null } : tab,
      ),
    }));
  }

  try {
    const trimmedQuery = query.trim();
    const { cleanedQuery, queryParams } = extractQueryParams(trimmedQuery);
    const queryToRun = cleanedQuery || trimmedQuery;
    const hasQueryParams = Object.keys(queryParams).length > 0;

    if (!queryToRun) {
      const result: QueryResult = {
        meta: [],
        data: [],
        statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
        rows: 0,
        error: null,
      };
      if (tabId) {
        await updateTab(tabId, { result, isLoading: false, error: null });
      }
      return result;
    }

    if (isCreateOrInsert(queryToRun)) {
      await clickHouseClient.command({
        query: queryToRun,
        abort_signal: abortController.signal,
      });
      const result: QueryResult = {
        meta: [],
        data: [],
        statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
        rows: 0,
        error: null,
      };
      if (tabId) {
        await updateTab(tabId, { result, isLoading: false, error: null });
      }
      return result;
    }

    const result = await clickHouseClient.query({
      query: queryToRun,
      ...(hasQueryParams && { query_params: queryParams }),
      abort_signal: abortController.signal,
    });

    let processedResult: QueryResult;

    if (isExplainQuery(trimmedQuery) && !isJsonExplain(trimmedQuery)) {
      const textResult = await result.text();
      const rows = textResult
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => ({ explain: line }));
      const syntheticJson = {
        meta: [{ name: "explain", type: "String" }],
        data: rows,
        rows: rows.length,
        statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
      };
      processedResult = {
        meta: syntheticJson.meta,
        data: syntheticJson.data,
        statistics: syntheticJson.statistics,
        rows: syntheticJson.rows,
        error: null,
      };
      processedResult.explainResult = ExplainParser.parse(
        trimmedQuery,
        syntheticJson,
      );
    } else {
      const jsonResult = (await result.json()) as any;
      processedResult = {
        meta: jsonResult.meta || [],
        data: jsonResult.data || [],
        statistics: jsonResult.statistics || {
          elapsed: 0,
          rows_read: 0,
          bytes_read: 0,
        },
        rows: jsonResult.rows || 0,
        error: null,
      };

      if (isExplainQuery(trimmedQuery)) {
        processedResult.explainResult = ExplainParser.parse(
          trimmedQuery,
          jsonResult,
        );
      }
    }

    if (tabId) {
      await updateTab(tabId, {
        result: processedResult,
        isLoading: false,
      });
    }
    return processedResult;
  } catch (error: any) {
    const errorResult: QueryResult = {
      meta: [],
      data: [],
      statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
      rows: 0,
      error: error.message,
    };
    if (tabId) {
      await updateTab(tabId, {
        result: errorResult,
        isLoading: false,
        error: error.message,
      });
    }
    return errorResult;
  } finally {
    if (tabId) {
      queryAbortControllers.delete(tabId);
      workspaceStore.setState((state) => ({
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === tabId ? { ...tab, isLoading: false } : tab,
        ),
      }));
    }
  }
}

export async function runAllQueries(
  queries: string[],
  tabId: string,
): Promise<MultiQueryResult[]> {
  const { clickHouseClient } = workspaceStore.state;
  if (!clickHouseClient) {
    throw new Error("ClickHouse client is not initialized");
  }

  const abortController = new AbortController();
  queryAbortControllers.get(tabId)?.abort();
  queryAbortControllers.set(tabId, abortController);

  workspaceStore.setState((state) => ({
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === tabId
        ? { ...tab, isLoading: true, error: null, results: [], result: null }
        : tab,
    ),
  }));

  const results: MultiQueryResult[] = [];
  const accumulatedParams: Record<string, string> = {};

  for (let i = 0; i < queries.length; i++) {
    if (abortController.signal.aborted) break;

    const query = queries[i];
    try {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) continue;

      const { cleanedQuery, queryParams } = extractQueryParams(trimmedQuery);
      Object.assign(accumulatedParams, queryParams);
      const queryToRun = cleanedQuery || trimmedQuery;
      const hasQueryParams = Object.keys(accumulatedParams).length > 0;

      if (!queryToRun) continue;

      let queryResult: QueryResult;

      if (isCreateOrInsert(queryToRun)) {
        await clickHouseClient.command({
          query: queryToRun,
          abort_signal: abortController.signal,
        });
        queryResult = {
          meta: [],
          data: [],
          statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
          rows: 0,
          error: null,
        };
      } else if (isExplainQuery(queryToRun) && !isJsonExplain(queryToRun)) {
        const result = await clickHouseClient.query({
          query: queryToRun,
          ...(hasQueryParams && {
            query_params: { ...accumulatedParams },
          }),
          abort_signal: abortController.signal,
        });
        const textResult = await result.text();
        const rows = textResult
          .split("\n")
          .filter((line) => line.length > 0)
          .map((line) => ({ explain: line }));
        const syntheticJson = {
          meta: [{ name: "explain", type: "String" }],
          data: rows,
          rows: rows.length,
          statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
        };
        queryResult = {
          meta: syntheticJson.meta,
          data: syntheticJson.data,
          statistics: syntheticJson.statistics,
          rows: syntheticJson.rows,
          error: null,
        };
        queryResult.explainResult = ExplainParser.parse(
          queryToRun,
          syntheticJson,
        );
      } else {
        const result = await clickHouseClient.query({
          query: queryToRun,
          ...(hasQueryParams && {
            query_params: { ...accumulatedParams },
          }),
          abort_signal: abortController.signal,
        });
        const jsonResult = (await result.json()) as any;
        queryResult = {
          meta: jsonResult.meta || [],
          data: jsonResult.data || [],
          statistics: jsonResult.statistics || {
            elapsed: 0,
            rows_read: 0,
            bytes_read: 0,
          },
          rows: jsonResult.rows || 0,
          error: null,
        };

        if (isExplainQuery(queryToRun)) {
          queryResult.explainResult = ExplainParser.parse(
            queryToRun,
            jsonResult,
          );
        }
      }

      results.push({
        queryIndex: i,
        queryText: trimmedQuery,
        result: queryResult,
      });
    } catch (error: any) {
      results.push({
        queryIndex: i,
        queryText: query.trim(),
        result: {
          meta: [],
          data: [],
          statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
          rows: 0,
          error: error.message,
        },
      });
    }
  }

  queryAbortControllers.delete(tabId);

  await updateTab(tabId, {
    results,
    activeResultIndex: 0,
    isLoading: false,
    error: null,
    result: null,
  });

  return results;
}

export function cancelQuery(tabId: string) {
  const controller = queryAbortControllers.get(tabId);
  if (controller) {
    controller.abort();
    queryAbortControllers.delete(tabId);
  }
  workspaceStore.setState((state) => ({
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === tabId ? { ...tab, isLoading: false, error: null } : tab,
    ),
  }));
}

// ─── Actions: App lifecycle ────────────────────────────────────────────────

export async function initializeApp(): Promise<void> {
  const { credential, tabs } = workspaceStore.state;
  if (credential.url && credential.username) {
    await setCredential(credential);
  }
  if (!tabs || tabs.length === 0) {
    patch({
      tabs: [
        {
          id: "home",
          title: "Home",
          content: "",
          type: "home",
        },
      ],
      activeTab: "home",
    });
  }
  patch({ isInitialized: true });
}

// ─── Actions: Tabs ─────────────────────────────────────────────────────────

export async function addTab(tab: AppState["tabs"][number]): Promise<void> {
  const { tabs } = workspaceStore.state;
  const existingTab = tabs.find((t) => t.id === tab.id);
  if (existingTab) {
    patch({ activeTab: existingTab.id });
    return;
  }
  workspaceStore.setState((state) => ({
    ...state,
    tabs: [...state.tabs, tab],
    activeTab: tab.id,
  }));
}

export async function updateTab(
  tabId: string,
  updates: Partial<AppState["tabs"][number]>,
): Promise<void> {
  workspaceStore.setState((state) => ({
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === tabId ? { ...tab, ...updates } : tab,
    ),
  }));
}

export async function removeTab(tabId: string): Promise<void> {
  // Clean up any running query for this tab
  queryAbortControllers.get(tabId)?.abort();
  queryAbortControllers.delete(tabId);

  const { tabs, activeTab } = workspaceStore.state;
  const updatedTabs = tabs.filter((tab) => tab.id !== tabId);
  const nextActiveTab =
    activeTab === tabId
      ? updatedTabs[updatedTabs.length - 1]?.id || "home"
      : activeTab;
  patch({ tabs: updatedTabs, activeTab: nextActiveTab });
}

export async function duplicateTab(tabId: string): Promise<void> {
  const { tabs } = workspaceStore.state;
  const tabToDuplicate = tabs.find((tab) => tab.id === tabId);
  if (!tabToDuplicate) {
    throw new Error("Tab not found");
  }
  // Don't copy query results - they can be huge and would double memory usage
  const newTab = {
    ...tabToDuplicate,
    id: `tab-${Date.now()}`,
    title: `${tabToDuplicate.title} (Copy)`,
    result: undefined,
    results: undefined,
    isLoading: false,
    error: null,
  };
  workspaceStore.setState((state) => ({
    ...state,
    tabs: [...state.tabs, newTab],
    activeTab: newTab.id,
  }));
}

export async function closeAllTabs(): Promise<void> {
  const { tabs } = workspaceStore.state;
  const home = tabs.find((tab) => tab.id === "home");
  if (!home) return;
  patch({ tabs: [home], activeTab: "home" });
}

export async function updateTabTitle(
  tabId: string,
  newTitle: string,
): Promise<void> {
  const { tabs } = workspaceStore.state;
  const updatedTabs = tabs.map((tab) =>
    tab.id === tabId ? { ...tab, title: newTitle } : tab,
  );
  const updatedTab = updatedTabs.find((tab) => tab.id === tabId);
  if (!updatedTab) {
    throw new Error("Tab not found");
  }
  patch({ tabs: updatedTabs });
  toast.success(`Tab title updated to "${newTitle}"`);
}

export function setActiveTab(tabId: string) {
  patch({ activeTab: tabId });
}

export function getTabById(tabId: string) {
  return workspaceStore.state.tabs.find((tab) => tab.id === tabId);
}

export function moveTab(oldIndex: number, newIndex: number) {
  const tabs = [...workspaceStore.state.tabs];
  const [removed] = tabs.splice(oldIndex, 1);
  tabs.splice(newIndex, 0, removed);
  patch({ tabs });
}

// ─── Actions: Explorer ─────────────────────────────────────────────────────

export async function fetchDatabaseInfo(): Promise<void> {
  const { clickHouseClient } = workspaceStore.state;
  if (!clickHouseClient) {
    console.warn("fetchDatabaseInfo: ClickHouse client is not initialized");
    patch({ isLoadingDatabase: false });
    return;
  }
  patch({ isLoadingDatabase: true });
  try {
    const query = appQueries.getDatabasesTables.query;
    if (!query) {
      throw new Error("getDatabasesTables query not found");
    }
    const result = await clickHouseClient.query({ query });
    const resultJSON = (await result.json()) as {
      data: Array<{
        database_name: string;
        table_name?: string;
        table_type?: string;
        total_bytes?: number;
      }>;
    };
    const databases: Record<string, DatabaseInfo> = {};

    resultJSON.data.forEach((row) => {
      const { database_name, table_name, table_type, total_bytes } = row;
      if (!databases[database_name]) {
        databases[database_name] = {
          name: database_name,
          type: "database",
          children: [],
        };
      }
      if (table_name) {
        const table_type_mapped =
          (table_type && MAPPED_TABLE_TYPE[table_type.toLowerCase()]) ||
          "table";
        databases[database_name].children.push({
          name: table_name,
          type: table_type_mapped,
          total_bytes: total_bytes ?? 0,
        });
      }
    });

    const databasesArray = Object.values(databases).map((database) => ({
      ...database,
      children: database.children.length > 0 ? database.children : [],
    }));
    patch({ dataBaseExplorer: databasesArray, isLoadingDatabase: false });
  } catch (error) {
    toast.error(
      `Failed to fetch database info: ${(error as Error).message}`,
    );
    patch({ isLoadingDatabase: false });
  }
}

export function closeCreateTableModal() {
  patch({ isCreateTableModalOpen: false, selectedDatabaseForCreateTable: "" });
}

export function openCreateTableModal(database: string) {
  patch({
    isCreateTableModalOpen: true,
    selectedDatabaseForCreateTable: database,
  });
}

export function closeCreateDatabaseModal() {
  patch({ isCreateDatabaseModalOpen: false });
}

export function openCreateDatabaseModal() {
  patch({ isCreateDatabaseModalOpen: true });
}

export function closeUploadFileModal() {
  patch({ isUploadFileModalOpen: false, selectedDatabaseForUpload: "" });
}

export function openUploadFileModal(database: string) {
  patch({
    isUploadFileModalOpen: true,
    selectedDatabaseForUpload: database,
  });
}

export function setSelectedDatabase(database: string | null) {
  patch({ selectedDatabase: database });
}

// ─── Actions: Admin & Saved Queries ────────────────────────────────────────

export async function checkIsAdmin(): Promise<boolean> {
  const { clickHouseClient } = workspaceStore.state;
  if (!clickHouseClient) {
    console.warn("checkIsAdmin: ClickHouse client is not initialized");
    patch({ isAdmin: false });
    return false;
  }
  try {
    const result = await clickHouseClient.query({
      query: `
        SELECT if(grant_option = 1, true, false) AS is_admin
        FROM system.grants
        WHERE user_name = currentUser()
        LIMIT 1
      `,
    });
    const response = (await result.json()) as AdminCheckResponse;
    if (!Array.isArray(response.data) || response.data.length === 0) {
      throw new ClickHouseError("No admin status data returned");
    }
    patch({ isAdmin: response.data[0].is_admin });
    return response.data[0].is_admin;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Failed to check admin status:", errorMessage);
    patch({ isAdmin: false });
    return false;
  }
}

export async function checkUserPrivileges(): Promise<void> {
  const { clickHouseClient } = workspaceStore.state;
  if (!clickHouseClient) {
    console.warn("checkUserPrivileges: ClickHouse client is not initialized");
    patch({ userPrivileges: null });
    return;
  }

  try {
    const query = `
      SELECT DISTINCT access_type, grant_option
      FROM system.grants
      WHERE user_name = currentUser()
         OR role_name IN (
           SELECT granted_role_name
           FROM system.role_grants
           WHERE user_name = currentUser()
         )
    `;

    const result = await clickHouseClient.query({ query });
    const response = (await result.json()) as ResponseJSON<{
      access_type: string;
      grant_option: number;
    }>;

    const grantedPrivileges = new Set(
      response.data.map(
        (row: { access_type: string; grant_option: number }) =>
          row.access_type.toUpperCase(),
      ),
    );
    const hasGrantOption = response.data.some(
      (row: { access_type: string; grant_option: number }) =>
        row.grant_option === 1,
    );

    const hasPrivilege = (privilege: string): boolean =>
      grantedPrivileges.has(privilege.toUpperCase()) ||
      grantedPrivileges.has("ALL");

    patch({
      userPrivileges: {
        canShowUsers:
          hasPrivilege("SHOW USERS") || hasPrivilege("SHOW ACCESS"),
        canShowRoles:
          hasPrivilege("SHOW ROLES") || hasPrivilege("SHOW ACCESS"),
        canShowQuotas:
          hasPrivilege("SHOW QUOTAS") || hasPrivilege("SHOW ACCESS"),
        canShowRowPolicies:
          hasPrivilege("SHOW ROW POLICIES") || hasPrivilege("SHOW ACCESS"),
        canShowSettingsProfiles:
          hasPrivilege("SHOW SETTINGS PROFILES") ||
          hasPrivilege("SHOW ACCESS"),

        canAlterUser:
          hasPrivilege("ALTER USER") || hasPrivilege("ACCESS MANAGEMENT"),
        canCreateUser:
          hasPrivilege("CREATE USER") || hasPrivilege("ACCESS MANAGEMENT"),
        canDropUser:
          hasPrivilege("DROP USER") || hasPrivilege("ACCESS MANAGEMENT"),

        canAlterRole:
          hasPrivilege("ALTER ROLE") ||
          hasPrivilege("ROLE ADMIN") ||
          hasPrivilege("ACCESS MANAGEMENT"),
        canCreateRole:
          hasPrivilege("CREATE ROLE") ||
          hasPrivilege("ROLE ADMIN") ||
          hasPrivilege("ACCESS MANAGEMENT"),
        canDropRole:
          hasPrivilege("DROP ROLE") ||
          hasPrivilege("ROLE ADMIN") ||
          hasPrivilege("ACCESS MANAGEMENT"),

        canAlterQuota:
          hasPrivilege("ALTER QUOTA") || hasPrivilege("ACCESS MANAGEMENT"),
        canCreateQuota:
          hasPrivilege("CREATE QUOTA") || hasPrivilege("ACCESS MANAGEMENT"),
        canDropQuota:
          hasPrivilege("DROP QUOTA") || hasPrivilege("ACCESS MANAGEMENT"),

        canAlterRowPolicy:
          hasPrivilege("ALTER ROW POLICY") ||
          hasPrivilege("ACCESS MANAGEMENT"),
        canCreateRowPolicy:
          hasPrivilege("CREATE ROW POLICY") ||
          hasPrivilege("ACCESS MANAGEMENT"),
        canDropRowPolicy:
          hasPrivilege("DROP ROW POLICY") ||
          hasPrivilege("ACCESS MANAGEMENT"),

        canAlterSettingsProfile:
          hasPrivilege("ALTER SETTINGS PROFILE") ||
          hasPrivilege("ACCESS MANAGEMENT"),
        canCreateSettingsProfile:
          hasPrivilege("CREATE SETTINGS PROFILE") ||
          hasPrivilege("ACCESS MANAGEMENT"),
        canDropSettingsProfile:
          hasPrivilege("DROP SETTINGS PROFILE") ||
          hasPrivilege("ACCESS MANAGEMENT"),

        hasGrantOption,
      },
    });
  } catch (error) {
    console.error("Failed to check user privileges:", error);
    patch({ userPrivileges: null });
  }
}

export async function saveQuery(
  tabId: string,
  name: string,
  query: string,
  connectionId: string,
  databaseName: string,
): Promise<void> {
  try {
    if (!connectionId) {
      throw new Error("No connection specified");
    }

    await createSavedQuery({
      name,
      query,
      connectionId,
      databaseName,
    });

    await updateTab(tabId, {
      title: name,
      content: query,
      isSaved: true,
    });

    patch({ updatedSavedQueriesTrigger: Date.now().toString() });
  } catch (error: any) {
    console.error("Failed to save query:", error);
    throw error;
  }
}

export async function updateSavedQuery(
  id: string,
  name: string,
  query: string,
  connectionId: string,
  databaseName: string,
): Promise<void> {
  try {
    void connectionId;
    await dbUpdateSavedQuery(id, {
      name,
      query,
      databaseName,
    });
    patch({ updatedSavedQueriesTrigger: Date.now().toString() });
  } catch (error: any) {
    console.error("Failed to update saved query:", error);
    throw error;
  }
}

export async function deleteSavedQuery(id: string): Promise<void> {
  try {
    await dbDeleteSavedQuery(id);
    await removeTab(id);
    patch({ updatedSavedQueriesTrigger: Date.now().toString() });
    toast.success("Query deleted successfully!");
  } catch (error: any) {
    console.error("Failed to delete query:", error);
    toast.error(`Failed to delete query: ${error.message}`);
    throw error;
  }
}

export async function fetchSavedQueries(): Promise<SavedQuery[]> {
  try {
    const activeConnectionId = connectionStore.state.activeConnectionId;
    if (!activeConnectionId) {
      return [];
    }
    return await getSavedQueriesByConnectionId(activeConnectionId);
  } catch (error: any) {
    console.error("Failed to fetch saved queries:", error);
    toast.error(`Failed to fetch saved queries: ${error.message}`);
    return [];
  }
}

export function clearLocalData() {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith("metrics_layout_")) keysToRemove.push(k);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));

    patch({
      tabs: [
        {
          id: "home",
          title: "Home",
          content: "",
          type: "home",
        },
      ],
      activeTab: "home",
    });
  } catch (e) {
    console.error("Failed to clear local data", e);
  }
}

// ─── Bundle + hook ─────────────────────────────────────────────────────────

const actions = {
  setCredential,
  clearCredentials,
  checkServerStatus,
  runQuery,
  runAllQueries,
  cancelQuery,
  initializeApp,
  setCredentialSource,
  updateConfiguration,
  addTab,
  updateTab,
  removeTab,
  updateTabTitle,
  setActiveTab,
  getTabById,
  moveTab,
  duplicateTab,
  closeAllTabs,
  fetchDatabaseInfo,
  closeCreateTableModal,
  openCreateTableModal,
  closeCreateDatabaseModal,
  openCreateDatabaseModal,
  closeUploadFileModal,
  openUploadFileModal,
  setSelectedDatabase,
  checkIsAdmin,
  checkUserPrivileges,
  saveQuery,
  updateSavedQuery,
  deleteSavedQuery,
  fetchSavedQueries,
  clearLocalData,
};

export type WorkspaceStoreValue = WorkspaceStateData & typeof actions;

const identity = (v: WorkspaceStoreValue) => v;

/**
 * Shallow equality check for selector results.
 * Compares object/array entries by reference, primitives by value.
 */
function shallow<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
}

/**
 * Hook returning the combined workspace state + actions. Mirrors the old
 * Zustand `useAppStore` API so consumers can keep destructuring as before.
 *
 * Supports both `useAppStore()` (returns everything) and
 * `useAppStore((s) => s.field)` (selector).
 *
 * Uses shallow equality by default when a selector is provided to prevent
 * unnecessary re-renders when selected slice hasn't actually changed.
 */
export function useAppStore<T = WorkspaceStoreValue>(
  selector?: (state: WorkspaceStoreValue) => T,
  equalityFn?: (a: T, b: T) => boolean,
): T {
  const sel = (selector ?? identity) as (s: WorkspaceStoreValue) => T;
  // Default to shallow equality when selector is provided, Object.is otherwise
  const eq = equalityFn ?? (selector ? shallow : Object.is);
  return useStore(
    workspaceStore,
    (rawState) => sel({ ...rawState, ...actions } as WorkspaceStoreValue),
    eq,
  );
}

useAppStore.getState = (): WorkspaceStoreValue => ({
  ...workspaceStore.state,
  ...actions,
});

useAppStore.subscribe = (
  listener: (state: WorkspaceStoreValue) => void,
) =>
  workspaceStore.subscribe(() => {
    listener({ ...workspaceStore.state, ...actions });
  });

export default useAppStore;
