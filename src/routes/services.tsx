import { createFileRoute } from "@tanstack/react-router";
import ServiceMap from "@/features/services/components/ServiceMap";

export const Route = createFileRoute("/services")({
  component: ServiceMap,
});
