// src/features/analytics/dashboardTemplates/index.ts
// Dashboard templates based on HyperDX patterns for common observability use cases.

import type { DashboardTile, BuilderChartConfig } from "@/features/analytics/types";

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  tiles: DashboardTile[];
}

export interface PresetDashboard {
  id: string;
  name: string;
  description: string;
  href: string;
}

// Preset dashboards shown as quick links at the top of the dashboard list
export const PRESET_DASHBOARDS: PresetDashboard[] = [
  {
    id: "http-performance",
    name: "HTTP Performance",
    description: "Monitor HTTP endpoints, latency, and error rates",
    href: "/dashboards/preset/http-performance",
  },
  {
    id: "database-metrics",
    name: "Database Metrics",
    description: "ClickHouse query performance and resource usage",
    href: "/dashboards/preset/database-metrics",
  },
  {
    id: "system-resources",
    name: "System Resources",
    description: "CPU, memory, disk, and network metrics",
    href: "/dashboards/preset/system-resources",
  },
];

// Helper to create a builder config
function builderConfig(
  overrides: Partial<BuilderChartConfig> & Pick<BuilderChartConfig, "select" | "displayType">
): BuilderChartConfig {
  return {
    type: "builder",
    where: "",
    groupBy: [],
    granularity: "auto",
    fillNulls: true,
    ...overrides,
  };
}

// Node.js Runtime Metrics template
export const nodejsRuntimeTemplate: DashboardTemplate = {
  id: "nodejs-runtime",
  name: "Node.js Runtime Metrics",
  description:
    "Event loop delay, heap usage, CPU utilization, and V8 memory for Node.js applications",
  tags: ["OTel Runtime Metrics", "Node.js"],
  tiles: [
    {
      id: "nodejs-el-delay-p99",
      title: "Event Loop Delay p99 (ms)",
      x: 0,
      y: 0,
      w: 6,
      h: 3,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "nodejs.eventloop.delay.p99" }],
        displayType: "number",
      }),
    },
    {
      id: "nodejs-el-util",
      title: "Event Loop Utilization",
      x: 6,
      y: 0,
      w: 6,
      h: 3,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "nodejs.eventloop.utilization" }],
        displayType: "number",
      }),
    },
    {
      id: "nodejs-heap-used",
      title: "Heap Used",
      x: 12,
      y: 0,
      w: 6,
      h: 3,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "v8js.memory.heap.used" }],
        displayType: "number",
      }),
    },
    {
      id: "nodejs-cpu-util",
      title: "CPU Utilization",
      x: 18,
      y: 0,
      w: 6,
      h: 3,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "process.cpu.utilization" }],
        displayType: "number",
      }),
    },
    {
      id: "nodejs-el-delay-chart",
      title: "Event Loop Delay Percentiles (ms)",
      x: 0,
      y: 3,
      w: 12,
      h: 7,
      config: builderConfig({
        select: [
          { aggFn: "avg", valueExpression: "nodejs.eventloop.delay.p50" },
          { aggFn: "avg", valueExpression: "nodejs.eventloop.delay.p90" },
          { aggFn: "avg", valueExpression: "nodejs.eventloop.delay.p99" },
        ],
        displayType: "line",
      }),
    },
    {
      id: "nodejs-el-util-chart",
      title: "Event Loop Utilization",
      x: 12,
      y: 3,
      w: 12,
      h: 7,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "nodejs.eventloop.utilization" }],
        displayType: "line",
      }),
    },
    {
      id: "nodejs-heap-chart",
      title: "V8 Heap: Used vs Limit",
      x: 0,
      y: 10,
      w: 12,
      h: 7,
      config: builderConfig({
        select: [
          { aggFn: "avg", valueExpression: "v8js.memory.heap.used" },
          { aggFn: "avg", valueExpression: "v8js.memory.heap.limit" },
        ],
        displayType: "line",
      }),
    },
    {
      id: "nodejs-cpu-chart",
      title: "CPU Utilization",
      x: 12,
      y: 10,
      w: 12,
      h: 7,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "process.cpu.utilization" }],
        displayType: "line",
      }),
    },
  ],
};

