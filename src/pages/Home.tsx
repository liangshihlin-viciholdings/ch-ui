import { useEffect } from "react";
import DatabaseExplorer from "@/features/explorer/components/DataExplorer";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import WorkspaceTabs from "@/features/workspace/components/WorkspaceTabs";
import CreateTable from "@/features/explorer/components/CreateTable";
import CreateDatabase from "@/features/explorer/components/CreateDatabase";
import UploadFromFile from "@/features/explorer/components/UploadFile";
import { useDefaultLayout } from "react-resizable-panels";

const homeLayoutOptions = {
  groupId: "unique-layout-id",
  storage: localStorage,
} as const;

function HomePage() {
  useEffect(() => {
    document.title = "CH-UI | Home - Workspace";
  }, []);

  const { defaultLayout, onLayoutChanged } = useDefaultLayout(homeLayoutOptions);

  return (
    <div className="h-screen w-full overflow-auto">
      <CreateTable />
      <CreateDatabase />
      <UploadFromFile />
      <ResizablePanelGroup
        id="main-layout"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        orientation="horizontal"
      >
        <ResizablePanel
          id="database-explorer"
          defaultSize="20%"
          minSize={300}
          collapsible
        >
          <DatabaseExplorer />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="workspace-tabs" minSize="40%">
          <WorkspaceTabs />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

export default HomePage;
