// Unified command palette (⌘/Ctrl+K) for the merged sidebar. Searches across
// pages, connections, loaded schema tables, and the active connection's saved
// queries. cmdk does the fuzzy filtering; we just supply the items.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Table2, FileCode2, type LucideIcon } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DialogTitle } from "@/components/ui/dialog";
import { ENGINES } from "@/features/workbench/engineMeta";
import {
  useWorkbenchStore,
  selectConnection,
  openTab,
} from "@/stores/workbenchStore";
import { liveQuery } from "dexie";
import { getSavedQueriesByConnectionId } from "@/lib/db";
import type { SavedQuery } from "@/lib/db/schema";

export interface PaletteDest {
  to: string;
  label: string;
  icon: LucideIcon;
}

export default function CommandPalette({
  open,
  onOpenChange,
  destinations,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  destinations: PaletteDest[];
}) {
  const navigate = useNavigate();
  const connections = useWorkbenchStore((s) => s.connections);
  const schemas = useWorkbenchStore((s) => s.schemas);
  const activeId = useWorkbenchStore((s) => s.activeConnectionId);
  const [saved, setSaved] = useState<SavedQuery[]>([]);

  useEffect(() => {
    if (!activeId) {
      setSaved([]);
      return;
    }
    const sub = liveQuery(() =>
      getSavedQueriesByConnectionId(activeId),
    ).subscribe({ next: (r) => setSaved(r), error: () => setSaved([]) });
    return () => sub.unsubscribe();
  }, [activeId]);

  // Flatten the loaded schema caches into a single searchable table list.
  const tables = useMemo(() => {
    const out: { connId: string; schema: string; table: string }[] = [];
    for (const [connId, cache] of Object.entries(schemas)) {
      for (const [schemaName, tbls] of Object.entries(cache.tables)) {
        for (const t of tbls) {
          out.push({ connId, schema: schemaName, table: t.name });
        }
      }
    }
    return out;
  }, [schemas]);

  const close = () => onOpenChange(false);
  const goPage = (to: string) => {
    navigate({ to });
    close();
  };
  const goConnection = (id: string) => {
    selectConnection(id);
    navigate({ to: "/" });
    close();
  };
  const goTable = (connId: string, schema: string, table: string) => {
    selectConnection(connId);
    openTab(connId, {
      title: table,
      sql: `SELECT *\nFROM ${schema}.${table}\nLIMIT 100;`,
    });
    navigate({ to: "/" });
    close();
  };
  const goSaved = (q: SavedQuery) => {
    selectConnection(q.connectionId);
    openTab(q.connectionId, { title: q.name, sql: q.query });
    navigate({ to: "/" });
    close();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <DialogTitle className="sr-only">Command palette</DialogTitle>
      <CommandInput placeholder="Search pages, connections, tables, queries…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Jump to">
          {destinations.map((d) => {
            const Icon = d.icon;
            return (
              <CommandItem
                key={d.to}
                value={`page ${d.label}`}
                onSelect={() => goPage(d.to)}
              >
                <Icon className="mr-2 h-4 w-4" />
                {d.label}
              </CommandItem>
            );
          })}
        </CommandGroup>

        {connections.length > 0 && (
          <CommandGroup heading="Connections">
            {connections.map((c) => {
              const meta = ENGINES[c.engine];
              const Icon = meta.icon;
              return (
                <CommandItem
                  key={c.id}
                  value={`connection ${c.name} ${meta.label}`}
                  onSelect={() => goConnection(c.id)}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {c.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {meta.label}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {tables.length > 0 && (
          <CommandGroup heading="Tables">
            {tables.map((t) => (
              <CommandItem
                key={`${t.connId}:${t.schema}.${t.table}`}
                value={`table ${t.table} ${t.schema} ${t.connId}`}
                onSelect={() => goTable(t.connId, t.schema, t.table)}
              >
                <Table2 className="mr-2 h-4 w-4" />
                {t.table}
                <span className="ml-2 text-xs text-muted-foreground">
                  {t.schema}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {saved.length > 0 && (
          <CommandGroup heading="Saved queries">
            {saved.map((q) => (
              <CommandItem
                key={q.id}
                value={`query ${q.name}`}
                onSelect={() => goSaved(q)}
              >
                <FileCode2 className="mr-2 h-4 w-4" />
                {q.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
