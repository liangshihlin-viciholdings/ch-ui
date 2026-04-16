# CH-UI Major Refactor: TanStack-First + HyperDX Analytics Port

**Date**: 2026-04-16
**Status**: Design
**Scope**: Full application refactor — no backwards compatibility

---

## 1. Goals

1. Replace ag-grid with TanStack Table + TanStack Virtual
2. Replace Monaco Editor with CodeMirror 6
3. Replace Zustand with TanStack Store
4. Replace react-router-dom with TanStack Router
5. Replace Dexie (IndexedDB) with TanStack DB
6. Add TanStack Query for server state management
7. Port full HyperDX analytics suite (dashboards, charts, chart builder, search, service map, traces, session replay, pattern analysis, alerts)
8. Add HyperDX-based colorscheme
9. Integrate custom OpenTelemetry collector
10. Reduce overall package count and bundle size
11. All tooling via `vp` CLI

---

## 2. Package Changes

### Removed

| Package | Size | Reason |
|---------|------|--------|
| ag-grid-community | ~2.5 MB | Replaced by TanStack Table |
| ag-grid-react | ~200 KB | Replaced by TanStack Table |
| monaco-editor | ~4 MB | Replaced by CodeMirror 6 |
| monaco-vim | ~50 KB | Replaced by @replit/codemirror-vim |
| zustand | ~15 KB | Replaced by TanStack Store |
| react-router-dom | ~60 KB | Replaced by TanStack Router |
| dexie | ~80 KB | Replaced by TanStack DB |

### Added — Core (TanStack Ecosystem)

| Package | Purpose |
|---------|---------|
| @tanstack/react-router | Type-safe file-based routing, search params |
| @tanstack/router-devtools | Dev tools (dev only) |
| @tanstack/store | Reactive state primitives |
| @tanstack/react-store | React bindings for TanStack Store |
| @tanstack/react-query | Server state, caching, mutations |
| @tanstack/react-query-devtools | Dev tools (dev only) |
| @tanstack/react-table | Headless table with sorting, filtering, pagination |
| @tanstack/react-virtual | Row/column virtualization |
| @tanstack/db | Client-side reactive database |

### Added — CodeMirror

| Package | Purpose |
|---------|---------|
| @uiw/react-codemirror | React wrapper for CodeMirror 6 |
| @codemirror/lang-sql | SQL language support + ClickHouse dialect |
| @codemirror/lang-json | JSON language support |
| @codemirror/autocomplete | Autocompletion framework |
| @codemirror/lint | Linting framework |
| @codemirror/state | Editor state management |
| @replit/codemirror-vim | Vim keybindings (replaces monaco-vim) |

### Added — Analytics

| Package | Purpose |
|---------|---------|
| recharts | Analytics charts (time series, pie, histogram, bar, heatmap) |
| react-grid-layout | Dashboard tile layout (drag/resize) |
| @xyflow/react | Service map visualization |

### Kept (No Change)

