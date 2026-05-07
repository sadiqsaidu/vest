import { readAuthHeaders, verifyWalletSignature } from "@/lib/auth";

/**
 * Verify the wallet signature on an incoming request.
 * Returns the signing wallet's address on success, or null if verification fails.
 *
 * Used by all routes that require founder/beneficiary authorization. Callers must
 * additionally compare the returned address against the expected owner of the
 * resource being mutated.
 */
export async function verifyRequest(req: Request): Promise<string | null> {
  const auth = readAuthHeaders(req);
  if (!auth) return null;
  if (!auth.message.startsWith("vest:auth:")) return null;
  const ok = await verifyWalletSignature({
    wallet: auth.wallet,
    message: auth.message,
    signatureBase58: auth.signature,
  });
  return ok ? auth.wallet : null;
}
