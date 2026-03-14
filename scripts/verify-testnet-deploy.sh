#!/usr/bin/env bash
set -euo pipefail

API_BASE="https://api.testnet.hiro.so"

usage() {
  cat <<USAGE
Usage:
  scripts/verify-testnet-deploy.sh <deployer_address> <estate_txid> <guardian_txid>

Example:
  scripts/verify-testnet-deploy.sh \
    ST5K2RHMSBH4PAP4PGX77MCVNK1ZEED07EH98W0P \
    0x1e1c2da4a61c42784c59a3c019742b786454404865495e9e11088e9eadbce4a5 \
    0x259feff952663490077652a3320d8ce9ce10119ac37d812e6247f5659b69f297
USAGE
}

if [[ $# -ne 3 ]]; then
  usage
  exit 1
fi

DEPLOYER="$1"
ESTATE_TXID="$2"
GUARDIAN_TXID="$3"

ESTATE_CONTRACT="${DEPLOYER}.estate-vault"
GUARDIAN_CONTRACT="${DEPLOYER}.guardian"

fetch_json() {
  local url="$1"
  curl -fsS "$url"
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  local label="$3"

  if ! printf '%s' "$haystack" | rg -q --fixed-strings "$needle"; then
    printf 'ERROR: %s\n' "$label" >&2
    exit 1
  fi
}

verify_tx() {
  local txid="$1"
  local expected_contract="$2"
  local label="$3"

  local payload
  payload="$(fetch_json "${API_BASE}/extended/v1/tx/${txid}")"

  assert_contains "$payload" '"tx_status":"success"' "${label}: tx_status is not success"
  assert_contains "$payload" '"tx_type":"smart_contract"' "${label}: tx_type is not smart_contract"
  assert_contains "$payload" "\"contract_id\":\"${expected_contract}\"" "${label}: contract_id mismatch"

  printf 'OK: %s tx confirmed: %s\n' "$label" "$txid"
}

verify_interface() {
  local contract_name="$1"
  local label="$2"

  local payload
  payload="$(fetch_json "${API_BASE}/v2/contracts/interface/${DEPLOYER}/${contract_name}")"

  assert_contains "$payload" '"functions"' "${label}: interface not found"

  printf 'OK: %s interface available: %s.%s\n' "$label" "$DEPLOYER" "$contract_name"
}

printf 'Verifying testnet deployment for %s\n' "$DEPLOYER"

verify_tx "$ESTATE_TXID" "$ESTATE_CONTRACT" "estate-vault"
verify_tx "$GUARDIAN_TXID" "$GUARDIAN_CONTRACT" "guardian"

verify_interface 'estate-vault' 'estate-vault'
verify_interface 'guardian' 'guardian'

printf '\nDeployment verification passed.\n'
printf 'Explorer (testnet):\n'
printf '  estate-vault tx: https://explorer.hiro.so/txid/%s?chain=testnet\n' "$ESTATE_TXID"
printf '  guardian tx:     https://explorer.hiro.so/txid/%s?chain=testnet\n' "$GUARDIAN_TXID"
printf '  deployer addr:   https://explorer.hiro.so/address/%s?chain=testnet\n' "$DEPLOYER"
