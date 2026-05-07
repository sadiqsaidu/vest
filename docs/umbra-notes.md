# Umbra SDK — Implementation Notes for Vest

> **Source of truth:** Compiled directly from sdk.umbraprivacy.com on 2026-05-07.
> Covers all pages needed for prompts 1–4. Each section references which
> pages were fetched. Do not merge with any earlier version of this file.

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
> This is wrong — the correct per-network endpoints are:

| Network | Indexer endpoint |
|---------|-----------------|
| Mainnet | `https://utxo-indexer.api.umbraprivacy.com` |
| **Devnet** | `https://utxo-indexer.api-devnet.umbraprivacy.com` |

> ⚠️ The indexer is NOT required to create UTXOs — only to discover and claim them.
> Omitting `indexerApiEndpoint` is valid for deposit-only flows.

### Relayer endpoints — CONFIRMED

| Network | Relayer endpoint |
|---------|-----------------|
| Mainnet | `https://relayer.api.umbraprivacy.com` |
| **Devnet** | `https://relayer.api-devnet.umbraprivacy.com` |

---

## Client Construction — exact `getUmbraClient` signature

> Source: sdk.umbraprivacy.com/sdk/creating-a-client

```typescript
import { getUmbraClient } from "@umbra-privacy/sdk";
const client = await getUmbraClient(args, deps?);
// Returns: Promise<IUmbraClient>
```

### Required args

| Field | Type | Notes |
|-------|------|-------|
| `signer` | `IUmbraSigner` | `signTransaction`, `signTransactions`, `signMessage`, `address` |
| `network` | `"mainnet" \| "devnet" \| "localnet"` | Determines program IDs + Arcium endpoints |
| `rpcUrl` | `string` | HTTP JSON-RPC endpoint |
| `rpcSubscriptionsUrl` | `string` | WebSocket endpoint |

### Optional args

| Field | Default | Notes |
|-------|---------|-------|
| `indexerApiEndpoint` | — | Required for mixer UTXO discovery/claim. NOT needed for deposit only. |
| `deferMasterSeedSignature` | `false` | `true` = wallet prompt deferred to first operation |
| `offsets` | all `0n` | U512 key-rotation offsets |

### Optional deps

`accountInfoProvider`, `blockhashProvider`, `transactionForwarder`, `epochInfoProvider`, `masterSeedStorage`

### IUmbraClient fields

```typescript
client.signer                       // IUmbraSigner
client.network                      // "mainnet" | "devnet" | "localnet"
client.networkConfig                // resolved program addresses + Arcium config
client.masterSeed.getMasterSeed()   // async — derives + caches 64-byte master seed
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

> Source: sdk.umbraprivacy.com/sdk/wallet-adapters

The SDK does NOT accept `@solana/wallet-adapter-react` adapters directly. Requires Wallet Standard.

### IUmbraSigner interface

```typescript
interface IUmbraSigner {
  readonly address: Address;
  signTransaction(tx: SignableTransaction): Promise<SignedTransaction>;
  signTransactions(txs: readonly SignableTransaction[]): Promise<SignedTransaction[]>;
  signMessage(message: Uint8Array): Promise<SignedMessage>;
}
```

### Production bridge (Wallet Standard)

```bash
pnpm add @wallet-standard/app @wallet-standard/base @wallet-standard/features
```

```typescript
import { getWallets } from "@wallet-standard/app";
import { StandardConnect } from "@wallet-standard/features";
import { createSignerFromWalletAccount } from "@umbra-privacy/sdk";

const { get } = getWallets();
const solanaWallets = get().filter((w) => {
  const f = Object.keys(w.features);
  return f.includes("solana:signTransaction") && f.includes("solana:signMessage");
});

const wallet = solanaWallets[0];
const { accounts } = await wallet.features[StandardConnect].connect();
const signer = createSignerFromWalletAccount(wallet, accounts[0]);
```

### Vest bridge pattern (`@solana/wallet-adapter-react` → Umbra signer)

1. Use `useWallet()` to detect connection and get pubkey.
2. Use `getWallets()` from `@wallet-standard/app` to enumerate Wallet Standard wallets.
3. Match by address: find the `WalletAccount` whose `address` equals the connected pubkey.
4. Call `createSignerFromWalletAccount(wallet, account)`.
5. Recreate the Umbra client when the wallet address changes.

---

## Registration Flow

> Source: sdk.umbraprivacy.com/sdk/registration, sdk.umbraprivacy.com/sdk/account-state

Registration is **idempotent** — safe to call every session. Each completed step is skipped.

### Three steps

| Step | Action | Trigger |
|------|--------|---------|
| 1 — Account init | Creates `EncryptedUserAccount` PDA | Always |
| 2 — X25519 key | Stores X25519 pubkey → enables Shared mode | `confidential: true` |
| 3 — User commitment | Poseidon commitment via Groth16 ZK proof → enables mixer | `anonymous: true` |

### Full call

```typescript
import { getUserRegistrationFunction } from "@umbra-privacy/sdk";

const register = getUserRegistrationFunction({ client });
const signatures = await register({
  confidential: true,   // required for encrypted balance querying
  anonymous: true,      // required for mixer — BOTH founders and beneficiaries
  callbacks: {
    userAccountInitialisation: {
      pre: async () => setStatus("Creating account…"),
      post: async (tx, sig) => setProgress(33),
    },
    registerX25519PublicKey: {
      pre: async () => setStatus("Registering encryption key…"),
      post: async (tx, sig) => setProgress(66),
    },
    registerUserForAnonymousUsage: {
      pre: async () => setStatus("Enabling anonymous mode…"),
      post: async (tx, sig) => setProgress(100),
    },
  },
});
```

### Check registration status

```typescript
import { getUserAccountQuerierFunction } from "@umbra-privacy/sdk";

