# Umbra SDK — Implementation Notes for Vest

> **Source of truth:** Compiled directly from sdk.umbraprivacy.com on 2026-05-07.
> The initial scaffold (prompt 1) generated a notes file from package metadata only
> — the docs site was blocked in the sandbox. That file had wrong indexer URLs and
> several open questions that are now resolved. **This file supersedes it entirely.**
> Do not merge with the old version.

---

## Network Status (mainnet vs devnet — confirmed)

Both networks are live and fully supported.

| Network   | Program ID                                      |
|-----------|-------------------------------------------------|
| mainnet   | `UMBRAD2ishebJTcgCLkTkNUx1v3GyoAgpTRPeWoLykh`  |
| devnet    | `DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ` |
| localnet  | local validator for unit tests                  |

The SDK resolves the correct program address automatically from the `network` param.

### Indexer endpoints — CONFIRMED (devnet differs from mainnet)

> ⚠️ The prompt-1 scaffold put `https://indexer.api.umbraprivacy.com` in `.env.local.example`.
> This is the wrong URL. The correct endpoints are:

| Network | Indexer endpoint |
|---------|-----------------|
| Mainnet | `https://utxo-indexer.api.umbraprivacy.com` |
| **Devnet** | `https://utxo-indexer.api-devnet.umbraprivacy.com` |

### Relayer endpoints — CONFIRMED

| Network | Relayer endpoint |
|---------|-----------------|
| Mainnet | `https://relayer.api.umbraprivacy.com` |
| **Devnet** | `https://relayer.api-devnet.umbraprivacy.com` |

---

## Client Construction — exact `getUmbraClient` signature

```typescript
import { getUmbraClient } from "@umbra-privacy/sdk";

const client = await getUmbraClient(args, deps?);
// Returns: Promise<IUmbraClient>
```

`getUmbraClient` is **async**.

### Required args

| Field | Type | Notes |
|-------|------|-------|
| `signer` | `IUmbraSigner` | Must implement `signTransaction`, `signTransactions`, `signMessage`, `address` |
| `network` | `"mainnet" \| "devnet" \| "localnet"` | Determines program IDs + Arcium endpoints |
| `rpcUrl` | `string` | HTTP JSON-RPC endpoint |
| `rpcSubscriptionsUrl` | `string` | WebSocket endpoint (same host as rpcUrl) |

### Optional args

| Field | Default | Notes |
|-------|---------|-------|
| `indexerApiEndpoint` | — | **Required for any mixer/UTXO usage.** Optional for encrypted-balance-only. |
| `deferMasterSeedSignature` | `false` | `false` = wallet prompted at construction; `true` = prompted on first operation |
| `offsets` | all `0n` | U512 key-rotation offsets for 7 key types |

### Optional deps (second argument)

| Dep | Notes |
|-----|-------|
| `accountInfoProvider` | Override RPC account fetcher |
| `blockhashProvider` | Override blockhash fetcher |
| `transactionForwarder` | Override tx broadcast (e.g. Jito) |
| `epochInfoProvider` | Override epoch info (Token-2022 fees) |
| `masterSeedStorage` | Override seed persistence (`load`, `store`, `generate`) |

> No client-level `commitment` param. Each factory call accepts per-call
> `accountInfoCommitment` and `epochInfoCommitment` (default: `"confirmed"`).

### IUmbraClient fields (read-only after construction)

```typescript
client.signer                       // IUmbraSigner
client.network                      // "mainnet" | "devnet" | "localnet"
client.networkConfig                // resolved program addresses + Arcium cluster config
client.accountInfoProvider          // pre-built RPC account fetcher
client.blockhashProvider            // pre-built blockhash fetcher
client.transactionForwarder         // pre-built tx broadcaster
client.epochInfoProvider            // pre-built epoch info (Token-2022)
client.masterSeed.getMasterSeed()   // async — derives + caches the 64-byte master seed
```

### Full devnet example

```typescript
const client = await getUmbraClient({
  signer,
  network: "devnet",
  rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL!,
  rpcSubscriptionsUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_SUBSCRIPTIONS_URL!,
  indexerApiEndpoint: "https://utxo-indexer.api-devnet.umbraprivacy.com",
  deferMasterSeedSignature: true,
});
```

---

## Wallet Adapter Integration

The SDK does **not** accept `@solana/wallet-adapter-react` adapters directly.
It uses the **Wallet Standard** interface.

### IUmbraSigner interface

```typescript
interface IUmbraSigner {
  readonly address: Address;
  signTransaction(tx: SignableTransaction): Promise<SignedTransaction>;
  signTransactions(txs: readonly SignableTransaction[]): Promise<SignedTransaction[]>;
  signMessage(message: Uint8Array): Promise<SignedMessage>;
}
```

