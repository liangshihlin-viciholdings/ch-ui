// Saved-queries list for the active connection, shown in the merged sidebar
// (Workbench route only). Clicking a query opens it in a new editor tab.
import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import {
  useWorkbenchStore,
  openTab,
  selectConnection,
} from "@/stores/workbenchStore";
import { getSavedQueriesByConnectionId } from "@/lib/db";
import type { SavedQuery } from "@/lib/db/schema";

export default function SavedQueriesSection() {
  const activeId = useWorkbenchStore((s) => s.activeConnectionId);
  const [queries, setQueries] = useState<SavedQuery[]>([]);

  useEffect(() => {
    if (!activeId) {
      setQueries([]);
      return;
    }
    const sub = liveQuery(() =>
      getSavedQueriesByConnectionId(activeId),
    ).subscribe({
      next: (rows) => setQueries(rows),
      error: () => setQueries([]),
    });
    return () => sub.unsubscribe();
  }, [activeId]);

  if (!activeId) {
    return (
      <div className="px-3 py-1 text-[11px] text-muted-foreground/60">
        Select a connection to see its saved queries.
      </div>
    );
  }

  if (!queries.length) {
    return (
      <div className="px-3 py-1 text-[11px] text-muted-foreground/60">
        No saved queries yet.
      </div>
    );
  }

  return (
    <div className="px-1">
      {queries.map((q) => (
        <button
          key={q.id}
          onClick={() => {
            selectConnection(q.connectionId);
            openTab(q.connectionId, { title: q.name, sql: q.query });
          }}
          className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-accent/50"
          title={q.name}
        >
          <span className="truncate text-[13px] text-foreground/85">
            {q.name}
          </span>
          {q.databaseName && (
            <span className="truncate text-[11px] text-muted-foreground/60">
              {q.databaseName}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