const query = getUserAccountQuerierFunction({ client });
const result = await query(walletAddress);

if (result.state === "non_existent") {
  // Not registered at all
} else {
  const { data } = result;
  data.isInitialised                      // Step 1
  data.isUserAccountX25519KeyRegistered   // Step 2 (confidential)
  data.isUserCommitmentRegistered         // Step 3 (anonymous)
  data.isActiveForAnonymousUsage          // All three complete and valid
  data.x25519PublicKey                    // Uint8Array | undefined
  data.userCommitment                     // bigint | undefined
  data.generationIndex                    // bigint
}
```

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

```typescript
import { UMBRA_MESSAGE_TO_SIGN } from "@umbra-privacy/sdk";
```

- Fires once per client lifetime, cached in memory.
- In-memory default: lost on page reload (user signs again).
- Override with `deps.masterSeedStorage` for persistence.

---

## Supported Tokens

> Source: sdk.umbraprivacy.com/supported-tokens

**Mainnet** (all SPL):

| Token | Mint | Confidential | Mixer |
|-------|------|:---:|:---:|
| USDC  | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | ✓ | ✓ |
| USDT  | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | ✓ | ✓ |
| wSOL  | `So11111111111111111111111111111111111111112` | ✓ | ✓ |
| UMBRA | `PRVT6TB7uss3FrUd2D9xs2zqDBsa3GbMJMwCQsgmeta` | ✓ | ✓ |

**Devnet USDC** — working assumption: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
Confirm by attempting a deposit — `account-fetch` error = no pool for that mint on devnet.

---

## Pricing / Fees

> Source: sdk.umbraprivacy.com/pricing, sdk.umbraprivacy.com/sdk/deposit

### Self-deposit fee (public ATA → own encrypted balance)

**Zero protocol fees** for direct self-deposits. The deposit page explicitly states:
> "In most cases, direct deposits from your own ATA to your own encrypted balance carry zero
> protocol fees — the `baseFee` and `commissionBps` are both set to 0."

This is the primary operation for Vest's treasury shielding (Phase A). No protocol fee deducted.

### General fee formula (for non-zero fee pools)

```
credited = transferAmount - baseFee - floor((transferAmount - baseFee) * commissionBps / 10_000)
```

Note: The deposit page uses `commissionBps / 10_000`. The SDK also exports `BPS_DIVISOR = 16_384n`
(used for pool-level fee config, not the deposit fee formula). Do NOT conflate these — the deposit
formula divides by 10,000. Use the SDK's built-in fee calculation rather than hardcoding either.

### UTXO creation fees

Protocol fees ARE deducted from `amount` before the commitment is created. The net amount is what
the recipient receives when they claim.

### Mixer SOL fee (at UTXO creation — one-time, non-refundable)

Dynamically calculated from current Solana rent. Covers treap node rent + claim compute costs.

### Relayer fee (at claim time)

Currently **0**.

| Operation | Protocol fee | SOL fee |
|-----------|:-----------:|:-------:|
| Deposit (self, ATA → own encrypted balance) | ✗ | ✗ |
| UTXO creation | ✓ | ✓ |
| UTXO claim | ✓ | ✗ |

---

## Funding Flow APIs

> Source: sdk.umbraprivacy.com/sdk/deposit, /sdk/query, /sdk/conversion,
> /sdk/mixer/overview, /sdk/mixer/creating-utxos, /sdk/understanding-the-sdk/callbacks

---

### Phase A — Deposit (shield treasury into encrypted balance)

**Function:** `getPublicBalanceToEncryptedBalanceDirectDepositorFunction`

```typescript
import { getPublicBalanceToEncryptedBalanceDirectDepositorFunction } from "@umbra-privacy/sdk";

const deposit = getPublicBalanceToEncryptedBalanceDirectDepositorFunction({ client });

const result = await deposit(
  destinationAddress,   // Address — whose encrypted balance to credit (usually self)
  mint,                 // Address — SPL or Token-2022 mint
  transferAmount,       // bigint — gross amount in native units (U64)
  options?,             // optional
);
```

#### Options

| Option | Default | Notes |
|--------|---------|-------|
| `priorityFees` | `0n` | Microlamports — increase during network congestion |
| `purpose` | `0` | Reserved — leave at 0 |
| `optionalData` | zeros | 32-byte arbitrary metadata |
| `awaitCallback` | `true` | Wait for Arcium MPC callback before resolving |
| `skipPreflight` | `false` | Skip simulation — useful when preflight nodes are behind |
| `maxRetries` | — | RPC retry count |
| `accountInfoCommitment` | `"confirmed"` | Per-call commitment override |
| `epochInfoCommitment` | `"confirmed"` | Per-call epoch info commitment |
| `callbacks` | — | `{ pre, post }` — see Transaction Callbacks section |

#### Return value: `DepositResult`

```typescript
type DepositResult = {
  queueSignature: TransactionSignature;        // handler tx — always present
  callbackStatus?: "finalized" | "pruned" | "timed-out"; // present when awaitCallback: true
  callbackSignature?: TransactionSignature;    // present when callbackStatus === "finalized"
  callbackElapsedMs?: number;                 // present when awaitCallback: true
  rentClaimSignature?: TransactionSignature;  // rent reclaim tx (may be absent)
  rentClaimError?: Error;                     // if rent reclaim failed (deposit still OK)
};
```

> ⚠️ **`callbackStatus` can be `"pruned"` or `"timed-out"`** — not just `"finalized"`.
> Handle all three cases in the UI. `"pruned"` or `"timed-out"` means the MPC computation
> did not complete; the deposit handler fired but the balance may not yet be updated.

#### IMPORTANT: Deposit transactions are publicly visible

> The deposit page states explicitly: "Deposit transactions are publicly visible on-chain.
> The depositor's wallet address, the destination address, and the gross transfer amount are
> all readable from the transaction. Only the resulting encrypted balance is hidden — the act
> of shielding itself is not private."

This matters for Vest's user-facing copy: the treasury shield tx will be visible on Solscan
with the amount. Only subsequent UTXO creation hides who gets what and how much.

#### Deposit with callbacks

```typescript
const result = await deposit(destinationAddress, mint, amount, {
  callbacks: {
    pre: async (tx) => setStatus("Sending to private balance…"),
    post: async (tx, sig) => setStatus("Shield confirmed."),
  },
});
```

#### Error handling

```typescript
import { isEncryptedDepositError } from "@umbra-privacy/sdk/errors";

