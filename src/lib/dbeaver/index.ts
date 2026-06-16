// src/lib/dbeaver/index.ts
// Public surface of the DBeaver import library.

export type {
  DbeaverConfiguration,
  DbeaverConnectionEntry,
  DbeaverFolder,
  DbeaverDataSourcesFile,
  DbeaverCredentialEntry,
  DbeaverCredentialsMap,
  ImportedConnection,
  ImportedScript,
  SkippedConnection,
  DbeaverParseResult,
  DbeaverProjectMetadata,
  DbeaverWorkspaceInfo,
} from "./types";

export {
  detectEngine,
  resolveFolderPath,
  parseDataSources,
  applyCredentials,
  buildScripts,
} from "./parser";

export { decryptCredentials } from "./decrypt";

import { parseDataSources, applyCredentials } from "./parser";
import { decryptCredentials } from "./decrypt";
import type { DbeaverParseResult } from "./types";

/** Raw DBeaver workspace files to parse (already read from disk or uploaded). */
export interface DbeaverConfigInput {
  /** Contents of data-sources.json (object or JSON string). */
  dataSources: unknown;
  /**
   * Contents of credentials-config.json, if available. Real DBeaver writes this
   * as raw bytes (IV + AES ciphertext), so prefer passing a Uint8Array; a Base64
   * string is also accepted for flexibility.
   */
  credentials?: Uint8Array | string;
}

/**
 * Parse a DBeaver workspace into deebee-ready connections, recovering usernames
 * and passwords from credentials-config.json when possible. Best-effort:
 * unrecoverable credentials are left blank (see decryptCredentials).
 */
export async function parseDbeaverConfig(
  input: DbeaverConfigInput,
): Promise<DbeaverParseResult> {
  const result = parseDataSources(input.dataSources);
  const creds = input.credentials;
  const hasCreds =
    creds != null && (typeof creds === "string" ? creds.length > 0 : creds.length > 0);
  if (hasCreds) {
    applyCredentials(result, await decryptCredentials(creds!));
  }
  return result;
}
