// Client-side alert evaluator (deebee-npg).
//
// While the app is open, periodically runs each enabled alert's query against
// its connection, checks the threshold, toasts on a rising edge (not-firing ->
// firing), and stamps lastTriggered. Reuses the dialect-aware generateChartSql
// + connection-routed runQuery, so it works for any connection's engine.
//
// LIMITATION: this only runs while the app is open. A true server-side
// evaluator (alerts firing when the app is closed) needs backend
// infrastructure that does not exist in this SPA/Electron app — see the note
// on deebee-npg. This is the in-app stopgap.
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAlerts, useUpdateAlert } from "@/features/alerts/hooks/useAlerts";
import { useWorkbenchStore } from "@/stores/workbenchStore";
import { generateChartSql } from "@/lib/chartUtils";
import { runQuery } from "@/lib/queryRunner";
import { TIME_BUCKET_KEY } from "@/features/analytics/charts/types";
import type { Alert, ThresholdOperator } from "@/features/alerts/types";
import type { Engine } from "@/lib/db/schema";

const INTERVAL_MS: Record<string, number> = {
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
};
const TICK_MS = 60_000;
const WINDOW_MS = 60 * 60 * 1000; // evaluate over the last hour

function checkThreshold(
  value: number,
  op: ThresholdOperator,
  threshold: number,
): boolean {
  switch (op) {
    case ">":
      return value > threshold;
    case "<":
      return value < threshold;
    case ">=":
      return value >= threshold;
    case "<=":
      return value <= threshold;
    case "==":
      return value === threshold;
    case "!=":
      return value !== threshold;
    default:
      return false;
  }
}

/** Latest data point's first (non-time-bucket) series value. */
function latestValue(rows: Record<string, unknown>[]): number | null {
  if (!rows.length) return null;
  const keys = Object.keys(rows[0]).filter((k) => k !== TIME_BUCKET_KEY);
  if (!keys.length) return null;
  const v = rows[rows.length - 1][keys[0]];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function useAlertEvaluator(): void {
  const { data: alerts = [] } = useAlerts();
  const updateAlert = useUpdateAlert();
  const connections = useWorkbenchStore((s) => s.connections);

  // Mirror latest props into refs so the interval callback stays stable.
  const alertsRef = useRef<Alert[]>(alerts);
  const connsRef = useRef(connections);
  alertsRef.current = alerts;
  connsRef.current = connections;

  // Per-alert bookkeeping that must survive ticks.
  const lastRunRef = useRef<Map<string, number>>(new Map());
  const wasFiringRef = useRef<Map<string, boolean>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function evaluateOne(alert: Alert, now: number): Promise<void> {
      const engine = (connsRef.current.find((c) => c.id === alert.connectionId)
        ?.engine ?? "clickhouse") as Engine;
      const dateRange: [Date, Date] = [new Date(now - WINDOW_MS), new Date(now)];
      const sql = generateChartSql(
        alert.config,
        dateRange,
        alert.tableName,
        "timestamp",
        [],
        engine,
      );
      try {
        const result = await runQuery(sql, alert.connectionId ?? undefined);
        if (result.error) return;
        const value = latestValue(
          (result.data ?? []) as Record<string, unknown>[],
        );
        if (value === null) return;

        const firing = checkThreshold(
          value,
          alert.thresholdOperator,
          alert.thresholdValue,
        );
        const wasFiring = wasFiringRef.current.get(alert.id) ?? false;
        wasFiringRef.current.set(alert.id, firing);

        // Rising edge only — toast once per not-firing -> firing transition.
        if (firing && !wasFiring) {
          toast.warning(`Alert "${alert.name}" triggered`, {
            description: `Latest ${value} ${alert.thresholdOperator} ${alert.thresholdValue}`,
          });
          void updateAlert
            .mutateAsync({ id: alert.id, input: { lastTriggered: new Date() } })
            .catch(() => {
              /* non-fatal */
            });
        }
      } catch {
        // Transient query failure — skip this tick.
      }
    }

    async function tick(): Promise<void> {
      const now = Date.now();
      const due = alertsRef.current.filter((a) => {
        if (!a.enabled || !a.tableName) return false;
        const intervalMs = INTERVAL_MS[a.evaluationInterval] ?? 300_000;
        const last = lastRunRef.current.get(a.id) ?? 0;
        return now - last >= intervalMs;
      });
      for (const a of due) lastRunRef.current.set(a.id, now);
      await Promise.allSettled(due.map((a) => evaluateOne(a, now)));
    }

    const intervalId = setInterval(() => {
      if (!cancelled) void tick();
    }, TICK_MS);
    // First pass shortly after mount (lets connections/alerts settle).
    const kickId = setTimeout(() => {
      if (!cancelled) void tick();
    }, 5_000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      clearTimeout(kickId);
    };
  }, [updateAlert]);
}

/** Mount once near the app root to run alert evaluation app-wide. */
export function AlertEvaluator(): null {
  useAlertEvaluator();
  return null;
}
