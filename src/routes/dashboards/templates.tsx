import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboards/templates")({
  component: DashboardTemplatesPage,
});

function DashboardTemplatesPage() {
  return (
    <div className="flex-1 w-full overflow-auto">
      <div className="container mx-auto px-4 py-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Dashboard templates
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Template catalog coming soon.
        </p>
      </div>
    </div>
  );
}
