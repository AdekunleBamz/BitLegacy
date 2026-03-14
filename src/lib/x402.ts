// src/lib/x402.ts
// Stacks-native x402 V2 helpers for BitLegacy

import {
  NETWORK,
  SBTC_CONTRACT,
  X402_ASSET,
  X402_CAIP2_NETWORK,
  X402_DEMO_MODE,
  X402_FACILITATOR_URL,
  X402_PAY_TO_ADDRESS,
  X402_PRICE_MICRO,
  type X402Asset,
} from '@/constants/contracts'

const X402_VERSION = 2 as const

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
  tokenContract?: string
}

export interface X402PaymentRequired {
  x402Version: typeof X402_VERSION
  paymentRequirements: X402PaymentRequirements
}

export interface X402PaymentPayload {
  x402Version: typeof X402_VERSION
  payload: {
    transaction: string
  }
  accepted: X402PaymentRequirements
}

export interface X402PaymentResponse {
  success: boolean
  payer?: string
  transaction?: string
  network?: string
  error?: string
  simulated?: boolean
}

interface FacilitatorSettlementResponse {
  success?: boolean
  payer?: string
  transaction?: string
  txid?: string
  network?: string
  error?: string
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

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

function getX402TokenContract(): string | undefined {
  return X402_ASSET === 'sBTC' ? SBTC_CONTRACT : undefined
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
  signedTransaction: string
): X402PaymentPayload {
  return {
    x402Version: X402_VERSION,
    payload: {
      transaction: signedTransaction,
    },
    accepted: paymentRequired.paymentRequirements,
  }
}

export function buildDemoSignedTransaction(
  paymentRequired: X402PaymentRequired,
  payerAddress?: string
): string {
  const payload = JSON.stringify({
    demo: true,
    payer: payerAddress || 'demo-payer',
    network: paymentRequired.paymentRequirements.network,
    asset: paymentRequired.paymentRequirements.asset,
    amount: paymentRequired.paymentRequirements.amount,
    resource: paymentRequired.paymentRequirements.resource,
    timestamp: Date.now(),
  })

  return `0x${Array.from(new TextEncoder().encode(payload))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')}`
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
  paymentSigner: (paymentRequired: X402PaymentRequired) => Promise<string>
): Promise<Response> {
  const firstResponse = await fetch(url, options)

  if (firstResponse.status !== 402) {
    return firstResponse
  }

  const paymentRequired = await readPaymentRequired(firstResponse)
  const signedTransaction = await paymentSigner(paymentRequired)
  const paymentPayload = buildPaymentPayload(paymentRequired, signedTransaction)
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

  if (accepted.asset === 'sBTC' && accepted.tokenContract !== SBTC_CONTRACT) {
    return { valid: false, error: 'Token contract mismatch' }
  }

  return { valid: true }
}

export async function verifyX402Payment(
  paymentSignatureHeader: string,
  expectedResource: string
): Promise<{ valid: boolean; txid?: string; payer?: string; error?: string; simulated?: boolean }> {
  try {
    const paymentPayload = decodeHeaderValue<X402PaymentPayload>(paymentSignatureHeader)
    const validation = validatePaymentPayload(paymentPayload, expectedResource)

    if (!validation.valid) {
      return { valid: false, error: validation.error }
    }

    if (X402_DEMO_MODE) {
      return {
        valid: true,
        txid: `simulated-${Date.now()}`,
        payer: 'demo-payer',
        simulated: true,
      }
    }

    if (!X402_FACILITATOR_URL) {
      return { valid: false, error: 'No x402 facilitator configured for live settlement' }
    }

    const facilitatorRes = await fetch(joinUrl(X402_FACILITATOR_URL, '/settle'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        x402Version: X402_VERSION,
        paymentPayload,
        paymentRequirements: paymentPayload.accepted,
      }),
    })

    if (!facilitatorRes.ok) {
      const errorBody = await facilitatorRes.text()
      return { valid: false, error: errorBody || 'Facilitator settlement failed' }
    }

    const result = (await facilitatorRes.json()) as FacilitatorSettlementResponse

    if (!result.success && !result.transaction && !result.txid) {
      return { valid: false, error: result.error || 'Payment settlement was rejected' }
    }

    return {
      valid: true,
      txid: result.transaction || result.txid,
      payer: result.payer,
      simulated: false,
    }
  } catch (error: any) {
    return { valid: false, error: error?.message || 'Unknown payment verification error' }
  }
}
