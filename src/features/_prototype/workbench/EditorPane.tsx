// PROTOTYPE — throwaway. Shared editor+results pane for the A-family variants.
// The variants differ in the LEFT navigator; this right-hand pane is held constant
// so the comparison is about navigation, not the editor. Optional tabbed results.
import { useState } from "react";
import { ChevronDown, Plus, Play, Save, X } from "lucide-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TABS,
  ENGINES,
  connOf,
  SAMPLE_COLUMNS,
  SAMPLE_ROWS,
} from "./mockData";
import SaveQueryFlow from "./SaveQueryFlow";

function ResultsGrid({ tabbed = false }: { tabbed?: boolean }) {
  const [rtab, setRtab] = useState("results");
  return (
    <div className="flex h-full flex-col bg-background">
      {tabbed ? (
        <div className="flex items-center gap-1 border-b border-border px-2 text-xs">
          {[
            ["results", "Results"],
            ["messages", "Messages"],
            ["stats", "Statistics"],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setRtab(k)}
              className={cn(
                "border-b-2 px-2.5 py-1.5",
                rtab === k
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto text-muted-foreground">5 rows · 0.04s</span>
        </div>
      ) : (
        <div className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">5 rows</span>
          <span>· 0.04s</span>
          <span className="ml-auto">FORMAT JSON</span>
        </div>
      )}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/60 text-left">
            <tr>
              {SAMPLE_COLUMNS.map((col) => (
                <th
                  key={col}
                  className="border-b border-border px-3 py-1.5 font-medium"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SAMPLE_ROWS.map((r, i) => (
              <tr key={i} className="hover:bg-accent/50">
                {r.map((cell, j) => (
                  <td
                    key={j}
                    className="border-b border-border/50 px-3 py-1.5 tabular-nums"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function EditorPane({
  tabbedResults = false,
  onConnectionFocus,
}: {
  tabbedResults?: boolean;
  /** fired when the focused tab changes — lets the navigator follow the tab's connection */
  onConnectionFocus?: (connId: string) => void;
}) {
  const [active, setActive] = useState(TABS[0].id);
  const [saving, setSaving] = useState(false);
  const tab = TABS.find((t) => t.id === active)!;
  const focusTab = (id: string) => {
    setActive(id);
    const t = TABS.find((x) => x.id === id)!;
    onConnectionFocus?.(t.connectionId);
  };
  const c = connOf(tab.connectionId);
  const meta = ENGINES[c.engine];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border bg-muted/30 px-2">
        {TABS.map((t) => {
          const tm = ENGINES[connOf(t.connectionId).engine];
          return (
            <button
              key={t.id}
              onClick={() => focusTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
                t.id === active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <span className={cn("size-2 rounded-full", tm.dot)} />
              {t.title}
              {t.dirty && <span className="text-primary">•</span>}
              <X className="size-3 opacity-50 hover:opacity-100" />
            </button>
          );
        })}
        <Button size="icon" variant="ghost" className="size-7">
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs">
          <span className={cn("size-2 rounded-full", meta.dot)} />
          <span className="font-medium">{c.name}</span>
          <span className="text-muted-foreground">· {meta.label}</span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" className="h-7 gap-1.5">
            <Play className="size-3.5" /> Run
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5"
            onClick={() => setSaving(true)}
          >
            <Save className="size-3.5" /> Save
          </Button>
        </div>
      </div>

      <ResizablePanelGroup orientation="vertical" className="flex-1">
        <ResizablePanel defaultSize="55%">
          <pre className="h-full overflow-auto bg-background p-4 font-mono text-[13px] leading-relaxed">
            {tab.sql}
          </pre>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="45%">
          <ResultsGrid tabbed={tabbedResults} />
        </ResizablePanel>
      </ResizablePanelGroup>
      <SaveQueryFlow open={saving} onOpenChange={setSaving} />
    </div>
  );
}
