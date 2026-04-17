import { createFileRoute } from "@tanstack/react-router";
import SessionList from "@/features/sessions/components/SessionList";

export const Route = createFileRoute("/sessions")({
  component: SessionList,
});
