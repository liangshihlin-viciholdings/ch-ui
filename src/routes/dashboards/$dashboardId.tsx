import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DashboardPage } from "@/features/analytics/components/DashboardPage";

export const Route = createFileRoute("/dashboards/$dashboardId")({
  component: DashboardRoute,
});

function DashboardRoute() {
  const { dashboardId } = Route.useParams();
  const navigate = useNavigate();
  return (
    <DashboardPage
      dashboardId={dashboardId}
      onNavigateToList={() => navigate({ to: "/dashboards" })}
    />
  );
}
