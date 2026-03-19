#!/usr/bin/env bash
set -euo pipefail

API_BASE="https://api.testnet.hiro.so"

usage() {
  cat <<USAGE
Usage:
  scripts/verify-testnet-deploy.sh <deployer_address>

Verifies that all three BitLegacy contracts (estate-vault, guardian, sbtc-yield)
are deployed and accessible on Stacks testnet.

Example:
  scripts/verify-testnet-deploy.sh ST5K2RHMSBH4PAP4PGX77MCVNK1ZEED07EH98W0P
USAGE
}

if [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

DEPLOYER="$1"

verify_interface() {
  local contract_name="$1"

  local http_code
  http_code="$(curl -sS -o /dev/null -w '%{http_code}' "${API_BASE}/v2/contracts/interface/${DEPLOYER}/${contract_name}")"

  if [[ "$http_code" != "200" ]]; then
    printf 'FAIL: %s not found (HTTP %s)\n' "$contract_name" "$http_code" >&2
    return 1
  fi

  printf 'OK: %s deployed at %s.%s\n' "$contract_name" "$DEPLOYER" "$contract_name"
}

printf 'Verifying testnet deployment for %s\n\n' "$DEPLOYER"

PASS=0
FAIL=0

for contract in estate-vault guardian sbtc-yield; do
  if verify_interface "$contract"; then
    ((PASS++))
  else
    ((FAIL++))
  fi
done

printf '\nResults: %d passed, %d failed\n' "$PASS" "$FAIL"

if [[ "$FAIL" -gt 0 ]]; then
  printf 'Some contracts are missing. Deploy them first.\n' >&2
  exit 1
fi

printf '\nAll contracts verified on testnet.\n'
printf 'Explorer: https://explorer.hiro.so/address/%s?chain=testnet\n' "$DEPLOYER"