- @clickhouse/client-web, @clickhouse/client-common (ClickHouse connectivity)
- @radix-ui/* (UI primitives)
- tailwindcss, @tailwindcss/vite (styling)
- lucide-react (icons)
- framer-motion (animations)
- @dnd-kit/* (drag and drop)
- react-hook-form, @hookform/resolvers, zod (forms/validation)
- react-resizable-panels (split panels)
- uplot (lightweight real-time metrics charts)
- papaparse (CSV parsing)
- date-fns (date utilities)
- sql-formatter (SQL formatting)
- sonner (toasts)
- cmdk (command palette)
- class-variance-authority, tailwind-merge, clsx (CSS utilities)
- highlight.js (syntax highlighting)
- bcryptjs (password hashing)

---

## 3. Architecture

### 3.1 Routing — TanStack Router

File-based route tree under `src/routes/`:

```
src/routes/
├── __root.tsx                    # Root layout (providers, nav)
├── index.tsx                     # / → SQL workspace (Home)
├── dashboards/
│   ├── index.tsx                 # /dashboards → list
│   ├── $dashboardId.tsx          # /dashboards/$id → view/edit
│   ├── templates.tsx             # /dashboards/templates
│   └── import.tsx                # /dashboards/import
├── search/
│   ├── index.tsx                 # /search → search interface
│   └── $savedSearchId.tsx        # /search/$id → saved search
├── alerts.tsx                    # /alerts → alert management
├── metrics.tsx                   # /metrics → real-time metrics
├── logs.tsx                      # /logs → log viewer
├── services.tsx                  # /services → service map
├── traces/
│   └── $traceId.tsx              # /traces/$id → trace detail
├── sessions.tsx                  # /sessions → session replay
├── admin.tsx                     # /admin → admin panel
└── settings.tsx                  # /settings → settings
```

Search params managed via TanStack Router's built-in `searchParams` validation (Zod schemas). Replaces URL state libraries entirely.

Example:
```typescript
// Route definition with validated search params
const dashboardRoute = createRoute({
  path: '/dashboards/$dashboardId',
  validateSearch: z.object({
    timeRange: z.enum(['15m','1h','6h','1d','7d','30d']).optional(),
    filters: z.string().optional(),
  }),
})
```

### 3.2 State Management — TanStack Store + Query + DB

Three tiers of state:

**Tier 1: Server State (TanStack Query)**
- ClickHouse query results
- Dashboard CRUD
- Alert configurations
- Saved searches
- Schema metadata (databases, tables, columns)
- Service map data
- Trace data

```typescript
// Example: dashboard query
const { data: dashboard } = useQuery({
  queryKey: ['dashboard', dashboardId],
  queryFn: () => fetchDashboard(dashboardId),
})
```

**Tier 2: Client State (TanStack Store)**
- Active connection credentials
- UI state (sidebar open/close, active tab, editor focus)
- Editor settings (font, vim mode, theme)
- Transient query state (loading, error per tab)

```typescript
// Example: connection store
const connectionStore = new Store({
  activeConnectionId: null,
  credentials: { url: '', username: '', password: '' },
})
```

**Tier 3: Persistent Client Data (TanStack DB)**
- Saved queries (replaces Dexie)
- Connection profiles
- Dashboard cache for offline/fast access
- Analytics data cache (client-side aggregations)
- User preferences
- Autocomplete usage frequency data

```typescript
// Example: saved queries collection
const savedQueriesCollection = createCollection({
  id: 'saved-queries',
  schema: savedQuerySchema,
})
```

### 3.3 Table System — TanStack Table + Virtual

Replaces all ag-grid usage across:
- `AgTable` → `DataTable` (query results display)
- `AgGridWrapper` → removed (TanStack Table is headless, no wrapper needed)
- `AgGridHeaderContextMenu` → `TableHeaderMenu` (Radix ContextMenu + TanStack header API)
- `AgGridPagination` → `TablePagination` (custom, reuses existing pagination logic)
- `transposeGrid` → `transposeTable` (adapted for TanStack row model)

**Features to preserve:**
- Row virtualization (via @tanstack/react-virtual, same as HyperDX pattern)
- Column pinning (left/right)
- Column resizing (CSS variable approach from TanStack examples)
- Custom cell renderer with copy-to-clipboard context menu
- Header context menu (pin, auto-size, reset)
- Custom pagination with statistics display
- Row number column
- Large dataset optimizations (disable animations >500 rows)
- Transpose view
- Data export (CSV, JSON, Parquet)

**Column definition migration:**
```typescript
// ag-grid ColDef → TanStack ColumnDef
// Before:
{ headerName: 'Name', field: 'name', flex: 1, sortable: true }

// After:
{ header: 'Name', accessorKey: 'name', size: 150, enableSorting: true }
```

**Virtualization pattern** (from TanStack examples/react/virtualized-rows):
```typescript
const rowVirtualizer = useVirtualizer({
  count: rows.length,
  estimateSize: () => 35,
  getScrollElement: () => containerRef.current,
  overscan: 10,
})
```

### 3.4 SQL Editor — CodeMirror 6

Replaces Monaco Editor with equivalent features:

| Monaco Feature | CodeMirror Equivalent |
|---------------|----------------------|
| SQL syntax highlighting | @codemirror/lang-sql with ClickHouse dialect |
| Context-aware autocomplete | @codemirror/autocomplete with custom CompletionSource |
| Vim mode | @replit/codemirror-vim |
| Document formatting | sql-formatter (same library, different integration) |
| Multiple themes | CodeMirror themes matching app themes |
| Font customization | EditorView.theme() with font CSS |
| Multi-cursor editing | Built into CodeMirror 6 |
| Keyboard shortcuts | @codemirror/view keymap |
| Worker-based parsing | Not needed (CodeMirror is lightweight enough) |

**Autocomplete system** — Port from monacoConfig.ts:
- Database suggestions (from ClickHouse client)
- Table suggestions with auto-alias
- Column suggestions from FROM clause parsing
- ClickHouse function suggestions (300+ built-in)
- Keyword suggestions (ClickHouse-specific: PREWHERE, FINAL, etc.)
- Usage frequency tracking (port AutocompleteUsageTracker)

**SQL context parser** — Port parseSQLContext() logic:
- Detect cursor position in SQL statement
- Determine context (SELECT, FROM, WHERE, GROUP BY, etc.)
- Provide context-appropriate completions

**Theme mapping** — Create CodeMirror themes for all 17 existing app themes + new HyperDX theme:
- Each theme: token colors (keywords, strings, comments, functions, types) + editor chrome (background, gutter, selection, cursor)
- Light/dark detection from app theme system

**Component structure:**
```
src/features/workspace/editor/
├── SqlEditor.tsx              # Main editor component (CodeMirror)
├── codeMirrorConfig.ts        # Central config (replaces monacoConfig.ts)
├── codeMirrorThemes.ts        # Theme definitions (replaces monacoThemes.ts)
├── completionSource.ts        # SQL autocomplete logic
├── sqlContextParser.ts        # Cursor context detection
├── usageTracker.ts            # Autocomplete usage frequency (kept)
└── vimMode.ts                 # Vim mode integration
```

### 3.5 Analytics Suite — Port from HyperDX

#### 3.5.1 Dashboard System

Port HyperDX's `DBDashboardPage` → `DashboardPage`:

- **Tile grid**: react-grid-layout with drag/resize
- **Dashboard CRUD**: TanStack Query mutations
- **Dashboard filters**: Dashboard-wide filter conditions applied to all tiles
- **Time range picker**: Relative (last 15m/1h/6h/1d/7d/30d) and absolute (date picker)
- **Auto-refresh**: Configurable refresh interval
- **Templates**: Pre-built dashboard templates (ClickHouse metrics, service overview, etc.)
- **Import/export**: JSON dashboard definitions
- **Tags**: Dashboard categorization

**Tile configuration:**
```typescript
interface DashboardTile {
  id: string
  x: number; y: number; w: number; h: number  // Grid position
  config: ChartConfig  // Builder or raw SQL
  title: string
}
```

**Dashboard state flow:**
```
URL ($dashboardId + search params)
  → TanStack Router loader
  → TanStack Query fetch
  → Dashboard component renders tiles
  → Each tile: chart config → SQL generation → TanStack Query → Recharts render
  → Time range / filter changes → URL update → re-query all tiles
```

#### 3.5.2 Chart Types

Port all HyperDX chart components, rewritten for Tailwind/Radix:

| HyperDX Component | CH-UI Component | Library |
|-------------------|-----------------|---------|
| DBTimeChart | TimeSeriesChart | Recharts (Line/Bar/Area) |
| DBPieChart | PieChart | Recharts |
| DBHistogramChart | HistogramChart | Recharts |
| DBHeatmapChart | HeatmapChart | Recharts (custom) |
| DBListBarChart | BarChart | Recharts |
| DBNumberChart | NumberCard | Custom (Tailwind) |
| DBDeltaChart | DeltaCard | Custom (Tailwind) |
| DBTableChart | TableChart | TanStack Table |
| DBTraceWaterfallChart | TraceWaterfall | Custom SVG |

**Chart container pattern:**
```typescript
// Wraps any chart type with toolbar, error boundary, loading state
<ChartContainer title={tile.title} onEdit={...} onDelete={...}>
  <TimeSeriesChart config={config} dateRange={dateRange} filters={filters} />
</ChartContainer>
```

**Display switcher**: Toggle between chart display types (line ↔ bar ↔ area ↔ table).

#### 3.5.3 Chart Builder

Port HyperDX's `EditTimeChartForm`:

- Visual configuration UI for building chart queries
- Aggregation function selector (count, sum, avg, p50, p90, p95, p99, min, max, count_distinct)
- Group by field selector with attribute autocomplete
- Where clause builder with filter expression input
- Display type selector
- Granularity selector (auto, 1m, 5m, 15m, 1h, 1d)
- Live preview panel
- Raw SQL mode (switch between builder and raw SQL)

**Chart config types** (adapted from HyperDX common-utils):
```typescript
type ChartConfig = BuilderChartConfig | RawSqlChartConfig

interface BuilderChartConfig {
  type: 'builder'
  select: Array<{
    aggFn: AggregateFunction
    aggCondition?: string
    valueExpression: string
  }>
  where: string
  groupBy: string[]
  displayType: DisplayType
  granularity: string | 'auto'
  fillNulls: boolean
  limit?: number
}

interface RawSqlChartConfig {
  type: 'rawsql'
  query: string
  displayType: DisplayType
}

type DisplayType = 'line' | 'bar' | 'area' | 'stacked_bar' | 'pie' |
  'histogram' | 'heatmap' | 'number' | 'delta' | 'table' | 'markdown'

type AggregateFunction = 'count' | 'sum' | 'avg' | 'min' | 'max' |
  'p50' | 'p90' | 'p95' | 'p99' | 'count_distinct' | 'any'
```

#### 3.5.4 Search & Filter System

Port HyperDX's search components:

- **Search input**: Attribute autocomplete with field suggestions from ClickHouse schema
- **Filter pills**: Active filters displayed as removable pills
- **Saved searches**: CRUD via TanStack Query + TanStack DB for local cache
- **Filter expression language**: Lucene-like syntax (port @hyperdx/lucene concepts)
- **Result display**: TanStack Table with row detail side panel

#### 3.5.5 Service Map

Port HyperDX's `ServiceMap`:

- **@xyflow/react** for graph visualization
- Service nodes with health indicators
- Edge connections showing request flow
- Click to drill into service details
- Data from ClickHouse span data (service.name, span relationships)

#### 3.5.6 Trace Waterfall

Port HyperDX's trace visualization:

- Span timeline with parent-child relationships
- Duration bars with color-coded status
- Span detail panel (attributes, events, links)
- Search within trace
- Collapsible span tree

#### 3.5.7 Session Replay

Port HyperDX's session components:

- Session list with metadata (duration, user, error count)
- Session player (timeline scrubber)
- Network requests panel
- Console log panel
- Click/scroll event markers

#### 3.5.8 Pattern Analysis

Port HyperDX's pattern detection:

- Log pattern grouping (cluster similar log messages)
- Pattern frequency table
- Click to filter by pattern
- Pattern detail side panel

#### 3.5.9 Alerts

Port HyperDX's alert system:

- Alert rule builder (threshold, aggregation, time window)
- Alert list with status indicators
- Alert preview chart (show threshold line on chart)
- Alert history/timeline
- Notification channel configuration

---

## 4. OpenTelemetry Integration

### 4.1 Custom OTel Collector

Port HyperDX's otel-collector setup. The collector is a Go binary built with OCB (OpenTelemetry Collector Builder).

**Key components to include:**

Receivers:
- `otlp` (OTLP protocol — primary)
- `hostmetrics` (host CPU, disk, memory)
- `filelog` (log file ingestion)
- `prometheus` (Prometheus scraping)

Processors:
- `batch` (batch for efficiency)
- `memory_limiter` (prevent OOM)
- `attributes` (add/modify attributes)
- `resource` (modify resource attributes)
- `resourcedetection` (auto-detect cloud/host info)
- `filter` (filter by conditions)
- `transform` (generic transformations)

Exporters:
- `clickhouse` (direct to ClickHouse — primary)
- `otlphttp` (forward to other collectors)
- `debug` (debugging)

Extensions:
- `health_check` (health endpoint)
- `pprof` (profiling)

### 4.2 ClickHouse Schema

The collector writes to ClickHouse tables for:
- **Logs**: timestamp, severity, body, resource attributes, log attributes
- **Traces**: trace_id, span_id, parent_span_id, service_name, operation, duration, status, attributes
- **Metrics**: name, value, timestamp, resource attributes, metric attributes

### 4.3 Browser SDK Integration

Add `@hyperdx/browser` SDK for:
- Real User Monitoring (RUM)
- Error tracking
- Session recording (for session replay feature)
- Performance metrics (Core Web Vitals)

### 4.4 Docker Setup

Update docker-compose to include:
- `ch-ui` service (Vite SPA served by `serve`)
- `clickhouse` service (if not external)
- `otel-collector` service (custom collector)

```yaml
services:
  ch-ui:
    build: .
    ports: ["5521:5521"]
  otel-collector:
    build: ./otel-collector
    ports:
      - "4317:4317"   # OTLP gRPC
      - "4318:4318"   # OTLP HTTP
      - "13133:13133" # Health check
    environment:
      - CLICKHOUSE_ENDPOINT=clickhouse:9000
```

---

## 5. Theme System — HyperDX Colorscheme

Add new theme `hyperdx` to existing theme system.

### CSS Variables (Dark Mode)
```css
.hyperdx {
  --background: 228 14% 7%;        /* #101113 */
  --foreground: 0 0% 95%;          /* #f2f2f2 */
  --primary: 158 100% 38%;         /* #00c28a (HyperDX green) */
  --primary-foreground: 0 0% 100%; /* white */
  --muted: 225 6% 13%;             /* #1e1f22 */
  --muted-foreground: 220 5% 55%;  /* #858890 */
  --accent: 158 100% 26%;          /* #008362 */
  --accent-foreground: 0 0% 100%;
  --card: 228 10% 10%;             /* #171819 */
  --card-foreground: 0 0% 95%;
  --border: 225 6% 18%;            /* #2a2b30 */
  --destructive: 0 72% 51%;        /* #d9534f */
  --ring: 158 100% 38%;            /* green ring */
  --selected-row: 158 30% 15%;     /* subtle green highlight */
  --chart-1: 158 100% 38%;         /* green (brand) */
  --chart-2: 210 100% 56%;         /* blue */
  --chart-3: 28 100% 54%;          /* orange */
  --chart-4: 0 72% 51%;            /* red */
  --chart-5: 187 100% 42%;         /* cyan */
  --chart-6: 330 65% 60%;          /* pink */
  --chart-7: 270 60% 55%;          /* purple */
  --chart-8: 200 80% 65%;          /* light blue */
  --chart-9: 30 50% 40%;           /* brown */
  --chart-10: 220 5% 55%;          /* gray */
}
```

### Light Mode Variant
```css
.hyperdx-light {
  --background: 0 0% 100%;
  --foreground: 228 14% 7%;
  --primary: 158 100% 32%;         /* slightly darker green for contrast */
  /* ... light variants of all tokens */
}
```

### CodeMirror Theme
Matching syntax highlighting tokens:
- Keywords: HyperDX green (#00c28a)
- Strings: orange (#e5a05b)
- Comments: muted gray (#858890)
- Functions: blue (#5c9fd8)
- Types: cyan (#4ec9b0)
- Numbers: light green (#b5cea8)

### AG-Grid → TanStack Table Theme
No special theming library needed. TanStack Table is headless — styled entirely via Tailwind CSS classes that read from the same CSS variables.

---

## 6. File Structure (Post-Refactor)

```
src/
├── routes/                          # TanStack Router file-based routes
│   ├── __root.tsx
│   ├── index.tsx                    # SQL workspace
│   ├── dashboards/
│   ├── search/
│   ├── alerts.tsx
│   ├── metrics.tsx
│   ├── logs.tsx
│   ├── services.tsx
│   ├── traces/
│   ├── sessions.tsx
│   ├── admin.tsx
│   └── settings.tsx
├── components/
│   ├── common/                      # Shared components
│   │   ├── DataTable.tsx            # TanStack Table wrapper
│   │   ├── TableHeaderMenu.tsx      # Column context menu
│   │   ├── TablePagination.tsx      # Pagination + statistics
│   │   ├── DownloadDialog.tsx       # Export (kept)
│   │   └── theme-provider.tsx       # Updated with hyperdx theme
│   └── ui/                          # Radix primitives (kept)
├── features/
│   ├── workspace/                   # SQL workspace
│   │   ├── editor/
│   │   │   ├── SqlEditor.tsx        # CodeMirror-based
│   │   │   ├── codeMirrorConfig.ts
│   │   │   ├── codeMirrorThemes.ts
│   │   │   ├── completionSource.ts
│   │   │   ├── sqlContextParser.ts
│   │   │   └── usageTracker.ts
│   │   └── components/
│   │       ├── SqlTab.tsx           # Updated for TanStack Table
│   │       └── MultiResultTabs.tsx
│   ├── analytics/                   # NEW — ported from HyperDX
│   │   ├── components/
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── DashboardGrid.tsx
│   │   │   ├── DashboardFilters.tsx
│   │   │   ├── TimePicker.tsx
│   │   │   ├── ChartContainer.tsx
│   │   │   ├── ChartBuilder.tsx
│   │   │   ├── DisplaySwitcher.tsx
│   │   │   └── SaveToDashboard.tsx
│   │   ├── charts/
│   │   │   ├── TimeSeriesChart.tsx
│   │   │   ├── PieChart.tsx
│   │   │   ├── HistogramChart.tsx
│   │   │   ├── HeatmapChart.tsx
│   │   │   ├── BarChart.tsx
│   │   │   ├── NumberCard.tsx
│   │   │   ├── DeltaCard.tsx
│   │   │   └── TableChart.tsx
│   │   ├── hooks/
│   │   │   ├── useChartConfig.ts
│   │   │   ├── useDashboard.ts
│   │   │   ├── useDashboardFilters.ts
│   │   │   └── useTimeRange.ts
│   │   └── types.ts
│   ├── search/                      # NEW — ported from HyperDX
│   │   ├── components/
│   │   │   ├── SearchPage.tsx
│   │   │   ├── SearchInput.tsx
│   │   │   ├── FilterPills.tsx
│   │   │   └── SavedSearches.tsx
│   │   └── hooks/
│   │       ├── useAutoComplete.ts
│   │       └── useSearchFilters.ts
│   ├── traces/                      # NEW — ported from HyperDX
│   │   ├── components/
│   │   │   ├── TraceDetail.tsx
│   │   │   ├── TraceWaterfall.tsx
│   │   │   ├── SpanDetail.tsx
│   │   │   └── SpanTree.tsx
│   │   └── hooks/
│   │       └── useTrace.ts
│   ├── services/                    # NEW — ported from HyperDX
│   │   ├── components/
│   │   │   ├── ServiceMap.tsx
│   │   │   ├── ServiceNode.tsx
│   │   │   └── ServiceEdge.tsx
│   │   └── hooks/
│   │       └── useServiceMap.ts
│   ├── sessions/                    # NEW — ported from HyperDX
│   │   ├── components/
│   │   │   ├── SessionList.tsx
│   │   │   ├── SessionPlayer.tsx
│   │   │   └── SessionTimeline.tsx
│   │   └── hooks/
│   │       └── useSession.ts
│   ├── alerts/                      # NEW — ported from HyperDX
│   │   ├── components/
│   │   │   ├── AlertList.tsx
│   │   │   ├── AlertBuilder.tsx
│   │   │   └── AlertPreview.tsx
│   │   └── hooks/
│   │       └── useAlerts.ts
│   ├── patterns/                    # NEW — ported from HyperDX
│   │   ├── components/
│   │   │   ├── PatternTable.tsx
│   │   │   └── PatternDetail.tsx
│   │   └── hooks/
│   │       └── usePatterns.ts
│   ├── metrics/                     # Existing, kept
│   ├── admin/                       # Existing, kept
│   └── settings/                    # Existing, updated
├── stores/                          # TanStack Store definitions
│   ├── connectionStore.ts
│   ├── workspaceStore.ts
│   ├── uiStore.ts
│   └── editorStore.ts
├── db/                              # TanStack DB collections
│   ├── index.ts
│   ├── savedQueries.ts
│   ├── connections.ts
│   ├── dashboardCache.ts
│   └── preferences.ts
├── lib/                             # Utilities
│   ├── chartUtils.ts               # Chart SQL generation
│   ├── transposeTable.ts           # Transpose for TanStack Table
│   ├── formatters.ts               # Time, bytes, number formatting
│   └── queryClient.ts              # TanStack Query client setup
├── hooks/                           # Shared hooks
├── contexts/                        # React contexts (Appearance, etc.)
├── types/                           # TypeScript types
└── index.css                        # Tailwind + theme CSS variables
```

---

## 7. Migration Strategy

### Phase 1: Foundation
- Set up TanStack Router (replace react-router-dom)
- Set up TanStack Store (replace zustand)
- Set up TanStack Query client
- Set up TanStack DB (replace dexie)
- Add HyperDX theme to CSS

### Phase 2: Editor
- Replace Monaco with CodeMirror 6
- Port SQL autocomplete system
- Port vim mode
- Port all 18 editor themes (17 existing + hyperdx)

### Phase 3: Table
- Replace ag-grid with TanStack Table + Virtual
- Port pagination, header menu, cell renderer
- Port transpose feature
- Port data export

### Phase 4: Analytics Core
- Dashboard system (grid, CRUD, filters, time picker)
- Chart types (all 9 types)
- Chart builder UI
- Display switcher

### Phase 5: Analytics Advanced
- Search & filter system
- Service map
- Trace waterfall
- Pattern analysis

### Phase 6: Sessions & Alerts
- Session replay
- Alert system

### Phase 7: OTel Integration
- Custom collector Docker setup
- ClickHouse schema for logs/traces/metrics
- Browser SDK integration
- Docker compose update

### Phase 8: Verification
- agent-browser CLI testing
- Docker build verification
- All features functional
- Bundle size comparison

---

## 8. Data Flow Diagrams

### Dashboard Data Flow
```
TanStack Router (URL: /dashboards/$id?timeRange=1h&filters=...)
  → Route loader fetches dashboard via TanStack Query
  → DashboardPage renders tile grid (react-grid-layout)
  → Each tile:
    → ChartConfig → SQL generation (chartUtils.ts)
    → TanStack Query executes SQL on ClickHouse
    → Response → Recharts/uPlot/TanStack Table render
    → Optional: cache in TanStack DB for fast revisit
  → Filter/time change → URL update → TanStack Query refetch
