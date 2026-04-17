import { createFileRoute } from "@tanstack/react-router";
import AlertList from "@/features/alerts/components/AlertList";

export const Route = createFileRoute("/alerts")({
  component: AlertList,
});
