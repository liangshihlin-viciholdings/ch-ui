// src/features/traces/components/SpanTree.tsx
// Collapsible tree view of the span hierarchy. Renders as nested <ul>/<li>
// with chevrons — no fancy virtualisation since trace span counts are
// usually under a few hundred.

import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { formatDuration } from "@/lib/formatters";
import type { Span } from "@/features/traces/types";

interface SpanNode {
  span: Span;
  children: SpanNode[];
}

function buildTree(spans: Span[]): SpanNode[] {
  const byId = new Map<string, SpanNode>();
  for (const span of spans) {
    byId.set(span.spanId, { span, children: [] });
  }
  const roots: SpanNode[] = [];
  for (const node of byId.values()) {
    const parent = node.span.parentSpanId
      ? byId.get(node.span.parentSpanId)
      : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export interface SpanTreeProps {
  spans: Span[];
  selectedSpanId?: string;
  onSelect: (span: Span) => void;
}

function NodeRow({
  node,
  depth,
  selectedSpanId,
  onSelect,
}: {
  node: SpanNode;
  depth: number;
  selectedSpanId?: string;
  onSelect: (span: Span) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isSelected = node.span.spanId === selectedSpanId;
  const isError = node.span.statusCode === "ERROR";

  return (
    <li>
      <div
        className={`flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted ${
          isSelected ? "bg-muted" : ""
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-muted-foreground"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="inline-block w-3" />
        )}
        <button
          type="button"
          onClick={() => onSelect(node.span)}
          className="flex flex-1 items-center gap-2 truncate text-left"
        >
          <span
            className={`truncate font-mono text-xs ${
              isError ? "text-destructive" : "text-foreground"
            }`}
          >
            {node.span.name}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {node.span.serviceName}
          </span>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {formatDuration(node.span.durationNs / 1_000_000_000)}
          </span>
        </button>
      </div>
      {hasChildren && expanded && (
        <ul>
          {node.children.map((child) => (
            <NodeRow
              key={child.span.spanId}
              node={child}
              depth={depth + 1}
              selectedSpanId={selectedSpanId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function SpanTree({ spans, selectedSpanId, onSelect }: SpanTreeProps) {
  const roots = useMemo(() => buildTree(spans), [spans]);
  if (!roots.length) {
    return (
      <div className="py-4 text-center text-xs text-muted-foreground">
        No spans.
      </div>
    );
  }
  return (
    <ul className="text-xs">
      {roots.map((root) => (
        <NodeRow
          key={root.span.spanId}
          node={root}
          depth={0}
          selectedSpanId={selectedSpanId}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

export default SpanTree;
