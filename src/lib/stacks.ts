// src/lib/stacks.ts
// All contract read/write interactions

import {
  callReadOnlyFunction,
  AnchorMode,
  PostConditionMode,
  FungibleConditionCode,
  makeStandardFungiblePostCondition,
  makeContractFungiblePostCondition,
  createAssetInfo,
  contractPrincipalCV,
  standardPrincipalCV,
  uintCV,
  listCV,
  tupleCV,
  stringAsciiCV,
  boolCV,
  someCV,
  noneCV,
  bufferCV,
  cvToJSON,
  type ClarityValue,
} from '@stacks/transactions'
import type { ConnectNetwork, ContractCallRegularOptions } from '@stacks/connect'
import { StacksTestnet, StacksMainnet, type StacksNetwork } from '@stacks/network'
import {
  CONTRACT_ADDRESS,
  ESTATE_VAULT_CONTRACT,
  GUARDIAN_CONTRACT,
  SBTC_CONTRACT,
  SBTC_YIELD_CONTRACT,
  NETWORK,
} from '@/constants/contracts'

export type WalletContractCallOptions = Omit<
  ContractCallRegularOptions,
  'appDetails' | 'onFinish' | 'onCancel'
>

const CONNECT_NETWORK: ConnectNetwork = NETWORK === 'mainnet' ? 'mainnet' : 'testnet'

export const getNetwork = (): StacksNetwork =>
  NETWORK === 'mainnet' ? new StacksMainnet() : new StacksTestnet()

function splitContractId(contractId: string) {
  const [contractAddress, contractName] = contractId.split('.')
  return { contractAddress, contractName }
}

function unwrapOptionalTuple(json: any) {
  if (!json || json.value === null) return null
  const inner = json.value
  if (inner && typeof inner === 'object' && inner.value && typeof inner.value === 'object') {
    return inner.value
  }
  return inner
}

export function isCvTrue(value: unknown): boolean {
  return value === true || value === 'true'
}

/** Build the sBTC asset info for post-conditions */
function getSbtcAssetInfo() {
  const { contractAddress, contractName } = splitContractId(SBTC_CONTRACT)
  return createAssetInfo(contractAddress, contractName, 'sbtc-token')
}

function createContractCallOptions({
  contractId,
  functionName,
  functionArgs,
  fee,
  stxAddress,
  postConditions,
}: {
  contractId: string
  functionName: string
  functionArgs: ClarityValue[]
  fee: number
  stxAddress?: string
  postConditions?: any[]
}): WalletContractCallOptions {
  const { contractAddress, contractName } = splitContractId(contractId)

  return {
    network: CONNECT_NETWORK,
    contractAddress,
    contractName,
    functionName,
    functionArgs,
    postConditionMode: postConditions?.length ? PostConditionMode.Deny : PostConditionMode.Allow,
    postConditions: postConditions || [],
    anchorMode: AnchorMode.Any,
    fee,
    stxAddress,
  }
}

// ─── READ FUNCTIONS ───────────────────────────────────────────────────────────

export async function getEstate(owner: string) {
  const { contractAddress, contractName } = splitContractId(ESTATE_VAULT_CONTRACT)
  const result = await callReadOnlyFunction({
    network: getNetwork(),
    contractAddress,
    contractName,
    functionName: 'get-estate',
    functionArgs: [standardPrincipalCV(owner)],
    senderAddress: owner,
  })
  const json = cvToJSON(result)
  return unwrapOptionalTuple(json)
}

export async function getTimeRemaining(owner: string) {
  const { contractAddress, contractName } = splitContractId(ESTATE_VAULT_CONTRACT)
  const result = await callReadOnlyFunction({
    network: getNetwork(),
    contractAddress,
    contractName,
    functionName: 'get-time-remaining',
    functionArgs: [standardPrincipalCV(owner)],
    senderAddress: owner,
  })
  return cvToJSON(result)
}

export async function isTriggered(owner: string) {
  const { contractAddress, contractName } = splitContractId(ESTATE_VAULT_CONTRACT)
  const result = await callReadOnlyFunction({
    network: getNetwork(),
    contractAddress,
    contractName,
    functionName: 'is-triggered',
    functionArgs: [standardPrincipalCV(owner)],
    senderAddress: owner,
  })
  return cvToJSON(result)
}

export async function getGuardianPanel(owner: string) {
  const { contractAddress, contractName } = splitContractId(GUARDIAN_CONTRACT)
  const result = await callReadOnlyFunction({
    network: getNetwork(),
    contractAddress,
    contractName,
    functionName: 'get-panel',
    functionArgs: [standardPrincipalCV(owner)],
    senderAddress: owner,
  })
  return unwrapOptionalTuple(cvToJSON(result))
}

export async function getConfirmationCount(owner: string) {
  const { contractAddress, contractName } = splitContractId(GUARDIAN_CONTRACT)
  const result = await callReadOnlyFunction({
    network: getNetwork(),
    contractAddress,
    contractName,
    functionName: 'get-confirmation-count',
    functionArgs: [standardPrincipalCV(owner)],
    senderAddress: owner,
  })
  return cvToJSON(result)
}

