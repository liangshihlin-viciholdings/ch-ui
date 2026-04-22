// src/features/analytics/dashboardTemplates/templates/nodejs.ts
import type { DashboardTemplate } from "../types";
import { builderConfig } from "../helpers";

export const nodejsRuntimeTemplate: DashboardTemplate = {
  id: "nodejs-runtime",
  name: "Node.js Runtime Metrics",
  description:
    "Event loop delay, heap usage, CPU utilization, and V8 memory for Node.js applications",
  tags: ["OTel Runtime Metrics", "Node.js"],
  tiles: [
    // Row 0: Metrics
    {
      id: "nodejs-el-delay-p99",
      title: "Event Loop Delay p99 (ms)",
      x: 0,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "nodejs.eventloop.delay.p99" }],
        displayType: "number",
      }),
    },
    {
      id: "nodejs-el-util",
      title: "Event Loop Utilization",
      x: 3,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "nodejs.eventloop.utilization" }],
        displayType: "number",
      }),
    },
    {
      id: "nodejs-heap-used",
      title: "Heap Used",
      x: 6,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "v8js.memory.heap.used" }],
        displayType: "number",
      }),
    },
    {
      id: "nodejs-cpu-util",
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
      id: "nodejs-el-delay-chart",
      title: "Event Loop Delay Percentiles (ms)",
      x: 0,
      y: 2,
      w: 6,
      h: 5,
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
      x: 6,
      y: 2,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "nodejs.eventloop.utilization" }],
        displayType: "line",
      }),
    },
    // Row 2: More Charts
    {
      id: "nodejs-heap-chart",
      title: "V8 Heap: Used vs Limit",
      x: 0,
      y: 7,
      w: 6,
      h: 5,
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
