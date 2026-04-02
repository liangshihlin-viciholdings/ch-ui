// src/store/store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  AppState,
  Credential,
  DatabaseInfo,
  ClickHouseSettings,
  QueryResult,
  SavedQuery,
  MultiQueryResult,
} from "@/types/common";
import { createClient } from "@clickhouse/client-web";
import { isCreateOrInsert, isExplainQuery, isJsonExplain, extractQueryParams } from "@/helpers/sqlUtils";
import { ExplainParser } from "@/features/workspace/explain/parser";
import { OverflowMode } from "@clickhouse/client-common/dist/settings";
import { toast } from "sonner";
import { appQueries } from "@/features/workspace/editor/appQueries";
import { retryInitialization } from "@/features/workspace/editor/monacoConfig";
import { useConnectionStore } from "@/store/connectionStore";
import {
  createSavedQuery,
  getSavedQueriesByConnectionId,
  updateSavedQuery as dbUpdateSavedQuery,
  deleteSavedQuery as dbDeleteSavedQuery,
} from "@/lib/db";

const MAPPED_TABLE_TYPE: Record<string, string> = {"view": "view", "dictionary": "dictionary", "materializedview": "materialized_view"};

// AbortControllers for in-flight queries, keyed by tabId.
// Kept outside Zustand to avoid serialization issues.
const queryAbortControllers = new Map<string, AbortController>();

/**
 * Error class for ClickHouse related errors.
 * Provides error categories and troubleshooting tips.
 */
export class ClickHouseError extends Error {
  category: 'connection' | 'authentication' | 'query' | 'timeout' | 'network' | 'unknown';
  troubleshootingTips: string[];

  constructor(
    message: string,
    public readonly originalError?: unknown,
    category?: 'connection' | 'authentication' | 'query' | 'timeout' | 'network' | 'unknown',
    troubleshootingTips?: string[]
  ) {
    super(message);
    this.name = "ClickHouseError";
    this.category = category || 'unknown';
    this.troubleshootingTips = troubleshootingTips || [];
  }

  /**
   * Creates a categorized error with helpful troubleshooting tips based on the error message or status code
   */
  static fromError(error: any, defaultMessage: string = "An unknown error occurred"): ClickHouseError {
    let message = error?.message || defaultMessage;
    let category: 'connection' | 'authentication' | 'query' | 'timeout' | 'network' | 'unknown' = 'unknown';
    let tips: string[] = [];

    // Check for common error patterns
    const statusCode = error?.response?.status;

    // Authentication errors
    if (statusCode === 401 || statusCode === 403 || message.includes("Authentication") || message.includes("Unauthorized") || message.includes("Access denied")) {
      category = 'authentication';
      message = "Authentication failed. Please check your username and password.";
      tips = [
        "Verify that your username and password are correct",
        "Ensure the user has the necessary permissions",
        "Check if the user exists in the ClickHouse server"
      ];
    }
    // Connection errors
    else if (statusCode === 404) {
      category = 'connection';
      message = "Server not found at the specified URL. Please check your connection settings.";
      tips = [
        "Verify the URL is correct and the server is running",
        "Check if you need to use a custom path (enable Advanced Settings)",
        "Ensure no firewalls are blocking the connection"
      ];
    }
    // Proxy errors
    else if (statusCode === 502 || statusCode === 504) {
      category = 'network';
      message = "Cannot reach the ClickHouse server. The server might be down or there's a network issue.";
      tips = [
        "Verify your ClickHouse server is running",
        "Check for network connectivity issues",
        "If using a proxy, ensure it's configured correctly"
      ];
    }
    // Timeout errors
    else if (statusCode === 408 || message.includes("timeout") || message.includes("timed out")) {
      category = 'timeout';
      message = "Connection timed out while trying to reach the ClickHouse server.";
      tips = [
        "Try increasing the request timeout value",
        "Check if the server is under heavy load",
        "Verify network latency is not causing delays"
      ];
    }
    // CORS errors
    else if (message.includes("CORS") || message.includes("Cross-Origin")) {
      category = 'network';
      message = "Cross-Origin Request Blocked. The server doesn't allow connections from this origin.";
      tips = [
        "Check if CORS is enabled on your ClickHouse server",
        "Configure the server to accept requests from this origin",
        "If using a proxy, ensure it's forwarding CORS headers correctly"
      ];
    }
    // Network errors
    else if (message.includes("Network") || message.includes("ECONNREFUSED") || message.includes("ENOTFOUND")) {
      category = 'network';
      message = "Failed to connect to the server. Please check your network connection.";
      tips = [
        "Verify the server URL is accessible from your network",
        "Check for firewall or proxy restrictions",
        "Ensure the server hostname can be resolved"
      ];
    }
    // SSL errors
    else if (message.includes("SSL") || message.includes("certificate")) {
      category = 'connection';
      message = "SSL connection failed. There might be an issue with the server's certificate.";
      tips = [
        "Check if the server's SSL certificate is valid",
        "Ensure the server name matches the certificate name",
        "Try using HTTP if HTTPS is not properly configured"
      ];
    }
    // General connection error if we can't be more specific
    else if (!message.includes("query") && !message.includes("SQL")) {
      category = 'connection';
      if (message === defaultMessage) {
        message = "Failed to connect to the ClickHouse server. Please check your connection settings.";
      }
      tips = [
        "Verify the server URL and port are correct",
        "Check if your username and password are valid",
        "Ensure the ClickHouse server is running and accessible"
      ];
    }

    return new ClickHouseError(message, error, category, tips);
  }
}

