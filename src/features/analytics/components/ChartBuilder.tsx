// src/features/analytics/components/ChartBuilder.tsx
// Form for editing a builder-type ChartConfig. Keeps raw-sql editing scoped
// to a single <textarea> when the config is raw SQL.

import { Trash2, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AGG_FNS,
  type AggregateFunction,
  type ChartConfig,
  type BuilderChartConfig,
  type DisplayType,
} from "@/features/analytics/types";
import { DisplaySwitcher } from "./DisplaySwitcher";

export interface ChartBuilderProps {
  config: ChartConfig;
  onChange: (config: ChartConfig) => void;
  tableName: string;
  onTableNameChange: (name: string) => void;
  title: string;
  onTitleChange: (title: string) => void;
}

const GRANULARITIES: { value: string; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "1 minute", label: "1 minute" },
  { value: "5 minute", label: "5 minutes" },
  { value: "15 minute", label: "15 minutes" },
  { value: "1 hour", label: "1 hour" },
  { value: "1 day", label: "1 day" },
];

export function ChartBuilder({
  config,
  onChange,
  tableName,
  onTableNameChange,
  title,
  onTitleChange,
}: ChartBuilderProps) {
  const updateBuilder = (patch: Partial<BuilderChartConfig>) => {
    if (config.type !== "builder") return;
    onChange({ ...config, ...patch });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="chart-title" className="text-xs">
          Chart title
        </Label>
        <Input
          id="chart-title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled chart"
          className="h-8"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="chart-table" className="text-xs">
          Source table
        </Label>
        <Input
          id="chart-table"
          value={tableName}
          onChange={(e) => onTableNameChange(e.target.value)}
          placeholder="database.table"
          className="h-8 font-mono text-xs"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Display</Label>
        <DisplaySwitcher
          value={config.displayType}
          onChange={(displayType: DisplayType) => {
            if (config.type === "builder") {
              onChange({ ...config, displayType });
            } else {
              onChange({ ...config, displayType });
            }
          }}
        />
      </div>

      {config.type === "builder" ? (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Aggregations</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() =>
                  updateBuilder({
                    select: [
                      ...config.select,
                      { aggFn: "count", valueExpression: "*" },
                    ],
                  })
                }
              >
                <Plus className="mr-1 h-3 w-3" />
                Add
              </Button>
            </div>
            {config.select.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select
                  value={s.aggFn}
                  onValueChange={(v) =>
                    updateBuilder({
                      select: config.select.map((x, idx) =>
                        idx === i ? { ...x, aggFn: v as AggregateFunction } : x,
                      ),
                    })
                  }
                >
                  <SelectTrigger className="h-8 w-36 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGG_FNS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={s.valueExpression}
                  onChange={(e) =>
                    updateBuilder({
                      select: config.select.map((x, idx) =>
                        idx === i
                          ? { ...x, valueExpression: e.target.value }
                          : x,
                      ),
                    })
                  }
                  placeholder="column or *"
                  className="h-8 flex-1 font-mono text-xs"
                />
                {config.select.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() =>
                      updateBuilder({
                        select: config.select.filter((_, idx) => idx !== i),
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <Label htmlFor="chart-where" className="text-xs">
              WHERE clause (optional)
            </Label>
            <Textarea
              id="chart-where"
              value={config.where}
              onChange={(e) => updateBuilder({ where: e.target.value })}
              placeholder="status = 'error'"
              className="min-h-[60px] font-mono text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="chart-groupby" className="text-xs">
              Group by (comma-separated)
            </Label>
            <Input
              id="chart-groupby"
              value={config.groupBy.join(", ")}
              onChange={(e) =>
                updateBuilder({
                  groupBy: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="service_name, status"
              className="h-8 font-mono text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Granularity</Label>
            <Select
              value={config.granularity}
              onValueChange={(v) => updateBuilder({ granularity: v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRANULARITIES.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      ) : (
        <div className="space-y-1">
          <Label htmlFor="chart-rawsql" className="text-xs">
            Raw SQL
          </Label>
          <Textarea
            id="chart-rawsql"
            value={config.query}
            onChange={(e) => onChange({ ...config, query: e.target.value })}
            className="min-h-[160px] font-mono text-xs"
          />
        </div>
      )}
    </div>
  );
}

export default ChartBuilder;
