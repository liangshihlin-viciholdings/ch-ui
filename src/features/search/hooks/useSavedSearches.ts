// src/features/search/hooks/useSavedSearches.ts
// TanStack Query hooks around the Dexie saved-search repository. Mirrors
// the dashboard hooks pattern in src/features/analytics/hooks/useDashboard.ts.

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { SavedSearchRuntime } from "@/features/search/types";
import {
  listSavedSearches,
  getSavedSearch,
  createSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
  type CreateSavedSearchInput,
  type UpdateSavedSearchInput,
} from "@/db/alerts";

const LIST_KEY = ["saved-searches"] as const;
const itemKey = (id: string) => ["saved-search", id] as const;

export function useSavedSearches(): UseQueryResult<SavedSearchRuntime[], Error> {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: listSavedSearches,
  });
}

export function useSavedSearch(
  id: string | undefined,
): UseQueryResult<SavedSearchRuntime | null, Error> {
  return useQuery({
    queryKey: itemKey(id ?? ""),
    queryFn: () => (id ? getSavedSearch(id) : Promise.resolve(null)),
    enabled: !!id,
  });
}

export function useCreateSavedSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSavedSearchInput) => createSavedSearch(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
    },
  });
}

export function useUpdateSavedSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSavedSearchInput }) =>
      updateSavedSearch(id, input),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: itemKey(id) });
    },
  });
}

export function useDeleteSavedSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSavedSearch(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: itemKey(id) });
    },
  });
}
