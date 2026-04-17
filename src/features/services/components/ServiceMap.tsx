// src/features/services/components/ServiceMap.tsx
// Top-level page for the Service Map feature. Wraps @xyflow/react with a
// simple grid layout (no dagre dependency — deliberate MVP stub), a time
// range selector, and a click-to-drill side panel.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type NodeTypes,
  type EdgeTypes,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertCircle, Network, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import ServiceNode, {
  type ServiceNodeData,
} from "@/features/services/components/ServiceNode";
import ServiceEdge, {
  type ServiceEdgeData,
} from "@/features/services/components/ServiceEdge";
import ServiceDetail from "@/features/services/components/ServiceDetail";
import { useServiceMap } from "@/features/services/hooks/useServiceMap";
import type {
  ServiceAggregation,
  ServiceMapRange,
} from "@/features/services/types";

const nodeTypes: NodeTypes = {
  service: ServiceNode,
};

const edgeTypes: EdgeTypes = {
  request: ServiceEdge,
};

const TIME_RANGE_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
  hours: number;
}> = [
  { value: "15m", label: "Last 15 minutes", hours: 0.25 },
  { value: "1h", label: "Last hour", hours: 1 },
  { value: "6h", label: "Last 6 hours", hours: 6 },
  { value: "24h", label: "Last 24 hours", hours: 24 },
];

function toRange(hours: number): ServiceMapRange {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Grid layout — lightweight stand-in for dagre. Each node is placed on a
 * square grid sized to the service count. It is deterministic, which matters
 * because the user can drag nodes once positioned; re-layouts should be rare.
 */
function layoutNodes<T extends Record<string, unknown>>(
  nodes: Node<T>[],
): Node<T>[] {
  const count = nodes.length;
  if (count === 0) return nodes;
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const SPACING_X = 220;
  const SPACING_Y = 120;

  return nodes.map((node, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    return {
      ...node,
      position: { x: col * SPACING_X, y: row * SPACING_Y },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });
}

function ServiceMapInner() {
  const [rangeKey, setRangeKey] = useState<string>("1h");
  const [selected, setSelected] = useState<ServiceAggregation | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const range = useMemo<ServiceMapRange>(() => {
    const hours =
      TIME_RANGE_OPTIONS.find((opt) => opt.value === rangeKey)?.hours ?? 1;
    return toRange(hours);
  }, [rangeKey]);

  const { data, isLoading, error, refetch, isFetching } = useServiceMap({
    range,
  });

  const [nodes, setNodes] = useState<Node<ServiceNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge<ServiceEdgeData>[]>([]);

  useEffect(() => {
    if (!data) return;
    const rawNodes: Node<ServiceNodeData>[] = Array.from(
      data.services.values(),
    ).map((service) => ({
      id: service.serviceName,
      type: "service",
      position: { x: 0, y: 0 },
      data: { aggregation: service },
    }));

    const rawEdges: Edge<ServiceEdgeData>[] = data.edges.map((edge) => ({
      id: `${edge.source}->${edge.target}`,
      source: edge.source,
      target: edge.target,
      type: "request",
      animated: true,
      data: {
        totalRequests: edge.totalRequests,
        errorPercentage: edge.errorPercentage,
      },
    }));

    setNodes(layoutNodes(rawNodes));
    setEdges(rawEdges);
  }, [data]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<ServiceNodeData>>[]) => {
      setNodes((current) => applyNodeChanges(changes, current));
    },
    [],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge<ServiceEdgeData>>[]) => {
      setEdges((current) => applyEdgeChanges(changes, current));
    },
    [],
  );

  const onNodeClick = useCallback<NodeMouseHandler<Node<ServiceNodeData>>>(
    (_event, node) => {
      setSelected(node.data.aggregation);
      setSheetOpen(true);
    },
    [],
  );

  const hasData = nodes.length > 0;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Service Map</h1>
        </div>
        <div className="flex items-center gap-2">
          <Select value={rangeKey} onValueChange={setRangeKey}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCcw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      <div className="relative flex-1">
        {error && (
          <div className="p-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Failed to load service map</AlertTitle>
              <AlertDescription>
                {error.message}
                <div className="mt-1 text-xs opacity-80">
                  Expected table: <code>otel_traces</code>. Ensure the OTel
                  schema is installed.
                </div>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {isLoading && !data && (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-48 w-full" />
          </div>
        )}

        {!isLoading && !error && !hasData && (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
            <Network className="mb-3 h-10 w-10 opacity-50" />
            <p className="text-sm">
              No services found for the selected range.
            </p>
            <p className="text-xs">
              Send OTLP traces to populate <code>otel_traces</code>.
            </p>
          </div>
        )}

        {hasData && (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Controls showInteractive={false} />
            <Background gap={24} size={1} />
          </ReactFlow>
        )}
      </div>

      <ServiceDetail
        service={selected}
        range={range}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}

export default function ServiceMap() {
  return (
    <div className="flex-1 w-full overflow-hidden">
      <ReactFlowProvider>
        <ServiceMapInner />
      </ReactFlowProvider>
    </div>
  );
}
