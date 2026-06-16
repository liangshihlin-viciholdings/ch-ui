// src/lib/dbeaver/parser.ts
// Pure parsing of DBeaver's data-sources.json into deebee's connection shape.
// No I/O, no crypto, no DOM — safe to run anywhere and trivially unit-testable.

import type { Engine } from "@/lib/db-adapter/types";
import type {
  DbeaverConfiguration,
  DbeaverConnectionEntry,
  DbeaverCredentialsMap,
  DbeaverDataSourcesFile,
  DbeaverFolder,
  DbeaverParseResult,
  ImportedConnection,
  SkippedConnection,
} from "./types";

// ─── Engine mapping ─────────────────────────────────────────────────────────

/**
 * Map a DBeaver connection to a deebee Engine using provider + driver ids.
 * Returns null for engines deebee does not support (Oracle, MSSQL, …).
 */
export function detectEngine(entry: DbeaverConnectionEntry): Engine | null {
  const hay = `${entry.provider ?? ""} ${entry.driver ?? ""}`.toLowerCase();
  if (hay.includes("clickhouse")) return "clickhouse";
  if (hay.includes("postgres")) return "postgres";
  // MariaDB shares DBeaver's mysql provider; treat it as mysql.
  if (hay.includes("mariadb") || hay.includes("mysql")) return "mysql";
  if (hay.includes("duckdb")) return "duckdb";
  if (hay.includes("sqlite")) return "sqlite";
  return null;
}

function isFileEngine(engine: Engine): boolean {
  return engine === "sqlite" || engine === "duckdb";
}

/** Default port when DBeaver does not record one (it almost always does). */
function defaultPort(engine: Engine): number {
  switch (engine) {
    case "clickhouse":
      return 8123; // DBeaver connects to ClickHouse over HTTP JDBC
    case "postgres":
      return 5432;
    case "mysql":
      return 3306;
    default:
      return 0;
  }
}

// ─── Field extraction ───────────────────────────────────────────────────────

function parsePort(port: string | number | undefined): number {
  if (typeof port === "number") return Number.isFinite(port) ? port : 0;
  if (typeof port === "string" && /^\d+$/.test(port.trim())) {
    return parseInt(port.trim(), 10);
  }
  return 0;
}

/** Whether a server connection is configured for TLS (ClickHouse → https). */
function isSslEnabled(config: DbeaverConfiguration): boolean {
  const props = config.properties ?? {};
  const ssl = String((props as Record<string, unknown>).ssl ?? "").toLowerCase();
  if (ssl === "true") return true;
  const sslmode = String(
    (props as Record<string, unknown>).sslmode ?? "",
  ).toLowerCase();
  if (sslmode && sslmode !== "none" && sslmode !== "disable") return true;
  return false;
}

/** Pull host/port from a JDBC url like "jdbc:postgresql://host:5432/db". */
function hostPortFromJdbc(url: string): { host?: string; port?: number } {
  const m = url.match(/\/\/([^/:?]+)(?::(\d+))?/);
  if (!m) return {};
  return { host: m[1], port: m[2] ? parseInt(m[2], 10) : undefined };
}

/** Build the deebee `url` string for a server connection. */
function buildServerUrl(config: DbeaverConfiguration, engine: Engine): string {
  let host = (config.host ?? "").trim();
  let port = parsePort(config.port);

  if ((!host || !port) && typeof config.url === "string") {
    const fromJdbc = hostPortFromJdbc(config.url);
    if (!host && fromJdbc.host) host = fromJdbc.host;
    if (!port && fromJdbc.port) port = fromJdbc.port;
  }
  if (!port) port = defaultPort(engine);

  const hostPort = port ? `${host}:${port}` : host;
  if (engine === "clickhouse") {
    return `${isSslEnabled(config) ? "https://" : "http://"}${hostPort}`;
  }
  return hostPort;
}

