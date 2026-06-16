// src/lib/dbeaver/__tests__/dbeaver.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { webcrypto } from "node:crypto";
import {
  detectEngine,
  parseDataSources,
  applyCredentials,
  resolveFolderPath,
} from "../parser";
import { decryptCredentials } from "../decrypt";
import { parseDbeaverConfig } from "../index";
import type { DbeaverConnectionEntry } from "../types";

// happy-dom may not expose a full SubtleCrypto; fall back to Node's webcrypto.
beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, "crypto", {
      value: webcrypto,
      configurable: true,
    });
  }
});

const STATIC_KEY_HEX = "babb4a9f774ab853c96c2d653dfe544a";

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Encrypt an object the way DBeaver does (IV ++ AES-128-CBC ciphertext, b64). */
async function encryptCredentials(
  obj: unknown,
  leadingRandomBlock = false,
): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey(
    "raw",
    hexToBytes(STATIC_KEY_HEX),
    { name: "AES-CBC" },
    false,
    ["encrypt"],
  );
  const iv = new Uint8Array(16); // deterministic IV is fine for a round-trip test
  const jsonBytes = new TextEncoder().encode(JSON.stringify(obj));
  const plain = leadingRandomBlock
    ? concat(new Uint8Array(16).fill(7), jsonBytes) // 16 non-'{' bytes up front
    : jsonBytes;
  const ct = new Uint8Array(
    await subtle.encrypt({ name: "AES-CBC", iv }, key, new Uint8Array(plain)),
  );
  return Buffer.from(concat(iv, ct)).toString("base64");
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function entry(over: Partial<DbeaverConnectionEntry>): DbeaverConnectionEntry {
  return { provider: "", driver: "", name: "c", configuration: {}, ...over };
}

describe("detectEngine", () => {
  it("maps known providers/drivers to engines", () => {
    expect(detectEngine(entry({ driver: "clickhouse:com.clickhouse" }))).toBe(
      "clickhouse",
    );
    expect(detectEngine(entry({ provider: "postgresql", driver: "postgres-jdbc" }))).toBe(
      "postgres",
    );
    expect(detectEngine(entry({ provider: "mysql", driver: "mysql:mysql8" }))).toBe(
      "mysql",
    );
    expect(detectEngine(entry({ provider: "mysql", driver: "mysql:mariadb" }))).toBe(
      "mysql",
    );
    expect(detectEngine(entry({ provider: "generic", driver: "generic:sqlite_jdbc" }))).toBe(
      "sqlite",
    );
    expect(detectEngine(entry({ provider: "generic", driver: "generic:duckdb" }))).toBe(
      "duckdb",
    );
  });

  it("returns null for unsupported engines", () => {
    expect(detectEngine(entry({ provider: "oracle", driver: "oracle_thin" }))).toBeNull();
    expect(detectEngine(entry({ provider: "sqlserver", driver: "mssql_jdbc_ms" }))).toBeNull();
  });
});

describe("resolveFolderPath", () => {
  it("walks nested folder parents into a ' / ' path", () => {
    const folders = {
      a: { name: "Prod", "parent-folder": null },
      b: { name: "Analytics", "parent-folder": "a" },
    };
    expect(resolveFolderPath("b", folders)).toBe("Prod / Analytics");
  });

  it("treats an unknown ref as a literal path", () => {
    expect(resolveFolderPath("Prod/Staging", {})).toBe("Prod / Staging");
  });

  it("handles the real name-as-key format with empty values", () => {
    // Observed in actual DBeaver workspaces: folders are keyed by name with {} values.
    expect(resolveFolderPath("MySQL", { MySQL: {}, ClickHouse: {} })).toBe("MySQL");
  });
});

