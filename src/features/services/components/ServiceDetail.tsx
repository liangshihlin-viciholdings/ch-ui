// src/features/services/components/ServiceDetail.tsx
// Side-panel with per-service latency/throughput stats. Rendered via Radix
// Sheet so it drops in next to the map without taking layout space.

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useServiceLatency } from "@/features/services/hooks/useServiceMap";
import type {
  ServiceAggregation,
  ServiceMapRange,
} from "@/features/services/types";

interface ServiceDetailProps {
  service: ServiceAggregation | null;
  range: ServiceMapRange;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatMs(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 ms";
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${value.toFixed(1)} ms`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export default function ServiceDetail({
  service,
  range,
  open,
  onOpenChange,
}: ServiceDetailProps) {
  const { data: latency, isLoading } = useServiceLatency({
    serviceName: service?.serviceName ?? null,
    range,
    enabled: !!service,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{service?.serviceName ?? "Service"}</SheetTitle>
          <SheetDescription>
            Aggregated stats for the selected time window.
          </SheetDescription>
        </SheetHeader>

        {service && (
          <div className="mt-6 space-y-6">
            <section>
              <h3 className="mb-2 text-sm font-semibold">Latency &amp; Throughput</h3>
              {isLoading || !latency ? (
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="p50" value={formatMs(latency.p50)} />
                  <Stat label="p95" value={formatMs(latency.p95)} />
                  <Stat label="p99" value={formatMs(latency.p99)} />
                  <Stat
                    label="Throughput"
                    value={`${latency.throughput.toFixed(2)} req/s`}
                  />
                  <Stat
                    label="Error rate"
                    value={`${(latency.errorRate * 100).toFixed(2)}%`}
                  />
                  <Stat
                    label="Total requests"
                    value={service.totalRequests.toLocaleString()}
                  />
                </div>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">
                Callers ({service.callers.size})
              </h3>
              {service.callers.size === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No upstream services observed.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {Array.from(service.callers.values()).map((edge) => (
                    <li
                      key={`caller-${edge.source}`}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                    >
                      <span className="truncate">{edge.source}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {edge.totalRequests.toLocaleString()} req
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">
                Callees ({service.callees.size})
              </h3>
              {service.callees.size === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No downstream services observed.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {Array.from(service.callees.values()).map((edge) => (
                    <li
                      key={`callee-${edge.target}`}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                    >
                      <span className="truncate">{edge.target}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {edge.totalRequests.toLocaleString()} req
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
