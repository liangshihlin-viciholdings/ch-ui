# CH-UI Major Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ag-grid, Monaco, Zustand, react-router-dom, and Dexie with full TanStack ecosystem; port HyperDX analytics suite; add HyperDX theme; integrate OpenTelemetry collector.

**Architecture:** Vite SPA with TanStack Router (file-based routes), TanStack Store (client state), TanStack Query (server state), TanStack DB (persistent client data), TanStack Table + Virtual (data grids), CodeMirror 6 (SQL editor), Recharts (analytics charts), react-grid-layout (dashboards), @xyflow/react (service map). UI layer stays Radix UI + Tailwind CSS 4.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Tailwind CSS 4, TanStack (Router, Store, Query, Table, Virtual, DB), CodeMirror 6, Recharts, react-grid-layout, @xyflow/react, @clickhouse/client-web

**Tooling:** All commands via `vp` CLI. No npm/pnpm/yarn direct usage.

**Reference Codebases:**
- HyperDX app: `/home/liangshih.lin/GitHub/hyperdx/packages/app/`
- HyperDX otel-collector: `/home/liangshih.lin/GitHub/hyperdx/packages/otel-collector/`
- TanStack Table examples: `/home/liangshih.lin/GitHub/tanstack/table/examples/react/`

---

## Phase 1: Foundation — TanStack Core Setup

### Task 1.1: Install TanStack Packages & Remove Old Dependencies

**Files:**
- Modify: `package.json`
- Delete: `pnpm-lock.yaml` (already deleted per git status)

- [ ] **Step 1: Remove old packages**

```bash
vp remove ag-grid-community ag-grid-react monaco-editor monaco-vim zustand react-router-dom dexie
```

- [ ] **Step 2: Install TanStack core packages**

```bash
vp add @tanstack/react-router @tanstack/react-store @tanstack/store @tanstack/react-query @tanstack/react-table @tanstack/react-virtual @tanstack/db
```

- [ ] **Step 3: Install TanStack dev tools**

```bash
vp add -D @tanstack/router-devtools @tanstack/react-query-devtools @tanstack/router-plugin
```

- [ ] **Step 4: Install CodeMirror packages**

```bash
vp add @uiw/react-codemirror @codemirror/lang-sql @codemirror/lang-json @codemirror/autocomplete @codemirror/lint @codemirror/state @codemirror/view @replit/codemirror-vim
```

- [ ] **Step 5: Install analytics packages**

```bash
vp add recharts react-grid-layout @xyflow/react
vp add -D @types/react-grid-layout
```

- [ ] **Step 6: Install OTel browser SDK**

```bash
vp add @hyperdx/browser
```

- [ ] **Step 7: Verify install**

```bash
vp ls @tanstack/react-router @tanstack/store @tanstack/react-table @uiw/react-codemirror recharts
```

- [ ] **Step 8: Commit**

```bash
git add package.json
git commit -m "chore: Replace ag-grid/monaco/zustand/react-router with TanStack + CodeMirror + Recharts"
```

---

### Task 1.2: Set Up TanStack Router

**Files:**
- Create: `src/routes/__root.tsx`
- Create: `src/routes/index.tsx`
- Create: `src/routes/metrics.tsx`
- Create: `src/routes/logs.tsx`
- Create: `src/routes/admin.tsx`
- Create: `src/routes/settings.tsx`
- Create: `src/routeTree.gen.ts` (auto-generated)
- Modify: `src/main.tsx`
- Modify: `src/App.tsx` (full rewrite)
- Modify: `vite.config.ts`

- [ ] **Step 1: Configure TanStack Router Vite plugin**

Modify `vite.config.ts`:

```typescript
/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import pkg from "./package.json";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    sourcemap: true,
  },
  define: {
    __CH_UI_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/test/",
        "**/*.test.{ts,tsx}",
        "**/__tests__/",
      ],
    },
  },
});
```

- [ ] **Step 2: Create root route**

Create `src/routes/__root.tsx`:

```tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "@/components/common/theme-provider";
import { AppearanceProvider } from "@/contexts/AppearanceContext";
import AppInitializer from "@/components/common/AppInit";
import Sidebar from "@/components/common/Sidebar";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <AppearanceProvider>
        <AppInitializer>
          <div className="flex h-screen">
            <Sidebar />
            <Outlet />
          </div>
        </AppInitializer>
      </AppearanceProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 3: Create index route (Home/SQL workspace)**

Create `src/routes/index.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import HomePage from "@/pages/Home";

export const Route = createFileRoute("/")({
  component: HomePage,
});
```

- [ ] **Step 4: Create remaining routes**

Create `src/routes/metrics.tsx`:
```tsx
import { createFileRoute } from "@tanstack/react-router";
import MetricsPage from "@/pages/Metrics";

export const Route = createFileRoute("/metrics")({
  component: MetricsPage,
});
```

Create `src/routes/logs.tsx`:
```tsx
import { createFileRoute } from "@tanstack/react-router";
import LogsPage from "@/pages/Logs";

export const Route = createFileRoute("/logs")({
  component: LogsPage,
});
```

Create `src/routes/admin.tsx`:
```tsx
import { createFileRoute } from "@tanstack/react-router";
import Admin from "@/pages/Admin";
import { AdminRoute } from "@/features/admin/routes/adminRoute";

export const Route = createFileRoute("/admin")({
  component: () => (
    <AdminRoute>
      <Admin />
    </AdminRoute>
  ),
});
```

Create `src/routes/settings.tsx`:
```tsx
import { createFileRoute } from "@tanstack/react-router";
import SettingsPage from "@/pages/Settings";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});
```

- [ ] **Step 5: Rewrite App.tsx for TanStack Router**

Replace `src/App.tsx`:

```tsx
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});

const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL,
  context: { queryClient },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 6: Update main.tsx**