describe("parseDataSources", () => {
  it("builds a ClickHouse url with http scheme and carries the database", () => {
    const res = parseDataSources({
      connections: {
        ch1: {
          provider: "clickhouse",
          driver: "clickhouse:com.clickhouse",
          name: "My CH",
          configuration: {
            host: "172.21.10.187",
            port: "8123",
            database: "analytics",
            user: "root",
          },
        },
      },
    });
    expect(res.connections).toHaveLength(1);
    expect(res.connections[0]).toMatchObject({
      engine: "clickhouse",
      url: "http://172.21.10.187:8123",
      database: "analytics",
      username: "root",
      hasPassword: false,
    });
  });

  it("uses https for ClickHouse when ssl is enabled", () => {
    const res = parseDataSources({
      connections: {
        ch1: {
          provider: "clickhouse",
          driver: "clickhouse",
          configuration: {
            host: "h",
            port: 8443,
            properties: { ssl: "true" },
          },
        },
      },
    });
    expect(res.connections[0].url).toBe("https://h:8443");
  });

  it("stores a bare host:port for Postgres and parses string ports", () => {
    const res = parseDataSources({
      connections: {
        pg: {
          provider: "postgresql",
          driver: "postgres-jdbc",
          configuration: { host: "localhost", port: "5432", database: "mydb", user: "admin" },
        },
      },
    });
    expect(res.connections[0].url).toBe("localhost:5432");
    expect(res.connections[0].database).toBe("mydb");
  });

  it("falls back to host/port from the JDBC url", () => {
    const res = parseDataSources({
      connections: {
        my: {
          provider: "mysql",
          driver: "mysql:mysql8",
          configuration: { url: "jdbc:mysql://db.internal:3307/shop" },
        },
      },
    });
    expect(res.connections[0].url).toBe("db.internal:3307");
  });

  it("extracts file paths for sqlite and flags memory for empty duckdb", () => {
    const res = parseDataSources({
      connections: {
        s: {
          provider: "generic",
          driver: "generic:sqlite_jdbc",
          configuration: { url: "jdbc:sqlite:/home/u/app.db" },
        },
        d: {
          provider: "generic",
          driver: "generic:duckdb",
          configuration: { url: "jdbc:duckdb:" },
        },
      },
    });
    const s = res.connections.find((c) => c.sourceId === "s")!;
    const d = res.connections.find((c) => c.sourceId === "d")!;
    expect(s).toMatchObject({ engine: "sqlite", filePath: "/home/u/app.db", url: "" });
    expect(d).toMatchObject({ engine: "duckdb", filePath: undefined, url: "" });
  });

  it("flattens folder names into the connection name", () => {
    const res = parseDataSources({
      folders: {
        a: { name: "Prod", "parent-folder": null },
        b: { name: "DW", "parent-folder": "a" },
      },
      connections: {
        c: {
          provider: "postgresql",
          driver: "postgres-jdbc",
          name: "Warehouse",
          folder: "b",
          configuration: { host: "h", port: "5432" },
        },
      },
    });
    expect(res.connections[0].name).toBe("Prod / DW / Warehouse");
    expect(res.connections[0].folderPath).toBe("Prod / DW");
  });

  it("collects unsupported drivers into skipped", () => {
    const res = parseDataSources({
      connections: {
        o: { provider: "oracle", driver: "oracle_thin", name: "Legacy" },
      },
    });
    expect(res.connections).toHaveLength(0);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]).toMatchObject({ sourceId: "o", name: "Legacy" });
  });
});

describe("applyCredentials", () => {
  it("fills password and missing username from the credentials map", () => {
    const res = parseDataSources({
      connections: {
        pg: {
          provider: "postgresql",
          driver: "postgres-jdbc",
          configuration: { host: "h", port: "5432" },
        },
      },
    });
    applyCredentials(res, {
      pg: { "#connection": { user: "admin", password: "s3cret" } },
    });
    expect(res.connections[0]).toMatchObject({
      username: "admin",
      password: "s3cret",
      hasPassword: true,
    });
  });

  it("does not overwrite an inline password", () => {
    const res = parseDataSources({
      connections: {
        pg: {
          provider: "postgresql",
          driver: "postgres-jdbc",
          configuration: { host: "h", port: "5432", password: "inline" },
        },
      },
    });
    applyCredentials(res, { pg: { "#connection": { password: "other" } } });
    expect(res.connections[0].password).toBe("inline");
  });
});

describe("decryptCredentials", () => {
  it("round-trips an AES-128-CBC payload (IV prepended)", async () => {
    const creds = { pg: { "#connection": { user: "admin", password: "p@ss" } } };
    const b64 = await encryptCredentials(creds);
    const out = await decryptCredentials(b64);
    expect(out).toEqual(creds);
  });

  it("tolerates a leading random block before the JSON", async () => {
    const creds = { ch: { "#connection": { password: "x" } } };
    const b64 = await encryptCredentials(creds, true);
    const out = await decryptCredentials(b64);
    expect(out).toEqual(creds);
  });

  it("returns {} on undecryptable input instead of throwing", async () => {
    expect(await decryptCredentials("not-real-base64-or-cipher!!")).toEqual({});
    expect(await decryptCredentials("")).toEqual({});
  });
});

describe("parseDbeaverConfig (integration)", () => {
  it("parses data-sources and merges decrypted credentials", async () => {
    const dataSources = {
      connections: {
        pg: {
          provider: "postgresql",
          driver: "postgres-jdbc",
          name: "Main",
          configuration: { host: "h", port: "5432", database: "app", user: "admin" },
        },
      },
    };
    const credentialsBase64 = await encryptCredentials({
      pg: { "#connection": { password: "hunter2" } },
    });
    const res = await parseDbeaverConfig({ dataSources, credentialsBase64 });
    expect(res.connections[0]).toMatchObject({
      engine: "postgres",
      url: "h:5432",
      database: "app",
      username: "admin",
      password: "hunter2",
      hasPassword: true,
    });
  });
});