```

### SQL Workspace Data Flow
```
SqlEditor (CodeMirror)
  → User types SQL, gets autocomplete from completionSource.ts
  → Ctrl+Enter → extract query at cursor
  → TanStack Query mutation → ClickHouse client-web
  → Response: { meta, data, rows, statistics }
  → DataTable (TanStack Table + Virtual) renders results
  → TablePagination shows stats + navigation
```

### OTel Data Flow
```
Application (instrumented with @hyperdx/browser)
  → OTLP HTTP → OTel Collector (port 4318)
  → Collector processes: batch → resource detection → attributes
  → Exports to ClickHouse (logs, traces, metrics tables)
  → CH-UI queries ClickHouse for analytics/search/traces
```

---

## 9. Docker Configuration

### Dockerfile (ch-ui — updated)
```dockerfile
FROM oven/bun:latest AS build
WORKDIR /app
COPY . .
RUN bun install && bun run build

FROM oven/bun:1-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/inject-env.cjs ./
RUN bun add serve
EXPOSE 5521
CMD ["sh", "-c", "bun run inject-env.cjs && ./node_modules/.bin/serve -s -l 5521 dist"]
```

### docker-compose.yml (updated)
```yaml
services:
  ch-ui:
    build: .
    ports: ["${CH_UI_PORT:-5555}:5521"]
    environment:
      - VITE_CLICKHOUSE_URL
      - VITE_CLICKHOUSE_USER
      - VITE_CLICKHOUSE_PASS
    restart: always

  otel-collector:
    build: ./otel-collector
    ports:
      - "4317:4317"
      - "4318:4318"
      - "13133:13133"
    environment:
      - CLICKHOUSE_ENDPOINT=clickhouse:9000
    restart: always
    depends_on:
      - ch-ui
