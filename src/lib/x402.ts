// src/lib/x402.ts
// x402 HTTP payment protocol integration for BitLegacy
// Used to gate heir verification API calls behind USDCx micropayments
// This is the "Best x402 Integration" bounty target

import { X402_ENDPOINT, X402_PRICE_USDCX } from '@/constants/contracts'

export interface X402PaymentRequired {
  scheme: 'exact'
  network: 'stacks-mainnet' | 'stacks-testnet'
  maxAmountRequired: string
  resource: string
  description: string
  mimeType: string
  payTo: string
  requiredDeadlineSeconds: number
  extra: {
    name: string
    version: string
  }
}

export interface X402PaymentPayload {
  scheme: 'exact'
  network: string
  payload: string      // base64-encoded signed tx
  resource: string
}

// ─── Client-side x402 flow ────────────────────────────────────────────────────

/**
 * Fetches a resource that requires x402 payment.
 * On 402 response, constructs and broadcasts the payment, then retries.
 */
export async function x402Fetch(
  url: string,
  options: RequestInit = {},
  paymentSigner: (paymentRequired: X402PaymentRequired) => Promise<string>
): Promise<Response> {
  // First attempt — no payment header
  const firstResponse = await fetch(url, options)

  if (firstResponse.status !== 402) {
    return firstResponse
  }

  // Parse the 402 payment requirements
  const paymentRequired: X402PaymentRequired = await firstResponse.json()

  // Ask the wallet/signer to authorize payment
  const signedPayload = await paymentSigner(paymentRequired)

  const paymentHeader: X402PaymentPayload = {
    scheme: 'exact',
    network: paymentRequired.network,
    payload: signedPayload,
    resource: paymentRequired.resource,
  }

  // Retry with X-PAYMENT header
  const paidResponse = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'X-PAYMENT': btoa(JSON.stringify(paymentHeader)),
    },
  })

  return paidResponse
}

/**
 * Builds the X-PAYMENT-RESPONSE header value from a facilitator response.
 */
export function parsePaymentResponse(response: Response): string | null {
  return response.headers.get('X-PAYMENT-RESPONSE')
}

// ─── Server-side x402 middleware helpers ─────────────────────────────────────

/**
 * Standard 402 response body for BitLegacy API routes.
 * Heirs pay $0.01 USDCx to hit verification endpoints.
 */
export function build402Response(resource: string, payTo: string): X402PaymentRequired {
  return {
    scheme: 'exact',
    network: (process.env.NEXT_PUBLIC_NETWORK === 'mainnet'
      ? 'stacks-mainnet'
      : 'stacks-testnet') as 'stacks-mainnet' | 'stacks-testnet',
    maxAmountRequired: X402_PRICE_USDCX,
    resource,
    description: `BitLegacy heir verification — pay ${X402_PRICE_USDCX} USDCx to verify your identity`,
    mimeType: 'application/json',
    payTo,
    requiredDeadlineSeconds: 60,
    extra: {
      name: 'BitLegacy',
      version: '1.0.0',
    },
  }
}

/**
 * Verifies an x402 payment header against the facilitator.
 * Returns true if payment is valid and settled.
 */
export async function verifyX402Payment(
  xPaymentHeader: string,
  expectedResource: string
): Promise<{ valid: boolean; txid?: string; error?: string }> {
  try {
    const payment: X402PaymentPayload = JSON.parse(atob(xPaymentHeader))

    if (payment.resource !== expectedResource) {
      return { valid: false, error: 'Resource mismatch' }
    }

    // Call the x402 facilitator to verify settlement
    const facilitatorRes = await fetch(X402_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scheme: payment.scheme,
        network: payment.network,
        payload: payment.payload,
        resource: payment.resource,
      }),
    })

    if (!facilitatorRes.ok) {
      const err = await facilitatorRes.text()
      return { valid: false, error: err }
    }

    const result = await facilitatorRes.json()
    return { valid: true, txid: result.txid }
  } catch (e: any) {
    return { valid: false, error: e.message }
  }
}

// ─── USDCx token helpers ──────────────────────────────────────────────────────

export const USDCX_CONTRACT_MAINNET = 'SM3VDXK3WZZSA84XXB1E2TF2QW2D29S67D9EKTR92.token-susdt'
export const USDCX_CONTRACT_TESTNET = 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.usdcx-token'

export const USDCX_CONTRACT =
  process.env.NEXT_PUBLIC_NETWORK === 'mainnet'
    ? USDCX_CONTRACT_MAINNET
    : USDCX_CONTRACT_TESTNET

/** Convert USDCx decimal string to micro-units (6 decimals) */
export function usdcxToMicro(amount: string): number {
  return Math.round(parseFloat(amount) * 1_000_000)
}

/** Format micro-USDCx back to human string */
export function microToUsdcx(micro: number): string {
  return (micro / 1_000_000).toFixed(2)
}
