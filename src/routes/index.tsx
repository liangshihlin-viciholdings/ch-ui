import { createFileRoute } from "@tanstack/react-router";
import HomePage from "@/pages/Home";
import WorkbenchShell from "@/features/workbench/WorkbenchShell";

const isElectron =
  typeof window !== "undefined" && !!(window as any).electronAPI;

export const Route = createFileRoute("/")({
  component: isElectron ? WorkbenchShell : HomePage,
});
