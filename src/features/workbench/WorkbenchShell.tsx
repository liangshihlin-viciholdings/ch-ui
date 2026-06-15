import { useEffect, useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import ConnectionNavigator from "./ConnectionNavigator";
import NewConnectionDialog from "./NewConnectionDialog";
import EditorPane from "./EditorPane";
import AdminPanel from "./AdminPanel";
import type { SavedConnection } from "@/lib/db/schema";
import { useWorkbenchStore, loadConnections } from "@/stores/workbenchStore";

export default function WorkbenchShell() {
  const [connDialogOpen, setConnDialogOpen] = useState(false);
  const [editConn, setEditConn] = useState<SavedConnection | null>(null);
  const adminView = useWorkbenchStore((s) => s.adminView);

  useEffect(() => {
    void loadConnections();
  }, []);

  function openAdd() {
    setEditConn(null);
    setConnDialogOpen(true);
  }

  function openEdit(connection: SavedConnection) {
    setEditConn(connection);
    setConnDialogOpen(true);
  }

  function handleDialogOpenChange(open: boolean) {
    setConnDialogOpen(open);
    if (!open) setEditConn(null);
  }

  return (
    <>
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        <ResizablePanel defaultSize="22%" minSize={220} collapsible>
          <ConnectionNavigator onAdd={openAdd} onEdit={openEdit} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel minSize="50%">
          {adminView ? <AdminPanel /> : <EditorPane />}
        </ResizablePanel>
      </ResizablePanelGroup>
      <NewConnectionDialog
        open={connDialogOpen}
        onOpenChange={handleDialogOpenChange}
        editing={editConn}
      />
    </>
  );
}
