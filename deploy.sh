#!/bin/bash
# deploy.sh — Deploy BitLegacy contracts + frontend

set -e

echo "================================================"
echo "  BitLegacy Deployment Script"
echo "================================================"

NETWORK=${1:-testnet}
echo "Target network: $NETWORK"

# ─── Step 1: Verify contracts + frontend ──────────────────────────────────────
echo ""
echo "[1/4] Verifying contracts and frontend..."
npm run verify
echo "✅ Verification passed"

# ─── Step 2: Deploy contracts ─────────────────────────────────────────────────
echo ""
echo "[2/4] Deploying contracts to $NETWORK..."

if [ "$NETWORK" = "mainnet" ]; then
  clarinet deployments apply --mainnet --no-dashboard
else
  clarinet deployments apply --testnet --no-dashboard
fi

echo "✅ Contracts deployed"

# ─── Step 3: Export contract addresses ───────────────────────────────────────
echo ""
echo "[3/4] Contract addresses:"
echo "  estate-vault: check explorer.hiro.so for your deployment"
echo "  guardian:     check explorer.hiro.so for your deployment"
echo "  sbtc-yield:   check explorer.hiro.so for your deployment"
echo ""
echo "Update .env.local with:"
echo "  NEXT_PUBLIC_CONTRACT_ADDRESS=<your_address>"
echo "  NEXT_PUBLIC_NETWORK=$NETWORK"

# ─── Step 4: Build frontend ───────────────────────────────────────────────────
echo ""
echo "[4/4] Building Next.js frontend..."
npm run build
echo "✅ Build complete"

echo ""
echo "================================================"
echo "  Deploy frontend with: vercel --prod"
echo "================================================"
