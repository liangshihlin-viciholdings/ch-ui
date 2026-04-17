// src/features/services/components/ServiceNode.tsx
// Custom @xyflow node renderer for a service. Displays the service name,
// request count, and a health dot colored by error rate.

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { ServiceAggregation } from "@/features/services/types";

export interface ServiceNodeData extends Record<string, unknown> {
  aggregation: ServiceAggregation;
  isSelected?: boolean;
}

function healthColor(errorRate: number): string {
  if (errorRate >= 0.1) return "bg-red-500";
  if (errorRate >= 0.02) return "bg-yellow-500";
  return "bg-emerald-500";
}

export default function ServiceNode(
  props: NodeProps<Node<ServiceNodeData, "service">>,
) {
  const { aggregation } = props.data;
  const { serviceName, totalRequests, errorPercentage } = aggregation;

  const dot = healthColor(errorPercentage);
  const selected = props.selected
    ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
    : "border border-border";

  return (
    <div
      className={`flex min-w-[140px] flex-col items-center rounded-md bg-card px-3 py-2 shadow-sm ${selected}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ opacity: 0 }}
      />
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <span className="truncate text-sm font-medium text-foreground">
          {serviceName || "<unknown>"}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {totalRequests.toLocaleString()} req
        {" · "}
        {(errorPercentage * 100).toFixed(1)}% err
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ opacity: 0 }}
      />
    </div>
  );
}