### Production: Wallet Standard browser wallet

Install extra packages:

```bash
pnpm add @wallet-standard/app @wallet-standard/base @wallet-standard/features
```

```typescript
import { getWallets } from "@wallet-standard/app";
import { StandardConnect } from "@wallet-standard/features";
import { createSignerFromWalletAccount, getUmbraClient } from "@umbra-privacy/sdk";

const { get } = getWallets();
const solanaWallets = get().filter((w) => {
  const f = Object.keys(w.features);
  return f.includes("solana:signTransaction") && f.includes("solana:signMessage");
});

const wallet = solanaWallets[0]; // Phantom, Solflare, Backpack — all auto-discovered
const { accounts } = await wallet.features[StandardConnect].connect();
const account = accounts[0];

const signer = createSignerFromWalletAccount(wallet, account);
const client = await getUmbraClient({ signer, network: "devnet", ... });
```

### Testing: In-memory keypair

```typescript
import { createInMemorySigner } from "@umbra-privacy/sdk";
const signer = await createInMemorySigner();
```

### Bridging `@solana/wallet-adapter-react` → Umbra signer (Vest's pattern)

1. Use `useWallet()` to detect connection and get pubkey.
2. Use `getWallets()` from `@wallet-standard/app` to get raw Wallet Standard objects.
3. Match the `WalletAccount` whose `address` equals the connected pubkey.
4. Call `createSignerFromWalletAccount(wallet, account)`.
5. Recreate the Umbra client whenever the wallet address changes.

Both `"solana:signTransaction"` and `"solana:signMessage"` must be present on the wallet —
an error is thrown immediately if either is missing. Phantom, Solflare, and Backpack all support both.

---

## Registration Flow

Registration creates the on-chain `EncryptedUserAccount` PDA. **Idempotent** — checks on-chain
state first, skips completed steps. Each step that runs costs SOL.

### The three steps

| Step | On-chain action | Required when |
|------|----------------|---------------|
| 1 — Account init | Creates `EncryptedUserAccount` PDA | Always (first call) |
| 2 — X25519 key | Stores X25519 pubkey → enables Shared mode (local balance decryption) | `confidential: true` |
| 3 — User commitment | Stores Poseidon commitment via Groth16 ZK proof → enables mixer | `anonymous: true` |

### Full call

```typescript
import { getUserRegistrationFunction } from "@umbra-privacy/sdk";

const register = getUserRegistrationFunction({ client });
const signatures = await register({
  confidential: true,
  anonymous: true,
});
// signatures.length: 0 (already registered) | 1–3 (steps run)
```

### `anonymous: true` — why both sides need it for Vest

- **Founders** need `anonymous: true` to create UTXOs for beneficiaries.
- **Beneficiaries** need `anonymous: true` to claim UTXOs from the mixer.
- Always register with both `confidential: true, anonymous: true`.

### Check before registering

```typescript
import { getUserAccountQuerierFunction, getUserRegistrationFunction } from "@umbra-privacy/sdk";

const query = getUserAccountQuerierFunction({ client });
const result = await query(client.signer.address);

const isFullyRegistered =
  result.state === "exists" &&
  result.data.isUserAccountX25519KeyRegistered &&
  result.data.isUserCommitmentRegistered;

if (!isFullyRegistered) {
  const register = getUserRegistrationFunction({ client });
  await register({ confidential: true, anonymous: true });
}
```

### `getUserAccountQuerierFunction` — verified return shape

```typescript
const query = getUserAccountQuerierFunction({ client });
const result = await query(walletAddress); // can query any address

if (result.state === "non_existent") {
  // Not registered
} else {
  const { data } = result;
  data.isInitialised                      // Step 1 complete
  data.isUserAccountX25519KeyRegistered   // Step 2 complete (confidential)
  data.isUserCommitmentRegistered         // Step 3 complete (anonymous/mixer)
  data.isActiveForAnonymousUsage          // Steps 2 + 3 both complete and valid
  data.x25519PublicKey                    // Uint8Array | undefined
  data.userCommitment                     // bigint | undefined
  data.generationIndex                    // number
  data.randomGenerationSeed               // Uint8Array
}
```

### Registration options (full)

```typescript
await register({
  confidential?: boolean,              // default true
  anonymous?: boolean,                 // default true
  accountInfoCommitment?: Commitment,  // default "confirmed"
  epochInfoCommitment?: Commitment,    // default "confirmed"
  callbacks?: {
    userAccountInitialisation?: { pre, post },
    registerX25519PublicKey?: { pre, post },
    registerUserForAnonymousUsage?: { pre, post },
  }
});
```

Use `callbacks` to drive progress UI — step 3 (ZK proof) takes 2–8s in browser.

### Error handling

