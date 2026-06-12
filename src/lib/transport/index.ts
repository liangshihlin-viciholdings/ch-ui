// Transport barrel — auto-detects Electron vs web and returns the right transport.
import { ClickHouseAdapter } from "@/lib/db-adapter";
import type { AdapterTransport } from "./types";
import { InProcessTransport } from "./in-process";
import { IPCTransport } from "./ipc";

export type { AdapterTransport, TransportError } from "./types";

const isElectron =
  typeof window !== "undefined" && !!(window as any).electronAPI;

let _transport: AdapterTransport | null = null;

export function getTransport(): AdapterTransport {
  if (_transport) return _transport;

  if (isElectron) {
    _transport = new IPCTransport();
  } else {
    const adapter = new ClickHouseAdapter();
    _transport = new InProcessTransport(adapter);
  }

  return _transport;
}

/** Replace the active transport (useful for testing or connection switching). */
export function setTransport(transport: AdapterTransport): void {
  _transport = transport;
}
