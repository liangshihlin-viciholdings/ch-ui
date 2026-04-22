// src/features/analytics/dashboardTemplates/templates/dotnet.ts
import type { DashboardTemplate } from "../types";
import { builderConfig } from "../helpers";

export const dotnetRuntimeTemplate: DashboardTemplate = {
  id: "dotnet-runtime",
  name: ".NET Runtime Metrics",
  description: "GC, thread pool, and memory metrics for .NET applications",
  tags: ["OTel Runtime Metrics", ".NET"],
  tiles: [
    // Row 0: Metrics
    {
      id: "dotnet-heap",
      title: "Heap Size",
      x: 0,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "dotnet.gc.heap.size" }],
        displayType: "number",
      }),
    },
    {
      id: "dotnet-threadpool",
      title: "Thread Pool Threads",
      x: 3,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "dotnet.threadpool.thread.count" }],
        displayType: "number",
      }),
    },
    {
      id: "dotnet-gc-count",
      title: "GC Collections",
      x: 6,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "sum", valueExpression: "dotnet.gc.collections.count" }],
        displayType: "number",
      }),
    },
    {
      id: "dotnet-cpu",
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
    // Row 1: Charts
    {
      id: "dotnet-heap-chart",
      title: "Heap Size Over Time",
      x: 0,
      y: 2,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "dotnet.gc.heap.size" }],
        displayType: "line",
      }),
    },
    {
      id: "dotnet-gc-chart",
      title: "GC Pause Duration",
      x: 6,
      y: 2,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "dotnet.gc.pause.time" }],
        displayType: "line",
      }),
    },
    // Row 2: More Charts
    {
      id: "dotnet-threadpool-chart",
      title: "Thread Pool Activity",
      x: 0,
      y: 7,
      w: 6,
      h: 5,
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
      x: 6,
      y: 7,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "process.cpu.utilization" }],
        displayType: "line",
      }),
    },
  ],
};
