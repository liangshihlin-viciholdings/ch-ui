// electron/dbeaver-ipc.ts
// Main-process IPC for importing DBeaver configuration.
//
//   dbeaver:detect → DbeaverWorkspaceInfo[]  (scan known workspace locations)
//   dbeaver:read   → DbeaverParseResult       (read + parse + decrypt one file)
//
// Parsing and AES decryption run HERE (main, Node 20+) rather than in the
// renderer because the production renderer is served over file://, where
// crypto.subtle is unavailable. The renderer receives a ready-to-use result.

import { ipcMain } from "electron";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { parseDbeaverConfig } from "../src/lib/dbeaver";
import type {
  DbeaverParseResult,
  DbeaverWorkspaceInfo,
} from "../src/lib/dbeaver";

const DATA_SOURCES_FILE = "data-sources.json";
const CREDENTIALS_FILE = "credentials-config.json";

/** Candidate DBeaverData base directories per platform (macOS out of scope). */
function candidateBaseDirs(): { dir: string; tag: string }[] {
  const home = homedir();
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    return [{ dir: join(appData, "DBeaverData"), tag: "" }];
  }
  // Linux: native install, snap confinement, and flatpak sandbox.
  return [
    { dir: join(home, ".local", "share", "DBeaverData"), tag: "" },
    {
      dir: join(home, "snap", "dbeaver-ce", "current", ".local", "share", "DBeaverData"),
      tag: "snap",
    },
    {
      dir: join(home, ".var", "app", "io.dbeaver.DBeaverCommunity", "data", "DBeaverData"),
      tag: "flatpak",
    },
  ];
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// Scan one DBeaverData dir, looking under each workspace's
// <project>/.dbeaver/ for a data-sources.json.
function scanBaseDir(baseDir: string, tag: string): DbeaverWorkspaceInfo[] {
  const out: DbeaverWorkspaceInfo[] = [];
  if (!isDir(baseDir)) return out;

  for (const ws of safeReaddir(baseDir)) {
    if (!ws.startsWith("workspace")) continue;
    const wsDir = join(baseDir, ws);
    if (!isDir(wsDir)) continue;

    for (const project of safeReaddir(wsDir)) {
      const dbeaverDir = join(wsDir, project, ".dbeaver");
      const dataSourcesPath = join(dbeaverDir, DATA_SOURCES_FILE);
      if (!existsSync(dataSourcesPath)) continue;

      const credPath = join(dbeaverDir, CREDENTIALS_FILE);
      const hasCredentials = existsSync(credPath);
      out.push({
        dataSourcesPath,
        credentialsPath: hasCredentials ? credPath : undefined,
        hasCredentials,
        label: tag ? `${project} (${tag})` : project,
      });
    }
  }
  return out;
}

function detectWorkspaces(): DbeaverWorkspaceInfo[] {
  const seen = new Set<string>();
  const out: DbeaverWorkspaceInfo[] = [];
  for (const { dir, tag } of candidateBaseDirs()) {
    for (const ws of scanBaseDir(dir, tag)) {
      if (seen.has(ws.dataSourcesPath)) continue;
      seen.add(ws.dataSourcesPath);
      out.push(ws);
    }
  }
  return out;
}

/** Read + parse a chosen data-sources.json plus its sibling credentials file. */
async function readWorkspace(
  dataSourcesPath: unknown,
): Promise<DbeaverParseResult> {
  // Path guard: only ever read a file literally named data-sources.json, and
  // only its sibling credentials-config.json. Limits XSS-driven path traversal.
  if (
    typeof dataSourcesPath !== "string" ||
    basename(dataSourcesPath) !== DATA_SOURCES_FILE
  ) {
    throw new Error("Invalid DBeaver data-sources path");
  }
  if (!existsSync(dataSourcesPath)) {
    throw new Error("DBeaver data-sources.json not found");
  }

  const dataSources = readFileSync(dataSourcesPath, "utf-8");
  const credPath = join(dirname(dataSourcesPath), CREDENTIALS_FILE);
  const credentialsBase64 = existsSync(credPath)
    ? readFileSync(credPath, "utf-8")
    : undefined;

  return parseDbeaverConfig({ dataSources, credentialsBase64 });
}

export function registerDbeaverIPC(): void {
  ipcMain.handle("dbeaver:detect", async (): Promise<DbeaverWorkspaceInfo[]> => {
    return detectWorkspaces();
  });

  ipcMain.handle(
    "dbeaver:read",
    async (_event, dataSourcesPath: string): Promise<DbeaverParseResult> => {
      return readWorkspace(dataSourcesPath);
    },
  );
}