try {
  await deposit(destinationAddress, mint, amount);
} catch (err) {
  if (isEncryptedDepositError(err)) {
    switch (err.stage) {
      case "validation":        // Invalid args
      case "mint-fetch":        // Bad RPC / wrong mint address
      case "fee-calculation":   // Token-2022 fee calc failed
      case "account-fetch":     // Destination account not found / RPC error
      case "transaction-send":  // Submitted but confirmation failed — may have landed
      // other: pda-derivation, instruction-build, transaction-build,
      //        transaction-compile, transaction-sign, transaction-validate
    }
  }
}
```

---

### Query encrypted balance (Stage 2 verification)

**Function:** `getEncryptedBalanceQuerierFunction`

```typescript
import { getEncryptedBalanceQuerierFunction } from "@umbra-privacy/sdk";

const query = getEncryptedBalanceQuerierFunction({ client });
const balances = await query([USDC_MINT], options?);
// Returns: Map<Address, QueryEncryptedBalanceResult>

const result = balances.get(USDC_MINT);
switch (result?.state) {
  case "shared":        // result.balance: MathU64 — decrypted locally via X25519
  case "mxe":          // encrypted, cannot decrypt client-side
  case "uninitialized": // account PDA exists but balance not initialized
  case "non_existent": // no ETA for this mint
}
```

> If the balance is `"mxe"` after a deposit, it means X25519 key wasn't registered before
> the deposit. Call `getNetworkEncryptionToSharedEncryptionConverterFunction` to upgrade.
> For Vest (where we register first, then deposit), this should not happen.

#### Error handling

```typescript
import { isQueryError } from "@umbra-privacy/sdk/errors";
// err.stage: "pda-derivation" | "account-fetch" | "account-decode" |
//            "key-derivation" | "decryption" | "initialization"
```

Query functions do NOT throw on non-existent accounts — they return `{ state: "non_existent" }`.
Errors only indicate infrastructure failures.

---

### Conversion (MXE → Shared mode — defensive only)

**Function:** `getNetworkEncryptionToSharedEncryptionConverterFunction`

Only needed if a deposit was made BEFORE X25519 registration. For Vest (register first → deposit),
this should not occur, but add as a defensive check in the Stage 2 verification step.

```typescript
import { getNetworkEncryptionToSharedEncryptionConverterFunction } from "@umbra-privacy/sdk";

const convert = getNetworkEncryptionToSharedEncryptionConverterFunction({ client });
const result = await convert([USDC_MINT]);
// result.converted: Map<Address, TransactionSignature>
// result.skipped:   Map<Address, "non_existent" | "not_initialised" | "already_shared" | "balance_not_initialised">
```

Conversion is idempotent — `already_shared` mints are silently skipped.

---

### Phase B — Create receiver-claimable UTXOs

> ⚠️ **No batching.** Each UTXO is one separate transaction. Loop sequentially.

#### Choosing the source

For Vest: treasury has been shielded into encrypted balance (Phase A). Use the
**encrypted balance** source for stronger privacy (hides the treasury → UTXO link):

```
getEncryptedBalanceToReceiverClaimableUtxoCreatorFunction
```

If Phase A was skipped / failed and you want to fund from public ATA instead:

```
getPublicBalanceToReceiverClaimableUtxoCreatorFunction
```

#### Correct ZK prover names (verified from docs)

> ⚠️ The prover names follow the same naming convention as the factory functions.
> Earlier notes had incorrect names. Verified names:

```typescript
import {
  getEncryptedBalanceToReceiverClaimableUtxoCreatorProver, // for encrypted source
  getPublicBalanceToReceiverClaimableUtxoCreatorProver,    // for public source
  getEncryptedBalanceToSelfClaimableUtxoCreatorProver,
  getPublicBalanceToSelfClaimableUtxoCreatorProver,
} from "@umbra-privacy/web-zk-prover";
```

#### Full UTXO creation call (encrypted balance source — Vest primary path)

```typescript
import { getEncryptedBalanceToReceiverClaimableUtxoCreatorFunction } from "@umbra-privacy/sdk";
import { getEncryptedBalanceToReceiverClaimableUtxoCreatorProver } from "@umbra-privacy/web-zk-prover";

const zkProver = getEncryptedBalanceToReceiverClaimableUtxoCreatorProver();

const createUtxo = getEncryptedBalanceToReceiverClaimableUtxoCreatorFunction(
  { client },
  { zkProver },
);

const result = await createUtxo({
  destinationAddress: beneficiaryWalletAddress as Address,  // recipient (the unlocker)
  mint: USDC_MINT as Address,
  amount: 500_000n as U64,                                  // base units, fees deducted before commitment
});
```

#### Return type differs by source

| Source | Return type | MPC callback? |
|--------|------------|:-------------:|
| Encrypted balance | `CreateUtxoFromEncryptedBalanceResult` | ✓ (dual instruction) |
| Public balance | `CreateUtxoFromPublicBalanceResult` | ✗ (single tx) |

From-encrypted-balance is a dual-instruction operation (handler + Arcium MPC callback).
It takes longer. From-public-balance is a single tx and confirms faster.

#### Verify recipient registration BEFORE creating each UTXO

The recipient's X25519 key must be on-chain — the SDK uses it to encrypt the ciphertext.
Creating a UTXO for an unregistered recipient will fail at `account-fetch` stage.

```typescript
const recipientQuery = getUserAccountQuerierFunction({ client });
const recipientResult = await recipientQuery(beneficiaryWalletAddress);

