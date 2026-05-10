"use client";

const cache = new Map<string, boolean>();

export function getCachedRegistration(wallet: string): boolean | undefined {
  return cache.get(wallet);
}

export function setCachedRegistration(wallet: string, value: boolean) {
  cache.set(wallet, value);
}

export async function isRegistered(
  client: unknown,
  walletAddress: string,
): Promise<boolean> {
  const cached = cache.get(walletAddress);
  if (cached !== undefined) return cached;

  const { getUserAccountQuerierFunction } = await import("@umbra-privacy/sdk");
  const query = getUserAccountQuerierFunction({ client: client as any });
  const result: any = await query(walletAddress as any);
  const ok =
    result?.state === "exists" &&
    !!result.data?.isUserAccountX25519KeyRegistered &&
    !!result.data?.isUserCommitmentRegistered;
  cache.set(walletAddress, ok);
  return ok;
}

export async function registerForMixer(client: unknown): Promise<void> {
  const [{ getUserRegistrationFunction }, zk] = await Promise.all([
    import("@umbra-privacy/sdk"),
    import("@umbra-privacy/web-zk-prover"),
  ]);
  // `anonymous: true` requires a Groth16 proof for the user-commitment step.
  // Without `zkProver` in deps the SDK throws
  // "ZK prover is required for anonymous mode registration".
  const proverFn = (zk as any).getUserRegistrationProver;
  if (typeof proverFn !== "function") {
    throw new Error(
      "@umbra-privacy/web-zk-prover is missing getUserRegistrationProver — check the installed version.",
    );
  }
  const zkProver = proverFn();
  const register = getUserRegistrationFunction(
    { client: client as any },
    { zkProver },
  );
  await register({ confidential: true, anonymous: true });
}
