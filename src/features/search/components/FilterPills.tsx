// src/features/search/components/FilterPills.tsx
// Renders active filter pills with click-to-remove. Mirrors the HyperDX
// ActiveFilterPills layout — compact inline pills, no borders on the row.

import { X, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  SearchFilter,
  SearchOperator,
} from "@/features/search/types";

const OPERATORS: { value: SearchOperator; label: string }[] = [
  { value: "=", label: "=" },
  { value: "!=", label: "!=" },
  { value: ">", label: ">" },
  { value: "<", label: "<" },
  { value: ">=", label: ">=" },
  { value: "<=", label: "<=" },
  { value: "contains", label: "contains" },
  { value: "exists", label: "exists" },
];

export interface FilterPillsProps {
  filters: SearchFilter[];
  onAdd: (filter: SearchFilter) => void;
  onRemove: (index: number) => void;
  onClear?: () => void;
}

export function FilterPills({
  filters,
  onAdd,
  onRemove,
  onClear,
}: FilterPillsProps) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState("");
  const [operator, setOperator] = useState<SearchOperator>("=");
  const [value, setValue] = useState("");

  const handleAdd = () => {
    if (!field.trim()) return;
    onAdd({ field: field.trim(), operator, value });
    setField("");
    setValue("");
    setOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {filters.map((f, i) => (
        <span
          key={`${f.field}-${i}`}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-mono"
        >
          <span className="text-foreground">{f.field}</span>
          <span className="text-muted-foreground">{f.operator}</span>
          {f.operator !== "exists" && (
            <span className="text-foreground">{f.value}</span>
          )}
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onRemove(i)}
            aria-label={`Remove ${f.field} filter`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
          >
            <Plus className="mr-1 h-3 w-3" />
            Add filter
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="start">
          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="filter-field" className="text-xs">
                Field
              </Label>
              <Input
                id="filter-field"
                value={field}
                onChange={(e) => setField(e.target.value)}
                placeholder="ServiceName"
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Operator</Label>
              <Select
                value={operator}
                onValueChange={(v) => setOperator(v as SearchOperator)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {operator !== "exists" && (
              <div className="space-y-1">
                <Label htmlFor="filter-value" className="text-xs">
                  Value
                </Label>
                <Input
                  id="filter-value"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="order-service"
                  className="h-8 font-mono text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdd();
                  }}
                />
              </div>
            )}
            <div className="flex justify-end pt-1">
              <Button size="sm" onClick={handleAdd} disabled={!field.trim()}>
                Add
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {filters.length > 0 && onClear && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground"
          onClick={onClear}
        >
          Clear
        </Button>
      )}
    </div>
  );
}

export default FilterPills;
