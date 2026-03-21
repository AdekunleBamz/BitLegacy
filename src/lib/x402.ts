// src/lib/x402.ts
// Stacks-native x402 V2 helpers for BitLegacy

import {
  deserializeTransaction,
  isTokenTransferPayload,
  principalToString,
} from '@stacks/transactions'
import {
  NETWORK,
  SBTC_CONTRACT,
  X402_ASSET,
  X402_CAIP2_NETWORK,
  X402_PAY_TO_ADDRESS,
  X402_PRICE_MICRO,
  type X402Asset,
} from '@/constants/contracts'

const X402_VERSION = 2 as const
const X402_INDEXING_RETRIES = 12
const X402_INDEXING_DELAY_MS = 1500

export interface X402PaymentRequirements {
  scheme: 'exact'
  network: string
  amount: string
  asset: X402Asset
  payTo: string
  maxTimeoutSeconds: number
  resource: string
  description: string
  mimeType: string
  memo: string
  tokenContract?: string
}

export interface X402PaymentRequired {
  x402Version: typeof X402_VERSION
  paymentRequirements: X402PaymentRequirements
}

export interface X402SignedPayment {
  transaction: string
  txId?: string
}

export interface X402PaymentPayload {
  x402Version: typeof X402_VERSION
  payload: X402SignedPayment
  accepted: X402PaymentRequirements
}

export interface X402PaymentResponse {
  success: boolean
  payer?: string
  transaction?: string
  network?: string
  error?: string
}

interface IndexedTransaction {
  tx_id: string
  tx_status: string
  tx_type: string
  sender_address: string
  token_transfer?: {
    recipient_address?: string
    amount?: string
    memo?: string
  }
}

function encodeBase64(value: string): string {
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return window.btoa(value)
  }

  return Buffer.from(value, 'utf8').toString('base64')
}

function decodeBase64(value: string): string {
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    return window.atob(value)
  }

  return Buffer.from(value, 'base64').toString('utf8')
}

function parseJsonValue<T>(value: string): T {
  return JSON.parse(value) as T
}

function decodeHeaderValue<T>(value: string): T {
  try {
    return parseJsonValue<T>(value)
  } catch {
    return parseJsonValue<T>(decodeBase64(value))
  }
}

function toHeaders(headers?: HeadersInit): Headers {
  return new Headers(headers)
}

function getX402TokenContract(): string | undefined {
  return X402_ASSET === 'sBTC' ? SBTC_CONTRACT : undefined
}

function normalizeTxId(txid: string) {
  return txid.replace(/^0x/i, '').toLowerCase()
}

function getHiroApiBase() {
  return NETWORK === 'mainnet' ? 'https://api.hiro.so' : 'https://api.testnet.hiro.so'
}

function getHiroHeaders() {
  const apiKey = process.env.HIRO_API_KEY || process.env.NEXT_PUBLIC_HIRO_API_KEY
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  if (apiKey) {
    headers['x-api-key'] = apiKey
  }

  return headers
}

async function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function formatWithDecimals(amount: string, decimals: number): string {
  const value = BigInt(amount)
  const divisor = BigInt(10) ** BigInt(decimals)
  const whole = value / divisor
  const fraction = value % divisor

  if (fraction === BigInt(0)) {
    return whole.toString()
  }

  return `${whole.toString()}.${fraction
    .toString()
    .padStart(decimals, '0')
    .replace(/0+$/, '')}`
}

function buildX402Memo(resource: string) {
  const resourceId = resource.split('/').filter(Boolean).at(-1) || 'lookup'
  return `BLX402:${resourceId.slice(-27)}`
}

export function formatX402Amount(amount: string, asset: X402Asset = X402_ASSET): string {
  return formatWithDecimals(amount, asset === 'sBTC' ? 8 : 6)
}

export function getX402PriceLabel(): string {
  return `${formatX402Amount(X402_PRICE_MICRO, X402_ASSET)} ${X402_ASSET}`
}

