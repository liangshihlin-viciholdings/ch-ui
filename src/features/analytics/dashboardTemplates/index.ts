// src/features/analytics/dashboardTemplates/index.ts
// Dashboard templates based on HyperDX patterns for common observability use cases.

// Re-export types and helpers
export type { DashboardTemplate, PresetDashboard, SetupGuide } from "./types";
export { builderConfig, rawSqlConfig } from "./helpers";

// Import all templates
import { clickhouseServerTemplate } from "./templates/clickhouse";
import { nodejsRuntimeTemplate } from "./templates/nodejs";
import { goRuntimeTemplate } from "./templates/go";
import { jvmRuntimeTemplate } from "./templates/jvm";
import { dotnetRuntimeTemplate } from "./templates/dotnet";
import { httpPerformanceTemplate } from "./templates/http";
import { fastapiTemplate } from "./templates/fastapi";
import { rustRuntimeTemplate } from "./templates/rust";

import type { DashboardTemplate, PresetDashboard } from "./types";

// Re-export individual templates for direct import
export {
  clickhouseServerTemplate,
  nodejsRuntimeTemplate,
  goRuntimeTemplate,
  jvmRuntimeTemplate,
  dotnetRuntimeTemplate,
  httpPerformanceTemplate,
  fastapiTemplate,
  rustRuntimeTemplate,
};

// Preset dashboards shown as quick-create cards at the top of the dashboard list
// Each links to a template that will be created when clicked
export const PRESET_DASHBOARDS: PresetDashboard[] = [
  {
    id: "clickhouse-server",
    name: "ClickHouse Server",
    description: "Monitor your connected ClickHouse server health and performance",
    templateId: "clickhouse-server",
  },
  {
    id: "http-performance",
    name: "HTTP Performance",
    description: "Monitor HTTP endpoints, latency, and error rates",
    templateId: "http-performance",
  },
  {
    id: "fastapi",
    name: "FastAPI",
    description: "Request latency, error rates, and endpoint metrics for FastAPI",
    templateId: "fastapi",
  },
  {
    id: "nodejs-runtime",
    name: "Node.js Runtime",
    description: "Event loop, heap, and CPU metrics for Node.js apps",
    templateId: "nodejs-runtime",
  },
  {
    id: "rust-runtime",
    name: "Rust Runtime",
    description: "Tokio runtime, memory, and HTTP metrics for Rust applications",
    templateId: "rust-runtime",
  },
  {
    id: "go-runtime",
    name: "Go Runtime",
    description: "Goroutines, memory allocation, and GC stats for Go apps",
    templateId: "go-runtime",
  },
];

// All importable templates
export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  clickhouseServerTemplate,
  httpPerformanceTemplate,
  fastapiTemplate,
  nodejsRuntimeTemplate,
  rustRuntimeTemplate,
  goRuntimeTemplate,
  jvmRuntimeTemplate,
  dotnetRuntimeTemplate,
];

export function getDashboardTemplate(id: string): DashboardTemplate | undefined {
  return DASHBOARD_TEMPLATES.find((t) => t.id === id);
}
