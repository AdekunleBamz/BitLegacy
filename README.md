# BitLegacy

**The dead man's switch for Bitcoin.** No lawyers. No intermediaries. Just Clarity smart contracts on Stacks.

I built this because I kept reading about people losing access to their crypto after passing away. There's over $100 billion in Bitcoin that's just... gone. Wallets nobody can open, keys nobody wrote down. Your family can't call customer support on a blockchain.

BitLegacy is my answer to that. It's a trustless inheritance protocol: you lock your sBTC, name your heirs, and check in periodically to prove you're still around. If you stop checking in, your beneficiaries can claim their shares. Everything happens on-chain through Clarity contracts — no third party ever touches your funds.

**[Live Demo →](https://bitlegacy.vercel.app)** · **Built for Buidl Battle #2 (2026)**

## How it works

1. **Lock your sBTC.** Deposit into the estate vault, pick up to 5 beneficiaries with percentage shares, and set how long you can be inactive before the countdown triggers (anywhere from 7 days to 2 years).

2. **Check in regularly.** Hit the "I'm alive" button to reset your countdown. That's it — one transaction, done.

3. **If you go silent,** anyone can trigger the estate once the window expires. Your heirs connect their wallets and claim their share. If you set up guardians, 2 out of 3 trusted contacts have to confirm before funds are released.

4. **Optional extras:** You can write an encrypted will that is sealed separately for each heir's BitLegacy access key, deposit sBTC into the yield vault to earn while you wait, and gate estate lookups behind x402 micropayments.

## What's deployed

All three contracts are live on Stacks testnet (Clarity 4, Epoch 3.3):

| Contract | Testnet Address |
|----------|----------------|
| `estate-vault` | [`ST5K2RHMSBH4PAP4PGX77MCVNK1ZEED07EH98W0P.estate-vault`](https://explorer.hiro.so/txid/ST5K2RHMSBH4PAP4PGX77MCVNK1ZEED07EH98W0P.estate-vault?chain=testnet) |
| `guardian` | [`ST5K2RHMSBH4PAP4PGX77MCVNK1ZEED07EH98W0P.guardian`](https://explorer.hiro.so/txid/ST5K2RHMSBH4PAP4PGX77MCVNK1ZEED07EH98W0P.guardian?chain=testnet) |
| `sbtc-yield` | [`ST5K2RHMSBH4PAP4PGX77MCVNK1ZEED07EH98W0P.sbtc-yield`](https://explorer.hiro.so/txid/ST5K2RHMSBH4PAP4PGX77MCVNK1ZEED07EH98W0P.sbtc-yield?chain=testnet) |

The Next.js frontend is deployed at [bitlegacy.vercel.app](https://bitlegacy.vercel.app).

## The contracts

**`estate-vault.clar`** is where the core logic lives. Owners deposit sBTC, define beneficiaries with percentage shares (must total 100%), and set an inactivity window based on `stacks-block-time`. The contract handles creation, proof-of-life resets, triggering after the countdown expires, and per-heir claims with a 0.5% platform fee. It also stores a keccak256 hash of the estate for integrity verification and supports optional IPFS will CIDs.

**`guardian.clar`** adds a safety layer. Estate owners can optionally require 2-of-3 guardian confirmation before any heir can claim. Guardians are registered by the estate owner, and each guardian independently confirms release. The estate vault checks guardian status on every claim.

**`sbtc-yield.clar`** lets estate owners put their deposited sBTC to work. It's a simple yield vault with a simulated 3.5% APY — you can deposit, harvest yield without touching your principal, or withdraw everything. The yield is calculated based on elapsed time using `stacks-block-time`.

> **Note on yield:** The yield vault demonstrates sBTC composability. In production, the yield would come from an external DeFi source or treasury. Right now it's simulated — the contract calculates what you'd earn, but the actual sBTC for yield payments needs to come from the vault's balance.

## x402 integration

Estate lookups on the `/api/estate/[owner]` endpoint are gated behind the x402 payment protocol. When a client hits the API without a payment header, they get a `402` response with Stacks-native V2 headers describing the payment terms (0.01 STX on testnet by default).

The client opens a live STX wallet payment using the quoted amount, recipient, and memo, then retries with the signed transaction in the `payment-signature` header. The server verifies the signed transfer payload and the indexed Hiro transaction before it returns estate data along with a `payment-response` header.

This is relevant for the **x402 bounty** — the idea is that estate verification becomes a paid service, which is useful for privacy (you don't want free lookups on who has inheritance estates) and creates a revenue model for the protocol.

The full implementation is in `src/lib/x402.ts` (client + server helpers) and `src/app/api/estate/[owner]/route.ts` (the API route).

## sBTC usage

sBTC is the backbone of this whole thing. Every deposit, claim, cancellation, and yield operation moves sBTC through SIP-010 trait-based transfers with strict post-conditions (`PostConditionMode.Deny`). The estate vault holds sBTC in custody, the yield vault compounds it, and claims distribute it to beneficiaries.

This is relevant for the **sBTC bounty** — BitLegacy is probably the first inheritance protocol built natively around sBTC, and the yield vault shows how sBTC can be composed into DeFi primitives beyond simple transfers.

## Project structure

```
bitlegacy/
├── contracts/
│   ├── estate-vault.clar     # Core estate logic
│   ├── guardian.clar         # 2-of-3 guardian multisig
│   └── sbtc-yield.clar      # sBTC yield vault
├── tests/
│   └── estate-vault_test.ts  # 17 Clarinet unit tests
├── src/
│   ├── app/
│   │   ├── page.tsx           # Landing page
│   │   ├── create/            # 3-step estate creation wizard
│   │   ├── dashboard/         # Owner dashboard with yield vault
│   │   ├── claim/             # Heir claim portal (x402-gated)
│   │   ├── guardian/          # Guardian confirmation portal
│   │   ├── api/estate/        # x402-gated API route
│   │   └── api/will/          # Server-side encrypted will upload
│   ├── components/
│   │   └── ConnectWallet.tsx  # Leather / Xverse wallet connect
│   ├── hooks/
│   │   └── useWallet.ts       # Stacks wallet session hook
│   ├── lib/
│   │   ├── stacks.ts          # Contract reads + tx builders
│   │   ├── x402.ts            # x402 V2 client + server
│   │   └── ipfs.ts            # Per-heir encrypted will helpers
│   └── constants/
│       └── contracts.ts       # Addresses, network config
├── deployments/
│   ├── default.testnet-plan.yaml
│   ├── default.mainnet-plan.yaml
│   └── sbtc-yield.testnet-plan.yaml
├── Clarinet.toml
└── .env.example
```

## Running locally

```bash
git clone https://github.com/AdekunleBamz/BitLegacy
cd bitlegacy
npm install
cp .env.example .env.local
# edit .env.local with your contract address if needed

npm run verify          # contracts + lint + production build
npm run dev             # start dev server
```

## Deploying to mainnet

```bash
# 1. Update settings/Mainnet.toml with your mnemonic
# 2. Update deployments/default.mainnet-plan.yaml with your address
clarinet deployments apply --mainnet --no-dashboard

# 3. Update .env.local
NEXT_PUBLIC_NETWORK=mainnet
NEXT_PUBLIC_CONTRACT_ADDRESS=<your_mainnet_address>

# 4. Deploy frontend
vercel --prod
```

## Security notes

- All token-moving transactions enforce SIP-010 post-conditions with `PostConditionMode.Deny`
- Estate owners can cancel and reclaim their sBTC at any time before the estate is triggered
- Guardian confirmation is enforced at claim time — the estate vault calls into the guardian contract directly
- The `claimed` map prevents double-claiming: once an heir claims, they can't claim again
- The x402 API validates the signed transaction payload, memo, network, amount, recipient, and indexed Hiro transaction before returning estate data
- Encrypted wills are sealed separately for each beneficiary access key, and decryption happens in-app through the heir's BitLegacy session

## Tech stack

- **Stacks** (Bitcoin L2) — smart contract execution
- **Clarity 4** — `stacks-block-time`, `keccak256`, `to-consensus-buff?`
- **sBTC (SIP-010)** — Bitcoin-backed token for all custody + yield operations
- **x402** — HTTP micropayment protocol with Stacks V2 headers
- **IPFS (nft.storage)** — encrypted will storage
- **Next.js 14** — frontend (app router)  
- **stacks.js + @stacks/connect** — wallet integration (Leather, Xverse)

## Who I am

I'm Bamzz. I build on Bitcoin because I think the most important financial infrastructure should be open and trustless.

[@Bamzzz on Farcaster](https://warpcast.com/bamzzz) · [@hrh_mckay on Twitter](https://twitter.com/hrh_mckay) · [github.com/AdekunleBamz](https://github.com/AdekunleBamz)

bamzzstudio@gmail.com
