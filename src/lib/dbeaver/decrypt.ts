// src/lib/dbeaver/decrypt.ts
// Decrypts DBeaver Community's credentials-config.json.
//
// Format (DBeaver CE, no workspace master password):
//   - The file is raw bytes (a Base64 string is also accepted as a fallback).
//   - Bytes = IV (first 16 bytes) ++ AES-128-CBC ciphertext (PKCS7 padding).
//   - Key = the 16 bytes of the hex string below (hex-decoded, NOT ASCII).
//   - Plaintext is a JSON object; some versions prepend a 16-byte random block,
//     so we extract the JSON substring rather than trusting byte offsets.
//
// Uses WebCrypto via globalThis.crypto.subtle, which is available both in the
// browser renderer (secure context) and in Node 20+ (Electron main process),
// so the same function works on web and desktop.
//
// This is best-effort by design: when decryption is not possible (a workspace
// master password is set, OS-keystore delegation, a key/format change in a
// future DBeaver release, or a non-secure context), it returns an empty map and
// the importer leaves those passwords blank for the user to re-enter.

import type { DbeaverCredentialsMap } from "./types";

/**
 * Static AES key shipped by DBeaver CE for credential storage when no master
 * password is configured. Hex-decoded to 16 bytes ⇒ AES-128.
 */
const STATIC_KEY_HEX = "babb4a9f774ab853c96c2d653dfe544a";

const IV_LENGTH = 16;

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64.trim());
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Extract the first balanced-looking JSON object from a string by slicing from
 * the first "{" to the last "}". Tolerates a leading random block and any
 * trailing padding bytes left over from decryption.
 */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start, end + 1);
}

/**
 * Decrypt DBeaver's credentials-config.json content into a credentials map.
 * @param fileContent The raw file content (Base64 string) or its decoded bytes.
 * @returns A map keyed by connection id, or {} when decryption is not possible.
 */
export async function decryptCredentials(
  fileContent: string | Uint8Array,
): Promise<DbeaverCredentialsMap> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return {};

    const raw =
      typeof fileContent === "string" ? base64ToBytes(fileContent) : fileContent;
    if (raw.length <= IV_LENGTH) return {};

    // Copy into fresh ArrayBuffer-backed views — WebCrypto requires BufferSource
    // backed by ArrayBuffer, not the ArrayBufferLike that subarray/slice yield.
    const iv = new Uint8Array(raw.subarray(0, IV_LENGTH));
    const ciphertext = new Uint8Array(raw.subarray(IV_LENGTH));

    const key = await subtle.importKey(
      "raw",
      hexToBytes(STATIC_KEY_HEX),
      { name: "AES-CBC" },
      false,
      ["decrypt"],
    );

    const plainBuf = await subtle.decrypt({ name: "AES-CBC", iv }, key, ciphertext);
    const text = new TextDecoder().decode(new Uint8Array(plainBuf));

    const json = extractJsonObject(text);
    if (!json) return {};

    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object"
      ? (parsed as DbeaverCredentialsMap)
      : {};
  } catch {
    // Master password / OS keystore / format change / non-secure context.
    return {};
  }
}
