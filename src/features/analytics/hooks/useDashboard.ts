// src/features/analytics/hooks/useDashboard.ts
// TanStack Query hooks around the Dexie dashboard repository.

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { Dashboard } from "@/features/analytics/types";
import {
  listDashboards,
  getDashboard,
  createDashboard,
  updateDashboard,
  deleteDashboard,
  type CreateDashboardInput,
  type UpdateDashboardInput,
} from "@/db/dashboards";

const DASHBOARDS_KEY = ["dashboards"] as const;
const dashboardKey = (id: string) => ["dashboard", id] as const;

export function useDashboards(): UseQueryResult<Dashboard[], Error> {
  return useQuery({
    queryKey: DASHBOARDS_KEY,
    queryFn: listDashboards,
  });
}

export function useDashboard(
  id: string | undefined,
): UseQueryResult<Dashboard | null, Error> {
  return useQuery({
    queryKey: dashboardKey(id ?? ""),
    queryFn: () => (id ? getDashboard(id) : Promise.resolve(null)),
    enabled: !!id,
  });
}

export function useCreateDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDashboardInput) => createDashboard(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DASHBOARDS_KEY });
    },
  });
}

export function useUpdateDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDashboardInput }) =>
      updateDashboard(id, input),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: DASHBOARDS_KEY });
      qc.invalidateQueries({ queryKey: dashboardKey(id) });
    },
  });
}

export function useDeleteDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDashboard(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: DASHBOARDS_KEY });
      qc.invalidateQueries({ queryKey: dashboardKey(id) });
    },
  });
}
