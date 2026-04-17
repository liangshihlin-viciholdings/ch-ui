// src/features/analytics/components/TimePicker.tsx
// Preset dropdown + custom calendar range picker.

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { DayPicker, type DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  TimeRange,
  TimeRangePreset,
} from "@/features/analytics/types";

const PRESETS: { value: TimeRangePreset; label: string }[] = [
  { value: "15m", label: "Last 15 minutes" },
  { value: "1h", label: "Last hour" },
  { value: "6h", label: "Last 6 hours" },
  { value: "1d", label: "Last day" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom…" },
];

export interface TimePickerProps {
  range: TimeRange;
  onPresetChange: (preset: TimeRangePreset) => void;
  onCustomChange: (start: Date, end: Date) => void;
}

export function TimePicker({
  range,
  onPresetChange,
  onCustomChange,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (selected: DateRange | undefined) => {
    if (selected?.from && selected?.to) {
      onCustomChange(selected.from, selected.to);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        value={range.preset}
        onValueChange={(v) => onPresetChange(v as TimeRangePreset)}
      >
        <SelectTrigger className="h-8 w-44 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {range.preset === "custom" && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
              {format(range.start, "MMM d, HH:mm")} –{" "}
              {format(range.end, "MMM d, HH:mm")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <DayPicker
              mode="range"
              selected={{ from: range.start, to: range.end }}
              onSelect={handleSelect}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

export default TimePicker;
