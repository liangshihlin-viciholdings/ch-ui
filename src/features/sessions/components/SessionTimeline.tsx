// src/features/sessions/components/SessionTimeline.tsx
// Scrollable timeline of session events. Pairs with SessionPlayer (which is
// a stub for full rrweb-style playback) to provide a chronological view.

import { useMemo } from "react";
import {
  AlertTriangle,
  Globe,
  MousePointerClick,
  Navigation,
  Terminal,
  Dot,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  SessionEvent,
  SessionEventKind,
} from "@/features/sessions/types";

interface SessionTimelineProps {
  events: SessionEvent[];
  isLoading?: boolean;
  activeEventId?: string | null;
  onSelect?: (event: SessionEvent) => void;
}

const KIND_META: Record<
  SessionEventKind,
  { icon: typeof Dot; color: string; label: string }
> = {
  navigation: { icon: Navigation, color: "text-blue-500", label: "Navigation" },
  click: { icon: MousePointerClick, color: "text-emerald-500", label: "Click" },
  error: { icon: AlertTriangle, color: "text-red-500", label: "Error" },
  network: { icon: Globe, color: "text-purple-500", label: "Network" },
  log: { icon: Terminal, color: "text-amber-500", label: "Log" },
  other: { icon: Dot, color: "text-muted-foreground", label: "Event" },
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  } catch {
    return iso;
  }
}

export default function SessionTimeline({
  events,
  isLoading,
  activeEventId,
  onSelect,
}: SessionTimelineProps) {
  const ordered = useMemo(() => [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp)), [events]);

  if (isLoading) {
    return (
      <div className="space-y-2 p-4 text-sm text-muted-foreground">
        Loading events...
      </div>
    );
  }

  if (ordered.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No events recorded for this session.
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <ul className="divide-y divide-border">
        {ordered.map((event) => {
          const meta = KIND_META[event.kind];
          const Icon = meta.icon;
          const active = activeEventId === event.id;
          return (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => onSelect?.(event)}
                className={`flex w-full items-start gap-3 px-4 py-2 text-left hover:bg-muted/50 ${
                  active ? "bg-muted" : ""
                }`}
              >
                <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${meta.color}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {meta.label}
                    </span>
                    <span className="tabular-nums text-[11px] text-muted-foreground">
                      {formatTime(event.timestamp)}
                    </span>
                  </div>
                  <div className="truncate text-sm text-foreground">
                    {event.message || event.url || "(no message)"}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}
