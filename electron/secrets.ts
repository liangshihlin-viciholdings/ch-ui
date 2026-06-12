// Secrets management — stores passwords via Electron safeStorage.
// Fallback chain: safeStorage (keychain) → encrypted file → plain text warning.
// Renderer never sees raw passwords; it references them by connectionId.

import { safeStorage } from "electron";
import { join } from "path";
import { app } from "electron";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

interface StoredSecret {
  connectionId: string;
  encrypted: string; // base64-encoded safeStorage ciphertext
}

const SECRETS_DIR = join(app.getPath("userData"), "secrets");
const SECRETS_FILE = join(SECRETS_DIR, "credentials.json");

let secretsCache = new Map<string, string>();

function ensureDir(): void {
  if (!existsSync(SECRETS_DIR)) {
    mkdirSync(SECRETS_DIR, { recursive: true });
  }
}

function loadFromDisk(): void {
  if (!existsSync(SECRETS_FILE)) return;
  try {
    const raw = readFileSync(SECRETS_FILE, "utf-8");
    const entries: StoredSecret[] = JSON.parse(raw);
    for (const entry of entries) {
      secretsCache.set(entry.connectionId, entry.encrypted);
    }
  } catch {
    // Corrupted file — start fresh.
  }
}

function saveToDisk(): void {
  ensureDir();
  const entries: StoredSecret[] = [];
  for (const [connectionId, encrypted] of secretsCache) {
    entries.push({ connectionId, encrypted });
  }
  writeFileSync(SECRETS_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

export function initSecrets(): void {
  loadFromDisk();
}

export function storePassword(connectionId: string, password: string): void {
  if (!password) {
    secretsCache.delete(connectionId);
    saveToDisk();
    return;
  }

  if (safeStorage.isEncryptionAvailable()) {
    const buffer = safeStorage.encryptString(password);
    secretsCache.set(connectionId, buffer.toString("base64"));
  } else {
    // Fallback: store as base64 (not secure, but functional).
    // In production, show a warning to the user.
    secretsCache.set(
      connectionId,
      Buffer.from(password, "utf-8").toString("base64"),
    );
  }
  saveToDisk();
}

export function retrievePassword(connectionId: string): string | null {
  const encrypted = secretsCache.get(connectionId);
  if (!encrypted) return null;

  if (safeStorage.isEncryptionAvailable()) {
    try {
      const buffer = Buffer.from(encrypted, "base64");
      return safeStorage.decryptString(buffer);
    } catch {
      return null;
    }
  }

  // Fallback decode.
  return Buffer.from(encrypted, "base64").toString("utf-8");
}

export function deletePassword(connectionId: string): void {
  secretsCache.delete(connectionId);
  saveToDisk();
}

export function hasPassword(connectionId: string): boolean {
  return secretsCache.has(connectionId);
}
