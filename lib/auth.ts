import bs58 from "bs58";
import { webcrypto } from "crypto";

const subtle = webcrypto.subtle;

export const VEST_AUTH_PREFIX = "vest:auth:";

export function buildAuthMessage(action: string, nonce: string): string {
  return `${VEST_AUTH_PREFIX}${action}:${nonce}`;
}

export async function verifyWalletSignature(opts: {
  wallet: string;
  message: string;
  signatureBase58: string;
}): Promise<boolean> {
  const { wallet, message, signatureBase58 } = opts;
  try {
    const toAB = (u: Uint8Array): ArrayBuffer => {
      const ab = new ArrayBuffer(u.byteLength);
      new Uint8Array(ab).set(u);
      return ab;
    };
    const pubkey = toAB(bs58.decode(wallet));
    const sig = toAB(bs58.decode(signatureBase58));
    const data = toAB(new TextEncoder().encode(message));
    const key = await subtle.importKey(
      "raw",
      pubkey,
      { name: "Ed25519" } as AlgorithmIdentifier,
      false,
      ["verify"],
    );
    return await subtle.verify(
      { name: "Ed25519" } as AlgorithmIdentifier,
      key,
      sig,
      data,
    );
  } catch {
    return false;
  }
}

export type AuthHeaders = {
  wallet: string;
  message: string;
  signature: string;
};

export function readAuthHeaders(req: Request): AuthHeaders | null {
  const wallet = req.headers.get("x-vest-wallet");
  const message = req.headers.get("x-vest-message");
  const signature = req.headers.get("x-vest-signature");
  if (!wallet || !message || !signature) return null;
  return { wallet, message, signature };
}