/** Extract the file path for sqlite/duckdb; absent path ⇒ in-memory. */
function extractFilePath(config: DbeaverConfiguration): string | undefined {
  const url = typeof config.url === "string" ? config.url : "";
  const m = url.match(/^jdbc:(?:sqlite|duckdb):(.*)$/i);
  let path = m ? m[1].trim() : "";
  if (!path && typeof config.database === "string") path = config.database.trim();
  if (!path || path === ":memory:") return undefined;
  return path;
}

// ─── Folder resolution ──────────────────────────────────────────────────────

/**
 * Resolve a folder reference to a " / "-joined path. Handles both UUID-keyed
 * folder maps (walking parent-folder links) and literal path strings.
 */
export function resolveFolderPath(
  folderRef: string,
  folders: Record<string, DbeaverFolder>,
): string {
  if (folders[folderRef]) {
    const parts: string[] = [];
    const seen = new Set<string>();
    let cur: string | null | undefined = folderRef;
    while (cur && folders[cur] && !seen.has(cur)) {
      seen.add(cur);
      const folder: DbeaverFolder = folders[cur];
      if (folder.name) parts.unshift(folder.name);
      cur = folder["parent-folder"] ?? null;
    }
    return parts.join(" / ");
  }
  // Literal path string (some DBeaver versions store "Prod/Staging").
  return folderRef
    .split(/[\\/]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" / ");
}

// ─── Parsing ────────────────────────────────────────────────────────────────

/** Parse data-sources.json (object or JSON string) into normalized results. */
export function parseDataSources(input: unknown): DbeaverParseResult {
  const file: DbeaverDataSourcesFile =
    typeof input === "string" ? JSON.parse(input) : (input as DbeaverDataSourcesFile);

  const folders = file?.folders ?? {};
  const connections = file?.connections ?? {};

  const out: ImportedConnection[] = [];
  const skipped: SkippedConnection[] = [];

  for (const [sourceId, entry] of Object.entries(connections)) {
    const rawName = entry.name?.trim() || sourceId;
    const driverLabel = entry.driver || entry.provider || "unknown";

    const engine = detectEngine(entry);
    if (!engine) {
      skipped.push({
        sourceId,
        name: rawName,
        driver: driverLabel,
        reason: `Unsupported driver "${driverLabel}"`,
      });
      continue;
    }

    const folderPath = entry.folder
      ? resolveFolderPath(String(entry.folder), folders)
      : "";
    const name = folderPath ? `${folderPath} / ${rawName}` : rawName;
    const config = entry.configuration ?? {};

    // Inline password (rare) — credentials-config.json is the usual source.
    const inlinePassword =
      typeof config.password === "string" && config.password.length > 0
        ? config.password
        : "";

    if (isFileEngine(engine)) {
      out.push({
        sourceId,
        name,
        engine,
        url: "",
        filePath: extractFilePath(config),
        username: "",
        password: "",
        hasPassword: false,
        folderPath: folderPath || undefined,
      });
      continue;
    }

    out.push({
      sourceId,
      name,
      engine,
      url: buildServerUrl(config, engine),
      database:
        typeof config.database === "string" && config.database
          ? config.database
          : undefined,
      username: typeof config.user === "string" ? config.user : "",
      password: inlinePassword,
      hasPassword: inlinePassword.length > 0,
      folderPath: folderPath || undefined,
    });
  }

  return { connections: out, skipped };
}

/**
 * Fill in usernames/passwords from a decrypted credentials map (mutates and
 * returns the same result for convenience). Inline passwords are preserved.
 */
export function applyCredentials(
  result: DbeaverParseResult,
  credentials: DbeaverCredentialsMap,
): DbeaverParseResult {
  for (const conn of result.connections) {
    const creds = credentials[conn.sourceId]?.["#connection"];
    if (!creds) continue;
    if (!conn.hasPassword && typeof creds.password === "string" && creds.password) {
      conn.password = creds.password;
      conn.hasPassword = true;
    }
    if (!conn.username && typeof creds.user === "string") {
      conn.username = creds.user;
    }
  }
  return result;
}
