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
import { basename, dirname, join, relative, sep } from "node:path";
import { parseDbeaverConfig, buildScripts } from "../src/lib/dbeaver";
import type {
  DbeaverParseResult,
  DbeaverProjectMetadata,
  DbeaverWorkspaceInfo,
} from "../src/lib/dbeaver";

const DATA_SOURCES_FILE = "data-sources.json";
const CREDENTIALS_FILE = "credentials-config.json";
const PROJECT_METADATA_FILE = "project-metadata.json";
const SCRIPTS_DIR = "Scripts";

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

  const result = await parseDbeaverConfig({ dataSources, credentialsBase64 });

  // Scripts (desktop only). dataSourcesPath is <project>/.dbeaver/data-sources.json,
  // so the project dir is two levels up; scripts live in <project>/Scripts.
  const projectDir = dirname(dirname(dataSourcesPath));
  const rawScripts = readScripts(projectDir);
  if (rawScripts.length > 0) {
    const metaPath = join(dirname(dataSourcesPath), PROJECT_METADATA_FILE);
    let metadata: DbeaverProjectMetadata | undefined;
    if (existsSync(metaPath)) {
      try {
        metadata = JSON.parse(readFileSync(metaPath, "utf-8"));
      } catch {
        // Malformed metadata — scripts just won't be linked to a connection.
      }
    }
    result.scripts = buildScripts(rawScripts, metadata);
  }

  return result;
}

// Recursively read every .sql file under <projectDir>/Scripts, keyed by a
// project-relative POSIX path (e.g. "Scripts/Foo.sql") so keys match the
// resource paths in project-metadata.json.
function readScripts(projectDir: string): { path: string; content: string }[] {
  const scriptsDir = join(projectDir, SCRIPTS_DIR);
  if (!isDir(scriptsDir)) return [];

  const out: { path: string; content: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of safeReaddir(dir)) {
      const full = join(dir, entry);
      if (isDir(full)) {
        walk(full);
      } else if (entry.toLowerCase().endsWith(".sql")) {
        const rel = relative(projectDir, full).split(sep).join("/");
        try {
          out.push({ path: rel, content: readFileSync(full, "utf-8") });
        } catch {
          // Unreadable file — skip it.
        }
      }
    }
  };
  walk(scriptsDir);
  return out;
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