// Go Runtime Metrics template
export const goRuntimeTemplate: DashboardTemplate = {
  id: "go-runtime",
  name: "Go Runtime Metrics",
  description: "Goroutines, memory allocation, GC stats for Go applications",
  tags: ["OTel Runtime Metrics", "Go"],
  tiles: [
    {
      id: "go-goroutines",
      title: "Goroutines",
      x: 0,
      y: 0,
      w: 6,
      h: 3,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "runtime.go.goroutines" }],
        displayType: "number",
      }),
    },
    {
      id: "go-heap-alloc",
      title: "Heap Alloc",
      x: 6,
      y: 0,
      w: 6,
      h: 3,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "runtime.go.mem.heap_alloc" }],
        displayType: "number",
      }),
    },
    {
      id: "go-gc-count",
      title: "GC Cycles",
      x: 12,
      y: 0,
      w: 6,
      h: 3,
      config: builderConfig({
        select: [{ aggFn: "sum", valueExpression: "runtime.go.gc.count" }],
        displayType: "number",
      }),
    },
    {
      id: "go-cpu-util",
      title: "CPU Utilization",
      x: 18,
      y: 0,
      w: 6,
      h: 3,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "process.cpu.utilization" }],
        displayType: "number",
      }),
    },
    {
      id: "go-goroutines-chart",
      title: "Goroutines Over Time",
      x: 0,
      y: 3,
      w: 12,
      h: 7,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "runtime.go.goroutines" }],
        displayType: "line",
      }),
    },
    {
      id: "go-memory-chart",
      title: "Memory: Heap vs Stack",
      x: 12,
      y: 3,
      w: 12,
      h: 7,
      config: builderConfig({
        select: [
          { aggFn: "avg", valueExpression: "runtime.go.mem.heap_alloc" },
          { aggFn: "avg", valueExpression: "runtime.go.mem.stack_inuse" },
        ],
        displayType: "line",
      }),
    },
    {
      id: "go-gc-pause-chart",
      title: "GC Pause Time",
      x: 0,
      y: 10,
      w: 12,
      h: 7,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "runtime.go.gc.pause_total_ns" }],
        displayType: "line",
      }),
    },
    {
      id: "go-cpu-chart",
      title: "CPU Utilization",
      x: 12,
      y: 10,
      w: 12,
      h: 7,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "process.cpu.utilization" }],
        displayType: "line",
      }),
    },
  ],
};

// JVM Runtime Metrics template
export const jvmRuntimeTemplate: DashboardTemplate = {
  id: "jvm-runtime",
  name: "JVM Runtime Metrics",
  description: "Heap memory, GC stats, thread counts for Java applications",
  tags: ["OTel Runtime Metrics", "JVM", "Java"],
  tiles: [
    {
      id: "jvm-heap-used",
      title: "Heap Used",
      x: 0,
      y: 0,
      w: 6,
      h: 3,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "jvm.memory.heap.used" }],
        displayType: "number",
      }),
    },
    {
      id: "jvm-threads",
      title: "Thread Count",
      x: 6,
      y: 0,
      w: 6,
      h: 3,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "jvm.thread.count" }],
        displayType: "number",
      }),
    },
    {
      id: "jvm-gc-time",
      title: "GC Time",
      x: 12,
      y: 0,
      w: 6,
      h: 3,
      config: builderConfig({
        select: [{ aggFn: "sum", valueExpression: "jvm.gc.duration" }],
        displayType: "number",
      }),
    },
    {
      id: "jvm-cpu-util",
      title: "CPU Utilization",
      x: 18,
      y: 0,
      w: 6,
      h: 3,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "process.cpu.utilization" }],
        displayType: "number",
      }),
    },
    {
      id: "jvm-heap-chart",
      title: "Heap Memory: Used vs Max",
      x: 0,
      y: 3,
      w: 12,
      h: 7,
      config: builderConfig({
        select: [
          { aggFn: "avg", valueExpression: "jvm.memory.heap.used" },
          { aggFn: "avg", valueExpression: "jvm.memory.heap.max" },
        ],
        displayType: "line",
      }),
    },
    {
      id: "jvm-gc-chart",
      title: "GC Duration",
      x: 12,
      y: 3,
      w: 12,
      h: 7,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "jvm.gc.duration" }],
        displayType: "line",
      }),
    },
    {
      id: "jvm-threads-chart",
      title: "Thread Count Over Time",
      x: 0,
      y: 10,
      w: 12,
      h: 7,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "jvm.thread.count" }],
        displayType: "line",
      }),
    },
    {
      id: "jvm-nonheap-chart",
      title: "Non-Heap Memory",
      x: 12,
      y: 10,
      w: 12,
      h: 7,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "jvm.memory.nonheap.used" }],
        displayType: "line",
      }),
    },
  ],
};

