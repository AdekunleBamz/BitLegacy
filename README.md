# BitLegacy — Bitcoin Inheritance Protocol

> The first trustless, on-chain Bitcoin inheritance protocol built on Stacks.
> Dead man's switch for Bitcoin. No lawyers. No intermediaries. Just Clarity.

**[Live Demo](https://bitlegacy.vercel.app)** · **[Contract on Explorer](https://explorer.hiro.so)** · **Built for Buidl Battle #2 2026**

---

## The Problem

Over **$100 billion** in Bitcoin is permanently inaccessible because owners died without a succession plan. Crypto has no probate system — no will survives on-chain, no lawyer can transfer keys, no court can compel a wallet to release funds.

BitLegacy solves this with a dead man's switch: if you stop checking in, your sBTC automatically flows to your heirs.

---

## How It Works

1. **Owner** deposits sBTC into `estate-vault.clar`, names up to 5 beneficiaries with percentage shares, sets an inactivity window (7–90 days), and optionally uploads an encrypted will to IPFS
2. **Every month**, the owner calls `proof-of-life` to reset the countdown
3. **If they stop checking in**, anyone can call `trigger-estate` once the window lapses
4. **Heirs** call `claim-inheritance` from their beneficiary wallet once the estate is triggered
5. **Guardians** (optional 2-of-3 multisig via `guardian.clar`) must confirm release before claims unlock for guardian-protected estates

---

## Current Status

- `clarinet check` passes for all three contracts (estate-vault, guardian, sbtc-yield)
- SIP-010 post-conditions enforce sBTC transfer limits on all token-moving transactions
- The Next.js app is set up for production build validation via `npm run build`
- Guardian confirmation is enforced directly during claims
- sBTC yield vault enables estate owners to earn passive yield on deposited sBTC
- Estate lookup API now speaks Stacks-native x402 V2 headers: `payment-required`, `payment-signature`, `payment-response`
- The default x402 path is **Stacks testnet + STX**, with `sBTC` and mainnet selectable via env config
- Browser-side signing remains demo-mode until a facilitator-backed signer is wired end to end

---

## x402 Integration (Bounty)

Estate lookup API calls (`/api/estate/[owner]`) are gated behind Stacks-native x402 V2 micropayment responses. The default configuration quotes **0.01 STX on testnet** per verification query, and can be switched to `sBTC` or mainnet through env config.

Flow:
1. Client calls `GET /api/estate/:owner` with no payment header
2. Server returns `402` plus a base64-encoded `payment-required` header describing the payment terms
3. Client signs or simulates a Stacks payment payload for retry
4. Client retries with `payment-signature: base64(payload)`
5. Server validates the payload and, when a facilitator is configured, forwards it to `/settle` before returning estate data + `payment-response`

See `src/lib/x402.ts` and `src/app/api/estate/[owner]/route.ts` for full implementation.

---

## Project Structure

```
bitlegacy/
├── contracts/
│   ├── estate-vault.clar     # Core estate logic (Clarity 4)
│   ├── guardian.clar         # 2-of-3 guardian multisig
│   └── sbtc-yield.clar      # sBTC yield vault (3.5% APY)
├── settings/
│   ├── Devnet.toml           # Clarinet devnet config
│   ├── Testnet.toml          # Clarinet testnet config
│   └── Mainnet.toml          # Clarinet mainnet config
├── tests/
│   └── estate-vault_test.ts  # Clarinet unit tests
├── src/
│   ├── app/
│   │   ├── page.tsx           # Landing / hero
│   │   ├── dashboard/         # Owner portal
│   │   ├── create/            # Estate creation wizard
│   │   ├── claim/             # Heir claim portal (x402-gated estate lookup)
│   │   ├── guardian/          # Guardian confirmation portal
│   │   └── api/estate/        # x402 backend route
│   ├── components/
│   │   └── ConnectWallet.tsx  # Leather / Xverse wallet connect
│   ├── hooks/
│   │   └── useWallet.ts       # Stacks wallet session hook
│   ├── lib/
│   │   ├── stacks.ts          # All on-chain reads + tx builders
│   │   ├── x402.ts            # x402 client + server helpers
│   │   └── ipfs.ts            # AES-256-GCM will encryption + IPFS upload
│   └── constants/
│       └── contracts.ts       # Contract addresses, network config
├── Clarinet.toml
├── .env.example
└── README.md
```

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/AdekunleBamz/BitLegacy
cd bitlegacy
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your contract address and x402 settings

# 3. Check contracts
clarinet check

# 4. Verify the frontend build
npm run build

# 5. Start frontend
npm run dev
```

---

## Deploy to Mainnet

```bash
# 1. Deploy contracts
clarinet deployments apply --mainnet

# 2. Update .env.local
NEXT_PUBLIC_NETWORK=mainnet
NEXT_PUBLIC_CONTRACT_ADDRESS=<your_mainnet_address>

# 3. Deploy frontend
vercel --prod
```

---

## Contract Addresses

| Contract | Network | Address |
|----------|---------|---------|
| `estate-vault` | Testnet | [`ST5K2RHMSBH4PAP4PGX77MCVNK1ZEED07EH98W0P.estate-vault`](https://explorer.hiro.so/txid/ST5K2RHMSBH4PAP4PGX77MCVNK1ZEED07EH98W0P.estate-vault?chain=testnet) |
| `guardian` | Testnet | [`ST5K2RHMSBH4PAP4PGX77MCVNK1ZEED07EH98W0P.guardian`](https://explorer.hiro.so/txid/ST5K2RHMSBH4PAP4PGX77MCVNK1ZEED07EH98W0P.guardian?chain=testnet) |
| `sbtc-yield` | Testnet | Pending deployment |

---

## Judging Criteria Mapping

| Criterion | BitLegacy |
|-----------|-----------|
| Innovation | First Bitcoin inheritance protocol — zero prior art on Stacks |
| Technical depth | Multi-contract release flow, guardian gating, encrypted IPFS wills, Stacks x402 V2-gated API |
| Stacks alignment | sBTC native, `stacks-block-time` core mechanic, stacks.js, Leather/Xverse |
| UX / mainstream | 3-step wizard, plain-English UI, no crypto jargon required |
| Impact | $100B problem, clear mainstream use case, production-shaped UX |

---

## Built With

- **Stacks** — L2 Bitcoin smart contracts
- **Clarity 4** — `stacks-block-time`, SIP-010 transfers, guardian-gated estate release, yield vault
- **sBTC (SIP-010)** — Bitcoin-backed token custody + yield generation
- **x402** — HTTP micropayment protocol with Stacks V2 headers and testnet-first STX payments
- **IPFS / nft.storage** — Encrypted will storage
- **Next.js 14** — Frontend
- **Stacks.js + @stacks/connect** — Wallet integration

---

## Author

**Bamzz** · [@Bamzzz on Farcaster](https://warpcast.com/bamzzz) · [@hrh_mckay on Twitter](https://twitter.com/hrh_mckay)
GitHub: [github.com/AdekunleBamz](https://github.com/AdekunleBamz)
Company: BamzzStudio · bamzzstudio@gmail.com
