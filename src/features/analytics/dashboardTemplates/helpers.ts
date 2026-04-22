// src/features/analytics/dashboardTemplates/helpers.ts
// Shared helpers for creating dashboard tile configurations

import type { BuilderChartConfig, RawSqlChartConfig } from "@/features/analytics/types";

export function builderConfig(
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

export function rawSqlConfig(
  query: string,
  displayType: RawSqlChartConfig["displayType"]
): RawSqlChartConfig {
  return {
    type: "rawsql",
    query,
    displayType,
  };
}