export function build402Response(resource: string, payTo: string = X402_PAY_TO_ADDRESS): X402PaymentRequired {
  return {
    x402Version: X402_VERSION,
    paymentRequirements: {
      scheme: 'exact',
      network: X402_CAIP2_NETWORK,
      amount: X402_PRICE_MICRO,
      asset: X402_ASSET,
      payTo,
      maxTimeoutSeconds: 300,
      resource,
      description: `BitLegacy estate lookup on ${NETWORK} - pay ${getX402PriceLabel()} to unlock the response`,
      mimeType: 'application/json',
      memo: buildX402Memo(resource),
      tokenContract: getX402TokenContract(),
    },
  }
}

export function buildPaymentRequiredHeader(paymentRequired: X402PaymentRequired): string {
  return encodeBase64(JSON.stringify(paymentRequired))
}

export function buildPaymentResponseHeader(paymentResponse: X402PaymentResponse): string {
  return encodeBase64(JSON.stringify(paymentResponse))
}

export function parsePaymentResponse(response: Response): X402PaymentResponse | null {
  const header = response.headers.get('payment-response')
  if (!header) {
    return null
  }

  return decodeHeaderValue<X402PaymentResponse>(header)
}

export function buildPaymentPayload(
  paymentRequired: X402PaymentRequired,
  signedPayment: X402SignedPayment
): X402PaymentPayload {
  return {
    x402Version: X402_VERSION,
    payload: signedPayment,
    accepted: paymentRequired.paymentRequirements,
  }
}

async function readPaymentRequired(response: Response): Promise<X402PaymentRequired> {
  const header = response.headers.get('payment-required')
  if (header) {
    return decodeHeaderValue<X402PaymentRequired>(header)
  }

  const body = await response.json()

  if (body?.paymentRequired) {
    return body.paymentRequired as X402PaymentRequired
  }

  if (body?.x402Version === X402_VERSION && body?.paymentRequirements) {
    return body as X402PaymentRequired
  }

  throw new Error('Missing payment requirements in 402 response')
}

export async function x402Fetch(
  url: string,
  options: RequestInit = {},
  paymentSigner: (paymentRequired: X402PaymentRequired) => Promise<X402SignedPayment>
): Promise<Response> {
  const firstResponse = await fetch(url, options)

  if (firstResponse.status !== 402) {
    return firstResponse
  }

  const paymentRequired = await readPaymentRequired(firstResponse)
  const signedPayment = await paymentSigner(paymentRequired)
  const paymentPayload = buildPaymentPayload(paymentRequired, signedPayment)
  const headers = toHeaders(options.headers)

  headers.set('payment-signature', encodeBase64(JSON.stringify(paymentPayload)))

  return fetch(url, {
    ...options,
    headers,
  })
}

function validatePaymentPayload(
  paymentPayload: X402PaymentPayload,
  expectedResource: string
): { valid: boolean; error?: string } {
  const { accepted, payload } = paymentPayload

  if (paymentPayload.x402Version !== X402_VERSION) {
    return { valid: false, error: 'Unsupported x402 version' }
  }

  if (!payload?.transaction) {
    return { valid: false, error: 'Missing signed transaction payload' }
  }

  if (accepted.scheme !== 'exact') {
    return { valid: false, error: 'Unsupported payment scheme' }
  }

  if (accepted.network !== X402_CAIP2_NETWORK) {
    return { valid: false, error: 'Network mismatch' }
  }

  if (accepted.amount !== X402_PRICE_MICRO) {
    return { valid: false, error: 'Amount mismatch' }
  }

  if (accepted.asset !== X402_ASSET) {
    return { valid: false, error: 'Asset mismatch' }
  }

  if (accepted.payTo !== X402_PAY_TO_ADDRESS) {
    return { valid: false, error: 'Recipient mismatch' }
  }

  if (accepted.resource !== expectedResource) {
    return { valid: false, error: 'Resource mismatch' }
  }

  if (accepted.memo !== buildX402Memo(expectedResource)) {
    return { valid: false, error: 'Memo mismatch' }
  }

  if (accepted.asset === 'sBTC' && accepted.tokenContract !== SBTC_CONTRACT) {
    return { valid: false, error: 'Token contract mismatch' }
  }

  return { valid: true }
}

