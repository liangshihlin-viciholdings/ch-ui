// src/features/services/components/ServiceEdge.tsx
// Custom @xyflow edge that shows the request count on the label.

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

export interface ServiceEdgeData extends Record<string, unknown> {
  totalRequests: number;
  errorPercentage: number;
}

export default function ServiceEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    style,
    data,
  } = props;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeData = data as ServiceEdgeData | undefined;
  const requests = edgeData?.totalRequests ?? 0;
  const errorPct = (edgeData?.errorPercentage ?? 0) * 100;

  const strokeColor = errorPct >= 10
    ? "#ef4444"
    : errorPct >= 2
      ? "#eab308"
      : "#94a3b8";

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth: 1.5,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="pointer-events-none absolute rounded bg-card/90 px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-sm"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {requests.toLocaleString()}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
