// src/features/traces/components/SpanDetail.tsx
// Right-pane detail view for a single span. Shows meta + the flat attribute
// map + event list. Kept deliberately boring — no fancy tables.

import { formatDuration } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Span } from "@/features/traces/types";

export interface SpanDetailProps {
  span: Span;
}

function statusVariant(
  status: Span["statusCode"],
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ERROR") return "destructive";
  if (status === "OK") return "secondary";
  return "outline";
}

export function SpanDetail({ span }: SpanDetailProps) {
  const attributeEntries = Object.entries(span.attributes).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-3">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 break-all font-mono text-sm font-medium text-foreground">
              {span.name}
            </h2>
            <Badge variant={statusVariant(span.statusCode)} className="">
              {span.statusCode}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span>Service: {span.serviceName || "—"}</span>
            <span>Kind: {span.kind || "—"}</span>
            <span>
              Duration: {formatDuration(span.durationNs / 1_000_000_000)}
            </span>
            <span>Start: {new Date(span.startTime).toLocaleString()}</span>
          </div>
          <div className="break-all font-mono text-[10px] text-muted-foreground">
            span_id={span.spanId}
            {span.parentSpanId && <> · parent={span.parentSpanId}</>}
          </div>
          {span.statusMessage && (
            <p className="rounded-md bg-destructive/10 px-2 py-1 font-mono text-[11px] text-destructive">
              {span.statusMessage}
            </p>
          )}
        </header>

        <section>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Attributes
          </h3>
          {attributeEntries.length === 0 ? (
            <div className="text-xs text-muted-foreground">No attributes.</div>
          ) : (
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full font-mono text-[11px]">
                <tbody>
                  {attributeEntries.map(([k, v]) => (
                    <tr key={k} className="border-b border-border/60 last:border-0">
                      <td className="w-1/3 whitespace-nowrap border-r border-border/60 bg-muted/50 px-2 py-1 align-top text-muted-foreground">
                        {k}
                      </td>
                      <td className="break-all px-2 py-1 align-top text-foreground">
                        {v || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {span.events.length > 0 && (
          <section>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Events ({span.events.length})
            </h3>
            <ul className="space-y-2">
              {span.events.map((ev, i) => (
                <li
                  key={`${ev.name}-${i}`}
                  className="rounded-md border border-border p-2"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-xs font-medium">
                      {ev.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(ev.timestamp).toLocaleString()}
                    </span>
                  </div>
                  {Object.entries(ev.attributes).map(([k, v]) => (
                    <div
                      key={k}
                      className="mt-1 flex gap-2 font-mono text-[10px]"
                    >
                      <span className="text-muted-foreground">{k}:</span>
                      <span className="break-all text-foreground">{v}</span>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </ScrollArea>
  );
}

export default SpanDetail;
