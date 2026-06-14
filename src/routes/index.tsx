import { createFileRoute } from "@tanstack/react-router";
import WorkbenchShell from "@/features/workbench/WorkbenchShell";

export const Route = createFileRoute("/")({
  component: WorkbenchShell,
});
