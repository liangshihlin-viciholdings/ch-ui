// Transport barrel — creates per-connection transports.
// Web: single in-process adapter. Electron: per-connection IPC transport.
import { ClickHouseAdapter } from "@/lib/db-adapter";
import type { AdapterTransport } from "./types";
import { InProcessTransport } from "./in-process";
import { IPCTransport } from "./ipc";

export type { AdapterTransport, TransportError } from "./types";

const isElectron =
  typeof window !== "undefined" && !!(window as any).electronAPI;

// Web build: single shared in-process transport.
let _webTransport: AdapterTransport | null = null;

// Electron: per-connection transports.
const _ipcTransports = new Map<string, IPCTransport>();

export function getTransport(
  connectionId?: string,
): AdapterTransport {
  if (isElectron) {
    const id = connectionId ?? "default";
    let transport = _ipcTransports.get(id);
    if (!transport) {
      transport = new IPCTransport(id);
      _ipcTransports.set(id, transport);
    }
    return transport;
  }

  if (!_webTransport) {
    const adapter = new ClickHouseAdapter();
    _webTransport = new InProcessTransport(adapter);
  }
  return _webTransport;
}

/** Replace the web transport (testing). */
export function setTransport(transport: AdapterTransport): void {
  _webTransport = transport;
}