if (
  recipientResult.state === "non_existent" ||
  !recipientResult.data.isUserAccountX25519KeyRegistered
) {
  // Surface error: "Beneficiary {label} has not registered with Umbra yet.
  // Ask them to connect their wallet at vest.app/claim."
  throw new Error(`Beneficiary not registered: ${beneficiaryWalletAddress}`);
}
```

#### UTXO creation with callbacks

```typescript
const result = await createUtxo(
  {
    destinationAddress: beneficiaryWalletAddress,
    mint,
    amount,
  },
  {           // <-- 2nd arg: options with callbacks
    callbacks: {  // Check TypeScript types — callback shape may differ by factory
      pre: async (tx) => updateProgress(i, "submitting"),
      post: async (tx, sig) => updateProgress(i, "confirmed"),
    },
  },
);
```

> ⚠️ **Callback shape discrepancy in docs**: The callbacks reference page shows UTXO creation
> using positional args `createUtxo(recipient, mint, amount, { createUtxo: {...} })`, but
> the Creating UTXOs page shows an object arg `createUtxo({ destinationAddress, mint, amount })`.
> Verify against TypeScript types at `node_modules/@umbra-privacy/sdk/dist/*.d.ts`. Use the
> object form as primary — it matches the dedicated API page.

#### Error handling for UTXO creation

```typescript
import { isCreateUtxoError } from "@umbra-privacy/sdk/errors";

try {
  const result = await createUtxo({ destinationAddress, mint, amount });
} catch (err) {
  if (isCreateUtxoError(err)) {
    switch (err.stage) {
      case "zk-proof-generation":
        // Most common failure. OOM in browser, or prover/circuit mismatch.
        // User-facing: "Failed to generate proof. Please try again."
        break;
      case "transaction-sign":
        // User rejected tx in wallet.
        break;
      case "account-fetch":
        // Recipient's on-chain account not found — likely not registered.
        // Or RPC connectivity issue.
        break;
      case "transaction-send":
        // ⚠️ DO NOT immediately retry. The tx may have landed.
        // First: scan recipient's UTXOs to check if the commitment was inserted.
        // Only retry if scan confirms no new UTXO.
        break;
      // other: initialization, validation, mint-fetch, fee-calculation,
      //        key-derivation, pda-derivation, instruction-build,
      //        transaction-build, transaction-compile, transaction-validate
    }
  }
}
```

> **Critical resilience note for Vest**: After `transaction-send` error, do NOT mark the
> schedule row as failed and immediately retry. First query the beneficiary's UTXO list to
> confirm whether the commitment was inserted. If yes, mark `utxo_created`. If no, retry.

---

## Transaction Callbacks

> Source: sdk.umbraprivacy.com/sdk/understanding-the-sdk/callbacks

```typescript
import type {
  TransactionCallbacks,
  PreTransactionCallback,
  PostTransactionCallback,
} from "@umbra-privacy/sdk/interfaces";

// Called with signed tx immediately before send
type PreTransactionCallback = (transaction: SignedTransaction) => Promise<void>;

// Called with signed tx and confirmed signature after landing
type PostTransactionCallback = (
  transaction: SignedTransaction,
  signature: TransactionSignature,
) => Promise<void>;
```

**Skipped steps do not invoke callbacks.** (e.g., already-registered steps during registration)

### Per-operation callback shapes

#### Deposit

```typescript
await deposit(destinationAddress, mint, amount, {
  callbacks: {
    pre: async (tx) => setStatus("Shielding…"),
    post: async (tx, sig) => setStatus("Shielded."),
  },
});
```

#### Registration

```typescript
await register({
  confidential: true,
  anonymous: true,
  callbacks: {
    userAccountInitialisation: { pre, post },
    registerX25519PublicKey: { pre, post },
    registerUserForAnonymousUsage: { pre, post },
  },
});
```

#### UTXO creation (verify exact shape against TypeScript types)

The callbacks page shows three slots: `createUtxo`, `createProofAccount`, `closeProofAccount`.
`closeProofAccount` only fires if a stale proof account was found and cleaned up.

---

## Mixer Architecture

> Source: sdk.umbraprivacy.com/sdk/mixer/overview

### 4 UTXO creation factory functions

| Function | Source | Unlocker (who claims) |
|----------|--------|----------------------|
| `getEncryptedBalanceToSelfClaimableUtxoCreatorFunction` | encrypted balance | creator |
| `getEncryptedBalanceToReceiverClaimableUtxoCreatorFunction` | encrypted balance | recipient |
| `getPublicBalanceToSelfClaimableUtxoCreatorFunction` | public ATA | creator |
| `getPublicBalanceToReceiverClaimableUtxoCreatorFunction` | public ATA | recipient |

**For Vest:** use `getEncryptedBalanceToReceiverClaimableUtxoCreatorFunction` — treasury was
already shielded (Phase A), and the beneficiary is the unlocker (not the founder).

### 3 roles per UTXO

- **Sender** — funded the UTXO, fixed the recipient at creation time
- **Unlocker** — burns the nullifier and releases tokens (chooses exit: public or encrypted)
- **Recipient** — final destination (set by sender, cannot be changed)

For receiver-claimable UTXOs, unlocker = recipient. The sender's involvement ends at creation.

### Indexer requirement

Indexer is only required for UTXO **discovery and claiming**. NOT for creating UTXOs.
`getClaimableUtxoScannerFunction` fails without `indexerApiEndpoint` in the client.

---

## Vest-Specific Call Sequences

### Founder flow (Prompt 4)

```
1. getUmbraClient({ network: "devnet", indexerApiEndpoint: devnet-indexer, deferMasterSeedSignature: true })
2. getUserAccountQuerierFunction → check full registration
3. getUserRegistrationFunction → register({ confidential: true, anonymous: true }) if needed
4. getPublicBalanceToEncryptedBalanceDirectDepositorFunction → shield treasury (Phase A)
   — capture result.queueSignature + result.callbackSignature
   — handle callbackStatus: "pruned" | "timed-out" as non-fatal, show warning
5. getEncryptedBalanceQuerierFunction → verify balance >= committed (Stage 2)
   — if state === "mxe", call getNetworkEncryptionToSharedEncryptionConverterFunction
6. getUserAccountQuerierFunction(beneficiaryWallet) → verify each recipient registered
   — surface error if not registered (don't skip silently)
7. Loop: getEncryptedBalanceToReceiverClaimableUtxoCreatorFunction (+ zkProver) per unlock row
   — persist after each success (PATCH /api/schedule/[id])
   — on transaction-send error: scan UTXOs before deciding to retry
   — on ZK proof error: surface retry UI
8. POST /api/cap-tables/[id]/activate → set shield_status='utxos_created'
```

### Beneficiary flow (Prompt 5)

```
1. getUmbraClient({ network: "devnet", indexerApiEndpoint: devnet-indexer, deferMasterSeedSignature: true })
2. getUserRegistrationFunction → register({ confidential: true, anonymous: true })
3. getClaimableUtxoScannerFunction → scan(0 as U32, 0 as U32)
4. Filter: only show UTXOs where unlock_timestamp <= now
5. getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction (+ zkProver + devnet relayer) → claim
```

---

## Installation Summary

```bash
pnpm add @umbra-privacy/sdk
pnpm add @umbra-privacy/web-zk-prover
pnpm add @wallet-standard/app @wallet-standard/base @wallet-standard/features
```

**Do NOT install:** `tweetnacl`, `ed2curve`, or any custom crypto library.

### WASM note for Next.js App Router

`@umbra-privacy/web-zk-prover` loads WASM. If WASM fails to load:

```js
// next.config.js
const nextConfig = {
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    return config;
  },
};
```

### Sub-path imports

| Import | Contents |
|--------|----------|
| `@umbra-privacy/sdk` | Everything |
| `@umbra-privacy/sdk/types` | Branded types (U64, U32, etc.) |
| `@umbra-privacy/sdk/interfaces` | Function type signatures for React context |
| `@umbra-privacy/sdk/constants` | `BPS_DIVISOR`, seeds, etc. |
| `@umbra-privacy/sdk/errors` | `isRegistrationError`, `isEncryptedDepositError`, `isCreateUtxoError`, `isQueryError`, `isConversionError` |

---

## Branded Types

```typescript
import type { U64, U32 } from "@umbra-privacy/sdk/types";
import type { Address } from "@solana/kit";

const amount = 1_000_000n as U64;   // 1 USDC (6 decimals) — always base units
const treeIndex = 0 as U32;
const mint = "EPjFWdd5..." as Address;
```

---

## Open Questions (remaining)

1. **Devnet USDC mint** — Working assumption: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
   Confirm by attempting a deposit — `account-fetch` error = no Umbra pool for that mint on devnet.

2. **ZK prover WASM in Next.js App Router** — May need `asyncWebAssembly: true`. Test when wiring
   UTXO creation in prompt 4. ZK proof generation (1–5s) should run in a Web Worker to avoid
   blocking the main thread — consider this for UX.

3. **UTXO creation callback shape** — The callbacks reference page shows positional args; the
   Creating UTXOs page shows an object arg. Verify against TypeScript declarations before
   implementing progress hooks.

4. **`callbackStatus: "pruned" | "timed-out"` handling** — Decide policy: treat as soft failure
   (show warning, allow continue) or hard failure (halt, require retry). Recommended: soft
   failure for treasury shield (Phase A), since balance may still be valid on next query.

5. **Beneficiary registration enforcement** — Vest has no on-chain mechanism to require
   registration before a UTXO is created. The UI must check registration client-side and
   surface a message ("ask your beneficiary to register at vest.app/claim") before dispatching.

6. **Devnet anonymity set** — Low traffic = weaker privacy. Acceptable for hackathon demo.

7. **Master seed persistence** — In-memory default acceptable for hackathon. Override
   `masterSeedStorage` with sessionStorage-backed implementation for better UX.

8. **Fee rates are on-chain** — `ProtocolFeesConfiguration` holds live rates. For production,
   fetch dynamically rather than hardcoding.

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

---

## Claim flow APIs

> Source pages (verified verbatim from the user-supplied umbra.txt extract):
> - https://sdk.umbraprivacy.com/sdk/mixer/fetching-utxos
> - https://sdk.umbraprivacy.com/sdk/mixer/claiming-utxos
> - https://sdk.umbraprivacy.com/sdk/mixer/privacy-analysis
>
> Function signatures and result shapes additionally cross-checked against
> `node_modules/@umbra-privacy/sdk/dist/*.d.ts` from the installed v4.0.0 SDK.

### `getClaimableUtxoScannerFunction` — what it returns

**Verified signature** (from `client-Cqv_5hHQ.d.ts`):

```typescript
type ClaimableUtxoScannerFunction = (
  treeIndex: U32,
  startInsertionIndex: U32,
  endInsertionIndex?: U32,
) => Promise<ScannedUtxoResult>;
```

> ⚠️ Three U32 args, not two. The earlier scaffold's `scan(0 as U32, 0 as U32)` is
> equivalent to `(treeIndex=0, startInsertionIndex=0, endInsertionIndex=undefined)` —
> "scan all of tree 0 from the start". Pagination uses `result.nextScanStartIndex`
> as the next call's `startInsertionIndex`.

**Return shape** — already-decrypted UTXOs grouped by source/unlocker type:

```typescript
interface ScannedUtxoResult {
  selfBurnable:       ScannedUtxoData[]; // encrypted-balance source, you create+claim
  received:           ScannedUtxoData[]; // encrypted-balance source, sent to you  ← Vest beneficiary
  publicSelfBurnable: ScannedUtxoData[]; // public-balance source, you create+claim
  publicReceived:     ScannedUtxoData[]; // public-balance source, sent to you
  nextScanStartIndex: U32;               // resume cursor
}

type ScannedUtxoData = DecryptedUtxoData;
```

`ScannedUtxoData` is the **decrypted** UTXO with `amount: U64`, `destinationAddress`,
`commitmentIndex`, `leafIndex`, sender address halves, mint address halves, timestamp,
pool volume, etc. **No Merkle proofs** at scan time — the SDK fetches proofs internally
when `claim()` is called. Pass entries directly to the claim factory.

Decryption: SDK derives the user's X25519 private key from the master seed, then
attempts to decrypt every ciphertext returned by the indexer. Successfully decrypted
ciphertexts surface as scanned UTXOs; failures are silently filtered (those weren't
addressed to this wallet).

**Error stages** (`isFetchUtxosError`): `initialization | validation | key-derivation
| indexer-fetch | proof-fetch`. Empty `received: []` is **not** an error.

### Beneficiary registration — required for receiver claims

The receiver-claim ZK circuit proves "knowledge of your user commitment", which is
established only by `register({ confidential: true, anonymous: true })`. Specifically:

| Field on `EncryptedUserAccount`   | Set by                          | Required for receiving | Required for claiming |
|-----------------------------------|---------------------------------|:----------------------:|:---------------------:|
| `isUserAccountX25519KeyRegistered`| `confidential: true`            | ✓ (sender encrypts to it) | ✓                  |
| `isUserCommitmentRegistered`      | `anonymous: true`               |                        | ✓                     |
| `isActiveForAnonymousUsage`       | both above                      |                        | ✓                     |

> Beneficiaries **must register with `anonymous: true`** before they can claim, even
> though sender-side enforcement at UTXO creation only checks the X25519 key. Auto-trigger
> registration as the first step of the claim flow if the user isn't fully active for
> anonymous usage; do not show a separate registration page.

### Claim factories — only 3 in v4.0.0 (no receiver→public direct claim)

```typescript
// SDK exports — confirmed from index.d.ts:
getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction  // ← receiver UTXO → ETA
getSelfClaimableUtxoToEncryptedBalanceClaimerFunction       // self UTXO → ETA
getSelfClaimableUtxoToPublicBalanceClaimerFunction          // self UTXO → ATA
// NOTE: there is NO getReceiverClaimableUtxoToPublicBalanceClaimerFunction.
```

> ⚠️ For Vest beneficiaries (recipients of receiver-claimable UTXOs) who want tokens
> in their public ATA, a **direct receiver→public claim is not supported by the SDK**.
> The path is two-step:
>
> 1. `getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction` → claim into ETA
> 2. `getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction` → withdraw ETA → ATA
>
> This is also the privacy-recommended path per Umbra's hybrid-model docs: aggregating
> multiple UTXOs into the encrypted balance hides per-UTXO amounts before they exit.

#### Claim signature + return value

```typescript
const zkProver = getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver(); // from web-zk-prover
const relayer = getUmbraRelayer({
  apiEndpoint: "https://relayer.api-devnet.umbraprivacy.com",
});

const claim = getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction(
  { client },
  { zkProver, relayer },
);

const result: ClaimUtxoIntoEncryptedBalanceResult = await claim(utxos /*, optionalData? */);
// utxos: readonly ScannedUtxoData[] — pass scan().received directly.
```

`ClaimUtxoIntoEncryptedBalanceResult.batches` is a `Map<U32, ClaimBatchResult>` — the
SDK auto-batches up to **4 UTXOs per relayer batch**. Each `ClaimBatchResult` carries:

```typescript
{
  requestId: string;
  status: ClaimStatus;          // terminal — completed | failed | timed_out
  txSignature?: string;         // present when completed
  callbackSignature?: string;   // present when completed
  utxoIds?: readonly string[];  // "treeIndex:leafIndex" — bridge to other scan results
  failureReason?: string | null;
}
```

Yes, batching IS supported via the array argument; the SDK splits batches of >4 into
multiple relayer requests but a single `claim()` call covers them all.

#### Withdraw signature (step 2 of the public-ATA path)

```typescript
const withdraw = getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction({ client });
const result: WithdrawResult = await withdraw(
  destinationAddress,           // beneficiary's own wallet address
  mint,
  withdrawalAmount as U64,
  // options? — { priorityFees, awaitCallback, ... } — same shape as deposit
);
```

`WithdrawResult` is identical in shape to `DepositResult`: `queueSignature`,
`callbackStatus` ("finalized" | "pruned" | "timed-out"), `callbackSignature?`. Same
"pruned/timed-out" handling rules apply.

### Claim error handling — `isClaimUtxoError`

```typescript
type ClaimUtxoStage =
  | "initialization" | "validation" | "key-derivation"
  | "zk-proof-generation"
  | "pda-derivation" | "instruction-build" | "transaction-build"
  | "transaction-compile" | "transaction-sign"
  | "transaction-validate"   // ← stale Merkle proof — re-scan and retry
  | "transaction-send";      // ← may have landed; verify on-chain before retry
