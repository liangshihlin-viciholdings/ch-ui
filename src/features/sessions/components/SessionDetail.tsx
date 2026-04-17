// src/features/sessions/components/SessionDetail.tsx
// Two-pane view for a selected session: stubbed player on the left,
// searchable event timeline on the right.

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SessionPlayer from "@/features/sessions/components/SessionPlayer";
import SessionTimeline from "@/features/sessions/components/SessionTimeline";
import { useSessionEvents } from "@/features/sessions/hooks/useSessions";
import type {
  SessionEvent,
  SessionSummary,
} from "@/features/sessions/types";

interface SessionDetailProps {
  session: SessionSummary;
  onBack: () => void;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function SessionDetail({ session, onBack }: SessionDetailProps) {
  const { data: events = [], isLoading } = useSessionEvents({
    sessionId: session.sessionId,
  });
  const [filter, setFilter] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  // Reset cursor whenever the loaded events change, so switching sessions
  // lands us at the first event rather than an out-of-range index.
  useEffect(() => {
    setActiveIndex(0);
  }, [session.sessionId, events.length]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return events;
    const needle = filter.toLowerCase();
    return events.filter(
      (event) =>
        event.message.toLowerCase().includes(needle) ||
        (event.url ?? "").toLowerCase().includes(needle) ||
        event.kind.includes(needle),
    );
  }, [events, filter]);

  const activeEvent: SessionEvent | undefined = events[activeIndex];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="text-sm font-semibold">
              {session.sessionId}
            </div>
            <div className="text-xs text-muted-foreground">
              {session.userId ?? "anonymous"} · {formatDuration(session.durationMs)} ·{" "}
              {session.eventCount} events · {session.errorCount} errors
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 border-r border-border">
          <SessionPlayer
            events={events}
            activeIndex={activeIndex}
            onActiveIndexChange={setActiveIndex}
          />
        </div>
        <div className="flex w-96 flex-col">
          <div className="border-b border-border p-3">
            <Input
              placeholder="Filter events..."
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </div>
          <div className="flex-1 overflow-hidden">
            <SessionTimeline
              events={filtered}
              isLoading={isLoading}
              activeEventId={activeEvent?.id ?? null}
              onSelect={(event) => {
                const idx = events.findIndex((e) => e.id === event.id);
                if (idx >= 0) setActiveIndex(idx);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
