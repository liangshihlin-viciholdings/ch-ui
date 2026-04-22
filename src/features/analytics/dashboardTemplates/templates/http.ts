// src/features/analytics/dashboardTemplates/templates/http.ts
import type { DashboardTemplate } from "../types";
import { builderConfig } from "../helpers";

export const httpPerformanceTemplate: DashboardTemplate = {
  id: "http-performance",
  name: "HTTP Performance",
  description: "Request rates, latency percentiles, error rates, and status codes",
  tags: ["HTTP", "Performance"],
  tiles: [
    // Row 0: Metrics
    {
      id: "http-requests",
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
      id: "http-p99",
      title: "Latency p99",
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
      id: "http-errors",
      title: "Error Rate",
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
      id: "http-success",
      title: "Success Rate",
      x: 9,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "count", valueExpression: "*" }],
        where: "http.status_code >= 200 AND http.status_code < 400",
        displayType: "number",
      }),
    },
    // Row 1: Charts
    {
      id: "http-requests-chart",
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
      id: "http-latency-chart",
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
      id: "http-status-chart",
      title: "Status Codes",
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
      id: "http-endpoints-chart",
      title: "Top Endpoints by Request Count",
      x: 6,
      y: 7,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [{ aggFn: "count", valueExpression: "*" }],
        groupBy: ["http.route"],
        displayType: "bar",
        limit: 10,
      }),
    },
  ],
};
