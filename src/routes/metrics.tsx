import { createFileRoute } from "@tanstack/react-router";
import MetricsPage from "@/pages/Metrics";

export const Route = createFileRoute("/metrics")({
  component: MetricsPage,
});
