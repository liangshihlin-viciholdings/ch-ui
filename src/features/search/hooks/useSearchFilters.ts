// src/features/search/hooks/useSearchFilters.ts
// Local-only state controller for an active filter set. Mirrors
// useDashboardFilters so the API feels consistent across features.

import { useCallback, useMemo, useState } from "react";
import type { SearchFilter } from "@/features/search/types";

export interface UseSearchFiltersResult {
  filters: SearchFilter[];
  addFilter: (filter: SearchFilter) => void;
  removeFilter: (index: number) => void;
  clearFilters: () => void;
  setFilters: (next: SearchFilter[]) => void;
}

export function useSearchFilters(
  initial: SearchFilter[] = [],
): UseSearchFiltersResult {
  const [filters, setFilters] = useState<SearchFilter[]>(initial);

  const addFilter = useCallback((filter: SearchFilter) => {
    setFilters((prev) => [...prev, filter]);
  }, []);

  const removeFilter = useCallback((index: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearFilters = useCallback(() => setFilters([]), []);

  return useMemo(
    () => ({ filters, addFilter, removeFilter, clearFilters, setFilters }),
    [filters, addFilter, removeFilter, clearFilters],
  );
}
