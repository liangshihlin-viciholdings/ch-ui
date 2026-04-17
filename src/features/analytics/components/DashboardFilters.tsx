// src/features/analytics/components/DashboardFilters.tsx
// Filter pill strip. Each pill shows "field OP value" with an X to remove.
// Adding a filter opens a popover with a 3-field form.

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import type { DashboardFilter } from "@/features/analytics/types";

const OPERATORS: DashboardFilter["operator"][] = [
  "=",
  "!=",
  ">",
  "<",
  "contains",
];

export interface DashboardFiltersProps {
  filters: DashboardFilter[];
  onAdd: (filter: DashboardFilter) => void;
  onRemove: (index: number) => void;
}

export function DashboardFilters({
  filters,
  onAdd,
  onRemove,
}: DashboardFiltersProps) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState("");
  const [operator, setOperator] = useState<DashboardFilter["operator"]>("=");
  const [value, setValue] = useState("");

  const handleAdd = () => {
    if (!field.trim()) return;
    onAdd({ field: field.trim(), operator, value });
    setField("");
    setOperator("=");
    setValue("");
    setOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((f, i) => (
        <Badge
          key={i}
          variant="secondary"
          className="gap-1 pl-2 pr-1 text-xs font-normal"
        >
          <span className="font-mono">
            {f.field} {f.operator} {f.value}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-4 w-4"
            onClick={() => onRemove(i)}
            aria-label="Remove filter"
          >
            <X className="h-3 w-3" />
          </Button>
        </Badge>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs">
            <Plus className="mr-1 h-3 w-3" />
            Filter
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Field</label>
            <Input
              value={field}
              onChange={(e) => setField(e.target.value)}
              placeholder="column name"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Operator</label>
            <Select
              value={operator}
              onValueChange={(v) => setOperator(v as DashboardFilter["operator"])}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATORS.map((op) => (
                  <SelectItem key={op} value={op}>
                    {op}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Value</label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="value"
              className="h-8 text-xs"
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={handleAdd}
            disabled={!field.trim()}
          >
            Add filter
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default DashboardFilters;