// .NET Runtime Metrics template
export const dotnetRuntimeTemplate: DashboardTemplate = {
  id: "dotnet-runtime",
  name: ".NET Runtime Metrics",
  description: "GC, thread pool, and memory metrics for .NET applications",
  tags: ["OTel Runtime Metrics", ".NET"],
  tiles: [
    {
      id: "dotnet-heap",
      title: "Heap Size",
      x: 0,
      y: 0,
      w: 6,
      h: 3,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "dotnet.gc.heap.size" }],
        displayType: "number",
      }),
    },
    {
      id: "dotnet-threadpool",
      title: "Thread Pool Threads",
      x: 6,
      y: 0,
      w: 6,
      h: 3,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "dotnet.threadpool.thread.count" }],
        displayType: "number",
      }),
    },
    {
      id: "dotnet-gc-count",
      title: "GC Collections",
      x: 12,
      y: 0,
      w: 6,
      h: 3,
      config: builderConfig({
        select: [{ aggFn: "sum", valueExpression: "dotnet.gc.collections.count" }],
        displayType: "number",
      }),
    },
    {
      id: "dotnet-cpu",
      title: "CPU Utilization",
      x: 18,
      y: 0,
      w: 6,
      h: 3,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "process.cpu.utilization" }],
        displayType: "number",
      }),
    },
    {
      id: "dotnet-heap-chart",
      title: "Heap Size Over Time",
      x: 0,
      y: 3,
      w: 12,
      h: 7,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "dotnet.gc.heap.size" }],
        displayType: "line",
      }),
    },
    {
      id: "dotnet-gc-chart",
      title: "GC Pause Duration",
      x: 12,
      y: 3,
      w: 12,
      h: 7,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "dotnet.gc.pause.time" }],
        displayType: "line",
      }),
    },
    {
      id: "dotnet-threadpool-chart",
      title: "Thread Pool Activity",
      x: 0,
      y: 10,
      w: 12,
      h: 7,
      config: builderConfig({
        select: [
          { aggFn: "avg", valueExpression: "dotnet.threadpool.thread.count" },
          { aggFn: "avg", valueExpression: "dotnet.threadpool.queue.length" },
        ],
        displayType: "line",
      }),
    },
    {
      id: "dotnet-cpu-chart",
      title: "CPU Utilization",
      x: 12,
      y: 10,
      w: 12,
      h: 7,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "process.cpu.utilization" }],
        displayType: "line",
      }),
    },
  ],
};

// HTTP Performance template
export const httpPerformanceTemplate: DashboardTemplate = {
  id: "http-performance",
  name: "HTTP Performance",
  description: "Request rates, latency percentiles, error rates, and status codes",
  tags: ["HTTP", "Performance"],
  tiles: [
    {
      id: "http-requests",
      title: "Request Rate",
      x: 0,
      y: 0,
      w: 6,
      h: 3,
      config: builderConfig({
        select: [{ aggFn: "count", valueExpression: "*" }],
        where: "http.method IS NOT NULL",
        displayType: "number",
      }),
    },
    {
      id: "http-p99",
      title: "Latency p99",
      x: 6,
      y: 0,
      w: 6,
      h: 3,
      config: builderConfig({
        select: [{ aggFn: "p99", valueExpression: "http.server.duration" }],
        displayType: "number",
      }),
    },
    {
      id: "http-errors",
      title: "Error Rate",
      x: 12,
      y: 0,
      w: 6,
      h: 3,
      config: builderConfig({
        select: [{ aggFn: "count", valueExpression: "*" }],
        where: "http.status_code >= 500",
        displayType: "number",
      }),
    },
    {
      id: "http-success",
      title: "Success Rate",
      x: 18,
      y: 0,
      w: 6,
      h: 3,
      config: builderConfig({
        select: [{ aggFn: "count", valueExpression: "*" }],
        where: "http.status_code >= 200 AND http.status_code < 400",
        displayType: "number",
      }),
    },
    {
      id: "http-requests-chart",
      title: "Requests Over Time",
      x: 0,
      y: 3,
      w: 12,
      h: 7,
      config: builderConfig({
        select: [{ aggFn: "count", valueExpression: "*" }],
        where: "http.method IS NOT NULL",
        displayType: "line",
      }),
    },
    {
      id: "http-latency-chart",
      title: "Latency Percentiles",
      x: 12,
      y: 3,
      w: 12,
      h: 7,
      config: builderConfig({
        select: [
          { aggFn: "p50", valueExpression: "http.server.duration" },
          { aggFn: "p90", valueExpression: "http.server.duration" },
          { aggFn: "p99", valueExpression: "http.server.duration" },
        ],
        displayType: "line",
      }),
    },
    {
      id: "http-status-chart",
      title: "Status Codes",
      x: 0,
      y: 10,
      w: 12,
      h: 7,
      config: builderConfig({
        select: [{ aggFn: "count", valueExpression: "*" }],
        groupBy: ["http.status_code"],
        displayType: "stacked_bar",
      }),
    },
    {
      id: "http-endpoints-chart",
      title: "Top Endpoints by Request Count",
      x: 12,
      y: 10,
      w: 12,
      h: 7,
      config: builderConfig({
        select: [{ aggFn: "count", valueExpression: "*" }],
        groupBy: ["http.route"],
        displayType: "bar",
        limit: 10,
      }),
    },
  ],
};

// All importable templates
export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  nodejsRuntimeTemplate,
  goRuntimeTemplate,
  jvmRuntimeTemplate,
  dotnetRuntimeTemplate,
  httpPerformanceTemplate,
];

export function getDashboardTemplate(id: string): DashboardTemplate | undefined {
  return DASHBOARD_TEMPLATES.find((t) => t.id === id);
}
