import React, { useState } from "react";
import { ExplainResult } from "@/types/common";
import { ExplainToolbar } from "./ExplainToolbar";
import { ExplainVisualization } from "./ExplainVisualization";
import { NodeDetailsPanel } from "./NodeDetailsPanel";
import { TreeNodeLayout } from "../layout";

interface ExplainTabProps {
  explainResult: ExplainResult;
}

export const ExplainTab = React.memo<ExplainTabProps>(({ explainResult }) => {
  const [viewType, setViewType] = useState<"tree" | "json" | "text">("tree");
  const [selectedNode, setSelectedNode] = useState<TreeNodeLayout | null>(null);

  return (
    <div className="flex flex-col h-full">
      <ExplainToolbar
        explainResult={explainResult}
        viewType={viewType}
        onViewTypeChange={(type) => setViewType(type)}
      />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <ExplainVisualization
            explainResult={explainResult}
            viewType={viewType}
            onNodeSelect={setSelectedNode}
          />
        </div>

        {viewType === "tree" && (
          <div className="w-80 border-l overflow-hidden">
            <NodeDetailsPanel node={selectedNode} tree={explainResult.tree} />
          </div>
        )}
      </div>
    </div>
  );
});
