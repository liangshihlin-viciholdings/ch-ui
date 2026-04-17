// src/features/patterns/components/PatternDetail.tsx
// Side-panel listing the raw log lines that match a selected pattern.

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { usePatternSamples } from "@/features/patterns/hooks/usePatterns";
import type {
  LogPattern,
  PatternRange,
} from "@/features/patterns/types";

interface PatternDetailProps {
  pattern: LogPattern | null;
  range: PatternRange;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function severityVariant(
  severity: string | null,
): "default" | "destructive" | "secondary" {
  const sev = (severity ?? "").toUpperCase();
  if (sev === "ERROR" || sev === "FATAL") return "destructive";
  if (sev === "WARNING" || sev === "WARN") return "secondary";
  return "default";
}

export default function PatternDetail({
  pattern,
  range,
  open,
  onOpenChange,
}: PatternDetailProps) {
  const { data: samples = [], isLoading } = usePatternSamples({
    pattern: pattern?.pattern ?? null,
    range,
    enabled: !!pattern,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Pattern detail</SheetTitle>
          <SheetDescription>
            {pattern?.count.toLocaleString() ?? 0} matches ·{" "}
            {pattern?.errorCount.toLocaleString() ?? 0} errors
          </SheetDescription>
        </SheetHeader>

        {pattern && (
          <div className="mt-4 space-y-4">
            <div className="rounded-md border border-border bg-muted/30 p-3 font-mono text-xs">
              {pattern.pattern || "(empty)"}
            </div>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Recent matches</h3>
              <ScrollArea className="h-[60vh] rounded-md border border-border">
                {isLoading ? (
                  <div className="space-y-2 p-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : samples.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">
                    No matching logs in this range.
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {samples.map((sample) => (
                      <li key={sample.id} className="p-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="tabular-nums text-muted-foreground">
                            {formatTimestamp(sample.timestamp)}
                          </span>
                          {sample.severity && (
                            <Badge
                              variant={severityVariant(sample.severity)}
                              className="text-[10px]"
                            >
                              {sample.severity}
                            </Badge>
                          )}
                        </div>
                        {sample.serviceName && (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            service: {sample.serviceName}
                          </div>
                        )}
                        <div className="mt-1 whitespace-pre-wrap break-words font-mono text-foreground">
                          {sample.body}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
