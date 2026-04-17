import { createFileRoute } from "@tanstack/react-router";
import TraceDetail from "@/features/traces/components/TraceDetail";

export const Route = createFileRoute("/traces/$traceId")({
  component: TraceRoute,
});

function TraceRoute() {
  const { traceId } = Route.useParams();
  return <TraceDetail traceId={traceId} />;
}
