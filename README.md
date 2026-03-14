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

- `clarinet check` passes for both contracts
- `npm run build` passes for the Next.js app
- Guardian confirmation is enforced directly during claims
- Estate lookup API supports x402-style `402 Payment Required` responses
- The current x402 flow remains demo-oriented until a live USDCx settlement path is wired end to end

---

## x402 Integration (Bounty)

Estate lookup API calls (`/api/estate/[owner]`) are gated behind x402-style micropayment responses. Heirs are quoted **$0.01 USDCx** per verification query.

Flow:
1. Client calls `GET /api/estate/:owner` with no payment header
2. Server returns `402` with `X402PaymentRequired` JSON describing payment terms
3. Client prepares a payment payload for retry
4. Client retries with `X-PAYMENT: base64(signedPayload)` header
5. Server verifies the payload via the configured facilitator when available and returns estate data + `X-PAYMENT-RESPONSE`

See `src/lib/x402.ts` and `src/app/api/estate/[owner]/route.ts` for full implementation.

---

## Project Structure

```
bitlegacy/
├── contracts/
│   ├── estate-vault.clar     # Core estate logic (Clarity 4)
│   └── guardian.clar         # 2-of-3 guardian multisig
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
│   │   ├── claim/             # Heir claim portal (x402-gated)
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
# Edit .env.local with your contract address and keys

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
| `estate-vault` | Testnet | `ST...estate-vault` |
| `guardian` | Testnet | `ST...guardian` |
| `estate-vault` | Mainnet | `SP...estate-vault` |
| `guardian` | Mainnet | `SP...guardian` |

---

## Judging Criteria Mapping

| Criterion | BitLegacy |
|-----------|-----------|
| Innovation | First Bitcoin inheritance protocol — zero prior art on Stacks |
| Technical depth | Multi-contract release flow, guardian gating, encrypted IPFS wills, x402-gated API |
| Stacks alignment | sBTC native, `stacks-block-time` core mechanic, stacks.js, Leather/Xverse |
| UX / mainstream | 3-step wizard, plain-English UI, no crypto jargon required |
| Impact | $100B problem, clear mainstream use case, production-shaped UX |

---

## Built With

- **Stacks** — L2 Bitcoin smart contracts
- **Clarity 4** — `stacks-block-time`, SIP-010 transfers, guardian-gated estate release
- **sBTC (SIP-010)** — Bitcoin-backed token custody
- **x402** — HTTP micropayment protocol (USDCx bounty integration)
- **IPFS / nft.storage** — Encrypted will storage
- **Next.js 14** — Frontend
- **Stacks.js + @stacks/connect** — Wallet integration

---

## Author

**Bamzz** · [@Bamzzz on Farcaster](https://warpcast.com/bamzzz) · [@hrh_mckay on Twitter](https://twitter.com/hrh_mckay)
GitHub: [github.com/AdekunleBamz](https://github.com/AdekunleBamz)
Company: I-Engendering Ltd · bamzzstudio@gmail.com
