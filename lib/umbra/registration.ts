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
  const { getUserRegistrationFunction } = await import("@umbra-privacy/sdk");
  const register = getUserRegistrationFunction({ client: client as any });
  await register({ confidential: true, anonymous: true });
}
