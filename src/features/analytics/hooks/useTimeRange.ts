// src/features/analytics/hooks/useTimeRange.ts
// Local controller for a dashboard time range. Resolves preset → concrete
// [start, end] and exposes a setter that accepts either a preset or a
// custom [start, end] tuple.

import { useCallback, useMemo, useState } from "react";
import type { TimeRange, TimeRangePreset } from "@/features/analytics/types";
import { resolveTimeRange } from "@/lib/chartUtils";

export interface UseTimeRangeResult {
  range: TimeRange;
  setPreset: (preset: TimeRangePreset) => void;
  setCustom: (start: Date, end: Date) => void;
}

function buildRange(preset: TimeRangePreset): TimeRange {
  const [start, end] = resolveTimeRange(preset);
  return { preset, start, end };
}

export function useTimeRange(
  defaultPreset: TimeRangePreset = "1h",
): UseTimeRangeResult {
  const [range, setRange] = useState<TimeRange>(() => buildRange(defaultPreset));

  const setPreset = useCallback((preset: TimeRangePreset) => {
    if (preset === "custom") return;
    setRange(buildRange(preset));
  }, []);

  const setCustom = useCallback((start: Date, end: Date) => {
    setRange({ preset: "custom", start, end });
  }, []);

  return useMemo(
    () => ({ range, setPreset, setCustom }),
    [range, setPreset, setCustom],
  );
}
