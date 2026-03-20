// src/app/api/estate/[owner]/route.ts
// x402-gated API endpoint - returns estate data after payment verification

import { NextRequest, NextResponse } from 'next/server'
import { cvToJSON, deserializeCV, serializeCV, standardPrincipalCV } from '@stacks/transactions'
import {
  build402Response,
  buildPaymentRequiredHeader,
  buildPaymentResponseHeader,
  verifyX402Payment,
} from '@/lib/x402'
import { CONTRACT_ADDRESS, NETWORK } from '@/constants/contracts'

function encodeClarityPrincipal(address: string) {
  return `0x${Buffer.from(serializeCV(standardPrincipalCV(address))).toString('hex')}`
}

function unwrapOptionalTuple(json: any) {
  if (!json || json.value === null) return null
  const inner = json.value
  if (inner && typeof inner === 'object' && inner.value && typeof inner.value === 'object') {
    return inner.value
  }
  return inner
}

function isCvTrue(value: unknown): boolean {
  return value === true || value === 'true'
}

function corsHeaders(extraHeaders: Record<string, string> = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'payment-required, payment-response',
    ...extraHeaders,
  }
}

function getHiroHeaders() {
  const apiKey = process.env.HIRO_API_KEY || process.env.NEXT_PUBLIC_HIRO_API_KEY
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (apiKey) {
    headers['x-api-key'] = apiKey
  }

  return headers
}

export async function GET(
  req: NextRequest,
  { params }: { params: { owner: string } }
) {
  const { owner } = params
  const resource = `/api/estate/${owner}`
  const paymentRequired = build402Response(resource)
  const paymentSignature = req.headers.get('payment-signature')

  if (!paymentSignature) {
    return NextResponse.json(
      {
        error: 'Payment required',
        paymentRequired,
      },
      {
        status: 402,
        headers: corsHeaders({
          'payment-required': buildPaymentRequiredHeader(paymentRequired),
        }),
      }
    )
  }

  const { valid, txid, payer, error } = await verifyX402Payment(paymentSignature, resource)

  if (!valid) {
    return NextResponse.json(
      {
        error: `Payment invalid: ${error}`,
        paymentRequired,
      },
      {
        status: 402,
        headers: corsHeaders({
          'payment-required': buildPaymentRequiredHeader(paymentRequired),
        }),
      }
    )
  }

  const apiBase = NETWORK === 'mainnet'
    ? 'https://api.hiro.so'
    : 'https://api.testnet.hiro.so'

  try {
    const ownerArg = encodeClarityPrincipal(owner)

    const estateRes = await fetch(
      `${apiBase}/v2/contracts/call-read/${CONTRACT_ADDRESS}/estate-vault/get-estate`,
      {
        method: 'POST',
        headers: getHiroHeaders(),
        body: JSON.stringify({
          sender: owner,
          arguments: [ownerArg],
        }),
      }
    )

    const triggerRes = await fetch(
      `${apiBase}/v2/contracts/call-read/${CONTRACT_ADDRESS}/estate-vault/is-triggered`,
      {
        method: 'POST',
        headers: getHiroHeaders(),
        body: JSON.stringify({
          sender: owner,
          arguments: [ownerArg],
        }),
      }
    )

    const estateData = estateRes.ok ? await estateRes.json() : null
    const triggerData = triggerRes.ok ? await triggerRes.json() : null
    const estateJson = estateData?.result ? cvToJSON(deserializeCV(estateData.result)) : null
    const triggerJson = triggerData?.result ? cvToJSON(deserializeCV(triggerData.result)) : null
    const estate = unwrapOptionalTuple(estateJson)

    return NextResponse.json(
      {
        estate,
        triggered: isCvTrue(triggerJson?.value?.value),
        payment: {
          txid,
          payer,
        },
      },
      {
        headers: corsHeaders({
          'payment-response': buildPaymentResponseHeader({
            success: true,
            payer,
            transaction: txid,
            network: paymentRequired.paymentRequirements.network,
          }),
        }),
      }
    )
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, payment-signature',
      'Access-Control-Expose-Headers': 'payment-required, payment-response',
    },
  })
}
