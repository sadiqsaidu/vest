# Umbra SDK — Implementation Notes

> Scaffolding reference for Vest. Compiled from `@umbra-privacy/sdk@4.0.0`
> README, TypeScript declarations (`dist/*.d.ts`), and the public docs site
> (`https://sdk.umbraprivacy.com`). The hosted docs were not reachable from the
> sandbox during scaffolding (`Host not in allowlist`), so anything below that
> is not directly reflected in the package types is flagged in **Open
> questions**. Re-confirm those against the live docs before relying on them.

## Network status (mainnet vs devnet — confirm current state)

The SDK's `Network` type accepts the values:

- `"mainnet"` — production
- `"devnet"` — development / testing
- `"localnet"` — local validator

Vest's scaffolding targets `devnet`. `NEXT_PUBLIC_SOLANA_NETWORK=devnet` and
the wallet adapter is configured to `WalletAdapterNetwork.Devnet`.

Per network the SDK resolves a hardcoded config at construction time
(`getNetworkConfig(network)` — program ID, MXE account, MXE X25519 public key,
Arcium program address, cluster offset, ALTs). If the network has no
deployment recorded the factory throws. Treat "is the protocol live on
devnet today?" as something to confirm by attempting `getUmbraClient({
network: "devnet", ... })` and watching for a config-missing error.

The companion indexer is hosted at `https://indexer.api.umbraprivacy.com`
(quickstart) or `https://indexer.umbraprivacy.com` (README example). Both
hostnames appear in different snippets — the env file uses the `.api.`
form. **Open question:** which is canonical for devnet vs mainnet.

## Client construction (exact getUmbraClient signature, required deps)

```ts
import { getUmbraClient } from "@umbra-privacy/sdk";

declare function getUmbraClient(
  args: GetUmbraClientArgs,
  deps?: GetUmbraClientDeps,
): Promise<IUmbraClient>;
```

`GetUmbraClientArgs` (required fields are `signer`, `network`, `rpcUrl`,
`rpcSubscriptionsUrl`):

| field                       | type                           | notes |
| --------------------------- | ------------------------------ | ----- |
| `signer`                    | `IUmbraSigner`                 | Required. `signMessage` is called once on first `getMasterSeed()`; the Ed25519 sig is Keccak-512 hashed to a 64-byte master seed cached in memory. `signTransaction` is called per on-chain op. |
| `network`                   | `"mainnet" \| "devnet" \| "localnet"` | Required. |
| `rpcUrl`                    | `string`                       | Required. HTTP JSON-RPC. |
| `rpcSubscriptionsUrl`       | `string`                       | Required. WSS endpoint for `signatureSubscribe`-based confirmation and MPC callback monitoring. |
| `indexerApiEndpoint`        | `string?`                      | Enables `fetchMerkleProof`, `fetchBatchMerkleProof`, `fetchUtxoData`. **Required for any UTXO discovery / claim flow.** |
| `versions`                  | `{ protocol?, algorithm?, scheme? }` | Override version specifiers (rare; only for upgrades or testing). |
| `offsets`                   | record of `U512`               | Used for key rotation. Default `0n` everywhere. |
| `deferMasterSeedSignature`  | `boolean?` (default `false`)   | If `true`, `getUmbraClient` resolves immediately and the wallet sign-message prompt fires lazily on first key derivation. Useful so connecting a wallet doesn't immediately demand a signature. |

`GetUmbraClientDeps` (all optional — every default is constructed from the
URLs above): `accountInfoProvider`, `blockhashProvider`,
`transactionForwarder`, `epochInfoProvider`, `computationMonitor`,
`masterSeedStorage` (`{ load, store, generate }` — by default in-memory and
lost on refresh; override to persist).

The returned `IUmbraClient` is a plain config object (not a class). Service
factories (`getUserRegistrationFunction`, deposit/withdraw/UTXO/etc.) all
take `{ client }` and return a callable function — the canonical two-step
pattern.

### Required peer / runtime dependencies

The SDK's own `dependencies` (transitively installed by pnpm) cover all
crypto and Solana primitives:

- `@noble/ciphers`, `@noble/curves`, `@noble/hashes`
- `@solana/kit` (the SDK is built on `@solana/kit`, not legacy
  `@solana/web3.js`)
- `@solana/wallet-standard-features`, `@wallet-standard/core`
- `@umbra-privacy/arcium-codama`, `@umbra-privacy/umbra-codama`,
  `@umbra-privacy/indexer-read-service-client`

We additionally need:

- `@umbra-privacy/web-zk-prover` — Groth16 prover for any UTXO create / claim
  operation in the browser. Not yet installed; add when we wire up the mixer
  in a later prompt.

We must **not** install our own crypto libs — Umbra owns all crypto.

## Wallet adapter integration

The SDK ships a Wallet-Standard signer adapter in `@umbra-privacy/sdk` (re-
exported from `solana/signers`):

```ts
import { createSignerFromWalletAccount, getUmbraClient } from "@umbra-privacy/sdk";

// from @wallet-standard/react useWallets() OR from @solana/react useWallet()
const signer = createSignerFromWalletAccount(wallet, account);
const client = await getUmbraClient({ signer, network: "devnet", rpcUrl, rpcSubscriptionsUrl });
```

Both `solana:signTransaction` and `solana:signMessage` features must be
present on the `Wallet`; otherwise `createSignerFromWalletAccount` throws
immediately.

Vest is using the older `@solana/wallet-adapter-react` (Phantom, Solflare,
Backpack — all wallet-standard-compatible). To use them with Umbra:

