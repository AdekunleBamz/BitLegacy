// src/app/api/estate/[owner]/route.ts
// x402-gated API endpoint — returns estate data after payment verification

import { NextRequest, NextResponse } from 'next/server'
import { cvToJSON, deserializeCV, serializeCV, standardPrincipalCV } from '@stacks/transactions'
import { build402Response, verifyX402Payment } from '@/lib/x402'
import { CONTRACT_ADDRESS } from '@/constants/contracts'

function encodeClarityPrincipal(address: string) {
  return `0x${Buffer.from(serializeCV(standardPrincipalCV(address))).toString('hex')}`
}

export async function GET(
  req: NextRequest,
  { params }: { params: { owner: string } }
) {
  const { owner } = params
  const resource = `/api/estate/${owner}`

  // Check for X-PAYMENT header
  const xPayment = req.headers.get('X-PAYMENT')

  if (!xPayment) {
    // Return 402 Payment Required
    const paymentRequired = build402Response(resource, CONTRACT_ADDRESS)
    return NextResponse.json(paymentRequired, {
      status: 402,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'X-PAYMENT-RESPONSE',
      },
    })
  }

  // Verify the payment (in production — for demo, we allow after any payment header)
  const { valid, txid, error } = await verifyX402Payment(xPayment, resource)

  if (!valid) {
    // Demo mode: allow through if payment header is present but facilitator not set up
    const isDemo = process.env.NEXT_PUBLIC_X402_DEMO === 'true'
    if (!isDemo) {
      return NextResponse.json({ error: `Payment invalid: ${error}` }, { status: 402 })
    }
  }

  // Payment verified — fetch estate data from Stacks API
  const network = process.env.NEXT_PUBLIC_NETWORK || 'testnet'
  const apiBase = network === 'mainnet'
    ? 'https://api.hiro.so'
    : 'https://api.testnet.hiro.so'

  try {
    const ownerArg = encodeClarityPrincipal(owner)

    const estateRes = await fetch(
      `${apiBase}/v2/contracts/call-read/${CONTRACT_ADDRESS}/estate-vault/get-estate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: owner,
          arguments: [ownerArg],
        }),
      }
    )

    // Also check trigger status
    const triggerRes = await fetch(
      `${apiBase}/v2/contracts/call-read/${CONTRACT_ADDRESS}/estate-vault/is-triggered`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

    return NextResponse.json(
      {
        estate: estateJson?.value ?? null,
        triggered: triggerJson?.value?.value === 'true',
        paymentTxid: txid,
      },
      {
        headers: {
          'X-PAYMENT-RESPONSE': JSON.stringify({ success: true, txid }),
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'X-PAYMENT-RESPONSE',
        },
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
      'Access-Control-Allow-Headers': 'Content-Type, X-PAYMENT',
      'Access-Control-Expose-Headers': 'X-PAYMENT-RESPONSE',
    },
  })
}