```typescript
import { isRegistrationError } from "@umbra-privacy/sdk/errors";

try {
  await register({ confidential: true, anonymous: true });
} catch (err) {
  if (isRegistrationError(err)) {
    switch (err.stage) {
      case "master-seed-derivation": // User rejected signMessage
      case "transaction-sign":       // User rejected tx
      case "zk-proof-generation":    // ZK proof failed (step 3 only)
      case "account-fetch":          // RPC error
      case "transaction-send":       // Confirmation timeout — may have landed
    }
  }
}
```

---

## Master Seed Derivation

The SDK signs a deterministic consent message (`UMBRA_MESSAGE_TO_SIGN`), hashes the signature
with KMAC256 (dkLen=64) to produce a 64-byte master seed.

```typescript
import { UMBRA_MESSAGE_TO_SIGN } from "@umbra-privacy/sdk";
```

- Fires once per client lifetime, then cached in memory.
- Default: in-memory only — lost on page reload (user signs again).
- Override with `deps.masterSeedStorage` to persist. `sessionStorage` is acceptable for
  hackathon; never use `localStorage` in plaintext for production.

---

## Supported Tokens

**Mainnet** (all SPL):

| Token | Mint | Confidential | Mixer |
|-------|------|:---:|:---:|
| USDC  | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | ✓ | ✓ |
| USDT  | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | ✓ | ✓ |
| wSOL  | `So11111111111111111111111111111111111111112` | ✓ | ✓ |
| UMBRA | `PRVT6TB7uss3FrUd2D9xs2zqDBsa3GbMJMwCQsgmeta` | ✓ | ✓ |

**Devnet USDC** — The docs don't list devnet mints explicitly. Working assumption:
`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (Solana's devnet USDC faucet mint).
Confirm by attempting a deposit — account-not-found = no Umbra pool for that mint on devnet.

---

## Pricing / Fees

### 1. Protocol fee (SPL token)

```typescript
import { BPS_DIVISOR } from "@umbra-privacy/sdk";
// BPS_DIVISOR = 16_384n  (2^14 — NOT 10_000)

// Current rate: 35 bps ≈ 0.2136%
const protocol_fee = (amount * 35n) / BPS_DIVISOR;
```

Self-deposit (public ATA → own encrypted balance) = **0 protocol fee**.
Fee applies to: withdrawals, cross-account transfers, UTXO creation, UTXO claims.

### 2. Relayer fee (at claim time)

Currently **0**.

### 3. Mixer SOL fee (at UTXO creation — one-time, non-refundable)

Covers treap node rent + claim compute costs. Dynamically calculated from current rent schedule.

| Operation | Protocol fee | Relayer fee | SOL fee |
|-----------|:-----------:|:-----------:|:-------:|
| Deposit (self, public → encrypted) | ✗ | ✗ | ✗ |
| Withdrawal (encrypted → public) | ✓ | ✗ | ✗ |
| UTXO creation | ✓ | ✗ | ✓ |
| UTXO claim | ✓ | ✓ (0 now) | ✗ |

---

## SDK Pattern — Factory Functions

```typescript
// Step 1: build the function (cheap, once at setup)
const deposit = getPublicBalanceToEncryptedBalanceDirectDepositorFunction({ client });

// Step 2: call at runtime (async, sends txs)
const result = await deposit(destinationAddress, mint, amount);
```

### Naming: `get[Source]To[Target][Verb]Function`

| Prefix/Suffix | Meaning |
|---------------|---------|
| `PublicBalance` | From/to public ATA |
| `EncryptedBalance` | From/to ETA |
| `ReceiverClaimableUtxo` | UTXO claimable by specified recipient |
| `SelfClaimableUtxo` | UTXO claimable only by creator |
| `Scanner` | Queries indexer for UTXOs |
| `Querier` | Reads on-chain state |

ZK provers are **never defaulted** — always supply in `deps`.

---

## Key SDK Calls for Vest

### Shield treasury (founder deposits into encrypted balance)

```typescript
import { getPublicBalanceToEncryptedBalanceDirectDepositorFunction } from "@umbra-privacy/sdk";

const deposit = getPublicBalanceToEncryptedBalanceDirectDepositorFunction({ client });
const result = await deposit(
  client.signer.address,
  USDC_MINT as Address,
  1_000_000n as U64,
);
// result.queueSignature / result.callbackSignature — both confirmed before return
```

### Create receiver-claimable UTXO (founder → beneficiary unlock)

```typescript
import { getPublicBalanceToReceiverClaimableUtxoCreatorFunction } from "@umbra-privacy/sdk";
import { getCreateReceiverClaimableUtxoFromPublicBalanceProver } from "@umbra-privacy/web-zk-prover";

const zkProver = getCreateReceiverClaimableUtxoFromPublicBalanceProver();
const createUtxo = getPublicBalanceToReceiverClaimableUtxoCreatorFunction(
  { client },
  { zkProver },
);

