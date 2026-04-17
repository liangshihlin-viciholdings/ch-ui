// src/features/traces/components/TraceDetail.tsx
// Top-level trace page: header with trace id + aggregate metrics, waterfall
// on top, and a resizable two-pane (tree + span detail) below.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { formatDuration } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useTrace } from "@/features/traces/hooks/useTrace";
import type { Span } from "@/features/traces/types";
import { TraceWaterfall } from "./TraceWaterfall";
import { SpanDetail } from "./SpanDetail";
import { SpanTree } from "./SpanTree";

export interface TraceDetailProps {
  traceId: string;
}

export function TraceDetail({ traceId }: TraceDetailProps) {
  const { data: trace, isLoading, error } = useTrace({ traceId });
  const [selectedSpanId, setSelectedSpanId] = useState<string | undefined>();

  // Auto-select the first (root) span when a trace first loads.
  useEffect(() => {
    if (trace && trace.spans.length && !selectedSpanId) {
      setSelectedSpanId(trace.spans[0].spanId);
    }
  }, [trace, selectedSpanId]);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertTitle>Failed to load trace</AlertTitle>
          <AlertDescription className="font-mono text-xs">
            {error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!trace || !trace.spans.length) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        No spans found for trace {traceId}.
      </div>
    );
  }

  const selectedSpan: Span | undefined =
    trace.spans.find((s) => s.spanId === selectedSpanId) ?? trace.spans[0];

  const handleSelect = (span: Span) => setSelectedSpanId(span.spanId);

  const errorCount = trace.spans.filter((s) => s.statusCode === "ERROR").length;

  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-sm font-medium text-foreground">
            {trace.traceId}
          </h1>
          {errorCount > 0 && (
            <Badge variant="destructive" className="">
              {errorCount} errors
            </Badge>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
          <span>
            Duration: {formatDuration(trace.durationNs / 1_000_000_000)}
          </span>
          <span>Spans: {trace.spans.length}</span>
          <span>Services: {trace.serviceNames.join(", ") || "—"}</span>
          <span>Start: {new Date(trace.startTime).toLocaleString()}</span>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup orientation="vertical">
          <ResizablePanel defaultSize="50%" minSize={160}>
            <div className="h-full overflow-auto p-3">
              <TraceWaterfall
                trace={trace}
                selectedSpanId={selectedSpan?.spanId}
                onSelectSpan={handleSelect}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="50%" minSize={160}>
            <ResizablePanelGroup orientation="horizontal">
              <ResizablePanel defaultSize="40%" minSize={200}>
                <div className="h-full overflow-auto border-r border-border p-2">
                  <SpanTree
                    spans={trace.spans}
                    selectedSpanId={selectedSpan?.spanId}
                    onSelect={handleSelect}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize="60%" minSize={300}>
                {selectedSpan ? <SpanDetail span={selectedSpan} /> : null}
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

export default TraceDetail;
