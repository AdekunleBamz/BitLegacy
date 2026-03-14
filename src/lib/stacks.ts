// src/lib/stacks.ts
// All contract read/write interactions

import {
  callReadOnlyFunction,
  AnchorMode,
  PostConditionMode,
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
  ESTATE_VAULT_CONTRACT,
  GUARDIAN_CONTRACT,
  SBTC_CONTRACT,
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

function createContractCallOptions({
  contractId,
  functionName,
  functionArgs,
  fee,
  stxAddress,
}: {
  contractId: string
  functionName: string
  functionArgs: ClarityValue[]
  fee: number
  stxAddress?: string
}): WalletContractCallOptions {
  const { contractAddress, contractName } = splitContractId(contractId)

  return {
    network: CONNECT_NETWORK,
    contractAddress,
    contractName,
    functionName,
    functionArgs,
    postConditionMode: PostConditionMode.Allow,
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
