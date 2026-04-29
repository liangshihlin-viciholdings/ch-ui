import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

interface DashboardSyncState {
  hoveredTs: number | null;
  setHoveredTs: (ts: number | null) => void;
}

const DashboardSyncContext = createContext<DashboardSyncState | undefined>(
  undefined,
);

const THROTTLE_MS = 60;

export function DashboardSyncProvider({ children }: { children: ReactNode }) {
  const [hoveredTs, setHoveredTs] = useState<number | null>(null);
  const lastUpdateRef = useRef(0);

  const setHovered = useCallback((ts: number | null) => {
    if (ts === null) {
      setHoveredTs(null);
      lastUpdateRef.current = 0;
      return;
    }
    const now = performance.now();
    if (now - lastUpdateRef.current < THROTTLE_MS) return;
    lastUpdateRef.current = now;
    setHoveredTs(ts);
  }, []);

  return (
    <DashboardSyncContext.Provider value={{ hoveredTs, setHoveredTs: setHovered }}>
      {children}
    </DashboardSyncContext.Provider>
  );
}

export function useDashboardSync(): DashboardSyncState {
  const ctx = useContext(DashboardSyncContext);
  if (!ctx) {
    throw new Error("useDashboardSync must be used within a DashboardSyncProvider");
  }
  return ctx;
}
