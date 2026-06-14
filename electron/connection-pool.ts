// Connection pool — manages adapter instances keyed by connectionId in the
// Electron main process. Lazy-open on first query/expand, idle-timeout close
// (~5 min), explicit disconnect IPC, status events to renderer.

import type { DbAdapter, ConnectionConfig, Engine } from "../src/lib/db-adapter/types";
import { ClickHouseAdapter } from "../src/lib/db-adapter/clickhouse";
import { PostgresAdapter } from "../src/lib/db-adapter/postgres";
import { MySQLAdapter } from "../src/lib/db-adapter/mysql";
import { BrowserWindow } from "electron";

async function createAdapterForEngine(engine: Engine): Promise<DbAdapter> {
  switch (engine) {
    case "clickhouse":
      return new ClickHouseAdapter();
    case "postgres":
      return new PostgresAdapter();
    case "mysql":
      return new MySQLAdapter();
    case "sqlite": {
      const { SQLiteAdapter } = await import("../src/lib/db-adapter/sqlite.js");
      return new SQLiteAdapter();
    }
    case "duckdb": {
      try {
        const { DuckDBAdapter } = await import("../src/lib/db-adapter/duckdb.js");
        return new DuckDBAdapter();
      } catch (err: any) {
        const isMissingBinding =
          err?.code === "ERR_MODULE_NOT_FOUND" ||
          (typeof err?.message === "string" && err.message.includes("Cannot find package"));
        throw new Error(
          isMissingBinding
            ? "DuckDB support requires optional native bindings (@duckdb/node-api and the matching platform binding such as @duckdb/node-bindings-linux-x64-musl or linux-x64). These are installed as optionalDependencies. Run `pnpm install` (the desktop postinstall will attempt to prepare binaries). If the binding for your libc/arch is not available, DuckDB file connections will not work in the desktop app."
            : "Failed to load the DuckDB adapter.",
          { cause: err }
        );
      }
    }
    default: {
      const _exhaustive: never = engine;
      throw new Error(`Unknown engine: ${String(_exhaustive)}`);
    }
  }
}

type PoolStatus = "connected" | "idle" | "disconnected";

interface PoolEntry {
  adapter: DbAdapter;
  status: PoolStatus;
  lastActivity: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const pool = new Map<string, PoolEntry>();

function broadcastStatus(connectionId: string, status: PoolStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("connection:status", { connectionId, status });
  }
}

function resetIdleTimer(connectionId: string): void {
  const entry = pool.get(connectionId);
  if (!entry) return;

  entry.lastActivity = Date.now();
  if (entry.idleTimer) clearTimeout(entry.idleTimer);

  entry.idleTimer = setTimeout(() => {
    if (entry.status === "connected") {
      entry.status = "idle";
      broadcastStatus(connectionId, "idle");
    }
  }, IDLE_TIMEOUT_MS);
}

export async function getOrCreateAdapter(
  connectionId: string,
  config?: ConnectionConfig,
): Promise<DbAdapter> {
  const existing = pool.get(connectionId);
  if (existing) {
    if (existing.status === "idle") {
      existing.status = "connected";
      broadcastStatus(connectionId, "connected");
    }
    resetIdleTimer(connectionId);
    return existing.adapter;
  }

  if (!config) {
    throw new Error(`No connection config for ${connectionId}`);
  }

  const adapter = await createAdapterForEngine(config.engine);
  await adapter.connect(config);

  const entry: PoolEntry = {
    adapter,
    status: "connected",
    lastActivity: Date.now(),
    idleTimer: null,
  };
  pool.set(connectionId, entry);
  broadcastStatus(connectionId, "connected");
  resetIdleTimer(connectionId);
  return adapter;
}

export function getAdapter(connectionId: string): DbAdapter | null {
  const entry = pool.get(connectionId);
  if (!entry) return null;
  resetIdleTimer(connectionId);
  return entry.adapter;
}

export async function disconnectAdapter(
  connectionId: string,
): Promise<void> {
  const entry = pool.get(connectionId);
  if (!entry) return;

  if (entry.idleTimer) clearTimeout(entry.idleTimer);
  await entry.adapter.disconnect();
  pool.delete(connectionId);
  broadcastStatus(connectionId, "disconnected");
}

export function getStatus(connectionId: string): PoolStatus {
  return pool.get(connectionId)?.status ?? "disconnected";
}

export async function disconnectAll(): Promise<void> {
  for (const [id] of pool) {
    await disconnectAdapter(id);
  }
}