const signatures = await createUtxo({
  destinationAddress: beneficiaryWalletAddress as Address,
  mint: USDC_MINT as Address,
  amount: 500_000n as U64,
});
```

From shielded treasury: `getEncryptedBalanceToReceiverClaimableUtxoCreatorFunction`.

### Scan for claimable UTXOs (beneficiary discovers unlocks)

```typescript
import { getClaimableUtxoScannerFunction } from "@umbra-privacy/sdk";

const scan = getClaimableUtxoScannerFunction({ client });
const { received } = await scan(0 as U32, 0 as U32);
// received: ReceiverClaimableUtxo[] addressed to this wallet's X25519 key
```

### Claim a UTXO (beneficiary → encrypted balance)

```typescript
import {
  getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction,
  getUmbraRelayer,
} from "@umbra-privacy/sdk";
import { getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver } from "@umbra-privacy/web-zk-prover";

const relayer = getUmbraRelayer({
  apiEndpoint: "https://relayer.api-devnet.umbraprivacy.com",
});
const zkProver = getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver();

const claim = getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction(
  { client },
  { zkProver, relayer },
);
await claim([received[0]]);
```

### Query encrypted balance

```typescript
import { getEncryptedBalanceQuerierFunction } from "@umbra-privacy/sdk";

const query = getEncryptedBalanceQuerierFunction({ client });
const balances = await query([USDC_MINT as Address]);
const result = balances.get(USDC_MINT);
// result.state: "shared" | "mxe" | "uninitialized" | "non_existent"
// result.balance (when "shared"): decrypted MathU64
```

---

## Installation Summary

```bash
pnpm add @umbra-privacy/sdk
pnpm add @umbra-privacy/web-zk-prover
pnpm add @wallet-standard/app @wallet-standard/base @wallet-standard/features
```

**Do NOT install:** `tweetnacl`, `ed2curve`, or any custom crypto library.

Sub-path imports:

| Import | Contents |
|--------|----------|
| `@umbra-privacy/sdk` | Everything — standard usage |
| `@umbra-privacy/sdk/types` | Branded types (U64, U32, etc.) |
| `@umbra-privacy/sdk/interfaces` | Function type signatures for React state/context |
| `@umbra-privacy/sdk/constants` | `BPS_DIVISOR`, seeds, constants |
| `@umbra-privacy/sdk/errors` | `isRegistrationError`, `isEncryptedDepositError`, etc. |

WASM note for `@umbra-privacy/web-zk-prover` in Next.js — if WASM fails to load:

```js
// next.config.js
const nextConfig = {
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    return config;
  },
};
```

---

## Branded Types

```typescript
import type { U64, U32 } from "@umbra-privacy/sdk/types";
// All amounts: bigint as U64 (base units — 1 USDC = 1_000_000n as U64)
// Tree/insertion indices: number as U32
// All addresses/mints: Address (base58 string from @solana/kit)
```

---

## Vest Call Sequences

### Founder

```
1. getUmbraClient({ network: "devnet", indexerApiEndpoint: "https://utxo-indexer.api-devnet.umbraprivacy.com", deferMasterSeedSignature: true })
2. getUserAccountQuerierFunction → check registration
3. getUserRegistrationFunction → register({ confidential: true, anonymous: true })
4. getPublicBalanceToEncryptedBalanceDirectDepositorFunction → shield treasury
5. Per unlock: getEncryptedBalanceToReceiverClaimableUtxoCreatorFunction (+ zkProver) → UTXO
```

### Beneficiary

```
1. getUmbraClient({ network: "devnet", indexerApiEndpoint: "https://utxo-indexer.api-devnet.umbraprivacy.com", deferMasterSeedSignature: true })
2. getUserRegistrationFunction → register({ confidential: true, anonymous: true })
3. getClaimableUtxoScannerFunction → scan(0, 0)
4. getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction (+ zkProver + devnet relayer) → claim
```

---

## Open Questions (remaining)

1. **Devnet USDC mint** — Working assumption `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
   Confirm via a test deposit attempt.

2. **`@umbra-privacy/web-zk-prover` WASM in Next.js App Router** — Test when wiring the
   first UTXO flow (prompt 4). May need `asyncWebAssembly: true` in `next.config.js`.

3. **Master seed persistence** — In-memory default is acceptable for hackathon. For better UX,
   override `masterSeedStorage` with a `sessionStorage`-backed implementation.

4. **Devnet anonymity set** — Low traffic = weaker privacy guarantees. Acceptable for demo.

5. **Fee rates are on-chain** — `ProtocolFeesConfiguration` account holds live rates. For
   production, fetch dynamically rather than hardcoding 35 bps.

