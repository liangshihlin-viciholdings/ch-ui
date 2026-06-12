// src/types/common.ts
import {
  ClickHouseSettings as ClickHouseSettingsType,
  ClickHouseClient,
} from "@clickhouse/client-web";
import { SavedQuery } from "../lib/db/schema";

export type ClickHouseSettings = ClickHouseSettingsType;
export type { SavedQuery };

export interface Credential {
  url: string;
  username: string;
  password: string;
  requestTimeout: number;
  database?: string;
  useAdvanced: boolean;
  customPath: string;
  isDistributed?: boolean;
  clusterName?: string;
}

export interface DatabaseInfo {
  name: string;
  type: string;
  children: { name: string; type: string; total_bytes?: number }[];
}

export interface MultiQueryResult {
  queryIndex: number;
  queryText: string;
  result: QueryResult;
}

interface Tab {
  id: string;
  title: string;
  type: "sql" | "home" | "information";
  content: string | { database?: string; table?: string };
  error?: string | null;
  isLoading?: boolean;
  isSaved?: boolean;
  result?: any;
  results?: MultiQueryResult[];
  activeResultIndex?: number;
  isDirty?: boolean;
  /** Connection this tab is bound to. null = uses the active/default connection. */
  connectionId?: string | null;
}

export interface ExplainNode {
  id: string;
  name: string;
  type: 'Expression' | 'Join' | 'Filter' | 'Aggregating' | 'ReadFromMergeTree' | string;
  children: ExplainNode[];
  metrics?: {
    rows?: number;
    bytes?: number;
    time?: number;
    cpu_time?: number;
  };
  rawData?: any;
}

export type ExplainType =
  | 'PIPELINE'
  | 'PLAN'
  | 'AST'
  | 'SYNTAX'
  | 'ESTIMATE'
  | 'TABLE OVERRIDE'
  | 'INDEXES'
  | 'QUERY TREE';

export interface ExplainResult {
  type: ExplainType;
  tree: ExplainNode;
  rawText: string;
  rawJson?: any;
}

export interface QueryResult {
  meta: any[];
  data: any[];
  statistics: {
    elapsed: number;
    rows_read: number;
    bytes_read: number;
  };
  rows?: number;
  error?: string | null;
  explainResult?: ExplainResult;
}

interface CoreState {
  credential: Credential;
  clickHouseClient: ClickHouseClient | null;
  isLoadingCredentials: boolean;
  isServerAvailable: boolean;
  isInitialized: boolean;
  version: string;
  error: string;
  credentialSource: "env" | "app" | null;
  clickhouseSettings: ClickHouseSettings;
}

interface WorkspaceState {
  tabs: Tab[];
  activeTab: string;
  tabError: string | null;
  isTabLoading: boolean;
}

interface ExplorerState {
  dataBaseExplorer: DatabaseInfo[];
  isLoadingDatabase: boolean;
  isCreateTableModalOpen: boolean;
  isCreateDatabaseModalOpen: boolean;
  selectedDatabaseForCreateTable: string;
  selectedDatabaseForCreateDatabase: string | null;
  selectedTableForCreateTable: string | null;
  selectedTableForCreateDatabase: string | null;
  selectedDatabaseForDelete: string | null;
  selectedTableForDelete: string | null;
  isUploadFileModalOpen: boolean;
  selectedDatabaseForUpload: string;
  selectedDatabase: string | null;
}

interface AdminState {
  isAdmin: boolean;
  userPrivileges: {
    canShowUsers: boolean;
    canShowRoles: boolean;
    canShowQuotas: boolean;
    canShowRowPolicies: boolean;
    canShowSettingsProfiles: boolean;
    canAlterUser: boolean;
    canAlterRole: boolean;
    canCreateUser: boolean;
    canCreateRole: boolean;
    canDropUser: boolean;
    canDropRole: boolean;
    canAlterQuota: boolean;
    canCreateQuota: boolean;
    canDropQuota: boolean;
    canAlterRowPolicy: boolean;
    canCreateRowPolicy: boolean;
    canDropRowPolicy: boolean;
    canAlterSettingsProfile: boolean;
    canCreateSettingsProfile: boolean;
    canDropSettingsProfile: boolean;
    hasGrantOption: boolean;
  } | null;
}

export interface AppState
  extends CoreState,
    WorkspaceState,
    ExplorerState,
    AdminState {
  setCredential: (credential: Credential) => Promise<void>;
  clearCredentials: () => Promise<void>;
  checkServerStatus: () => Promise<void>;
  runQuery: (query: string, tabId?: string) => Promise<QueryResult>;
  runAllQueries: (queries: string[], tabId: string) => Promise<MultiQueryResult[]>;
  cancelQuery: (tabId: string) => void;
  initializeApp: () => Promise<void>;
  setCredentialSource: (source: "env" | "app") => void;
  updateConfiguration: (clickhouseSettings: ClickHouseSettings) => void;
  updatedSavedQueriesTrigger: string;
  addTab: (tab: Tab) => Promise<void>;
  updateTab: (tabId: string, updates: Partial<Tab>) => Promise<void>;
  removeTab: (tabId: string) => Promise<void>;
  updateTabTitle: (tabId: string, title: string) => Promise<void>;
  setActiveTab: (tabId: string) => void;
  getTabById: (tabId: string) => Tab | undefined;
  moveTab: (oldIndex: number, newIndex: number) => void;
  duplicateTab: (tabId: string) => void | Promise<void>;
  closeAllTabs: () => void | Promise<void>;

  fetchDatabaseInfo: () => Promise<void>;
  closeCreateTableModal: () => void;
  openCreateTableModal: (database: string) => void;
  closeCreateDatabaseModal: () => void;
  openCreateDatabaseModal: () => void;
  closeUploadFileModal: () => void;
  openUploadFileModal: (database: string) => void;
  setSelectedDatabase: (database: string | null) => void;

  checkIsAdmin: () => Promise<boolean>;
  checkUserPrivileges: () => Promise<void>;

  saveQuery: (
    tabId: string,
    queryName: string,
    query: string,
    connectionId: string,
    databaseName: string
  ) => Promise<void>;
  updateSavedQuery: (
    id: string,
    name: string,
    query: string,
    connectionId: string,
    databaseName: string
  ) => Promise<void>;
  fetchSavedQueries: () => Promise<SavedQuery[]>;
  deleteSavedQuery: (id: string) => Promise<void>;

  // Utilities
  clearLocalData: () => void;
}
