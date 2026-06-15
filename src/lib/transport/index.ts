// Transport barrel — creates per-connection transports.
//
//   Electron: a per-connection IPCTransport (the main process owns the real
//             engine adapters via the connection pool — all engines).
//   Web:      a per-connection in-process ClickHouseAdapter. Multiple
//             ClickHouse connections stay isolated (previously they shared a
//             single adapter and clobbered each other). Non-ClickHouse engines
//             are desktop-only: their drivers (pg, mysql2, better-sqlite3,
//             @duckdb/node-api) are node-only and cannot run in the browser.
import { ClickHouseAdapter } from "@/lib/db-adapter";
import type { AdapterTransport } from "./types";
import { InProcessTransport } from "./in-process";
import { IPCTransport } from "./ipc";

export type { AdapterTransport, TransportError } from "./types";

const isElectron =
  typeof window !== "undefined" && !!(window as any).electronAPI;

// Per-connection transports, keyed by connection id.
const _ipcTransports = new Map<string, IPCTransport>();
const _webTransports = new Map<string, AdapterTransport>();

export function getTransport(connectionId?: string): AdapterTransport {
  const id = connectionId ?? "default";

  if (isElectron) {
    let transport = _ipcTransports.get(id);
    if (!transport) {
      transport = new IPCTransport(id);
      _ipcTransports.set(id, transport);
    }
    return transport;
  }

  let transport = _webTransports.get(id);
  if (!transport) {
    transport = new InProcessTransport(new ClickHouseAdapter());
    _webTransports.set(id, transport);
  }
  return transport;
}

/** Replace a web transport (testing). Defaults to the "default" connection. */
export function setTransport(
  transport: AdapterTransport,
  connectionId = "default",
): void {
  _webTransports.set(connectionId, transport);
}