```

### otel-collector/ (new directory)
Port from HyperDX's `packages/otel-collector/`:
- `builder-config.yaml` (OCB manifest)
- `Dockerfile` (multi-stage Go build)
- `config.yaml` (collector configuration)
- `cmd/migrate/main.go` (ClickHouse migration)

---

## 10. Verification Plan

1. **Unit tests**: `vp test` — all existing tests updated + new tests for analytics
2. **Type check**: `vp check` — zero TypeScript errors
3. **Lint**: `vp lint` — zero warnings
4. **agent-browser CLI**: Navigate all routes, interact with dashboards, run queries, verify charts render
5. **Docker build**: `docker compose build` succeeds, containers start, health checks pass
6. **Bundle analysis**: Compare before/after bundle sizes, verify reduction from ag-grid + monaco removal

---

## 11. Success Criteria

- All existing ch-ui features work (SQL workspace, connections, metrics, logs, admin, settings)
- All HyperDX analytics features work (dashboards, charts, search, traces, service map, sessions, alerts, patterns)
- CodeMirror editor has feature parity with Monaco (autocomplete, vim, themes, formatting)
- TanStack Table has feature parity with ag-grid (virtualization, pinning, resize, pagination, export)
- HyperDX theme renders correctly in light and dark mode
- OTel collector receives data and writes to ClickHouse
- Docker compose starts all services successfully
- No ag-grid, monaco-editor, zustand, react-router-dom, or dexie imports remain
- `vp build` produces smaller bundle than current
- `vp check` passes with zero errors