Replace `src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "uplot/dist/uPlot.min.css";
import "./features/metrics/components/uplot.css";
import { Toaster } from "@/components/ui/sonner";

if (typeof crypto.randomUUID !== "function") {
  crypto.randomUUID = function () {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
      (
        parseInt(c) ^
        (crypto.getRandomValues(new Uint8Array(1))[0] &
          (15 >> (parseInt(c) / 4)))
      ).toString(16)
    ) as `${string}-${string}-${string}-${string}-${string}`;
  };
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Toaster
      richColors
      toastOptions={{ duration: 2000, closeButton: true }}
      expand={true}
    />
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 7: Generate route tree and verify**

```bash
vp dev
# Verify TanStack Router generates src/routeTree.gen.ts
# Navigate to /, /metrics, /logs, /admin, /settings — all should render
```

- [ ] **Step 8: Remove all react-router-dom imports across codebase**

Search and replace all `useNavigate` from react-router-dom with `useNavigate` from @tanstack/react-router. Search and replace all `Link` from react-router-dom with `Link` from @tanstack/react-router. Search for `useParams`, `useSearchParams`, `useLocation` and replace with TanStack Router equivalents.

Key files to update:
- `src/features/workspace/editor/SqlEditor.tsx` (line 37: `useNavigate`)
- `src/components/common/Sidebar.tsx` (navigation links)
- `src/components/common/AppInit.tsx` (any navigation)
- `src/pages/*.tsx` (any navigation)
- `src/features/admin/routes/adminRoute.tsx`

For each file:
```tsx
// Before
import { useNavigate, Link } from "react-router-dom";

// After
import { useNavigate, Link } from "@tanstack/react-router";
```

TanStack Router `Link` uses `to` prop (same as react-router-dom), so most links work as-is. The key difference: `useNavigate()` returns `navigate({ to: '/path' })` instead of `navigate('/path')`.

- [ ] **Step 9: Verify no react-router-dom imports remain**

```bash
grep -r "react-router-dom" src/ --include="*.ts" --include="*.tsx"
# Expected: no results
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: Replace react-router-dom with TanStack Router file-based routing"
```

---

### Task 1.3: Set Up TanStack Store (Replace Zustand)

**Files:**
- Create: `src/stores/connectionStore.ts`
- Create: `src/stores/workspaceStore.ts`
- Create: `src/stores/uiStore.ts`
- Create: `src/stores/editorStore.ts`
- Modify: `src/store/index.ts` → migrate to `src/stores/workspaceStore.ts`
- Modify: `src/store/connectionStore.ts` → migrate to `src/stores/connectionStore.ts`
- Delete: `src/store/index.ts` (after migration)
- Delete: `src/store/connectionStore.ts` (after migration)

- [ ] **Step 1: Create TanStack Store for connections**

Create `src/stores/connectionStore.ts`:

```typescript
import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";

export interface ConnectionCredential {
  url: string;
  username: string;
  password: string;
  useAdvanced?: boolean;
  customPath?: string;
  requestTimeout?: number;
}

export interface ConnectionProfile {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
  useAdvanced: boolean;
  customPath: string;
  requestTimeout: number;
  isDistributed: boolean;
  clusterName: string;
  isDefault: boolean;
}

interface ConnectionState {
  activeConnectionId: string | null;
  credentials: ConnectionCredential;
  databasesByConnection: Record<string, string[]>;
  lastSelectedDatabaseByConnection: Record<string, string>;
}

const STORAGE_KEY = "ch-ui-connections";

function loadPersistedState(): Partial<ConnectionState> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

const persisted = loadPersistedState();

export const connectionStore = new Store<ConnectionState>({
  activeConnectionId: persisted.activeConnectionId ?? null,
  credentials: persisted.credentials ?? {
    url: "",
    username: "",
    password: "",
  },
  databasesByConnection: persisted.databasesByConnection ?? {},
  lastSelectedDatabaseByConnection:
    persisted.lastSelectedDatabaseByConnection ?? {},
});

// Persist on state change
connectionStore.subscribe(() => {
  const state = connectionStore.state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
});

// Actions (pure functions that update store)
export function setActiveConnection(id: string | null) {
  connectionStore.setState((prev) => ({
    ...prev,
    activeConnectionId: id,
  }));
}

export function updateCredentials(credentials: Partial<ConnectionCredential>) {
  connectionStore.setState((prev) => ({
    ...prev,
    credentials: { ...prev.credentials, ...credentials },
  }));
}

export function cacheDatabases(connectionId: string, databases: string[]) {
  connectionStore.setState((prev) => ({
    ...prev,
    databasesByConnection: {
      ...prev.databasesByConnection,
      [connectionId]: databases,
    },
  }));
}

export function setLastSelectedDatabase(
  connectionId: string,
  database: string
) {
  connectionStore.setState((prev) => ({
    ...prev,
    lastSelectedDatabaseByConnection: {
      ...prev.lastSelectedDatabaseByConnection,
      [connectionId]: database,
    },
  }));
}

// React hooks
export function useConnectionState() {
  return useStore(connectionStore);
}

export function useActiveConnectionId() {
  return useStore(connectionStore, (s) => s.activeConnectionId);
}

export function useCredentials() {
  return useStore(connectionStore, (s) => s.credentials);
}
```

- [ ] **Step 2: Create TanStack Store for workspace (tabs, queries)**

Create `src/stores/workspaceStore.ts`:

```typescript
import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";

export interface Tab {
  id: string;
  title: string;
  content: string;
  savedQueryId?: string;
  database?: string;
}

export interface QueryResult {
  meta: Array<{ name: string; type: string }>;
  data: Record<string, unknown>[];
  rows: number;
  statistics: {
    elapsed: number;
    rows_read: number;
    bytes_read: number;
  };
}

interface WorkspaceState {
  tabs: Tab[];
  activeTabId: string | null;
  tabResults: Record<string, QueryResult>;
  tabErrors: Record<string, string>;
  tabLoading: Record<string, boolean>;
  selectedDatabase: string;
  isServerAvailable: boolean;
}

const STORAGE_KEY = "ch-ui-workspace";

function loadPersistedState(): Partial<WorkspaceState> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

const persisted = loadPersistedState();

export const workspaceStore = new Store<WorkspaceState>({
  tabs: persisted.tabs ?? [
    { id: crypto.randomUUID(), title: "Query 1", content: "" },
  ],
  activeTabId: persisted.activeTabId ?? null,
  tabResults: {},
  tabErrors: {},
  tabLoading: {},
  selectedDatabase: persisted.selectedDatabase ?? "",
  isServerAvailable: false,
});

// Persist on change (exclude transient state)
workspaceStore.subscribe(() => {
  const { tabs, activeTabId, selectedDatabase } = workspaceStore.state;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ tabs, activeTabId, selectedDatabase })
  );
});

// Actions
export function addTab(title?: string) {
  const id = crypto.randomUUID();
  workspaceStore.setState((prev) => ({
    ...prev,
    tabs: [
      ...prev.tabs,
      { id, title: title ?? `Query ${prev.tabs.length + 1}`, content: "" },
    ],
    activeTabId: id,
  }));
  return id;
}

export function removeTab(tabId: string) {
  workspaceStore.setState((prev) => {
    const filtered = prev.tabs.filter((t) => t.id !== tabId);
    const newActive =
      prev.activeTabId === tabId
        ? filtered[filtered.length - 1]?.id ?? null
        : prev.activeTabId;
    const { [tabId]: _r, ...tabResults } = prev.tabResults;
    const { [tabId]: _e, ...tabErrors } = prev.tabErrors;
    const { [tabId]: _l, ...tabLoading } = prev.tabLoading;
    return {
      ...prev,
      tabs: filtered,
      activeTabId: newActive,
      tabResults,
      tabErrors,
      tabLoading,
    };
  });
}

export function setActiveTab(tabId: string) {
  workspaceStore.setState((prev) => ({ ...prev, activeTabId: tabId }));
}

export function updateTab(tabId: string, updates: Partial<Tab>) {
  workspaceStore.setState((prev) => ({
    ...prev,
    tabs: prev.tabs.map((t) =>
      t.id === tabId ? { ...t, ...updates } : t
    ),
  }));
}

export function setTabResult(tabId: string, result: QueryResult) {
  workspaceStore.setState((prev) => ({
    ...prev,
    tabResults: { ...prev.tabResults, [tabId]: result },
    tabErrors: { ...prev.tabErrors, [tabId]: "" },
    tabLoading: { ...prev.tabLoading, [tabId]: false },
  }));
}

export function setTabError(tabId: string, error: string) {
  workspaceStore.setState((prev) => ({
    ...prev,
    tabErrors: { ...prev.tabErrors, [tabId]: error },
    tabLoading: { ...prev.tabLoading, [tabId]: false },
  }));
}

export function setTabLoading(tabId: string, loading: boolean) {
  workspaceStore.setState((prev) => ({
    ...prev,
    tabLoading: { ...prev.tabLoading, [tabId]: loading },
  }));
}

export function setSelectedDatabase(database: string) {
  workspaceStore.setState((prev) => ({ ...prev, selectedDatabase: database }));
}

export function setServerAvailable(available: boolean) {
  workspaceStore.setState((prev) => ({
    ...prev,
    isServerAvailable: available,
  }));
}

// React hooks
export function useWorkspaceState() {
  return useStore(workspaceStore);
}

export function useTabs() {
  return useStore(workspaceStore, (s) => s.tabs);
}

export function useActiveTabId() {
  return useStore(workspaceStore, (s) => s.activeTabId);
}

export function useTabResult(tabId: string) {
  return useStore(workspaceStore, (s) => s.tabResults[tabId]);
}

export function useTabLoading(tabId: string) {
  return useStore(workspaceStore, (s) => s.tabLoading[tabId]);
}

export function useTabError(tabId: string) {
  return useStore(workspaceStore, (s) => s.tabErrors[tabId]);
}
```

- [ ] **Step 3: Create UI store and editor store**

Create `src/stores/uiStore.ts`:
```typescript
import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";

interface UIState {
  sidebarOpen: boolean;
  commandPaletteOpen: boolean;
}

export const uiStore = new Store<UIState>({
  sidebarOpen: true,
  commandPaletteOpen: false,
});

export function toggleSidebar() {
  uiStore.setState((prev) => ({ ...prev, sidebarOpen: !prev.sidebarOpen }));
}

export function setCommandPaletteOpen(open: boolean) {
  uiStore.setState((prev) => ({ ...prev, commandPaletteOpen: open }));
}

export function useSidebarOpen() {
  return useStore(uiStore, (s) => s.sidebarOpen);
}
```

Create `src/stores/editorStore.ts`:
```typescript
import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import type { EditorFontFamily } from "@/contexts/AppearanceContext";

interface EditorState {
  fontSize: number;
  fontFamily: EditorFontFamily;
  vimMode: boolean;
}

const STORAGE_KEY = "ch-ui-editor";

function loadPersistedState(): Partial<EditorState> {
  try {
    return {
      fontSize: parseInt(localStorage.getItem("ch-ui-editor-font-size") ?? "14"),
      fontFamily: (localStorage.getItem("ch-ui-editor-font-family") as EditorFontFamily) ?? "system",
      vimMode: localStorage.getItem("ch-ui-editor-vim-mode") === "true",
    };
  } catch {
    return {};
  }
}

const persisted = loadPersistedState();

export const editorStore = new Store<EditorState>({
  fontSize: persisted.fontSize ?? 14,
  fontFamily: persisted.fontFamily ?? "system",
  vimMode: persisted.vimMode ?? false,
});

editorStore.subscribe(() => {
  const { fontSize, fontFamily, vimMode } = editorStore.state;
  localStorage.setItem("ch-ui-editor-font-size", String(fontSize));
  localStorage.setItem("ch-ui-editor-font-family", fontFamily);
  localStorage.setItem("ch-ui-editor-vim-mode", String(vimMode));
});

export function setEditorFontSize(size: number) {
  editorStore.setState((prev) => ({ ...prev, fontSize: size }));
}

export function setEditorFontFamily(family: EditorFontFamily) {
  editorStore.setState((prev) => ({ ...prev, fontFamily: family }));
}

export function setEditorVimMode(enabled: boolean) {
  editorStore.setState((prev) => ({ ...prev, vimMode: enabled }));
}

export function useEditorState() {
  return useStore(editorStore);
}
```

- [ ] **Step 4: Update all consumers**

Search all files importing from `@/store` or `@/store/connectionStore` and update to new store imports. Key pattern:

```tsx
// Before (Zustand)
import useAppStore from "@/store";
const { tabs, activeTabId, runQuery } = useAppStore();

// After (TanStack Store)
import { useTabs, useActiveTabId } from "@/stores/workspaceStore";
import { runQuery } from "@/lib/queryRunner"; // Extract query execution to lib
const tabs = useTabs();
const activeTabId = useActiveTabId();
```

Files to update (search `from "@/store"` and `from "@/store/connectionStore"`):
- All files in `src/features/workspace/`
- All files in `src/pages/`
- All files in `src/components/common/`
- `src/features/admin/`
- `src/features/settings/`
- `src/features/metrics/`

- [ ] **Step 5: Extract query execution to lib**

Create `src/lib/queryRunner.ts` — extract the `runQuery` logic from the old zustand store into a standalone async function that updates TanStack Store state:

```typescript
import { createClient } from "@clickhouse/client-web";
import { connectionStore } from "@/stores/connectionStore";
import {
  setTabLoading,
  setTabResult,
  setTabError,
  type QueryResult,
} from "@/stores/workspaceStore";

const queryAbortControllers = new Map<string, AbortController>();

export async function runQuery(query: string, tabId: string) {
  // Cancel existing query for this tab
  queryAbortControllers.get(tabId)?.abort();

  const controller = new AbortController();
  queryAbortControllers.set(tabId, controller);

  setTabLoading(tabId, true);

  const { credentials } = connectionStore.state;

  try {
    const client = createClient({
      url: credentials.url,
      username: credentials.username,
      password: credentials.password,
      request_timeout: credentials.requestTimeout ?? 30000,
      ...(credentials.useAdvanced && credentials.customPath
        ? { pathname: credentials.customPath }
        : {}),
    });

    const result = await client.query({
      query,
      format: "JSONEachRow",
      abort_signal: controller.signal,
    });

    const meta = result.response_headers?.["x-clickhouse-summary"]
      ? JSON.parse(result.response_headers["x-clickhouse-summary"])
      : {};

    const data = await result.json<Record<string, unknown>[]>();

    const queryResult: QueryResult = {
      meta: [], // Populated from response
      data,
      rows: data.length,
      statistics: {
        elapsed: meta.elapsed ?? 0,
        rows_read: meta.rows_read ?? 0,
        bytes_read: meta.bytes_read ?? 0,
      },
    };

    setTabResult(tabId, queryResult);
  } catch (error: unknown) {
    if (controller.signal.aborted) return;
    const message =
      error instanceof Error ? error.message : "Query execution failed";
    setTabError(tabId, message);
  } finally {
    queryAbortControllers.delete(tabId);
  }
}

export function cancelQuery(tabId: string) {
  queryAbortControllers.get(tabId)?.abort();
  queryAbortControllers.delete(tabId);
  setTabLoading(tabId, false);
}
```

- [ ] **Step 6: Delete old store files**

```bash
rm src/store/index.ts src/store/connectionStore.ts
rmdir src/store 2>/dev/null || true
```

- [ ] **Step 7: Verify no zustand imports remain**

```bash
grep -r "zustand\|from ['\"]@/store['\"]" src/ --include="*.ts" --include="*.tsx"
# Expected: no results
```

- [ ] **Step 8: Type check**

```bash
vp check
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: Replace Zustand with TanStack Store for all state management"
```

---

### Task 1.4: Set Up TanStack DB (Replace Dexie)

**Files:**
- Create: `src/db/index.ts`
- Create: `src/db/savedQueries.ts`
- Create: `src/db/connections.ts`
- Create: `src/db/preferences.ts`
- Delete: `src/lib/db.ts` (old Dexie setup)

- [ ] **Step 1: Create TanStack DB setup**

Create `src/db/index.ts`:

```typescript
import { createDatabase } from "@tanstack/db";

export const db = createDatabase({
  name: "ch-ui",
});
```

Create `src/db/savedQueries.ts`:

```typescript
import { z } from "zod";

export const savedQuerySchema = z.object({
  id: z.string(),
  title: z.string(),
  query: z.string(),
  connectionId: z.string(),
  database: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SavedQuery = z.infer<typeof savedQuerySchema>;
```

Create `src/db/connections.ts`:

```typescript
import { z } from "zod";

export const connectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  username: z.string(),
  password: z.string(),
  useAdvanced: z.boolean().default(false),
  customPath: z.string().default(""),
  requestTimeout: z.number().default(30000),
  isDistributed: z.boolean().default(false),
  clusterName: z.string().default(""),
  isDefault: z.boolean().default(false),
  createdAt: z.string(),
});

export type Connection = z.infer<typeof connectionSchema>;
```

> **Note:** TanStack DB is still evolving. If the `createDatabase`/`createCollection` API is not available at install time, fall back to a thin IndexedDB wrapper using the browser's native `indexedDB` API with the same schema definitions. The schema types above remain the same either way.

- [ ] **Step 2: Update all Dexie imports to use new DB layer**

Search for all files importing from `@/lib/db` and update:

```bash
grep -r "from ['\"]@/lib/db['\"]" src/ --include="*.ts" --include="*.tsx"
```

Replace each import with the equivalent from `src/db/`.

- [ ] **Step 3: Delete old Dexie db file**

```bash
rm src/lib/db.ts
```

- [ ] **Step 4: Verify no dexie imports remain**

```bash
grep -r "dexie\|from ['\"]@/lib/db['\"]" src/ --include="*.ts" --include="*.tsx"
# Expected: no results
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Replace Dexie with TanStack DB for persistent client data"
```

---

### Task 1.5: Add HyperDX Theme

**Files:**
- Modify: `src/index.css`
- Modify: `src/components/common/theme-provider.tsx`

- [ ] **Step 1: Add hyperdx theme variant to index.css**

Add after the existing `@custom-variant` declarations (line 19):

```css
@custom-variant hyperdx (&:is(.hyperdx *));
```

Add the HyperDX theme CSS variables after the existing theme blocks in the same file. Find the section where other themes define their `--background`, `--foreground`, etc. variables and add:

```css
.hyperdx {
  --background: 228 14% 7%;
  --foreground: 0 0% 95%;
  --card: 228 10% 10%;
  --card-foreground: 0 0% 95%;
  --popover: 228 10% 10%;
  --popover-foreground: 0 0% 95%;
  --primary: 158 100% 38%;
  --primary-foreground: 0 0% 100%;
  --secondary: 225 6% 15%;
  --secondary-foreground: 0 0% 90%;
  --muted: 225 6% 13%;
  --muted-foreground: 220 5% 55%;
  --accent: 158 100% 26%;
  --accent-foreground: 0 0% 100%;
  --destructive: 0 72% 51%;
  --destructive-foreground: 0 0% 100%;
  --border: 225 6% 18%;
  --input: 225 6% 18%;
  --ring: 158 100% 38%;
  --selected-row: 158 30% 15%;
  --chart-1: 158 100% 38%;
  --chart-2: 210 100% 56%;
  --chart-3: 28 100% 54%;
  --chart-4: 0 72% 51%;
  --chart-5: 187 100% 42%;
  --chart-6: 330 65% 60%;
  --chart-7: 270 60% 55%;
  --chart-8: 200 80% 65%;
  --chart-9: 30 50% 40%;
  --chart-10: 220 5% 55%;
}
```

- [ ] **Step 2: Update theme-provider.tsx to include hyperdx**

Add `"hyperdx"` to the `Theme` type union (after `"rose-pine-dawn"`).
Add `"hyperdx"` to the `DARK_THEMES` array.
Add `"hyperdx"` to the `classList.remove()` call in the useEffect.

- [ ] **Step 3: Verify theme renders**

```bash
vp dev
# Navigate to Settings → Appearance → select "hyperdx" theme
# Verify green accent colors apply throughout UI
```

- [ ] **Step 4: Commit**

```bash
git add src/index.css src/components/common/theme-provider.tsx
git commit -m "feat: Add HyperDX green-accent colorscheme"
```

---

## Phase 2: CodeMirror Editor

### Task 2.1: Create CodeMirror SQL Editor

**Files:**
- Create: `src/features/workspace/editor/codeMirrorConfig.ts`
- Create: `src/features/workspace/editor/codeMirrorThemes.ts`
- Create: `src/features/workspace/editor/completionSource.ts`
- Create: `src/features/workspace/editor/vimMode.ts`
- Rewrite: `src/features/workspace/editor/SqlEditor.tsx`
- Keep: `src/features/workspace/editor/usageTracker.ts` (no changes)
- Keep: `src/features/workspace/editor/sqlContextParser.ts` (rename exports only)
- Delete: `src/features/workspace/editor/monacoConfig.ts`
- Delete: `src/features/workspace/editor/monacoThemes.ts`

Reference: HyperDX's CodeMirror usage at `/home/liangshih.lin/GitHub/hyperdx/packages/app/src/components/SQLEditor/SQLEditor.tsx`

- [ ] **Step 1: Create CodeMirror themes**

Create `src/features/workspace/editor/codeMirrorThemes.ts`. Port all 18 themes (17 existing + hyperdx) from Monaco theme format to CodeMirror `EditorView.theme()` + `HighlightStyle.define()` format.

Each theme maps: background, foreground, cursor, selection, gutter, lineNumber, matchingBracket + token colors for keywords, strings, comments, functions, types, numbers, operators.

Reference the colors from `src/features/workspace/editor/monacoThemes.ts` for each theme.

- [ ] **Step 2: Create autocomplete CompletionSource**

Create `src/features/workspace/editor/completionSource.ts`. Port the autocomplete logic from `monacoConfig.ts` lines 400-1596 to CodeMirror's `CompletionSource` API.

Key pattern:
```typescript
import { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { parseSQLContext } from "./sqlContextParser";

export function clickhouseCompletionSource(
  context: CompletionContext
): CompletionResult | null {
  const word = context.matchBefore(/[\w.]+/);
  if (!word) return null;

  const sqlContext = parseSQLContext(
    context.state.doc.toString(),
    context.pos
  );

  // Return appropriate completions based on SQL context
  // (databases, tables, columns, functions, keywords)
}
```

- [ ] **Step 3: Create vim mode integration**

Create `src/features/workspace/editor/vimMode.ts`:
```typescript
import { vim } from "@replit/codemirror-vim";

export { vim };
```

- [ ] **Step 4: Create CodeMirror config**

Create `src/features/workspace/editor/codeMirrorConfig.ts`:
```typescript
import { sql, ClickHouse } from "@codemirror/lang-sql";
import { autocompletion } from "@codemirror/autocomplete";
import { linter } from "@codemirror/lint";
import { keymap } from "@codemirror/view";
import { clickhouseCompletionSource } from "./completionSource";

export function createSqlExtensions(options: {
  vimMode: boolean;
  onRun: () => void;
  onRunAll: () => void;
  onSave: () => void;
}) {
  const extensions = [
    sql({ dialect: ClickHouse, upperCaseKeywords: true }),
    autocompletion({
      override: [clickhouseCompletionSource],
      activateOnTyping: true,
    }),
    keymap.of([
      {
        key: "Ctrl-Enter",
        mac: "Cmd-Enter",
        run: () => { options.onRun(); return true; },
      },
      {
        key: "Shift-Ctrl-Enter",
        mac: "Shift-Cmd-Enter",
        run: () => { options.onRunAll(); return true; },
      },
      {
        key: "Ctrl-s",
        mac: "Cmd-s",
        run: () => { options.onSave(); return true; },
      },
    ]),
  ];

  if (options.vimMode) {
    const { vim } = require("@replit/codemirror-vim");
    extensions.push(vim());
  }

  return extensions;
}
```

- [ ] **Step 5: Rewrite SqlEditor.tsx with CodeMirror**

Replace the Monaco-based SqlEditor with CodeMirror using `@uiw/react-codemirror`:

```tsx
import { useCallback, useRef, useState } from "react";
import CodeMirror, { ReactCodeMirrorRef, EditorView } from "@uiw/react-codemirror";
import { useTheme } from "@/components/common/theme-provider";
import { useEditorState } from "@/stores/editorStore";
import { createSqlExtensions } from "./codeMirrorConfig";
import { getCodeMirrorTheme } from "./codeMirrorThemes";
import { parseQueries, findQueryAtCursor } from "@/helpers/queryParser";
// ... rest of component using CodeMirror instead of Monaco
```

- [ ] **Step 6: Delete Monaco files**

```bash
rm src/features/workspace/editor/monacoConfig.ts
rm src/features/workspace/editor/monacoThemes.ts
rm src/types/monaco-vim.d.ts
rm __mocks__/monaco-editor.ts
```

- [ ] **Step 7: Remove Monaco test mock from vite config**

Remove the `alias` entry in `vite.config.ts` test section:
```typescript
// Remove this:
alias: {
  "monaco-editor": "/__mocks__/monaco-editor.ts",
},
```

- [ ] **Step 8: Verify no monaco imports remain**

```bash
grep -r "monaco-editor\|monaco-vim\|from ['\"]monaco" src/ --include="*.ts" --include="*.tsx"
# Expected: no results
```

- [ ] **Step 9: Type check and test**

```bash
vp check
vp test
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: Replace Monaco Editor with CodeMirror 6 for SQL editing"
```

---

## Phase 3: TanStack Table

### Task 3.1: Create DataTable Component

**Files:**
- Create: `src/components/common/DataTable.tsx`
- Create: `src/components/common/TableHeaderMenu.tsx`
- Create: `src/components/common/TablePagination.tsx`
- Create: `src/lib/transposeTable.ts`

Reference: TanStack virtualized-rows example at `/home/liangshih.lin/GitHub/tanstack/table/examples/react/virtualized-rows/src/main.tsx`

- [ ] **Step 1: Create DataTable component**

Create `src/components/common/DataTable.tsx` — headless TanStack Table with virtualization:

```tsx
import { useMemo, useRef, useState, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  ColumnPinningState,
  ColumnSizingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TableHeaderMenu } from "./TableHeaderMenu";
import { TablePagination } from "./TablePagination";
import type { QueryResult } from "@/stores/workspaceStore";

const LARGE_DATASET = 500;

interface DataTableProps {
  data: QueryResult;
  height?: number | string;
  enablePagination?: boolean;
  pageSize?: number;
}

export function DataTable({
  data,
  height = "350px",
  enablePagination = true,
  pageSize: initialPageSize = 100,
}: DataTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({});
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    if (!data.data.length) return [];

    // Row number column
    const rowNumCol: ColumnDef<Record<string, unknown>> = {
      id: "__row_num",
      header: "#",
      size: 60,
      enableSorting: false,
      enableResizing: false,
      cell: ({ row }) => row.index + 1,
    };

    const dataCols = Object.keys(data.data[0]).map((key) => ({
      id: key,
      accessorKey: key,
      header: key,
      size: 150,
      cell: ({ getValue }: { getValue: () => unknown }) => {
        const value = getValue();
        if (value === null || value === undefined) return "null";
        if (typeof value === "object") return JSON.stringify(value);
        return String(value);
      },
    }));

    return [rowNumCol, ...dataCols];
  }, [data.data]);

  const table = useReactTable({
    data: data.data,
    columns,
    state: { sorting, columnPinning, columnSizing },
    onSortingChange: setSorting,
    onColumnPinningChange: setColumnPinning,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(enablePagination
      ? { getPaginationRowModel: getPaginationRowModel() }
      : {}),
    columnResizeMode: "onChange",
    enableColumnResizing: true,
  });

  const { rows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 35,
    getScrollElement: () => containerRef.current,
    overscan: 10,
  });

  return (
    <div className="flex flex-col" style={{ height }}>
      <div
        ref={containerRef}
        className="flex-1 overflow-auto border border-border rounded-md"
      >
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="border-b border-border px-3 py-2 text-left font-medium text-muted-foreground select-none"
                    style={{ width: header.getSize() }}
                  >
                    <TableHeaderMenu header={header} table={table}>
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                    </TableHeaderMenu>
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none hover:bg-primary"
                      />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <tr
                  key={row.id}
                  data-index={virtualRow.index}
                  ref={(node) => rowVirtualizer.measureElement(node)}
                  className="hover:bg-muted/50"
                  style={{
                    height: `${virtualRow.size}px`,
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="border-b border-border/50 px-3 py-1.5 text-foreground truncate"
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {enablePagination && (
        <TablePagination table={table} statistics={data.statistics} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create TableHeaderMenu**

Create `src/components/common/TableHeaderMenu.tsx` — Radix context menu for column operations (pin, sort, auto-size, reset). Port logic from `AgGridHeaderContextMenu.tsx`.

- [ ] **Step 3: Create TablePagination**

Create `src/components/common/TablePagination.tsx` — port pagination + statistics display from `AgGridPagination.tsx`, adapted for TanStack Table's pagination API (`table.setPageIndex()`, `table.getPageCount()`, etc.).

- [ ] **Step 4: Create transposeTable utility**

Create `src/lib/transposeTable.ts` — port `transposeGrid.ts` for TanStack Table row model.

- [ ] **Step 5: Update SqlTab and MultiResultTabs**

Modify `src/features/workspace/components/SqlTab.tsx` and `MultiResultTabs.tsx`:
- Replace `AgGridWrapper` with `DataTable`
- Replace ag-grid refs with TanStack table instance
- Update column definition format
- Update theme usage (remove `createAgGridTheme`, use Tailwind classes)

- [ ] **Step 6: Delete ag-grid files**

```bash
rm src/lib/agGrid.tsx
rm src/components/common/AgGridWrapper.tsx
rm src/components/common/AgTable.tsx
rm src/components/common/AgGridHeaderContextMenu.tsx
rm src/components/common/AgGridPagination.tsx
rm src/lib/transposeGrid.ts
```

- [ ] **Step 7: Verify no ag-grid imports remain**

```bash
grep -r "ag-grid\|AgGrid\|agGrid" src/ --include="*.ts" --include="*.tsx"
# Expected: no results
```

- [ ] **Step 8: Type check**

```bash
vp check
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: Replace ag-grid with TanStack Table + Virtual for all data grids"
```

---

## Phase 4: Analytics Core (Dashboard System + Charts)

### Task 4.1: Create Analytics Types and Utilities

**Files:**
- Create: `src/features/analytics/types.ts`
- Create: `src/lib/chartUtils.ts`
- Create: `src/lib/formatters.ts`

- [ ] **Step 1: Define analytics types**

Create `src/features/analytics/types.ts` — port chart config types from HyperDX `common-utils`:

```typescript
export type DisplayType =
  | "line" | "bar" | "area" | "stacked_bar"
  | "pie" | "histogram" | "heatmap"
  | "number" | "delta" | "table" | "markdown";

export type AggregateFunction =
  | "count" | "sum" | "avg" | "min" | "max"
  | "p50" | "p90" | "p95" | "p99"
  | "count_distinct" | "any";

export interface BuilderChartConfig {
  type: "builder";
  select: Array<{
    aggFn: AggregateFunction;
    aggCondition?: string;
    valueExpression: string;
  }>;
  where: string;
  groupBy: string[];
  displayType: DisplayType;
  granularity: string | "auto";
  fillNulls: boolean;
  limit?: number;
}

export interface RawSqlChartConfig {
  type: "rawsql";
  query: string;
  displayType: DisplayType;
}

export type ChartConfig = BuilderChartConfig | RawSqlChartConfig;

export interface DashboardTile {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config: ChartConfig;
  title: string;
}

export interface DashboardFilter {
  field: string;
  operator: "=" | "!=" | ">" | "<" | "contains";
  value: string;
}

export interface Dashboard {
  id: string;
  name: string;
  tiles: DashboardTile[];
  tags: string[];
  filters: DashboardFilter[];
  createdAt: string;
  updatedAt: string;
}

export const AGG_FNS = [
  { value: "count" as const, label: "Count" },
  { value: "sum" as const, label: "Sum" },
  { value: "avg" as const, label: "Average" },
  { value: "min" as const, label: "Minimum" },
  { value: "max" as const, label: "Maximum" },
  { value: "p50" as const, label: "Median (P50)" },
  { value: "p90" as const, label: "P90" },
  { value: "p95" as const, label: "P95" },
  { value: "p99" as const, label: "P99" },
  { value: "count_distinct" as const, label: "Count Distinct" },
  { value: "any" as const, label: "Any" },
] as const;
```

- [ ] **Step 2: Create chart SQL generation utility**

Create `src/lib/chartUtils.ts` — port SQL generation from HyperDX `ChartUtils.tsx`:

```typescript
import { format } from "sql-formatter";
import type {
  BuilderChartConfig,
  RawSqlChartConfig,
  ChartConfig,
} from "@/features/analytics/types";

export function generateChartSql(
  config: ChartConfig,
  dateRange: [Date, Date],
  tableName: string,
  timestampColumn: string = "timestamp"
): string {
  if (config.type === "rawsql") {
    return config.query;
  }

  return generateBuilderSql(config, dateRange, tableName, timestampColumn);
}

function generateBuilderSql(
  config: BuilderChartConfig,
  dateRange: [Date, Date],
  tableName: string,
  timestampColumn: string
): string {
  const [start, end] = dateRange;
  const granularity = resolveGranularity(config.granularity, dateRange);

  const selectClauses = config.select.map((s) => {
    const expr = s.valueExpression || "*";
    return aggFnToSql(s.aggFn, expr, s.aggCondition);
  });

  const timeBucket = `toStartOfInterval(${timestampColumn}, INTERVAL ${granularity}) AS time_bucket`;
  const groupByFields = config.groupBy.length
    ? config.groupBy.join(", ")
    : "";

  const select = [
    timeBucket,
    ...selectClauses,
    ...(groupByFields ? [groupByFields] : []),
  ].join(",\n  ");

  const where = [
    `${timestampColumn} >= '${start.toISOString()}'`,
    `${timestampColumn} <= '${end.toISOString()}'`,
    ...(config.where ? [config.where] : []),
  ].join("\n  AND ");

  const groupBy = [
    "time_bucket",
    ...(config.groupBy || []),
  ].join(", ");

  const limit = config.limit ? `LIMIT ${config.limit}` : "";

  return `SELECT\n  ${select}\nFROM ${tableName}\nWHERE ${where}\nGROUP BY ${groupBy}\nORDER BY time_bucket ASC\n${limit}`.trim();
}

function aggFnToSql(
  fn: string,
  expr: string,
  condition?: string
): string {
  const condSuffix = condition ? `If(${condition})` : "";
  switch (fn) {
    case "count": return `count${condSuffix}()`;
    case "sum": return `sum${condSuffix}(${expr})`;
    case "avg": return `avg${condSuffix}(${expr})`;
    case "min": return `min${condSuffix}(${expr})`;
    case "max": return `max${condSuffix}(${expr})`;
    case "p50": return `quantile${condSuffix}(0.5)(${expr})`;
    case "p90": return `quantile${condSuffix}(0.9)(${expr})`;
    case "p95": return `quantile${condSuffix}(0.95)(${expr})`;
    case "p99": return `quantile${condSuffix}(0.99)(${expr})`;
    case "count_distinct": return `uniq${condSuffix}(${expr})`;
    case "any": return `any${condSuffix}(${expr})`;
    default: return `count()`;
  }
}

export function resolveGranularity(
  granularity: string | "auto",
  dateRange: [Date, Date]
): string {
  if (granularity !== "auto") return granularity;
  const diffSeconds = (dateRange[1].getTime() - dateRange[0].getTime()) / 1000;
  if (diffSeconds <= 3600) return "1 minute";
  if (diffSeconds <= 86400) return "5 minute";
  if (diffSeconds <= 604800) return "1 hour";
  if (diffSeconds <= 2592000) return "1 day";
  return "1 day";
}
```

- [ ] **Step 3: Create formatters utility**

Create `src/lib/formatters.ts`:

```typescript
export function formatDuration(seconds: number): string {
  if (seconds < 0.001) return `${(seconds * 1_000_000).toFixed(0)}μs`;
  if (seconds < 1) return `${(seconds * 1000).toFixed(1)}ms`;
  return `${seconds.toFixed(2)}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: Add analytics types, chart SQL generation, and formatting utilities"
```

---

### Task 4.2: Create Dashboard System

**Files:**
- Create: `src/routes/dashboards/index.tsx`
- Create: `src/routes/dashboards/$dashboardId.tsx`
- Create: `src/routes/dashboards/templates.tsx`
- Create: `src/features/analytics/components/DashboardPage.tsx`
- Create: `src/features/analytics/components/DashboardGrid.tsx`
- Create: `src/features/analytics/components/DashboardFilters.tsx`
- Create: `src/features/analytics/components/TimePicker.tsx`
- Create: `src/features/analytics/components/ChartContainer.tsx`
- Create: `src/features/analytics/components/ChartBuilder.tsx`
- Create: `src/features/analytics/components/DisplaySwitcher.tsx`
- Create: `src/features/analytics/components/SaveToDashboard.tsx`
- Create: `src/features/analytics/hooks/useDashboard.ts`
- Create: `src/features/analytics/hooks/useDashboardFilters.ts`
- Create: `src/features/analytics/hooks/useTimeRange.ts`
- Create: `src/features/analytics/hooks/useChartConfig.ts`

Port from HyperDX reference:
- `DBDashboardPage.tsx` → `DashboardPage.tsx` (rewrite Mantine → Radix/Tailwind)
- `dashboard.ts` → `hooks/useDashboard.ts` (TanStack Query mutations)
- `DashboardFilters.tsx` → `DashboardFilters.tsx`
- `TimePicker/TimePicker.tsx` → `TimePicker.tsx`
- `charts/ChartContainer.tsx` → `ChartContainer.tsx`
- `DBEditTimeChartForm` → `ChartBuilder.tsx`
- `charts/DisplaySwitcher.tsx` → `DisplaySwitcher.tsx`

Key patterns:
- Dashboard grid: `react-grid-layout` with drag/resize
- CRUD: TanStack Query mutations with optimistic updates
- Time range: URL search params via TanStack Router
- Filters: Dashboard-wide, propagated to all tiles

Each component should be:
- Written in Tailwind CSS (no Mantine/SCSS)
- Using Radix UI primitives (Dialog, DropdownMenu, Popover, etc.)
- Using TanStack Router for navigation/search params
- Using TanStack Query for data fetching

- [ ] **Step 1-10: Implement each component** (follow file list above, one component per step)

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: Add dashboard system with grid layout, CRUD, filters, and time picker"
```

---

### Task 4.3: Create Chart Components

**Files:**
- Create: `src/features/analytics/charts/TimeSeriesChart.tsx`
- Create: `src/features/analytics/charts/PieChart.tsx`
- Create: `src/features/analytics/charts/HistogramChart.tsx`
- Create: `src/features/analytics/charts/HeatmapChart.tsx`
- Create: `src/features/analytics/charts/BarChart.tsx`
- Create: `src/features/analytics/charts/NumberCard.tsx`
- Create: `src/features/analytics/charts/DeltaCard.tsx`
- Create: `src/features/analytics/charts/TableChart.tsx`

All charts use Recharts (port from HyperDX) except:
- `NumberCard` and `DeltaCard`: pure Tailwind components
- `TableChart`: uses `DataTable` from Phase 3

Each chart component receives:
```typescript
interface ChartProps {
  data: Record<string, unknown>[];
  config: ChartConfig;
  dateRange: [Date, Date];
  height?: number;
}
```

- [ ] **Step 1: Create TimeSeriesChart** (Recharts Line/Bar/Area)

Port from HyperDX `DBTimeChart.tsx` + `HDXMultiSeriesTimeChart.tsx`. Use Recharts `ResponsiveContainer`, `LineChart`/`BarChart`/`AreaChart`, with custom tooltip and click-to-search.

- [ ] **Step 2: Create PieChart**
- [ ] **Step 3: Create HistogramChart**
- [ ] **Step 4: Create HeatmapChart**
- [ ] **Step 5: Create BarChart** (horizontal bar for top-K)
- [ ] **Step 6: Create NumberCard** (single KPI display)
- [ ] **Step 7: Create DeltaCard** (percentage change)
- [ ] **Step 8: Create TableChart** (wraps DataTable)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: Add all chart types (time series, pie, histogram, heatmap, bar, number, delta, table)"
```

---

## Phase 5: Analytics Advanced

### Task 5.1: Search & Filter System

**Files:**
- Create: `src/routes/search/index.tsx`
- Create: `src/routes/search/$savedSearchId.tsx`
- Create: `src/features/search/components/SearchPage.tsx`
- Create: `src/features/search/components/SearchInput.tsx`
- Create: `src/features/search/components/FilterPills.tsx`
- Create: `src/features/search/components/SavedSearches.tsx`
- Create: `src/features/search/hooks/useAutoComplete.ts`
- Create: `src/features/search/hooks/useSearchFilters.ts`

Port from HyperDX `Search/`, `SearchInput/`, `DBSearchPageFilters/`, `ActiveFilterPills.tsx`.

- [ ] **Steps 1-8: Implement each component**
- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: Add search and filter system with autocomplete and saved searches"
```

---

### Task 5.2: Service Map

**Files:**
- Create: `src/routes/services.tsx`
- Create: `src/features/services/components/ServiceMap.tsx`
- Create: `src/features/services/components/ServiceNode.tsx`
- Create: `src/features/services/components/ServiceEdge.tsx`
- Create: `src/features/services/hooks/useServiceMap.ts`

Port from HyperDX `ServiceMap/`. Uses `@xyflow/react` for graph rendering.

- [ ] **Steps 1-5: Implement each component**
- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Add service map with @xyflow/react graph visualization"
```

---

### Task 5.3: Trace Waterfall

**Files:**
- Create: `src/routes/traces/$traceId.tsx`
- Create: `src/features/traces/components/TraceDetail.tsx`
- Create: `src/features/traces/components/TraceWaterfall.tsx`
- Create: `src/features/traces/components/SpanDetail.tsx`
- Create: `src/features/traces/components/SpanTree.tsx`
- Create: `src/features/traces/hooks/useTrace.ts`

Port from HyperDX `TimelineChart/`, `DBTracePanel.tsx`, `DBTraceWaterfallChart.tsx`.

- [ ] **Steps 1-6: Implement each component**
- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: Add trace waterfall visualization with span tree and detail panel"
```

---

### Task 5.4: Pattern Analysis

**Files:**
- Create: `src/features/patterns/components/PatternTable.tsx`
- Create: `src/features/patterns/components/PatternDetail.tsx`
- Create: `src/features/patterns/hooks/usePatterns.ts`

Port from HyperDX `PatternTable.tsx`, `PatternSidePanel.tsx`.

- [ ] **Steps 1-3: Implement each component**
- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: Add log pattern analysis with grouping and frequency table"
```

---

## Phase 6: Sessions & Alerts

### Task 6.1: Session Replay

**Files:**
- Create: `src/routes/sessions.tsx`
- Create: `src/features/sessions/components/SessionList.tsx`
- Create: `src/features/sessions/components/SessionPlayer.tsx`
- Create: `src/features/sessions/components/SessionTimeline.tsx`
- Create: `src/features/sessions/hooks/useSession.ts`

Port from HyperDX `DBSessionPanel.tsx`.

- [ ] **Steps 1-5: Implement each component**
- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Add session replay with player, timeline, and network panel"
```

---

### Task 6.2: Alert System

**Files:**
- Create: `src/routes/alerts.tsx`
- Create: `src/features/alerts/components/AlertList.tsx`
- Create: `src/features/alerts/components/AlertBuilder.tsx`
- Create: `src/features/alerts/components/AlertPreview.tsx`
- Create: `src/features/alerts/hooks/useAlerts.ts`

Port from HyperDX `Alerts.tsx`, `AlertPreviewChart.tsx`.

- [ ] **Steps 1-5: Implement each component**
- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Add alert system with builder, preview chart, and management"
```

---

## Phase 7: OpenTelemetry Integration

### Task 7.1: OTel Collector Setup

**Files:**
- Create: `otel-collector/builder-config.yaml`
- Create: `otel-collector/Dockerfile`
- Create: `otel-collector/config.yaml`
- Create: `otel-collector/README.md`

Port from HyperDX `packages/otel-collector/`.

- [ ] **Step 1: Create builder-config.yaml**

Copy and adapt from `/home/liangshih.lin/GitHub/hyperdx/packages/otel-collector/builder-config.yaml`. Include receivers (otlp, hostmetrics, filelog, prometheus), processors (batch, memory_limiter, attributes, resource, resourcedetection, filter, transform), exporters (clickhouse, otlphttp, debug), extensions (health_check, pprof).

- [ ] **Step 2: Create collector Dockerfile**

Multi-stage build: OCB binary → Go build → Alpine runtime.

- [ ] **Step 3: Create collector config.yaml**

Default pipeline configuration:
- Receivers: otlp (grpc:4317, http:4318)
- Processors: memory_limiter → batch
- Exporters: clickhouse (logs, traces, metrics tables)

- [ ] **Step 4: Commit**

```bash
git add otel-collector/
git commit -m "feat: Add custom OpenTelemetry collector with ClickHouse exporter"
```

---

### Task 7.2: Browser SDK Integration

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: Initialize HyperDX browser SDK**

Add to `src/main.tsx` before `ReactDOM.createRoot`:

```typescript
import HyperDX from "@hyperdx/browser";

if (import.meta.env.VITE_OTEL_ENDPOINT) {
  HyperDX.init({
    apiKey: import.meta.env.VITE_OTEL_API_KEY ?? "",
    service: import.meta.env.VITE_OTEL_SERVICE_NAME ?? "ch-ui",
    tracePropagationTargets: [/localhost/i, /clickhouse/i],
    consoleCapture: true,
    advancedNetworkCapture: true,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main.tsx
git commit -m "feat: Add HyperDX browser SDK for RUM and session recording"
```

---

### Task 7.3: Docker Compose Update

**Files:**
- Modify: `docker-compose.yml`
- Modify: `Dockerfile` (if needed)

- [ ] **Step 1: Update docker-compose.yml**

Add otel-collector service alongside ch-ui:

```yaml
services:
  ch-ui:
    build: .
    ports:
      - "${CH_UI_PORT:-5555}:5521"
    environment:
      - VITE_CLICKHOUSE_URL
      - VITE_CLICKHOUSE_USER
      - VITE_CLICKHOUSE_PASS
      - VITE_OTEL_ENDPOINT=http://otel-collector:4318
    restart: always

  otel-collector:
    build: ./otel-collector
    ports:
      - "4317:4317"
      - "4318:4318"
      - "13133:13133"
    environment:
      - CLICKHOUSE_ENDPOINT=${VITE_CLICKHOUSE_URL:-http://localhost:8123}
    restart: always
```

- [ ] **Step 2: Verify Docker build**

```bash
docker compose build
docker compose up -d
# Verify both services start
curl http://localhost:5555  # ch-ui
curl http://localhost:13133  # otel-collector health
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: Add otel-collector to docker-compose with ClickHouse integration"
```

---

## Phase 8: Verification

### Task 8.1: Build & Type Check

- [ ] **Step 1: Type check**

```bash
vp check
```
Fix all TypeScript errors.

- [ ] **Step 2: Lint**

```bash
vp lint
```
Fix all lint errors.

- [ ] **Step 3: Build**

```bash
vp build
```
Verify production build succeeds.

- [ ] **Step 4: Verify no old imports remain**

```bash
grep -r "ag-grid\|monaco-editor\|zustand\|react-router-dom\|dexie" src/ --include="*.ts" --include="*.tsx"
# Expected: no results
```

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: Resolve build errors and lint issues from refactor"
```

---

### Task 8.2: Agent-Browser Testing

- [ ] **Step 1: Start dev server**

```bash
vp dev &
```

- [ ] **Step 2: Test with agent-browser CLI**

Test each route:
- `/` — SQL workspace loads, editor functional, run query, results display in TanStack Table
- `/dashboards` — Dashboard list renders
- `/dashboards/new` — Create dashboard, add tiles, drag/resize
- `/search` — Search input with autocomplete
- `/metrics` — Metrics dashboard renders
- `/logs` — Logs page renders
- `/services` — Service map renders
- `/alerts` — Alert list renders
- `/sessions` — Session list renders
- `/settings` — Settings page, theme switcher works (test hyperdx theme)

- [ ] **Step 3: Test Docker containers**

```bash
docker compose build
docker compose up -d
# Wait for health checks
docker compose ps
# Verify all services running
curl -f http://localhost:5555 || echo "CH-UI FAILED"
curl -f http://localhost:13133 || echo "OTEL COLLECTOR FAILED"
docker compose down
```

---

### Task 8.3: Final Cleanup

- [ ] **Step 1: Remove unused files**

Search for any orphaned files from the old stack that weren't caught:
```bash
# Check for old ag-grid, monaco, zustand, react-router-dom, dexie files
find src/ -name "*agGrid*" -o -name "*AgGrid*" -o -name "*monaco*" -o -name "*Monaco*"
```

- [ ] **Step 2: Bundle size comparison**

```bash
vp build
ls -la dist/assets/*.js | sort -k5 -n
# Compare total JS size vs pre-refactor
```

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: Final cleanup — remove orphaned files, verify bundle size reduction"
```

---

## Parallelization Guide (for agent-teams)

These phases can be parallelized:

```
Phase 1 (Foundation) ─── SEQUENTIAL (each task depends on previous)
  │
  ├── Phase 2 (Editor) ────────────────── PARALLEL ──┐
  ├── Phase 3 (Table) ─────────────────── PARALLEL ──┤
  └── Phase 1.5 (Theme) ──────────────── PARALLEL ──┤
                                                      │
Phase 4 (Analytics Core) ──── depends on Phase 3 ────┘
  │
  ├── Task 5.1 (Search) ──────────────── PARALLEL ──┐
  ├── Task 5.2 (Service Map) ──────────── PARALLEL ──┤
  ├── Task 5.3 (Traces) ──────────────── PARALLEL ──┤
  └── Task 5.4 (Patterns) ─────────────── PARALLEL ──┤
                                                      │
  ├── Task 6.1 (Sessions) ────────────── PARALLEL ──┤
  └── Task 6.2 (Alerts) ──────────────── PARALLEL ──┤
                                                      │
Phase 7 (OTel) ───── depends on Phase 4 ─────────────┘
  │
Phase 8 (Verification) ──── depends on ALL ───────────
```

**File ownership boundaries for parallel agents:**
- Agent A (Editor): `src/features/workspace/editor/*`
- Agent B (Table): `src/components/common/DataTable*.tsx`, `src/components/common/Table*.tsx`, `src/lib/transposeTable.ts`
- Agent C (Theme): `src/index.css`, `src/components/common/theme-provider.tsx`
- Agent D (Dashboard): `src/features/analytics/*`, `src/routes/dashboards/*`
- Agent E (Search): `src/features/search/*`, `src/routes/search/*`
- Agent F (Services): `src/features/services/*`, `src/routes/services.tsx`
- Agent G (Traces): `src/features/traces/*`, `src/routes/traces/*`
- Agent H (Patterns): `src/features/patterns/*`
- Agent I (Sessions): `src/features/sessions/*`, `src/routes/sessions.tsx`
- Agent J (Alerts): `src/features/alerts/*`, `src/routes/alerts.tsx`
- Agent K (OTel): `otel-collector/*`, `docker-compose.yml`
