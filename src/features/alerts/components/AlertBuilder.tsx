// src/features/alerts/components/AlertBuilder.tsx
// Alert create / edit form. Wraps the shared ChartBuilder and layers on the
// alert-specific fields (threshold, interval). Form state is local —
// parent owns the save/cancel flow.

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ChartBuilder } from "@/features/analytics/components/ChartBuilder";
import { createDefaultBuilderConfig } from "@/features/analytics/hooks/useChartConfig";
import type { BuilderChartConfig, ChartConfig } from "@/features/analytics/types";
import {
  EVALUATION_INTERVALS,
  THRESHOLD_OPERATORS,
  type AlertConfig,
  type EvaluationInterval,
  type ThresholdOperator,
} from "@/features/alerts/types";
import { AlertPreview } from "./AlertPreview";

export interface AlertBuilderState {
  name: string;
  tableName: string;
  config: AlertConfig;
  thresholdOperator: ThresholdOperator;
  thresholdValue: number;
  evaluationInterval: EvaluationInterval;
  enabled: boolean;
}

export function createDefaultAlertState(): AlertBuilderState {
  return {
    name: "",
    tableName: "",
    config: createDefaultBuilderConfig(),
    thresholdOperator: ">",
    thresholdValue: 0,
    evaluationInterval: "5m",
    enabled: true,
  };
}

export interface AlertBuilderProps {
  value: AlertBuilderState;
  onChange: (next: AlertBuilderState) => void;
}

export function AlertBuilder({ value, onChange }: AlertBuilderProps) {
  const patch = (partial: Partial<AlertBuilderState>) =>
    onChange({ ...value, ...partial });

  // Alerts only support builder-type configs; narrow the callback accordingly.
  const handleConfigChange = (config: ChartConfig) => {
    if (config.type !== "builder") return;
    patch({ config: config as BuilderChartConfig });
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="alert-name" className="text-xs">
            Alert name
          </Label>
          <Input
            id="alert-name"
            value={value.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="High error rate on api"
            className="h-8"
          />
        </div>

        <ChartBuilder
          config={value.config}
          onChange={handleConfigChange}
          tableName={value.tableName}
          onTableNameChange={(name) => patch({ tableName: name })}
          title={value.name}
          onTitleChange={(name) => patch({ name })}
        />

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Trigger when value is</Label>
            <Select
              value={value.thresholdOperator}
              onValueChange={(v) =>
                patch({ thresholdOperator: v as ThresholdOperator })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THRESHOLD_OPERATORS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="alert-threshold" className="text-xs">
              Threshold
            </Label>
            <Input
              id="alert-threshold"
              type="number"
              value={Number.isFinite(value.thresholdValue) ? value.thresholdValue : 0}
              onChange={(e) =>
                patch({ thresholdValue: Number(e.target.value) })
              }
              className="h-8 font-mono text-xs"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Evaluation interval</Label>
          <Select
            value={value.evaluationInterval}
            onValueChange={(v) =>
              patch({ evaluationInterval: v as EvaluationInterval })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVALUATION_INTERVALS.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-2">
          <div>
            <Label htmlFor="alert-enabled" className="text-xs">
              Enabled
            </Label>
            <p className="text-[10px] text-muted-foreground">
              Disabled alerts won't fire even when the threshold is crossed.
            </p>
          </div>
          <Switch
            id="alert-enabled"
            checked={value.enabled}
            onCheckedChange={(checked) => patch({ enabled: checked })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Preview (last hour)</Label>
        <AlertPreview
          config={value.config}
          tableName={value.tableName}
          thresholdValue={value.thresholdValue}
          thresholdOperator={value.thresholdOperator}
        />
      </div>
    </div>
  );
}

