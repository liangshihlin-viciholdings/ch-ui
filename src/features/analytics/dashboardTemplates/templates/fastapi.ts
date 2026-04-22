// src/features/analytics/dashboardTemplates/templates/fastapi.ts
import type { DashboardTemplate } from "../types";
import { builderConfig } from "../helpers";

export const fastapiTemplate: DashboardTemplate = {
  id: "fastapi",
  name: "FastAPI Performance",
  description: "Request latency, error rates, and endpoint metrics for FastAPI applications",
  tags: ["Python", "FastAPI", "HTTP"],
  tiles: [
    // Row 0: Metrics
    {
      id: "fastapi-requests",
      title: "Request Rate",
      x: 0,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "count", valueExpression: "*" }],
        where: "http.method IS NOT NULL",
        displayType: "number",
      }),
    },
    {
      id: "fastapi-p99",
      title: "Latency p99 (ms)",
      x: 3,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "p99", valueExpression: "http.server.duration" }],
        displayType: "number",
      }),
    },
    {
      id: "fastapi-errors",
      title: "5xx Errors",
      x: 6,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "count", valueExpression: "*" }],
        where: "http.status_code >= 500",
        displayType: "number",
      }),
    },
    {
      id: "fastapi-active",
      title: "Active Requests",
      x: 9,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "http.server.active_requests" }],
        displayType: "number",
      }),
    },
    // Row 1: Charts
    {
      id: "fastapi-requests-chart",
      title: "Requests Over Time",
      x: 0,
      y: 2,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [{ aggFn: "count", valueExpression: "*" }],
        where: "http.method IS NOT NULL",
        displayType: "line",
      }),
    },
    {
      id: "fastapi-latency-chart",
      title: "Latency Percentiles",
      x: 6,
      y: 2,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [
          { aggFn: "p50", valueExpression: "http.server.duration" },
          { aggFn: "p90", valueExpression: "http.server.duration" },
          { aggFn: "p99", valueExpression: "http.server.duration" },
        ],
        displayType: "line",
      }),
    },
    // Row 2: More Charts
    {
      id: "fastapi-status-chart",
      title: "Status Codes Distribution",
      x: 0,
      y: 7,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [{ aggFn: "count", valueExpression: "*" }],
        groupBy: ["http.status_code"],
        displayType: "stacked_bar",
      }),
    },
    {
      id: "fastapi-endpoints-chart",
      title: "Top Routes by Latency",
      x: 6,
      y: 7,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [{ aggFn: "p95", valueExpression: "http.server.duration" }],
        groupBy: ["http.route"],
        displayType: "bar",
        limit: 10,
      }),
    },
    // Row 3: Python Runtime (if OTel instrumentation enabled)
    {
      id: "fastapi-cpu-chart",
      title: "CPU Utilization",
      x: 0,
      y: 12,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "process.cpu.utilization" }],
        displayType: "line",
      }),
    },
    {
      id: "fastapi-memory-chart",
      title: "Memory Usage",
      x: 6,
      y: 12,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "process.runtime.cpython.memory" }],
        displayType: "area",
      }),
    },
  ],
};
