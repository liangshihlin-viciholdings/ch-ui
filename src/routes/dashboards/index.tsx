import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DashboardListPage } from "@/features/analytics/components/DashboardListPage";

export const Route = createFileRoute("/dashboards/")({
  component: DashboardsIndex,
});

function DashboardsIndex() {
  const navigate = useNavigate();
  return (
    <DashboardListPage
      onSelect={(id) =>
        navigate({ to: "/dashboards/$dashboardId", params: { dashboardId: id } })
      }
    />
  );
}
