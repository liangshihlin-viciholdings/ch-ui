// src/features/analytics/hooks/useDashboardFilters.ts
// Thin state container for the dashboard-level filter pills.

import { useCallback, useMemo, useState } from "react";
import type { DashboardFilter } from "@/features/analytics/types";

export interface UseDashboardFiltersResult {
  filters: DashboardFilter[];
  addFilter: (filter: DashboardFilter) => void;
  removeFilter: (index: number) => void;
  updateFilter: (index: number, filter: DashboardFilter) => void;
  clearFilters: () => void;
  setFilters: (filters: DashboardFilter[]) => void;
}

export function useDashboardFilters(
  initial: DashboardFilter[] = [],
): UseDashboardFiltersResult {
  const [filters, setFilters] = useState<DashboardFilter[]>(initial);

  const addFilter = useCallback((filter: DashboardFilter) => {
    setFilters((prev) => [...prev, filter]);
  }, []);

  const removeFilter = useCallback((index: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateFilter = useCallback(
    (index: number, filter: DashboardFilter) => {
      setFilters((prev) => prev.map((f, i) => (i === index ? filter : f)));
    },
    [],
  );

  const clearFilters = useCallback(() => setFilters([]), []);

  return useMemo(
    () => ({ filters, addFilter, removeFilter, updateFilter, clearFilters, setFilters }),
    [filters, addFilter, removeFilter, updateFilter, clearFilters],
  );
}
