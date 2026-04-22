// src/features/analytics/dashboardTemplates/templates/go.ts
import type { DashboardTemplate } from "../types";
import { builderConfig } from "../helpers";

export const goRuntimeTemplate: DashboardTemplate = {
  id: "go-runtime",
  name: "Go Runtime Metrics",
  description: "Goroutines, memory allocation, GC stats for Go applications",
  tags: ["OTel Runtime Metrics", "Go"],
  tiles: [
    // Row 0: Metrics
    {
      id: "go-goroutines",
      title: "Goroutines",
      x: 0,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "runtime.go.goroutines" }],
        displayType: "number",
      }),
    },
    {
      id: "go-heap-alloc",
      title: "Heap Alloc",
      x: 3,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "runtime.go.mem.heap_alloc" }],
        displayType: "number",
      }),
    },
    {
      id: "go-gc-count",
      title: "GC Cycles",
      x: 6,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "sum", valueExpression: "runtime.go.gc.count" }],
        displayType: "number",
      }),
    },
    {
      id: "go-cpu-util",
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
      id: "go-goroutines-chart",
      title: "Goroutines Over Time",
      x: 0,
      y: 2,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "runtime.go.goroutines" }],
        displayType: "line",
      }),
    },
    {
      id: "go-memory-chart",
      title: "Memory: Heap vs Stack",
      x: 6,
      y: 2,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [
          { aggFn: "avg", valueExpression: "runtime.go.mem.heap_alloc" },
          { aggFn: "avg", valueExpression: "runtime.go.mem.stack_inuse" },
        ],
        displayType: "line",
      }),
    },
    // Row 2: More Charts
    {
      id: "go-gc-pause-chart",
      title: "GC Pause Time",
      x: 0,
      y: 7,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "runtime.go.gc.pause_total_ns" }],
        displayType: "line",
      }),
    },
    {
      id: "go-cpu-chart",
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
