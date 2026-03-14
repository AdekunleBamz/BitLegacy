// src/constants/contracts.ts

export const NETWORK = process.env.NEXT_PUBLIC_NETWORK || 'testnet'

export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM'

export const ESTATE_VAULT_CONTRACT = `${CONTRACT_ADDRESS}.estate-vault`
export const GUARDIAN_CONTRACT = `${CONTRACT_ADDRESS}.guardian`

// sBTC token contract (mainnet)
export const SBTC_CONTRACT_MAINNET = 'SM3VDXK3WZZSA84XXB1E2TF2QW2D29S67D9EKTR92.sbtc-token'
// sBTC token contract (testnet)
export const SBTC_CONTRACT_TESTNET = 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token-v2'

export const SBTC_CONTRACT =
  NETWORK === 'mainnet' ? SBTC_CONTRACT_MAINNET : SBTC_CONTRACT_TESTNET

// Blocks per day ~= 144
export const BLOCKS_PER_DAY = 144

export const WINDOW_OPTIONS = [
  { label: '7 days',  blocks: BLOCKS_PER_DAY * 7   },
  { label: '14 days', blocks: BLOCKS_PER_DAY * 14  },
  { label: '30 days', blocks: BLOCKS_PER_DAY * 30  },
  { label: '60 days', blocks: BLOCKS_PER_DAY * 60  },
  { label: '90 days', blocks: BLOCKS_PER_DAY * 90  },
]

// x402 config
export const X402_ENDPOINT = process.env.NEXT_PUBLIC_X402_ENDPOINT || 'https://x402.org/facilitate'
export const X402_PRICE_USDCX = '0.01' // $0.01 USDCx per API call
