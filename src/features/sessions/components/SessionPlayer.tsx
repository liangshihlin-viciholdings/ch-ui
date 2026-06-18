// src/features/sessions/components/SessionPlayer.tsx
//
// STUB: Full session replay (rrweb snapshots, DOM diffing, network replay)
// is out of scope for deebee. This component shows a placeholder and a simple
// scrubber that mirrors the currently-selected event index within the
// session's timeline. The parent coordinates which event is active.
//
// If/when rrweb snapshots are ingested (likely via a separate table such as
// `otel_rum_snapshots`), this component is the integration point — replace
// the placeholder with the `rrweb-player` iframe and drive it from the
// same scrubber state.

import { useMemo } from "react";
import { PlaySquare } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import type { SessionEvent } from "@/features/sessions/types";

interface SessionPlayerProps {
  events: SessionEvent[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
}

function formatElapsed(startIso: string, currentIso: string): string {
  try {
    const delta = Math.max(
      0,
      new Date(currentIso).getTime() - new Date(startIso).getTime(),
    );
    const seconds = Math.floor(delta / 1000);
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    const ms = String(delta % 1000).padStart(3, "0");
    return `${mm}:${ss}.${ms}`;
  } catch {
    return "00:00.000";
  }
}

export default function SessionPlayer({
  events,
  activeIndex,
  onActiveIndexChange,
}: SessionPlayerProps) {
  const lastIndex = Math.max(0, events.length - 1);
  const clamped = Math.min(lastIndex, Math.max(0, activeIndex));
  const activeEvent = events[clamped];
  const start = events[0];

  const elapsed = useMemo(() => {
    if (!start || !activeEvent) return "00:00.000";
    return formatElapsed(start.timestamp, activeEvent.timestamp);
  }, [activeEvent, start]);

  return (
    <div className="flex h-full flex-col bg-muted/20">
      <div className="flex flex-1 items-center justify-center border-b border-border">
        <div className="max-w-sm text-center">
          <PlaySquare className="mx-auto mb-3 h-12 w-12 text-muted-foreground/60" />
          <h3 className="text-sm font-medium">Session replay preview</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Full visual replay is not yet available in deebee. Use the
            timeline on the right to scrub through recorded events.
          </p>
          {activeEvent && (
            <div className="mt-4 rounded-md border border-border bg-card p-3 text-left text-xs">
              <div className="font-mono text-[11px] text-muted-foreground">
                {activeEvent.timestamp}
              </div>
              <div className="mt-1 font-medium text-foreground">
                {activeEvent.kind.toUpperCase()}
              </div>
              <div className="mt-1 break-words text-foreground">
                {activeEvent.message || activeEvent.url || "(no message)"}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-3">
        <span className="w-20 tabular-nums text-xs text-muted-foreground">
          {elapsed}
        </span>
        <Slider
          className="flex-1"
          value={[clamped]}
          min={0}
          max={lastIndex}
          step={1}
          onValueChange={(value) => {
            const next = value[0] ?? 0;
            onActiveIndexChange(next);
          }}
        />
        <span className="w-20 text-right tabular-nums text-xs text-muted-foreground">
          {clamped + 1} / {events.length}
        </span>
      </div>
    </div>
  );
}
