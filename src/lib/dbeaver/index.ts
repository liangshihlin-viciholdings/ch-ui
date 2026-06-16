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
  /** Contents of credentials-config.json (Base64 string), if available. */
  credentialsBase64?: string;
}

/**
 * Parse a DBeaver workspace into deebee-ready connections, recovering passwords
 * from credentials-config.json when possible. Best-effort: unrecoverable
 * passwords are left blank (see decryptCredentials).
 */
export async function parseDbeaverConfig(
  input: DbeaverConfigInput,
): Promise<DbeaverParseResult> {
  const result = parseDataSources(input.dataSources);
  if (input.credentialsBase64) {
    const creds = await decryptCredentials(input.credentialsBase64);
    applyCredentials(result, creds);
  }
  return result;
}
