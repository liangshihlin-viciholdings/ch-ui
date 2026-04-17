// src/features/analytics/components/DisplaySwitcher.tsx
// Segmented control for switching a chart between display types.

import {
  AreaChart as AreaIcon,
  BarChart3 as BarIcon,
  LineChart as LineIcon,
  PieChart as PieIcon,
  Table2,
  Hash,
  TrendingUp,
  Grid3x3,
  BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DisplayType } from "@/features/analytics/types";

const OPTIONS: { value: DisplayType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "line", label: "Line", icon: LineIcon },
  { value: "area", label: "Area", icon: AreaIcon },
  { value: "bar", label: "Bar", icon: BarIcon },
  { value: "stacked_bar", label: "Stacked", icon: BarIcon },
  { value: "pie", label: "Pie", icon: PieIcon },
  { value: "histogram", label: "Histogram", icon: BarChart2 },
  { value: "heatmap", label: "Heatmap", icon: Grid3x3 },
  { value: "number", label: "Number", icon: Hash },
  { value: "delta", label: "Delta", icon: TrendingUp },
  { value: "table", label: "Table", icon: Table2 },
];

export interface DisplaySwitcherProps {
  value: DisplayType;
  onChange: (value: DisplayType) => void;
}

export function DisplaySwitcher({ value, onChange }: DisplaySwitcherProps) {
  return (
    <div className="flex flex-wrap gap-1 rounded-md border border-border p-1">
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const isActive = value === option.value;
        return (
          <Button
            key={option.value}
            type="button"
            variant={isActive ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onChange(option.value)}
          >
            <Icon className="mr-1 h-3.5 w-3.5" />
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

export default DisplaySwitcher;