```

Special cases:
- `transaction-validate` typically means a stale Merkle proof. Re-call the scanner and
  retry the claim.
- `transaction-send` means the relayer accepted the tx but confirmation timed out. The
  nullifier may already be burned; check on-chain before retrying.

### Privacy implications for "claim to public" — UI warning copy

From the Privacy Analysis page, **Encrypted Balance → Receiver-claimable → ATA** is
Tier 2 (mixed). At burn time the chain reveals:

- The claimed amount
- The destination ATA (== beneficiary's wallet)

Hidden:

- The deposited amount (treasury shield is visible separately, but the per-UTXO carve-up
  is not)
- The depositor identity at burn time
- Any direct on-chain link from the visible claim back to the original deposit

UI copy: "Funds will arrive at your connected wallet ({addr}). Because this is a public
withdrawal, the destination and amount are visible on-chain — but the link back to the
original deposit is hidden."

Tier 1 (encrypted → encrypted) hides amounts at both ends and is the "preferred" path
per Umbra docs. v2 of Vest can offer "claim privately" (stop after step 1) as an option.

### Proof generation timing (UX copy reference)

From the Claiming UTXOs page: "Proof generation is CPU-intensive and may take **1–5
seconds**. Consider showing a progress indicator while it runs." Plan UI accordingly:
indeterminate progress for the proof phase, then per-batch completion ticks.

### DB cross-reference — practical key for Vest

The scanner returns `commitmentIndex` and `leafIndex` per UTXO; the relayer's
`utxoIds` come back formatted as `"treeIndex:leafIndex"`. Neither is known at UTXO
creation time (the sender doesn't see the inserted leaf index until the indexer picks
it up), so we cannot persist this as the bridge.

For Vest v1, match `unlock_schedule` rows ↔ scanner UTXOs by:

1. Filter `unlock_schedule` to `beneficiary_wallet = me AND status = 'utxo_created'`.
2. Sort by `unlock_timestamp ASC` (insertion order on our side).
3. Sort `scan().received` by `commitmentIndex ASC` (insertion order on chain).
4. Pair positionally; surplus scanner UTXOs render as "Direct payment" cards.

This is fragile if multiple senders fund the same beneficiary in interleaved order, but
fine for the demo. v2 should write `treeIndex:leafIndex` back to the row after the
indexer surfaces it.


---

## Viewing keys verified

> Source pages (verified verbatim from the user-supplied umbra.txt extract):
> - https://sdk.umbraprivacy.com/sdk/compliance
> - https://sdk.umbraprivacy.com/sdk/compliance-viewing-keys
> - https://sdk.umbraprivacy.com/sdk/compliance-x25519-grants
>
> Cross-checked against `node_modules/@umbra-privacy/sdk` v4.0.0 source:
> - `getMasterViewingKeyDeriver`, `getMintViewingKeyDeriver`,
>   `getYearlyViewingKeyDeriver`, `getMonthlyViewingKeyDeriver`,
>   `getDailyViewingKeyDeriver`, `getHourlyViewingKeyDeriver`,
>   `getMinuteViewingKeyDeriver`, `getSecondViewingKeyDeriver`
> - Branded types: `MasterViewingKey | MintViewingKey | YearlyViewingKey |
>   MonthlyViewingKey | DailyViewingKey | ...` — all `Bn254FieldElement`
>   sub-brands → `bigint` at runtime.
> - Branded types `Year`, `Month`, `Day` (etc.) from
>   `@umbra-privacy/sdk/types` are `TimestampComponent` sub-brands.

### 1. MVK derivation — IS auto-derived from the master seed

Master Viewing Key derivation uses `getMasterViewingKeyDeriver({ client })`,
which internally pulls the master seed (cached on the client). It does NOT
prompt the wallet again **if the master seed was already derived earlier in
the session** (via registration, deposit, etc.). On a fresh page load with
`deferMasterSeedSignature: true`, the MVK derivation will trigger the
`UMBRA_MESSAGE_TO_SIGN` prompt the first time it runs.

For Vest, this means a founder who has already shielded a treasury (or
created UTXOs) can derive viewing keys with **no extra wallet prompts** in
the same session. After page reload, the first viewing key generation in a
session triggers one signMessage prompt.

### 2. Exact SDK signatures (from TypeScript declarations)

```typescript
type MasterViewingKeyDeriverFunction =
  () => Promise<MasterViewingKey>;