1. Connect a wallet through `WalletProvider` / `useWallet()` as usual.
2. To build the Umbra signer, retrieve the underlying Wallet-Standard
   `Wallet` + `WalletAccount` (each adapter's `wallet` accessor or via
   `useWallets()` from `@wallet-standard/react`).
3. Pass them to `createSignerFromWalletAccount`.

Other signer factories also exist: `getInMemorySigner` (test/scripting), and
adapters for `@solana/kit` `KeyPairSigner` instances. **Open question:** the
exact ergonomics of bridging `@solana/wallet-adapter-react` to a Wallet-
Standard `Wallet` — finalize in the prompt that introduces real Umbra calls.

## Registration flow (anonymous: true requirement for mixer)

```ts
import { getUserRegistrationFunction } from "@umbra-privacy/sdk";

const registerUser = getUserRegistrationFunction({ client });
await registerUser({ confidential: true, anonymous: true });
```

`UserRegistrationOptions`:

- `confidential?: boolean` (default `true`) — registers the user's X25519
  public key. Required to receive encrypted balances and use shared-mode
  token accounts. Skipped if already registered.
- `anonymous?: boolean` (default true based on quickstart usage; verify) —
  registers a user commitment for anonymous operations. **Required for any
  mixer / UTXO usage.** Skipped if already registered or if `false`.

Registration is idempotent — safe to call on every session start. Internally
it runs up to three steps in order:

1. `userAccountInitialisation` — creates the `EncryptedUserAccount` PDA.
2. `registerX25519PublicKey` — registers the X25519 pubkey (skipped if
   `confidential: false` or already done).
3. `registerUserForAnonymousUsage` — registers the anonymous commitment
   (skipped if `anonymous: false` or already done). This step does ZK
   work; expect it to be the slowest of the three.

Optional `UserRegistrationCallbacks` ({ pre, post }) fire around each step
— useful for UI progress.

**Vest implication:** every wallet that ever needs to claim from the mixer
(every beneficiary) must complete a registration call with `anonymous:
true`. Founders that only shield treasury into encrypted balances technically
only need `confidential: true`, but we should still register them with
`anonymous: true` so they can self-fund UTXOs for the cap table. Plan to
call registration on first wallet connect after the user opts in.

## Supported tokens (which mints are usable on devnet)

The README lists USDC mainnet mint
`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` in its example. Token-2022
mints are explicitly supported (`epochInfoProvider` exists for the
Token-2022 transfer-fee schedule).

The hosted "Supported tokens" page would enumerate the mainnet-allowlisted
mints and (presumably) the devnet equivalents. That page is not reachable
here — `NEXT_PUBLIC_USDC_MINT` is left blank in `.env.local.example` so it
can be filled with the devnet USDC mint once we confirm it on the docs.

**Working assumptions until verified:**

- Devnet USDC: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (Solana's
  official devnet USDC faucet mint). **Confirm with Umbra docs.**
- Vest will also want a non-USDC "team token" example for the demo — pick a
  Token-2022 mint on devnet from the supported list once read.

## Pricing / fees

The SDK exposes hardcoded fee providers:

- `getHardcodedDepositProtocolFeeProvider`
- `getHardcodedWithdrawalProtocolFeeProvider`
- `getHardcodedCreateUtxoProtocolFeeProvider`
- `getHardcodedClaimUtxoProtocolFeeProvider`
- `getHardcodedClaimUtxoRelayerFeeProvider`

Each provides a fee slab (basis-point-style, with `BPS_DIVISOR` exported)
that the SDK plugs into instructions. Helpers: `calculateFee`,
`feeSlabResultToInstructionFields`,
`protocolFeeSlabResultToInstructionFields`,
`relayerFeeSlabResultToInstructionFields`.

There is also `getUmbraRelayer` for relayed claims — relayers charge an
additional fee on top of the protocol fee (used so the receiver can claim
without holding SOL).

**Open question:** the actual fee values (bps + flat + caps per operation)
on the public pricing page. Surface fee preview UI in the relevant flows
once those numbers are confirmed.

## Open questions

- **Network status** — is the Umbra protocol fully deployed on devnet today,
  and is the indexer endpoint that we use the same on devnet and mainnet?
  Confirm `https://indexer.api.umbraprivacy.com` vs
  `https://indexer.umbraprivacy.com` (README and quickstart disagree).
- **Bridging `@solana/wallet-adapter-react` → `createSignerFromWalletAccount`**.
  Today `wallet-adapter-react` exposes a Wallet-Standard `Wallet` via the
  adapter's internal hooks but the cleanest production pattern would be to
  switch to `@wallet-standard/react` `useWallets()` directly. Decide before
  the first real Umbra call.
- **Devnet token allowlist** — fill `NEXT_PUBLIC_USDC_MINT` once the
  supported-tokens page can be read.
- **Pricing** — exact numbers for protocol and relayer fees per flow.
- **`anonymous: true` cost** — the ZK proof in step 3 of registration takes
  noticeable time; budget for a multi-second loading state on first
  connect, and expose `UserRegistrationCallbacks` to drive a 3-step
  progress UI.
- **ZK prover choice** — `@umbra-privacy/web-zk-prover` for browser. Confirm
  whether the WASM artifact has any bundling caveats with Next.js (likely
  needs `webpack.config.js` `asyncWebAssembly: true` or the `next.config`
  experimental flag).
- **Master-seed persistence** — default is in-memory and lost on refresh,
  meaning every page load forces a wallet sign-message. We probably want a
  `masterSeedStorage` override that encrypts the seed under a session-scoped
  WebCrypto key in `sessionStorage`. Decide policy before user testing.

