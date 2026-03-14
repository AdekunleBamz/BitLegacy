# BitLegacy

Bitcoin inheritance, built on Stacks.

BitLegacy is a dead-man-switch style estate vault for sBTC. The idea is simple: if I stop checking in, my beneficiaries should be able to claim funds on-chain without relying on lawyers, exchanges, or private off-chain arrangements.

Built for **Buidl Battle #2 (2026)**.

- Live app: https://bitlegacy.vercel.app
- Repo: https://github.com/AdekunleBamz/BitLegacy

## Why I built this

A lot of people hold meaningful value in crypto but still have no practical inheritance flow. Traditional probate doesn’t map cleanly to self-custody. BitLegacy is my attempt to solve that in a way that is transparent, programmable, and testable.

## What BitLegacy does

1. Estate owner creates an estate and locks funds in the `estate-vault` contract.
2. Owner adds up to 5 beneficiaries and percentage allocations (must total 100%).
3. Owner sets an inactivity window.
4. Owner calls `proof-of-life` periodically to reset the timer.
5. If the timer expires, anyone can trigger the estate.
6. Beneficiaries claim from their own wallet.
7. Optional: 2-of-3 guardians must confirm before claims are allowed.

## Current implementation status

- Core contracts are in `contracts/estate-vault.clar` and `contracts/guardian.clar`.
- Frontend includes create, dashboard, claim, and guardian flows.
- Estate windows are time-based (seconds) because the contract uses `stacks-block-time`.
- Test presets are available for fast validation (`2h`, `6h`, `12h`, `24h`) plus longer presets (`7d`, `14d`, `30d`, `60d`, `90d`, `180d`, `1y`, `2y`).
- x402-style paywall is wired for estate lookup API and defaults to **testnet STX** pricing.

## x402 integration (bounty work)

The route `GET /api/estate/:owner` is protected behind x402 V2-style headers:

- `payment-required`
- `payment-signature`
- `payment-response`

Default config is testnet + STX (`0.01 STX` by default), with optional sBTC mode via env vars.

Important note:
- Browser-side payment signing is currently demo-oriented unless you wire a real facilitator/signer flow.
- For hackathon demo, `NEXT_PUBLIC_X402_DEMO=true` is the smooth path.

Relevant files:
- `src/lib/x402.ts`
- `src/app/api/estate/[owner]/route.ts`
- `src/app/claim/page.tsx`

## Hackathon fit

BitLegacy fits:

- Main hackathon track (Stacks app with real contract + frontend)
- Best x402 Integration (API paywall and payment header flow)
- Most Innovative Use of sBTC (estate custody and inheritance release model)

## Project structure

```text
bitlegacy/
├── contracts/
│   ├── estate-vault.clar
│   └── guardian.clar
├── settings/
│   ├── Devnet.toml
│   ├── Testnet.toml
│   └── Mainnet.toml
├── scripts/
│   └── verify-testnet-deploy.sh
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── create/
│   │   ├── dashboard/
│   │   ├── claim/
│   │   ├── guardian/
│   │   └── api/estate/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   └── constants/
├── tests/
├── Clarinet.toml
├── .env.example
└── README.md
```

## Local setup

```bash
git clone https://github.com/AdekunleBamz/BitLegacy
cd bitlegacy
npm install
cp .env.example .env.local
```

Update `.env.local` with your contract address and preferred x402 settings.

Then run:

```bash
clarinet check
npm run build
npm run dev
```

## Testnet deploy flow

Deploy contracts:

```bash
clarinet deployments apply --testnet
```

Verify deploy (helper script):

```bash
scripts/verify-testnet-deploy.sh <DEPLOYER_ADDRESS> <ESTATE_TXID> <GUARDIAN_TXID>
```

The verifier checks:
- both contract deployment txs succeeded
- contract IDs match deployer address
- contract interfaces are queryable via Hiro API

## Environment variables

Use `.env.example` as baseline. Main ones:

- `NEXT_PUBLIC_NETWORK=testnet|mainnet`
- `NEXT_PUBLIC_CONTRACT_ADDRESS=<deployer-address>`
- `NEXT_PUBLIC_X402_ASSET=STX|sBTC`
- `NEXT_PUBLIC_X402_PRICE_MICRO=10000`
- `NEXT_PUBLIC_X402_DEMO=true|false`
- `NEXT_PUBLIC_X402_FACILITATOR_URL=<optional>`
- `NEXT_PUBLIC_NFT_STORAGE_KEY=<optional for will uploads>`

## Notes for judges and collaborators

What I focused on in this version:

- Contract-first inheritance flow with clear state transitions
- Practical guardian gating for higher-trust estates
- Fast test presets so full lifecycle can be demonstrated on testnet
- A working x402-shaped API monetization flow for estate lookups

What still needs tightening for production:

- Live non-demo x402 signer + facilitator settlement path
- More adversarial contract tests and scenario coverage
- Stronger operational monitoring around claim/release events

## Author

Bamzz

- Farcaster: https://warpcast.com/bamzzz
- X/Twitter: https://twitter.com/hrh_mckay
- GitHub: https://github.com/AdekunleBamz
- Email: bamzzstudio@gmail.com
