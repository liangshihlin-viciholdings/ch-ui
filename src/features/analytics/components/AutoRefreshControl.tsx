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

export function AutoRefreshControl() {
  const { enabled, intervalMs, intervalLabel, setEnabled, setInterval } =
    useAutoRefresh();

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
            <RefreshCw className={cn("h-3.5 w-3.5", enabled && "animate-spin")} style={{ animationDuration: "2s" }} />
            <span className="tabular-nums">{intervalLabel}</span>
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
