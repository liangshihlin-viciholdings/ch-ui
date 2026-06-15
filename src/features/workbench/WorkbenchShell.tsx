import { useEffect } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import ConnectionsSection from "./ConnectionsSection";
import EditorPane from "./EditorPane";
import AdminPanel from "./AdminPanel";
import { useWorkbenchStore, loadConnections } from "@/stores/workbenchStore";

export default function WorkbenchShell() {
  const adminView = useWorkbenchStore((s) => s.adminView);

  useEffect(() => {
    void loadConnections();
  }, []);

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize="22%" minSize={220} collapsible>
        <div className="h-full overflow-y-auto bg-card">
          <ConnectionsSection />
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel minSize="50%">
        {adminView ? <AdminPanel /> : <EditorPane />}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
