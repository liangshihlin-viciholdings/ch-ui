// Connection picker for dashboards — selects which saved connection a
// dashboard queries. The "Default" option (null) keeps the legacy
// single-ClickHouse path.
import { useWorkbenchStore } from "@/stores/workbenchStore";
import { ENGINES } from "@/features/workbench/engineMeta";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const LEGACY = "__legacy__";

export function ConnectionPicker({
  value,
  onChange,
  className,
}: {
  value?: string | null;
  onChange: (id: string | null) => void;
  className?: string;
}) {
  const connections = useWorkbenchStore((s) => s.connections);
  const current = value ?? LEGACY;

  return (
    <Select
      value={current}
      onValueChange={(v) => onChange(v === LEGACY ? null : v)}
    >
      <SelectTrigger className={cn("h-8 w-[190px] text-xs", className)}>
        <SelectValue placeholder="Connection" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={LEGACY}>Default (ClickHouse)</SelectItem>
        {connections.map((c) => {
          const meta = ENGINES[c.engine];
          const Icon = meta.icon;
          return (
            <SelectItem key={c.id} value={c.id}>
              <span className="flex items-center gap-2">
                <span className={cn("size-2 shrink-0 rounded-full", meta.dot)} />
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                {c.name}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
