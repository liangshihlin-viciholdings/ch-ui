// src/lib/dbeaver/access.ts
// Renderer-side access to DBeaver configuration. On desktop it goes through the
// Electron main process (which reads files and decrypts); on web it parses
// user-uploaded files in the browser. Both paths return a DbeaverParseResult.
//
// NOTE: do not import this module from the Electron main process — it touches
// `window`/`File`. Main should import the pure parser from "./index" instead.

import { parseDbeaverConfig } from "./index";
import type { DbeaverParseResult, DbeaverWorkspaceInfo } from "./types";

interface ElectronAPILike {
  isDesktop?: boolean;
  invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

function electronAPI(): ElectronAPILike | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { electronAPI?: ElectronAPILike }).electronAPI;
}

/** Whether we are running inside the Electron desktop shell. */
export function isDesktop(): boolean {
  return !!electronAPI()?.isDesktop;
}

/** Auto-detect DBeaver workspaces on disk. Desktop only; returns [] on web. */
export async function detectDbeaverWorkspaces(): Promise<DbeaverWorkspaceInfo[]> {
  const api = electronAPI();
  if (!api?.invoke) return [];
  try {
    return (await api.invoke("dbeaver:detect")) as DbeaverWorkspaceInfo[];
  } catch {
    return [];
  }
}

/** Read + parse a data-sources.json at an absolute path (desktop only). */
export async function readDbeaverWorkspace(
  dataSourcesPath: string,
): Promise<DbeaverParseResult> {
  const api = electronAPI();
  if (!api?.invoke) {
    throw new Error("DBeaver auto-detect is only available in the desktop app");
  }
  return (await api.invoke("dbeaver:read", dataSourcesPath)) as DbeaverParseResult;
}

/**
 * Open a native picker for a DBeaver data-sources.json (desktop only).
 * Returns the chosen absolute path, or null if cancelled/unavailable.
 */
export async function pickDbeaverFile(): Promise<string | null> {
  const api = electronAPI();
  if (!api?.invoke) return null;
  return (await api.invoke("dialog:open", {
    title: "Select DBeaver data-sources.json",
    filters: [{ name: "DBeaver config", extensions: ["json"] }],
  })) as string | null;
}

/**
 * Parse user-uploaded DBeaver files in the browser (web path). Decryption runs
 * in the renderer here, which is fine because the web build is served from a
 * secure context (https/localhost) where crypto.subtle is available.
 */
export async function parseUploadedDbeaver(
  dataSourcesFile: File,
  credentialsFile?: File,
): Promise<DbeaverParseResult> {
  const dataSources = await dataSourcesFile.text();
  const credentialsBase64 = credentialsFile
    ? await credentialsFile.text()
    : undefined;
  return parseDbeaverConfig({ dataSources, credentialsBase64 });
}
