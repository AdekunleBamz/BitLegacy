import { NextRequest, NextResponse } from 'next/server'

function getStorageApiKey() {
  return process.env.NFT_STORAGE_KEY || process.env.NEXT_PUBLIC_NFT_STORAGE_KEY || ''
}

export async function POST(req: NextRequest) {
  const apiKey = getStorageApiKey()
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing NFT storage API key' }, { status: 500 })
  }

  try {
    const body = (await req.json()) as { envelope?: unknown }

    if (!body?.envelope) {
      return NextResponse.json({ error: 'Missing encrypted will payload' }, { status: 400 })
    }

    const blob = new Blob([JSON.stringify(body.envelope)], {
      type: 'application/json',
    })
    const formData = new FormData()
    formData.append('file', blob, 'will.encrypted.json')

    const uploadRes = await fetch('https://api.nft.storage/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    })

    if (!uploadRes.ok) {
      const errorBody = await uploadRes.text()
      return NextResponse.json(
        { error: errorBody || 'NFT storage upload failed' },
        { status: 502 }
      )
    }

    const uploadData = (await uploadRes.json()) as { value?: { cid?: string } }
    const cid = uploadData.value?.cid

    if (!cid) {
      return NextResponse.json({ error: 'Upload succeeded without a CID' }, { status: 502 })
    }

    return NextResponse.json({ cid })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unexpected upload error' },
      { status: 500 }
    )
  }
}