// ─── WRITE FUNCTIONS (return unsigned tx for wallet signing) ─────────────────

export interface Beneficiary {
  addr: string
  share_pct: number
  label: string
}

export async function buildCreateEstateTx({
  amount,
  beneficiaries,
  windowBlocks,
  guardianRequired,
  ipfsCid,
  senderAddress,
}: {
  amount: number
  beneficiaries: Beneficiary[]
  windowBlocks: number
  guardianRequired: boolean
  ipfsCid?: string
  senderAddress: string
}) {
  const { contractAddress: sbtcAddress, contractName: sbtcContractName } =
    splitContractId(SBTC_CONTRACT)

  // Post-condition: sender sends exactly `amount` sBTC to the vault
  const pc = makeStandardFungiblePostCondition(
    senderAddress,
    FungibleConditionCode.Equal,
    amount,
    getSbtcAssetInfo()
  )

  return createContractCallOptions({
    contractId: ESTATE_VAULT_CONTRACT,
    functionName: 'create-estate',
    functionArgs: [
      contractPrincipalCV(sbtcAddress, sbtcContractName),
      uintCV(amount),
      listCV(
        beneficiaries.map(b =>
          tupleCV({
            addr: standardPrincipalCV(b.addr),
            'share-pct': uintCV(b.share_pct),
            label: stringAsciiCV(b.label.slice(0, 32)),
          })
        )
      ),
      uintCV(windowBlocks),
      boolCV(guardianRequired),
      ipfsCid ? someCV(stringAsciiCV(ipfsCid)) : noneCV(),
    ],
    fee: 2000,
    stxAddress: senderAddress,
    postConditions: [pc],
  })
}

export async function buildProofOfLifeTx(senderAddress: string) {
  return createContractCallOptions({
    contractId: ESTATE_VAULT_CONTRACT,
    functionName: 'proof-of-life',
    functionArgs: [],
    fee: 800,
    stxAddress: senderAddress,
  })
}

export async function buildTriggerEstateTx(owner: string, senderAddress: string) {
  return createContractCallOptions({
    contractId: ESTATE_VAULT_CONTRACT,
    functionName: 'trigger-estate',
    functionArgs: [standardPrincipalCV(owner)],
    fee: 1000,
    stxAddress: senderAddress,
  })
}

export async function buildClaimInheritanceTx({
  owner,
  senderAddress,
}: {
  owner: string
  senderAddress: string
}) {
  const { contractAddress: sbtcAddress, contractName: sbtcContractName } =
    splitContractId(SBTC_CONTRACT)
  const { contractAddress: guardianAddress, contractName: guardianContractName } =
    splitContractId(GUARDIAN_CONTRACT)
  const { contractAddress: vaultAddr, contractName: vaultName } =
    splitContractId(ESTATE_VAULT_CONTRACT)

  // Post-condition: vault contract sends sBTC (amount validated by contract logic)
  const pc = makeContractFungiblePostCondition(
    vaultAddr,
    vaultName,
    FungibleConditionCode.GreaterEqual,
    0,
    getSbtcAssetInfo()
  )

  return createContractCallOptions({
    contractId: ESTATE_VAULT_CONTRACT,
    functionName: 'claim-inheritance',
    functionArgs: [
      contractPrincipalCV(sbtcAddress, sbtcContractName),
      contractPrincipalCV(guardianAddress, guardianContractName),
      standardPrincipalCV(owner),
    ],
    fee: 2000,
    stxAddress: senderAddress,
    postConditions: [pc],
  })
}

export async function buildConfirmReleaseTx(estateOwner: string, senderAddress: string) {
  return createContractCallOptions({
    contractId: GUARDIAN_CONTRACT,
    functionName: 'confirm-release',
    functionArgs: [standardPrincipalCV(estateOwner)],
    fee: 800,
    stxAddress: senderAddress,
  })
}

export async function buildRegisterGuardiansTx({
  estateOwner,
  g1,
  g2,
  g3,
  senderAddress,
}: {
  estateOwner: string
  g1: string
  g2: string
  g3: string
  senderAddress: string
}) {
  return createContractCallOptions({
    contractId: GUARDIAN_CONTRACT,
    functionName: 'register-guardians',
    functionArgs: [
      standardPrincipalCV(estateOwner),
      standardPrincipalCV(g1),
      standardPrincipalCV(g2),
      standardPrincipalCV(g3),
    ],
    fee: 1000,
    stxAddress: senderAddress,
  })
}

export async function buildUpdateEstateTx({
  newWindowSeconds,
  ipfsCid,
  senderAddress,
}: {
  newWindowSeconds?: number
  ipfsCid?: string
  senderAddress: string
}) {
  return createContractCallOptions({
    contractId: ESTATE_VAULT_CONTRACT,
    functionName: 'update-estate',
    functionArgs: [
      typeof newWindowSeconds === 'number' && newWindowSeconds > 0
        ? someCV(uintCV(newWindowSeconds))
        : noneCV(),
      ipfsCid ? someCV(stringAsciiCV(ipfsCid)) : noneCV(),
    ],
    fee: 1000,
    stxAddress: senderAddress,
  })
}

