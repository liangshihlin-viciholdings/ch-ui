// src/features/analytics/components/AutoRefreshControl.tsx
// Dropdown + switch for controlling dashboard auto-refresh interval.

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  useAutoRefresh,
  AUTO_REFRESH_INTERVALS,
} from "@/features/analytics/contexts/AutoRefreshContext";

function CountdownRing({ progress }: { progress: number }) {
  const size = 16;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <svg
      width={size}
      height={size}
      className="absolute inset-0 -rotate-90"
      style={{ margin: "auto" }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        opacity={0.2}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        className="transition-[stroke-dashoffset] duration-100"
      />
    </svg>
  );
}

export function AutoRefreshControl() {
  const {
    enabled,
    intervalMs,
    intervalLabel,
    setEnabled,
    setInterval,
    secondsRemaining,
    countdownProgress,
  } = useAutoRefresh();

  const formatCountdown = (seconds: number): string => {
    if (seconds >= 60) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${mins}m${secs}s` : `${mins}m`;
    }
    return `${seconds}s`;
  };

  return (
    <div className="flex items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "gap-1.5 transition-colors",
              enabled && "border-primary bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
            )}
          >
            <span className="relative flex h-4 w-4 items-center justify-center">
              <RefreshCw className="h-3 w-3" />
              {enabled && <CountdownRing progress={countdownProgress} />}
            </span>
            <span className="tabular-nums min-w-[2.5rem] text-left">
              {enabled ? formatCountdown(secondsRemaining) : intervalLabel}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Refresh interval
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {AUTO_REFRESH_INTERVALS.map((opt) => (
            <DropdownMenuItem
              key={opt.ms}
              onClick={() => setInterval(opt.ms)}
              className={cn(
                "justify-between",
                opt.ms === intervalMs && "bg-accent"
              )}
            >
              {opt.label}
              {opt.ms === intervalMs && (
                <span className="text-xs text-muted-foreground">selected</span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Switch
        size="sm"
        checked={enabled}
        onCheckedChange={setEnabled}
        aria-label="Toggle auto-refresh"
      />
    </div>
  );
}

export default AutoRefreshControl;