async function fetchIndexedTransaction(txid: string): Promise<IndexedTransaction | null> {
  const prefixedTxid = `0x${normalizeTxId(txid)}`
  const res = await fetch(
    `${getHiroApiBase()}/extended/v1/tx/multiple?tx_id=${encodeURIComponent(prefixedTxid)}&unanchored=true`,
    {
      headers: getHiroHeaders(),
      cache: 'no-store',
    }
  )

  if (!res.ok) {
    return null
  }

  const data = (await res.json()) as { results?: IndexedTransaction[] }
  return data.results?.[0] || null
}

async function waitForIndexedTransaction(txid: string) {
  for (let attempt = 0; attempt < X402_INDEXING_RETRIES; attempt += 1) {
    const indexed = await fetchIndexedTransaction(txid)
    if (indexed) {
      return indexed
    }

    if (attempt < X402_INDEXING_RETRIES - 1) {
      await wait(X402_INDEXING_DELAY_MS)
    }
  }

  return null
}

export async function verifyX402Payment(
  paymentSignatureHeader: string,
  expectedResource: string
): Promise<{ valid: boolean; txid?: string; payer?: string; error?: string }> {
  try {
    const paymentPayload = decodeHeaderValue<X402PaymentPayload>(paymentSignatureHeader)
    const validation = validatePaymentPayload(paymentPayload, expectedResource)

    if (!validation.valid) {
      return { valid: false, error: validation.error }
    }

    if (paymentPayload.accepted.asset !== 'STX') {
      return {
        valid: false,
        error: 'This wallet-based x402 flow currently supports STX micropayments only',
      }
    }

    const transaction = deserializeTransaction(paymentPayload.payload.transaction)
    if (!isTokenTransferPayload(transaction.payload)) {
      return { valid: false, error: 'Expected an STX token transfer payload' }
    }

    const derivedTxid = transaction.txid()
    if (
      paymentPayload.payload.txId &&
      normalizeTxId(paymentPayload.payload.txId) !== normalizeTxId(derivedTxid)
    ) {
      return { valid: false, error: 'Signed transaction does not match the provided txid' }
    }

    const recipientAddress = principalToString(transaction.payload.recipient)
    const amount = transaction.payload.amount.toString()
    const memo = transaction.payload.memo.content

    if (recipientAddress !== paymentPayload.accepted.payTo) {
      return { valid: false, error: 'Signed payment recipient does not match payment requirements' }
    }

    if (amount !== paymentPayload.accepted.amount) {
      return { valid: false, error: 'Signed payment amount does not match payment requirements' }
    }

    if (memo !== paymentPayload.accepted.memo) {
      return { valid: false, error: 'Signed payment memo does not match payment requirements' }
    }

    const indexed = await waitForIndexedTransaction(derivedTxid)
    if (!indexed) {
      return { valid: false, error: 'Payment transaction was not indexed on Hiro in time' }
    }

    if (normalizeTxId(indexed.tx_id) !== normalizeTxId(derivedTxid)) {
      return { valid: false, error: 'Indexed transaction did not match the signed payment txid' }
    }

    if (indexed.tx_type !== 'token_transfer') {
      return { valid: false, error: 'Indexed transaction is not an STX transfer' }
    }

    if (indexed.tx_status !== 'success' && indexed.tx_status !== 'pending') {
      return { valid: false, error: `Payment transaction status is ${indexed.tx_status}` }
    }

    if (indexed.token_transfer?.recipient_address !== paymentPayload.accepted.payTo) {
      return { valid: false, error: 'Indexed payment recipient did not match payment requirements' }
    }

    if (indexed.token_transfer?.amount !== paymentPayload.accepted.amount) {
      return { valid: false, error: 'Indexed payment amount did not match payment requirements' }
    }

    if ((indexed.token_transfer?.memo || '') !== paymentPayload.accepted.memo) {
      return { valid: false, error: 'Indexed payment memo did not match payment requirements' }
    }

    return {
      valid: true,
      txid: derivedTxid,
      payer: indexed.sender_address,
    }
  } catch (error: any) {
    return { valid: false, error: error?.message || 'Unknown payment verification error' }
  }
}