export async function buildCancelEstateTx({
  totalLocked,
  senderAddress,
}: {
  totalLocked: number
  senderAddress: string
}) {
  const { contractAddress: sbtcAddress, contractName: sbtcContractName } =
    splitContractId(SBTC_CONTRACT)
  const { contractAddress: vaultAddr, contractName: vaultName } =
    splitContractId(ESTATE_VAULT_CONTRACT)

  // Post-condition: vault returns exactly totalLocked sBTC to the owner
  const pc = makeContractFungiblePostCondition(
    vaultAddr,
    vaultName,
    FungibleConditionCode.Equal,
    totalLocked,
    getSbtcAssetInfo()
  )

  return createContractCallOptions({
    contractId: ESTATE_VAULT_CONTRACT,
    functionName: 'cancel-estate',
    functionArgs: [
      contractPrincipalCV(sbtcAddress, sbtcContractName),
    ],
    fee: 1000,
    stxAddress: senderAddress,
    postConditions: [pc],
  })
}

// ─── YIELD VAULT FUNCTIONS ───────────────────────────────────────────────────

export async function getYieldDeposit(owner: string) {
  const { contractAddress, contractName } = splitContractId(SBTC_YIELD_CONTRACT)
  const result = await callReadOnlyFunction({
    network: getNetwork(),
    contractAddress,
    contractName,
    functionName: 'get-deposit',
    functionArgs: [standardPrincipalCV(owner)],
    senderAddress: owner,
  })
  return unwrapOptionalTuple(cvToJSON(result))
}

export async function getAccruedYield(owner: string) {
  const { contractAddress, contractName } = splitContractId(SBTC_YIELD_CONTRACT)
  const result = await callReadOnlyFunction({
    network: getNetwork(),
    contractAddress,
    contractName,
    functionName: 'get-accrued-yield',
    functionArgs: [standardPrincipalCV(owner)],
    senderAddress: owner,
  })
  return cvToJSON(result)
}

export async function buildDepositToYieldTx({
  amount,
  senderAddress,
}: {
  amount: number
  senderAddress: string
}) {
  const { contractAddress: sbtcAddress, contractName: sbtcContractName } =
    splitContractId(SBTC_CONTRACT)

  const pc = makeStandardFungiblePostCondition(
    senderAddress,
    FungibleConditionCode.Equal,
    amount,
    getSbtcAssetInfo()
  )

  return createContractCallOptions({
    contractId: SBTC_YIELD_CONTRACT,
    functionName: 'deposit-to-yield',
    functionArgs: [
      contractPrincipalCV(sbtcAddress, sbtcContractName),
      uintCV(amount),
    ],
    fee: 1000,
    stxAddress: senderAddress,
    postConditions: [pc],
  })
}

export async function buildWithdrawFromYieldTx(senderAddress: string) {
  const { contractAddress: sbtcAddress, contractName: sbtcContractName } =
    splitContractId(SBTC_CONTRACT)
  const { contractAddress: yieldAddr, contractName: yieldName } =
    splitContractId(SBTC_YIELD_CONTRACT)

  const pc = makeContractFungiblePostCondition(
    yieldAddr,
    yieldName,
    FungibleConditionCode.GreaterEqual,
    0,
    getSbtcAssetInfo()
  )

  return createContractCallOptions({
    contractId: SBTC_YIELD_CONTRACT,
    functionName: 'withdraw-from-yield',
    functionArgs: [
      contractPrincipalCV(sbtcAddress, sbtcContractName),
    ],
    fee: 1000,
    stxAddress: senderAddress,
    postConditions: [pc],
  })
}

export async function buildHarvestYieldTx(senderAddress: string) {
  const { contractAddress: sbtcAddress, contractName: sbtcContractName } =
    splitContractId(SBTC_CONTRACT)
  const { contractAddress: yieldAddr, contractName: yieldName } =
    splitContractId(SBTC_YIELD_CONTRACT)

  const pc = makeContractFungiblePostCondition(
    yieldAddr,
    yieldName,
    FungibleConditionCode.GreaterEqual,
    0,
    getSbtcAssetInfo()
  )

  return createContractCallOptions({
    contractId: SBTC_YIELD_CONTRACT,
    functionName: 'harvest-yield',
    functionArgs: [
      contractPrincipalCV(sbtcAddress, sbtcContractName),
    ],
    fee: 800,
    stxAddress: senderAddress,
    postConditions: [pc],
  })
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

export function satoshiToSBTC(sats: number): number {
  return sats / 1e8
}

export function sBTCToSatoshi(sbtc: number): number {
  return Math.round(sbtc * 1e8)
}

// Legacy name kept for compatibility. Input is countdown seconds from contract.
export function blocksToHuman(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min${minutes > 1 ? 's' : ''}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''}`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days > 1 ? 's' : ''}`
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? 's' : ''}`
  if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? 's' : ''}`
  const years = Math.floor(days / 365)
  return `${years} year${years > 1 ? 's' : ''}`
}
