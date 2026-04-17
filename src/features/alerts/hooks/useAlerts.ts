// src/features/alerts/hooks/useAlerts.ts
// TanStack Query hooks around the Dexie alerts repository. Identical shape
// to useDashboard / useSavedSearches so the feature surfaces feel uniform.

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { Alert } from "@/features/alerts/types";
import {
  listAlerts,
  getAlert,
  createAlert,
  updateAlert,
  deleteAlert,
  type CreateAlertInput,
  type UpdateAlertInput,
} from "@/db/alerts";

const LIST_KEY = ["alerts"] as const;
const itemKey = (id: string) => ["alert", id] as const;

export function useAlerts(): UseQueryResult<Alert[], Error> {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: listAlerts,
  });
}

export function useAlert(
  id: string | undefined,
): UseQueryResult<Alert | null, Error> {
  return useQuery({
    queryKey: itemKey(id ?? ""),
    queryFn: () => (id ? getAlert(id) : Promise.resolve(null)),
    enabled: !!id,
  });
}

export function useCreateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAlertInput) => createAlert(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
    },
  });
}

export function useUpdateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAlertInput }) =>
      updateAlert(id, input),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: itemKey(id) });
    },
  });
}

export function useDeleteAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAlert(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: itemKey(id) });
    },
  });
}
