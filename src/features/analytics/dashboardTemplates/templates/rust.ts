// src/features/analytics/dashboardTemplates/templates/rust.ts
import type { DashboardTemplate } from "../types";
import { builderConfig } from "../helpers";

export const rustRuntimeTemplate: DashboardTemplate = {
  id: "rust-runtime",
  name: "Rust Runtime Metrics",
  description: "Tokio runtime, memory allocation, and HTTP metrics for Rust applications",
  tags: ["Rust", "Tokio", "Performance"],
  tiles: [
    // Row 0: Metrics
    {
      id: "rust-active-tasks",
      title: "Active Tasks",
      x: 0,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "tokio.runtime.active_tasks" }],
        displayType: "number",
      }),
    },
    {
      id: "rust-memory",
      title: "Memory RSS",
      x: 3,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "process.runtime.rust.memory.rss" }],
        displayType: "number",
      }),
    },
    {
      id: "rust-threads",
      title: "Thread Count",
      x: 6,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "process.threads" }],
        displayType: "number",
      }),
    },
    {
      id: "rust-cpu",
      title: "CPU Utilization",
      x: 9,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "process.cpu.utilization" }],
        displayType: "number",
      }),
    },
    // Row 1: Tokio Runtime Charts
    {
      id: "rust-tasks-chart",
      title: "Active Tasks Over Time",
      x: 0,
      y: 2,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [
          { aggFn: "avg", valueExpression: "tokio.runtime.active_tasks" },
          { aggFn: "avg", valueExpression: "tokio.runtime.blocking_threads" },
        ],
        displayType: "line",
      }),
    },
    {
      id: "rust-poll-chart",
      title: "Task Poll Duration",
      x: 6,
      y: 2,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [
          { aggFn: "p50", valueExpression: "tokio.runtime.task.poll.duration" },
          { aggFn: "p99", valueExpression: "tokio.runtime.task.poll.duration" },
        ],
        displayType: "line",
      }),
    },
    // Row 2: Memory and CPU
    {
      id: "rust-memory-chart",
      title: "Memory Usage",
      x: 0,
      y: 7,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [
          { aggFn: "avg", valueExpression: "process.runtime.rust.memory.rss" },
          { aggFn: "avg", valueExpression: "process.runtime.rust.memory.heap" },
        ],
        displayType: "area",
      }),
    },
    {
      id: "rust-cpu-chart",
      title: "CPU Utilization",
      x: 6,
      y: 7,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "process.cpu.utilization" }],
        displayType: "line",
      }),
    },
    // Row 3: HTTP (if using Axum/Actix with OTel)
    {
      id: "rust-http-latency",
      title: "HTTP Latency Percentiles",
      x: 0,
      y: 12,
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
    {
      id: "rust-http-throughput",
      title: "Request Throughput",
      x: 6,
      y: 12,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [{ aggFn: "count", valueExpression: "*" }],
        where: "http.method IS NOT NULL",
        displayType: "line",
      }),
    },
  ],
};
