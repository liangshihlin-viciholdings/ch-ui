// src/features/analytics/contexts/AutoRefreshContext.tsx
// Context for managing dashboard auto-refresh state (interval and enabled).

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

const STORAGE_KEY = "ch-ui-auto-refresh";

export interface AutoRefreshInterval {
  label: string;
  ms: number;
}

export const AUTO_REFRESH_INTERVALS: AutoRefreshInterval[] = [
  { label: "5s", ms: 5_000 },
  { label: "10s", ms: 10_000 },
  { label: "30s", ms: 30_000 },
  { label: "1m", ms: 60_000 },
  { label: "5m", ms: 300_000 },
  { label: "15m", ms: 900_000 },
];

interface AutoRefreshState {
  enabled: boolean;
  intervalMs: number;
  intervalLabel: string;
  setEnabled: (enabled: boolean) => void;
  setInterval: (ms: number) => void;
  refetchInterval: number | false;
  /** Seconds remaining until next refetch (0 when disabled) */
  secondsRemaining: number;
  /** Progress from 0-1 representing countdown (1 = just refreshed, 0 = about to refresh) */
  countdownProgress: number;
}

const AutoRefreshContext = createContext<AutoRefreshState | undefined>(undefined);

function loadStoredState(): { enabled: boolean; intervalMs: number } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as { enabled?: boolean; intervalMs?: number };
      return {
        enabled: parsed.enabled ?? false,
        intervalMs: parsed.intervalMs ?? AUTO_REFRESH_INTERVALS[2].ms,
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { enabled: false, intervalMs: AUTO_REFRESH_INTERVALS[2].ms };
}

function saveState(enabled: boolean, intervalMs: number): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled, intervalMs }));
}

export function AutoRefreshProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(loadStoredState);
  const [msRemaining, setMsRemaining] = useState(state.intervalMs);
  const lastTickRef = useRef(Date.now());

  const resetCountdown = useCallback(() => {
    setMsRemaining(state.intervalMs);
    lastTickRef.current = Date.now();
  }, [state.intervalMs]);

  const setEnabled = useCallback((enabled: boolean) => {
    setState((prev) => {
      saveState(enabled, prev.intervalMs);
      return { ...prev, enabled };
    });
    if (enabled) {
      resetCountdown();
    }
  }, [resetCountdown]);

  const setInterval = useCallback((ms: number) => {
    setState((prev) => {
      saveState(prev.enabled, ms);
      return { ...prev, intervalMs: ms };
    });
    setMsRemaining(ms);
    lastTickRef.current = Date.now();
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!state.enabled) {
      setMsRemaining(state.intervalMs);
      return;
    }

    const tick = () => {
      const now = Date.now();
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;

      setMsRemaining((prev) => {
        const next = prev - elapsed;
        if (next <= 0) {
          // Reset countdown - TanStack Query handles the actual refetch
          return state.intervalMs;
        }
        return next;
      });
    };

    const intervalId = window.setInterval(tick, 100);
    return () => window.clearInterval(intervalId);
  }, [state.enabled, state.intervalMs]);

  const intervalLabel =
    AUTO_REFRESH_INTERVALS.find((i) => i.ms === state.intervalMs)?.label ?? "30s";

  const secondsRemaining = Math.ceil(msRemaining / 1000);
  const countdownProgress = msRemaining / state.intervalMs;

  const value: AutoRefreshState = {
    enabled: state.enabled,
    intervalMs: state.intervalMs,
    intervalLabel,
    setEnabled,
    setInterval,
    refetchInterval: state.enabled ? state.intervalMs : false,
    secondsRemaining,
    countdownProgress,
  };

  return (
    <AutoRefreshContext.Provider value={value}>
      {children}
    </AutoRefreshContext.Provider>
  );
}

export function useAutoRefresh(): AutoRefreshState {
  const context = useContext(AutoRefreshContext);
  if (context === undefined) {
    throw new Error("useAutoRefresh must be used within an AutoRefreshProvider");
  }
  return context;
}
