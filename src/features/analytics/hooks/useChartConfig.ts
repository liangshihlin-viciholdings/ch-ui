// src/features/analytics/hooks/useChartConfig.ts
// Small helpers to build/update ChartConfig values from the chart builder UI.

import { useCallback, useState } from "react";
import type {
  BuilderChartConfig,
  ChartConfig,
  ChartSelect,
  DisplayType,
  AggregateFunction,
} from "@/features/analytics/types";

export function createDefaultBuilderConfig(): BuilderChartConfig {
  return {
    type: "builder",
    select: [{ aggFn: "count", valueExpression: "*" }],
    where: "",
    groupBy: [],
    displayType: "line",
    granularity: "auto",
    fillNulls: true,
  };
}

export function useChartConfig(initial?: ChartConfig) {
  const [config, setConfig] = useState<ChartConfig>(
    initial ?? createDefaultBuilderConfig(),
  );

  const update = useCallback((patch: Partial<ChartConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch } as ChartConfig));
  }, []);

  const setDisplayType = useCallback((displayType: DisplayType) => {
    setConfig((prev) => ({ ...prev, displayType }));
  }, []);

  const updateSelect = useCallback(
    (index: number, select: Partial<ChartSelect>) => {
      setConfig((prev) => {
        if (prev.type !== "builder") return prev;
        const next = prev.select.map((s, i) =>
          i === index ? { ...s, ...select } : s,
        );
        return { ...prev, select: next };
      });
    },
    [],
  );

  const addSelect = useCallback(() => {
    setConfig((prev) => {
      if (prev.type !== "builder") return prev;
      const newSelect: ChartSelect = { aggFn: "count", valueExpression: "*" };
      return { ...prev, select: [...prev.select, newSelect] };
    });
  }, []);

  const removeSelect = useCallback((index: number) => {
    setConfig((prev) => {
      if (prev.type !== "builder") return prev;
      if (prev.select.length <= 1) return prev;
      return { ...prev, select: prev.select.filter((_, i) => i !== index) };
    });
  }, []);

  const setAggFn = useCallback((index: number, aggFn: AggregateFunction) => {
    updateSelect(index, { aggFn });
  }, [updateSelect]);

  const reset = useCallback(() => {
    setConfig(createDefaultBuilderConfig());
  }, []);

  return {
    config,
    setConfig,
    update,
    setDisplayType,
    updateSelect,
    addSelect,
    removeSelect,
    setAggFn,
    reset,
  };
}
