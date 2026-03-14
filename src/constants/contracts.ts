// src/constants/contracts.ts

export type AppNetwork = 'mainnet' | 'testnet'
export type X402Asset = 'STX' | 'sBTC'

export const NETWORK: AppNetwork =
  process.env.NEXT_PUBLIC_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'

export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM'

export const ESTATE_VAULT_CONTRACT = `${CONTRACT_ADDRESS}.estate-vault`
export const GUARDIAN_CONTRACT = `${CONTRACT_ADDRESS}.guardian`

// sBTC token contract (mainnet)
export const SBTC_CONTRACT_MAINNET = 'SM3VDXK3WZZSA84XXB1E2TF2QW2D29S67D9EKTR92.sbtc-token'
// sBTC token contract (testnet)
export const SBTC_CONTRACT_TESTNET = 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token'

export const SBTC_CONTRACT =
  NETWORK === 'mainnet' ? SBTC_CONTRACT_MAINNET : SBTC_CONTRACT_TESTNET

// Countdown windows use seconds because the contract compares against stacks-block-time.
export const SECONDS_PER_MINUTE = 60
export const SECONDS_PER_HOUR = SECONDS_PER_MINUTE * 60
export const SECONDS_PER_DAY = SECONDS_PER_HOUR * 24
export const DEFAULT_WINDOW_BLOCKS = SECONDS_PER_DAY * 30

const MAINNET_WINDOW_OPTIONS = [
  { label: '7 days', blocks: SECONDS_PER_DAY * 7 },
  { label: '14 days', blocks: SECONDS_PER_DAY * 14 },
  { label: '30 days', blocks: SECONDS_PER_DAY * 30 },
  { label: '60 days', blocks: SECONDS_PER_DAY * 60 },
  { label: '90 days', blocks: SECONDS_PER_DAY * 90 },
  { label: '180 days', blocks: SECONDS_PER_DAY * 180 },
  { label: '1 year', blocks: SECONDS_PER_DAY * 365 },
  { label: '2 years', blocks: SECONDS_PER_DAY * 730 },
]

const TESTNET_SHORT_WINDOW_OPTIONS = [
  { label: '2 hours (test)', blocks: SECONDS_PER_HOUR * 2 },
  { label: '6 hours (test)', blocks: SECONDS_PER_HOUR * 6 },
  { label: '12 hours (test)', blocks: SECONDS_PER_HOUR * 12 },
  { label: '24 hours (test)', blocks: SECONDS_PER_HOUR * 24 },
]

export const WINDOW_OPTIONS =
  NETWORK === 'testnet'
    ? [...TESTNET_SHORT_WINDOW_OPTIONS, ...MAINNET_WINDOW_OPTIONS]
    : MAINNET_WINDOW_OPTIONS

// x402 config
export const X402_ASSET: X402Asset =
  process.env.NEXT_PUBLIC_X402_ASSET === 'sBTC' ? 'sBTC' : 'STX'

export const X402_PRICE_MICRO = process.env.NEXT_PUBLIC_X402_PRICE_MICRO || '10000'

export const X402_FACILITATOR_URL =
  process.env.NEXT_PUBLIC_X402_FACILITATOR_URL || ''

export const X402_DEMO_MODE = process.env.NEXT_PUBLIC_X402_DEMO === 'true'

export const X402_PAY_TO_ADDRESS =
  process.env.NEXT_PUBLIC_X402_PAY_TO_ADDRESS || CONTRACT_ADDRESS

export const X402_CAIP2_NETWORK = NETWORK === 'mainnet' ? 'stacks:1' : 'stacks:2147483648'
