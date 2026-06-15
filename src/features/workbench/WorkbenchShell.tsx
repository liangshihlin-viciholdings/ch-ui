import { useEffect } from "react";
import EditorPane from "./EditorPane";
import AdminPanel from "./AdminPanel";
import { useWorkbenchStore, loadConnections } from "@/stores/workbenchStore";

// The connection + schema navigator now lives in the global AppSidebar
// (rendered on this route), so the workbench is just the editor / admin area.
export default function WorkbenchShell() {
  const adminView = useWorkbenchStore((s) => s.adminView);

  useEffect(() => {
    void loadConnections();
  }, []);

  return (
    <div className="h-full min-w-0 flex-1">
      {adminView ? <AdminPanel /> : <EditorPane />}
    </div>
  );
}
