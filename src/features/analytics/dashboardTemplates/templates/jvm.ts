// src/features/analytics/dashboardTemplates/templates/jvm.ts
import type { DashboardTemplate } from "../types";
import { builderConfig } from "../helpers";

export const jvmRuntimeTemplate: DashboardTemplate = {
  id: "jvm-runtime",
  name: "JVM Runtime Metrics",
  description: "Heap memory, GC stats, thread counts for Java applications",
  tags: ["OTel Runtime Metrics", "JVM", "Java"],
  tiles: [
    // Row 0: Metrics
    {
      id: "jvm-heap-used",
      title: "Heap Used",
      x: 0,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "jvm.memory.heap.used" }],
        displayType: "number",
      }),
    },
    {
      id: "jvm-threads",
      title: "Thread Count",
      x: 3,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "jvm.thread.count" }],
        displayType: "number",
      }),
    },
    {
      id: "jvm-gc-time",
      title: "GC Time",
      x: 6,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "sum", valueExpression: "jvm.gc.duration" }],
        displayType: "number",
      }),
    },
    {
      id: "jvm-cpu-util",
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
      id: "jvm-heap-chart",
      title: "Heap Memory: Used vs Max",
      x: 0,
      y: 2,
      w: 6,
      h: 5,
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
      x: 6,
      y: 2,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "jvm.gc.duration" }],
        displayType: "line",
      }),
    },
    // Row 2: More Charts
    {
      id: "jvm-threads-chart",
      title: "Thread Count Over Time",
      x: 0,
      y: 7,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "jvm.thread.count" }],
        displayType: "line",
      }),
    },
    {
      id: "jvm-nonheap-chart",
      title: "Non-Heap Memory",
      x: 6,
      y: 7,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "jvm.memory.nonheap.used" }],
        displayType: "line",
      }),
    },
  ],
};
