// src/features/search/hooks/useAutoComplete.ts
// Simple autocomplete backed by localStorage. Stores the most recent search
// terms keyed by table name so suggestions stay scoped to what the user was
// looking at.
//
// STUB: a real implementation would hit ClickHouse for distinct values of
// the active field (e.g. `SELECT DISTINCT ServiceName FROM otel_logs LIMIT
// 50`). That query firehose is non-trivial to cache correctly — we punt
// until there's a concrete user need.

import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "deebee/search-history";
const MAX_HISTORY = 20;

type HistoryMap = Record<string, string[]>;

function readHistory(): HistoryMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeHistory(history: HistoryMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // localStorage full / disabled — silently drop.
  }
}

export interface UseAutoCompleteResult {
  suggestions: string[];
  recordSearch: (term: string) => void;
  clearHistory: () => void;
}

export function useAutoComplete(tableName: string): UseAutoCompleteResult {
  const [history, setHistory] = useState<HistoryMap>(() => readHistory());

  // Re-read on mount in case another tab updated the store.
  useEffect(() => {
    setHistory(readHistory());
  }, []);

  const recordSearch = useCallback(
    (term: string) => {
      const trimmed = term.trim();
      if (!trimmed) return;
      setHistory((prev) => {
        const existing = prev[tableName] ?? [];
        const deduped = [trimmed, ...existing.filter((t) => t !== trimmed)];
        const next = {
          ...prev,
          [tableName]: deduped.slice(0, MAX_HISTORY),
        };
        writeHistory(next);
        return next;
      });
    },
    [tableName],
  );

  const clearHistory = useCallback(() => {
    setHistory((prev) => {
      const next = { ...prev, [tableName]: [] };
      writeHistory(next);
      return next;
    });
  }, [tableName]);

  const suggestions = useMemo(
    () => history[tableName] ?? [],
    [history, tableName],
  );

  return { suggestions, recordSearch, clearHistory };
}
