// src/features/alerts/types.ts
// Runtime types for the alerts feature. Alerts are stored client-side in
// Dexie; there is no server-side evaluator yet — the AlertPreview chart is
// the only consumer of the threshold today.

import type { BuilderChartConfig } from "@/features/analytics/types";

export type ThresholdOperator = ">" | "<" | ">=" | "<=" | "==" | "!=";

export type EvaluationInterval = "5m" | "15m" | "1h";

// Alert config piggy-backs on the analytics BuilderChartConfig so we can
// reuse the chart pipeline for previews. Raw SQL configs are intentionally
// not supported here — the UI restricts the user to the builder.
export type AlertConfig = BuilderChartConfig;

export interface Alert {
  id: string;
  name: string;
  tableName: string;
  config: AlertConfig;
  thresholdOperator: ThresholdOperator;
  thresholdValue: number;
  evaluationInterval: EvaluationInterval;
  enabled: boolean;
  /** Saved connection this alert evaluates against. null = legacy default. */
  connectionId?: string | null;
  /** ISO string when the alert last evaluated truthy. Stubbed — never set
   * server-side today. */
  lastTriggered?: string;
  createdAt: string;
  updatedAt: string;
}

export const THRESHOLD_OPERATORS: ReadonlyArray<{
  value: ThresholdOperator;
  label: string;
}> = [
  { value: ">", label: "greater than" },
  { value: "<", label: "less than" },
  { value: ">=", label: "greater than or equal to" },
  { value: "<=", label: "less than or equal to" },
  { value: "==", label: "equal to" },
  { value: "!=", label: "not equal to" },
] as const;

export const EVALUATION_INTERVALS: ReadonlyArray<{
  value: EvaluationInterval;
  label: string;
}> = [
  { value: "5m", label: "Every 5 minutes" },
  { value: "15m", label: "Every 15 minutes" },
  { value: "1h", label: "Every hour" },
] as const;