type MintViewingKeyDeriverFunction =
  (mint: Address, options?: ViewingKeyGeneratorOptions)
    => Promise<MintViewingKey>;
type YearlyViewingKeyGeneratorFunction =
  (mint: Address, year: Year, options?: ViewingKeyGeneratorOptions)
    => Promise<YearlyViewingKey>;
type MonthlyViewingKeyGeneratorFunction =
  (mint: Address, year: Year, month: Month, options?: ViewingKeyGeneratorOptions)
    => Promise<MonthlyViewingKey>;
```

> ⚠️ **Yearly and Monthly keys both require a `mint`.** The hierarchy
> documented as `MVK → Mint → Year → Month` in the docs page chained
> diagrams is the actual derivation path. There is no "all-tokens yearly
> key" — yearly is always under a specific mint. A "tax year for all
> tokens" audit needs N yearly keys (one per mint).
>
> Vest's UI must reflect this: the "Yearly" and "Monthly" scopes pick a
> mint AND a time period. We default the mint to the cap table's mint
> (single-mint cap tables today) — when we add multi-mint cap tables, the
> generator must allow multi-key bundles.

### 3. Format

All keys are BN254 field elements (252-bit) materialized as `bigint`
sub-brands. For Vest's storage and display:

- **Decimal export**: `key.toString()` — lossless.
- **Hex export**: `"0x" + key.toString(16).padStart(64, "0")` — 32-byte
  big-endian, 0-padded (the prompt's preferred format).
- **Bytes** (for envelope encryption-at-rest): `BigInt → 32-byte BE buffer`.
  Re-import with `BigInt("0x" + Buffer.from(bytes).toString("hex"))`.

### 4. Auditor-side scanning — NOT in v4.0.0 SDK

The compliance-viewing-keys page closes with:

> "SDK utilities for auditors to scan the mixer pool and decrypt UTXO
> ciphertexts using viewing keys are on the roadmap. The key generation
> and export functionality described on this page is available today."

There is **no** `client.scanWithViewingKey(...)` and no analogue. Confirmed
by exhaustive grep over `node_modules/@umbra-privacy/sdk/dist/index.d.ts`:
the only scanner is `getClaimableUtxoScannerFunction`, which decrypts via
the wallet's own X25519 private key (not viewing keys).

#### Vest workaround for v1 demo

The Vest cap-table mirror in Supabase already holds:
- The full schedule (beneficiary, amount, unlock time, mint).
- The treasury shield tx signature.
- Per-row UTXO creation tx signatures.
- Per-row claim tx signatures + claim timestamps.

For the auditor experience we render this mirror, **scoped by the viewing
key's domain**, and surface the actual on-chain anchors (shield tx,
commitment) for the auditor to verify out-of-band on Solscan. The viewing
key bytes themselves are displayed too, so any party who later builds an
on-chain scanner against the Umbra mixer can re-verify our cleartext
mirror against the chain.

We document this honestly in the audit footer: "Generated by Vest from a
viewing key issued by {founder}. Underlying transactions anchored on
Solana via the Umbra mixer." The viewing key proves the founder authorized
this scope of disclosure; the on-chain commitment lets any third party
cryptographically verify our mirror once Umbra ships the auditor scanner.

### 5. Combining scopes — chained derivation, not intersection

From the page's "How Key Derivation Works" section:

```
MintViewingKey(mint)            = Poseidon(MVK, mint_lo, mint_hi)
YearlyViewingKey(mint, year)    = Poseidon(MintViewingKey(mint), year)
MonthlyViewingKey(mint, y, m)   = Poseidon(YearlyViewingKey(mint, y), m)
```

So "USDC for 2025" is *one* yearly key, not two. The hierarchy is strictly
one-directional and a parent is needed to derive any child. A grantee with
the monthly Feb-2025 USDC key cannot derive the yearly 2025 USDC key, and
cannot read any other mint's activity.

For Vest's UX: when a founder picks "Yearly" with mint USDC and year 2025,
we call `getYearlyViewingKeyDeriver({ client })(USDC_MINT, 2025n as Year)`.
For "Monthly", the additional `month` param is required.

### 6. X25519 compliance grants — defer to v2

The X25519 grant flow (`getComplianceGrantIssuerFunction`,
`getComplianceGrantRevokerFunction`, `getUserComplianceGrantQuerierFunction`,
`getSharedCiphertextReencryptorForUserGrantFunction`) is a **separate**
mechanism — it re-encrypts ETA ciphertexts under a grantee's X25519 key
via Arcium MPC. It targets encrypted-balance disclosure, not mixer UTXOs.

Vest v1 ships only the mixer-pool viewing keys (above). v2 can layer
X25519 grants for "share my live encrypted balance with my CFO" use cases.

> ⚠️ Critical note from docs: Rescue is a stream cipher; once a grantee
> has obtained any re-encryption for a given nonce, they can derive the
> keystream for that nonce and read **every** ciphertext encrypted under
> the same nonce — past and future. Treat each nonce as a permanent
> per-disclosure scope. Use a fresh nonce per grant.

### 7. Vest-specific design decisions

#### Key envelope (encryption-at-rest, application-layer)

The viewing key bytes never touch the DB in plaintext. Flow:

1. Server `POST /api/viewing-keys/prepare`:
   - Generates `access_token` = 32 random bytes, encoded `vk_<base58>`.
   - Generates `envelope_id` = uuid.
   - Inserts a placeholder row with `status='pending'`, `cap_table_id`,
     `recipient_label`, `scope`, `scope_params`, `expires_at`.
   - Returns `{ access_token, envelope_id }`.
2. Client derives the viewing key in-browser via SDK.
3. Client wraps it: `aes_key = HKDF(token_bytes, salt="vest:vk:v1",
    info=envelope_id, len=32)`, `payload = AES-GCM(aes_key, vk_bytes)`.
4. Client `POST /api/viewing-keys/finalize`:
   - Body `{ envelope_id, encrypted_key_payload }`.
   - Server stores payload, sets `status='active'`, returns
     `{ audit_url }`.
5. Founder shares `audit_url` (which contains the access_token) +/-
   the raw `access_token` via secure channel.

DB is breach-resistant: without the access_token (only ever distributed
out-of-band), the encrypted payload is opaque AES-GCM ciphertext.

#### Revocation semantics

Revoking sets `revoked_at`. The decrypt API returns 410 thereafter. As
the docs note (compliance-overview):

> "Revoking a compliance grant prevents future re-encryption requests but
> does not invalidate ciphertexts already re-encrypted."

Vest's revocation is application-level, not cryptographic — anyone who
already pulled the envelope before revocation still has the bytes and
could continue to use them off-platform. We surface this honestly in the
revocation UI.

#### Expiration

`expires_at` is enforced by the Vest backend (decrypt returns 410 if
past). Umbra's own viewing keys are derived deterministically and have
no on-chain expiration — anyone who held them yesterday holds them
forever, off-platform. Same caveat as revocation.

#### Yearly/monthly mint default

Vest cap tables today are single-mint, so "yearly" and "monthly" scopes
default the mint silently to the cap table's mint. The modal still shows
"Mint: USDC" so the auditor receiver knows what they're getting.

