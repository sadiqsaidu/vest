/**
 * Viewing key envelope crypto. Symmetric AES-GCM with key material derived
 * via HKDF-SHA256 from the access_token.
 *
 * Works in both Node.js (server routes) and the browser. Uses the
 * `crypto.subtle` global which both environments expose.
 */

import bs58 from "bs58";

const TOKEN_PREFIX = "vk_";
const HKDF_SALT_NS = "vest:vk:v1";

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      "crypto.subtle is not available. Vest requires a modern runtime (Node 19+ or any current browser).",
    );
  }
  return subtle;
}

function getRandomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("crypto.getRandomValues is not available");
  }
  globalThis.crypto.getRandomValues(out);
  return out;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/**
 * Generate a random access token. 32 bytes, base58, "vk_" prefix.
 *
 * Example: `vk_5kW7TyG3aV9jJk2x...`
 */
export function generateAccessToken(): string {
  const bytes = getRandomBytes(32);
  return TOKEN_PREFIX + bs58.encode(bytes);
}

/** True if the input parses as a valid Vest access token. */
export function isAccessToken(input: string): boolean {
  if (!input.startsWith(TOKEN_PREFIX)) return false;
  try {
    const raw = bs58.decode(input.slice(TOKEN_PREFIX.length));
    return raw.length === 32;
  } catch {
    return false;
  }
}

function decodeAccessToken(token: string): Uint8Array {
  if (!token.startsWith(TOKEN_PREFIX)) {
    throw new Error("Malformed access token");
  }
  const raw = bs58.decode(token.slice(TOKEN_PREFIX.length));
  if (raw.length !== 32) throw new Error("Malformed access token (length)");
  return raw;
}

async function deriveAesKey(
  accessToken: string,
  envelopeId: string,
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const tokenBytes = decodeAccessToken(accessToken);
  const baseKey = await subtle.importKey(
    "raw",
    tokenBytes as BufferSource,
    "HKDF",
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: utf8(HKDF_SALT_NS) as BufferSource,
      info: utf8(envelopeId) as BufferSource,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
}

function hexToBytes(s: string): Uint8Array {
  const clean = s.startsWith("0x") ? s.slice(2) : s;
  if (clean.length % 2 !== 0) throw new Error("Bad hex length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export type EncryptedPayload = {
  v: 1;
  iv: string; // hex
  ct: string; // hex (ciphertext + GCM tag)
};

/** Wrap raw viewing-key bytes under the access_token + envelope id. */
export async function wrapKey(
  accessToken: string,
  envelopeId: string,
  keyBytes: Uint8Array,
): Promise<EncryptedPayload> {
  const subtle = getSubtle();
  const aesKey = await deriveAesKey(accessToken, envelopeId);
  const iv = getRandomBytes(12);
  const ct = await subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    aesKey,
    keyBytes as BufferSource,
  );
  return {
    v: 1,
    iv: bytesToHex(iv),
    ct: bytesToHex(new Uint8Array(ct)),
  };
}

/** Reverse of `wrapKey`. */
export async function unwrapKey(
  accessToken: string,
  envelopeId: string,
  payload: EncryptedPayload,
): Promise<Uint8Array> {
  if (payload.v !== 1) throw new Error("Unsupported envelope version");
  const subtle = getSubtle();
  const aesKey = await deriveAesKey(accessToken, envelopeId);
  const iv = hexToBytes(payload.iv);
  const ct = hexToBytes(payload.ct);
  const pt = await subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    aesKey,
    ct as BufferSource,
  );
  return new Uint8Array(pt);
}

/** 32-byte big-endian → bigint. Symmetric with `lib/umbra/viewing-keys.ts`. */
export function bytesToBigInt(b: Uint8Array): bigint {
  return BigInt("0x" + bytesToHex(b));
}

/** Convenience: render a 32-byte key as a 0x… hex string. */
export function bytesToHexString(b: Uint8Array): string {
  return "0x" + bytesToHex(b);
}