interface AdminCheckResponse {
  data: Array<{ is_admin: boolean }>;
}

interface SavedQueriesCheckResponse {
  data: Array<{ exists: number }>;
}

/**
 * Helper: Builds the connection URL from the provided credential.
 */
const buildConnectionUrl = (credential: Credential): string => {
  let baseUrl = credential.url.replace(/\/+$/, "");
  if (credential.useAdvanced && credential.customPath) {
    const cleanPath = credential.customPath.replace(/^\/+/, "");
    return `${baseUrl}/${cleanPath}`;
  }
  return baseUrl;
};


/**
 * Zustand Store
 */
const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      return {
        // =====================================================
        // Credentials & Connection State and Actions
        // =====================================================
        credential: {
          url: "",
          username: "",
          password: "",
          useAdvanced: false,
          customPath: "",
          requestTimeout: 30000,
        },
        clickHouseClient: null,
        isLoadingCredentials: false,
        isServerAvailable: false,
        isInitialized: false,
        version: "",
        error: "",
        credentialSource: null,
        updatedSavedQueriesTrigger: "",
        clickhouseSettings: {
          max_result_rows: "200",
          max_result_bytes: "0",
          result_overflow_mode: "break" as OverflowMode,
        },

        /**
         * Sets the credential source.
         */
        setCredentialSource: (source) => set({ credentialSource: source }),

        /**
         * Sets credentials, initializes the ClickHouse client, and checks the server status.
         * Provides detailed error information when the connection fails.
         */
        setCredential: async (credential: Credential) => {
          set({ credential, isLoadingCredentials: true, error: "" });
          try {
            const connectionUrl = buildConnectionUrl(credential);
            const client = createClient({
              url: connectionUrl,
              pathname: credential.customPath, // Use custom path for proxy
              username: credential.username,
              password: credential.password || "",
              request_timeout: credential.requestTimeout || 30000,
              database: credential.database,
              clickhouse_settings: {
                ...get().clickhouseSettings,
                result_overflow_mode: "break",
              },
            });
            set({ clickHouseClient: client });
            await get()
              .checkServerStatus()
              .then(() => {
                get().checkIsAdmin();
                get().checkUserPrivileges();
                // Sync Monaco editor's ClickHouse client
                retryInitialization(1, 0);
              });
          } catch (error) {
            // Use the enhanced error handling
            const enhancedError = ClickHouseError.fromError(
              error,
              "Failed to set connection credentials"
            );

            set({
              error: `${enhancedError.message}\n\nTroubleshooting tips:\n${enhancedError.troubleshootingTips.join('\n')}`,
              isServerAvailable: false
            });

            toast.error(`Connection error: ${enhancedError.message}`, {
              description: "Please check the troubleshooting tips in the settings panel."
            });
          } finally {
            set({ isLoadingCredentials: false });
          }
        },

        /**
         * Updates ClickHouse configuration and re-checks the server status.
         * Uses enhanced error handling for better user feedback.
         */
        updateConfiguration: async (clickhouseSettings: ClickHouseSettings) => {
          try {
            const credentials = get().credential;
            const connectionUrl = buildConnectionUrl(credentials);
            const client = createClient({
              url: connectionUrl,
              pathname: credentials.customPath, // Ensure custom path is applied
              username: credentials.username,
              password: credentials.password || "",
              request_timeout: credentials.requestTimeout || 30000,
              clickhouse_settings: clickhouseSettings,
            });
            set({ clickHouseClient: client, clickhouseSettings });
            await get().checkServerStatus();
          } catch (error) {
            const enhancedError = ClickHouseError.fromError(
              error,
              "Failed to update ClickHouse configuration"
            );

            toast.error(`Configuration error: ${enhancedError.message}`, {
              description: "Check the troubleshooting tips for possible solutions."
            });

            throw enhancedError;
          }
        },

        /**
         * Clears all stored credentials and resets connection settings.
         */
        clearCredentials: async () => {
          set({
            credential: {
              url: "",
              username: "",
              password: "",
              useAdvanced: false,
              customPath: "",
              requestTimeout: 30000,
            },
            clickhouseSettings: {
              max_result_rows: "200",
              max_result_bytes: "0",
              result_overflow_mode: "break" as OverflowMode,
            },
            clickHouseClient: null,
            isServerAvailable: false,
            version: "",
            error: "",
          });
        },

        /**
         * Pings the ClickHouse server and retrieves its version.
         * If the connection fails, provides detailed error information and troubleshooting tips.
         */
        checkServerStatus: async () => {
          const { clickHouseClient } = get();
          set({ isLoadingCredentials: true, error: "" });
          try {
            if (!clickHouseClient) {
              throw new ClickHouseError(
                "ClickHouse client is not initialized",
                null,
                'connection',
                ["Please enter your connection details and try again"]
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
            set({ isServerAvailable: true, version });
          } catch (error: any) {
            // Use the new ClickHouseError.fromError to get a better error message and tips
            const enhancedError = ClickHouseError.fromError(error, "Failed to connect to ClickHouse server");

            // Set the detailed error
            set({
              isServerAvailable: false,
              error: `${enhancedError.message}\n\nTroubleshooting tips:\n${enhancedError.troubleshootingTips.join('\n')}`
            });

            // Don't automatically clear credentials on all errors
            // Only clear them for certain types of errors
            if (enhancedError.category === 'connection' || enhancedError.category === 'authentication') {
              await get().clearCredentials();
              toast.error(`Connection failed: ${enhancedError.message}`, {
                description: "Your credentials have been cleared. Please try again with correct information."
              });
            } else {
              toast.error(`Connection error: ${enhancedError.message}`, {
                description: "Check the troubleshooting tips for suggestions to resolve this issue."
              });
            }
          } finally {
            set({ isLoadingCredentials: false });
          }
        },

        /**
         * Runs a SQL query. If a tabId is provided, it updates the tab state.
         * Supports both query and command operations.
         */
        runQuery: async (query: string, tabId?: string) => {
          const { clickHouseClient } = get();
          if (!clickHouseClient) {
            throw new Error("ClickHouse client is not initialized");
          }

          // Set up abort controller for cancellation
          const abortController = new AbortController();
          if (tabId) {
            queryAbortControllers.get(tabId)?.abort();
            queryAbortControllers.set(tabId, abortController);
            set((state) => ({
              tabs: state.tabs.map((tab) =>
                tab.id === tabId
                  ? { ...tab, isLoading: true, error: null }
                  : tab
              ),
            }));
          }
          try {
            const trimmedQuery = query.trim();
            const { cleanedQuery, queryParams } = extractQueryParams(trimmedQuery);
            const queryToRun = cleanedQuery || trimmedQuery;
            const hasQueryParams = Object.keys(queryParams).length > 0;

            // If the entire query was SET param_ statements, nothing to run
            if (!queryToRun) {
              const result: QueryResult = {
                meta: [],
                data: [],
                statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
                rows: 0,
                error: null,
              };
              if (tabId)
                await get().updateTab(tabId, { result, isLoading: false, error: null });
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
              if (tabId)
                await get().updateTab(tabId, {
                  result,
                  isLoading: false,
                  error: null,
                });
              return result;
            }

            const result = await clickHouseClient.query({
              query: queryToRun,
              ...(hasQueryParams && { query_params: queryParams }),
              abort_signal: abortController.signal,
            });

            let processedResult: QueryResult;

            // EXPLAIN queries (without json=1) return TabSeparated text,
            // not JSON — calling .json() on them throws a parse error.
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
              const explainResult = ExplainParser.parse(trimmedQuery, syntheticJson);
              processedResult.explainResult = explainResult;
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

              // Check if JSON-format EXPLAIN query and parse result
              if (isExplainQuery(trimmedQuery)) {
                const explainResult = ExplainParser.parse(trimmedQuery, jsonResult);
                processedResult.explainResult = explainResult;
              }
            }

            if (tabId)
              await get().updateTab(tabId, {
                result: processedResult,
                isLoading: false,
              });
            return processedResult;
          } catch (error: any) {
            const errorResult: QueryResult = {
              meta: [],
              data: [],
              statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
              rows: 0,
              error: error.message,
            };
            if (tabId)
              await get().updateTab(tabId, {
                result: errorResult,
                isLoading: false,
                error: error.message,
              });
            return errorResult;
          } finally {
            if (tabId) {
              queryAbortControllers.delete(tabId);
              set((state) => ({
                tabs: state.tabs.map((tab) =>
                  tab.id === tabId ? { ...tab, isLoading: false } : tab
                ),
              }));
            }
          }
        },

        /**
         * Runs multiple SQL queries sequentially and stores results in the tab.
         * Each query's result is stored in the results array for tabbed display.
         */
        runAllQueries: async (queries: string[], tabId: string) => {
          const { clickHouseClient, updateTab } = get();
          if (!clickHouseClient) {
            throw new Error("ClickHouse client is not initialized");
          }

          // Set up abort controller for cancellation
          const abortController = new AbortController();
          queryAbortControllers.get(tabId)?.abort();
          queryAbortControllers.set(tabId, abortController);

          // Set loading state
          set((state) => ({
            tabs: state.tabs.map((tab) =>
              tab.id === tabId
                ? { ...tab, isLoading: true, error: null, results: [], result: null }
                : tab
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

              // Skip if only SET param_ statements with nothing left to run
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
                  ...(hasQueryParams && { query_params: { ...accumulatedParams } }),
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
                const explainResult = ExplainParser.parse(queryToRun, syntheticJson);
                queryResult.explainResult = explainResult;
              } else {
                const result = await clickHouseClient.query({
                  query: queryToRun,
                  ...(hasQueryParams && { query_params: { ...accumulatedParams } }),
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
                  queryResult.explainResult = ExplainParser.parse(queryToRun, jsonResult);
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

          // Update tab with all results
          await updateTab(tabId, {
            results,
            activeResultIndex: 0,
            isLoading: false,
            error: null,
            result: null, // Clear single result when using multi-query mode
          });

          return results;
        },

        cancelQuery: (tabId: string) => {
          const controller = queryAbortControllers.get(tabId);
          if (controller) {
            controller.abort();
            queryAbortControllers.delete(tabId);
          }
          set((state) => ({
            tabs: state.tabs.map((tab) =>
              tab.id === tabId ? { ...tab, isLoading: false, error: null } : tab
            ),
          }));
        },

        /**
         * Initializes the app by setting credentials (if available) and ensuring a home tab exists.
         * Tabs are persisted via localStorage using Zustand persist.
         */
        initializeApp: async () => {
          const { credential, setCredential, tabs } = get();
          if (credential.url && credential.username) {
            await setCredential(credential);
          }
          if (!tabs || tabs.length === 0) {
            set({
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
          set({ isInitialized: true });
        },

        // =====================================================
        // Workspace / Tabs State and Actions
        // =====================================================

        tabs: [],
        activeTab: "home",
        tabError: null,
        isTabLoading: false,
        // IndexedDB removed; tabs persist via localStorage

        /**
         * Adds a new tab. If the tab already exists, it simply activates it.
         */
        addTab: async (tab) => {
          const { tabs } = get();
          const existingTab = tabs.find((t) => t.id === tab.id);
          if (existingTab) {
            set({ activeTab: existingTab.id });
            return;
          }
          set((state) => ({
            tabs: [...state.tabs, tab],
            activeTab: tab.id,
          }));
        },

        /**
         * Updates a tab with the given changes.
         */
        updateTab: async (tabId, updates) => {
          const { tabs } = get();
          const updatedTabs = tabs.map((tab) =>
            tab.id === tabId ? { ...tab, ...updates } : tab
          );
          set({ tabs: updatedTabs });
        },

        /**
         * Removes a tab and updates the active tab if necessary.
         */
        removeTab: async (tabId) => {
          const { tabs, activeTab } = get();
          const updatedTabs = tabs.filter((tab) => tab.id !== tabId);
          set({ tabs: updatedTabs });
          if (activeTab === tabId) {
            set({
              activeTab: updatedTabs[updatedTabs.length - 1]?.id || "home",
            });
          }
        },

        /**
         * Creates a duplicate of an existing tab.
         */
        duplicateTab: async (tabId: string) => {
          const { tabs } = get();
          const tabToDuplicate = tabs.find((tab) => tab.id === tabId);
          if (!tabToDuplicate) {
            throw new Error("Tab not found");
          }
          const newTab = {
            ...tabToDuplicate,
            id: `tab-${Date.now()}`,
            title: `${tabToDuplicate.title} (Copy)`,
          };
          set((state) => ({
            tabs: [...state.tabs, newTab],
            activeTab: newTab.id,
          }));
        },

        /**
         * Closes all tabs except the home tab.
         */
        closeAllTabs: async () => {
          const { tabs } = get();
          set({
            tabs: [tabs.find((tab) => tab.id === "home")!],
            activeTab: "home",
          });
        },

        /**
         * Updates the title of a specified tab.
         */
        updateTabTitle: async (tabId, newTitle) => {
          const { tabs } = get();
          const updatedTabs = tabs.map((tab) =>
            tab.id === tabId ? { ...tab, title: newTitle } : tab
          );
          const updatedTab = updatedTabs.find((tab) => tab.id === tabId);
          if (!updatedTab) {
            throw new Error("Tab not found");
          }
          set({ tabs: updatedTabs });
          toast.success(`Tab title updated to "${newTitle}"`);
        },

        /**
         * Sets the active tab.
         */
        setActiveTab: (tabId) => {
          set({ activeTab: tabId });
        },

        /**
         * Retrieves a tab by its ID.
         */
        getTabById: (tabId) => {
          return get().tabs.find((tab) => tab.id === tabId);
        },

        /**
         * Moves a tab from one position to another.
         */
        moveTab: (oldIndex, newIndex) => {
          const tabs = [...get().tabs];
          const [removed] = tabs.splice(oldIndex, 1);
          tabs.splice(newIndex, 0, removed);
          set({ tabs });
        },

        // =====================================================
        // Explorer State and Actions
        // =====================================================
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

        /**
         * Fetches database and table information from ClickHouse
         * and organizes it for the explorer.
         */
        fetchDatabaseInfo: async () => {
          const { clickHouseClient } = get();
          if (!clickHouseClient) {
            console.warn("fetchDatabaseInfo: ClickHouse client is not initialized");
            set({ isLoadingDatabase: false });
            return;
          }
          set({ isLoadingDatabase: true });
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
                const table_type_mapped = table_type && MAPPED_TABLE_TYPE[table_type.toLowerCase()] || "table";
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
            set({ dataBaseExplorer: databasesArray, isLoadingDatabase: false });
          } catch (error) {
            toast.error(
              `Failed to fetch database info: ${(error as Error).message}`
            );
            set({ isLoadingDatabase: false });
          }
        },

        // Modal controls for explorer
        closeCreateTableModal: () =>
          set({
            isCreateTableModalOpen: false,
            selectedDatabaseForCreateTable: "",
          }),
        openCreateTableModal: (database) =>
          set({
            isCreateTableModalOpen: true,
            selectedDatabaseForCreateTable: database,
          }),
        closeCreateDatabaseModal: () =>
          set({ isCreateDatabaseModalOpen: false }),
        openCreateDatabaseModal: () => set({ isCreateDatabaseModalOpen: true }),
        closeUploadFileModal: () =>
          set({
            isUploadFileModalOpen: false,
            selectedDatabaseForUpload: "",
          }),
        openUploadFileModal: (database) =>
          set({
            isUploadFileModalOpen: true,
            selectedDatabaseForUpload: database,
          }),
        setSelectedDatabase: (database) =>
          set({ selectedDatabase: database }),

        // =====================================================
        // Admin & Saved Queries Actions
        // =====================================================
        isAdmin: false,
        userPrivileges: null,

        /**
         * Checks if the current user has admin privileges.
         */

        checkIsAdmin: async (): Promise<boolean> => {
          const { clickHouseClient } = get();
          if (!clickHouseClient) {
            console.warn("checkIsAdmin: ClickHouse client is not initialized");
            set({ isAdmin: false });
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
            set({ isAdmin: response.data[0].is_admin });
            return response.data[0].is_admin;
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error occurred";
            console.error("Failed to check admin status:", errorMessage);
            set({ isAdmin: false });
            return false;
          }
        },

        /**
         * Checks granular user privileges from system.grants
         */
        checkUserPrivileges: async (): Promise<void> => {
          const { clickHouseClient } = get();
          if (!clickHouseClient) {
            console.warn("checkUserPrivileges: ClickHouse client is not initialized");
            set({ userPrivileges: null });
            return;
          }

          try {
            // Query all grants for current user and their roles
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
            const response = await result.json<{
              data: Array<{ access_type: string; grant_option: number }>
            }>();

            // Create a set of granted access types for quick lookup
            const grantedPrivileges = new Set(
              response.data.map(row => row.access_type.toUpperCase())
            );

            // Check for grant option
            const hasGrantOption = response.data.some(row => row.grant_option === 1);

            // Helper to check if user has specific privilege
            const hasPrivilege = (privilege: string): boolean => {
              return grantedPrivileges.has(privilege.toUpperCase()) ||
                     grantedPrivileges.has('ALL');
            };

            // Build privileges object
            set({
              userPrivileges: {
                // View privileges
                canShowUsers: hasPrivilege('SHOW USERS') || hasPrivilege('SHOW ACCESS'),
                canShowRoles: hasPrivilege('SHOW ROLES') || hasPrivilege('SHOW ACCESS'),
                canShowQuotas: hasPrivilege('SHOW QUOTAS') || hasPrivilege('SHOW ACCESS'),
                canShowRowPolicies: hasPrivilege('SHOW ROW POLICIES') || hasPrivilege('SHOW ACCESS'),
                canShowSettingsProfiles: hasPrivilege('SHOW SETTINGS PROFILES') || hasPrivilege('SHOW ACCESS'),

                // User modification privileges
                canAlterUser: hasPrivilege('ALTER USER') || hasPrivilege('ACCESS MANAGEMENT'),
                canCreateUser: hasPrivilege('CREATE USER') || hasPrivilege('ACCESS MANAGEMENT'),
                canDropUser: hasPrivilege('DROP USER') || hasPrivilege('ACCESS MANAGEMENT'),

                // Role modification privileges
                canAlterRole: hasPrivilege('ALTER ROLE') || hasPrivilege('ROLE ADMIN') || hasPrivilege('ACCESS MANAGEMENT'),
                canCreateRole: hasPrivilege('CREATE ROLE') || hasPrivilege('ROLE ADMIN') || hasPrivilege('ACCESS MANAGEMENT'),
                canDropRole: hasPrivilege('DROP ROLE') || hasPrivilege('ROLE ADMIN') || hasPrivilege('ACCESS MANAGEMENT'),

                // Quota privileges
                canAlterQuota: hasPrivilege('ALTER QUOTA') || hasPrivilege('ACCESS MANAGEMENT'),
                canCreateQuota: hasPrivilege('CREATE QUOTA') || hasPrivilege('ACCESS MANAGEMENT'),
                canDropQuota: hasPrivilege('DROP QUOTA') || hasPrivilege('ACCESS MANAGEMENT'),

                // Row policy privileges
                canAlterRowPolicy: hasPrivilege('ALTER ROW POLICY') || hasPrivilege('ACCESS MANAGEMENT'),
                canCreateRowPolicy: hasPrivilege('CREATE ROW POLICY') || hasPrivilege('ACCESS MANAGEMENT'),
                canDropRowPolicy: hasPrivilege('DROP ROW POLICY') || hasPrivilege('ACCESS MANAGEMENT'),

                // Settings profile privileges
                canAlterSettingsProfile: hasPrivilege('ALTER SETTINGS PROFILE') || hasPrivilege('ACCESS MANAGEMENT'),
                canCreateSettingsProfile: hasPrivilege('CREATE SETTINGS PROFILE') || hasPrivilege('ACCESS MANAGEMENT'),
                canDropSettingsProfile: hasPrivilege('DROP SETTINGS PROFILE') || hasPrivilege('ACCESS MANAGEMENT'),

                // Grant option
                hasGrantOption,
              },
            });
          } catch (error) {
            console.error("Failed to check user privileges:", error);
            set({ userPrivileges: null });
          }
        },

        saveQuery: async (
          tabId: string,
          name: string,
          query: string,
          connectionId: string,
          databaseName: string
        ) => {
          const { updateTab } = get();

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

            set({ updatedSavedQueriesTrigger: Date.now().toString() });
          } catch (error: any) {
            console.error("Failed to save query:", error);
            throw error;
          }
        },

        updateSavedQuery: async (
          id: string,
          name: string,
          query: string,
          connectionId: string,
          databaseName: string
        ) => {
          try {
            await dbUpdateSavedQuery(id, {
              name,
              query,
              connectionId,
              databaseName,
            });
            set({ updatedSavedQueriesTrigger: Date.now().toString() });
          } catch (error: any) {
            console.error("Failed to update saved query:", error);
            throw error;
          }
        },

        deleteSavedQuery: async (id: string) => {
          const { removeTab } = get();
          try {
            await dbDeleteSavedQuery(id);
            await removeTab(id);

            // Trigger refresh of saved queries
            set((state) => ({
              updatedSavedQueriesTrigger: Date.now().toString(),
            }));

            toast.success("Query deleted successfully!");
          } catch (error: any) {
            console.error("Failed to delete query:", error);
            toast.error(`Failed to delete query: ${error.message}`);
            throw error;
          }
        },

        fetchSavedQueries: async (): Promise<SavedQuery[]> => {
          try {
            // Get the active connection ID
            const activeConnectionId = useConnectionStore.getState().activeConnectionId;
            if (!activeConnectionId) {
              return [];
            }

            // Fetch saved queries from IndexedDB for the active connection
            return await getSavedQueriesByConnectionId(activeConnectionId);
          } catch (error: any) {
            console.error("Failed to fetch saved queries:", error);
            toast.error(`Failed to fetch saved queries: ${error.message}`);
            return [];
          }
        },

        /**
         * Clears local UI data stored in localStorage (tabs, layouts, etc.).
         * Keeps credentials intact. Resets tabs to Home.
         */
        clearLocalData: () => {
          try {
            // Remove metrics layouts
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i)!;
              if (k.startsWith('metrics_layout_')) keysToRemove.push(k);
            }
            keysToRemove.forEach((k) => localStorage.removeItem(k));

            // Reset tabs in state; persist plugin will write back clean tabs
            set({
              tabs: [
                {
                  id: 'home',
                  title: 'Home',
                  content: '',
                  type: 'home',
                },
              ],
              activeTab: 'home',
            });
          } catch (e) {
            console.error('Failed to clear local data', e);
          }
        },
      };
    },

    {
      name: "app-storage",
      // Persist subset of the state to localStorage
      partialize: (state) => ({
        credential: state.credential,
        activeTab: state.activeTab,
        tabs: state.tabs.map((t) => ({
          ...t,
          // Avoid persisting heavy query results to keep storage small
          result: undefined,
          isLoading: false,
          error: null,
        })),
        clickhouseSettings: state.clickhouseSettings,
        isAdmin: state.isAdmin,
      }),
    }
  )
);

export default useAppStore;
