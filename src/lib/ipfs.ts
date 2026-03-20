// src/lib/ipfs.ts
// Heir-only encrypted will storage via IPFS

import { userSession } from '@/hooks/useWallet'

export interface WillDocument {
  version: '1.0'
  owner: string
  created_at: number
  message: string
  instructions: string
  documents: string[]
  contacts: {
    name: string
    role: string
    email?: string
    phone?: string
  }[]
}

export interface WillAccessRecipient {
  addr: string
  publicKey: string
  label?: string
}

interface EncryptedWillRecipient {
  addr: string
  publicKey: string
  label?: string
  cipherText: string
}

interface EncryptedWillEnvelope {
  version: '2.0'
  schema: 'bitlegacy-heir-access'
  owner: string
  created_at: number
  recipients: EncryptedWillRecipient[]
}

const COMPRESSED_PUBLIC_KEY_RE = /^(02|03)[0-9a-fA-F]{64}$/

function normalizeAddress(address: string) {
  return address.trim().toUpperCase()
}

function normalizePublicKey(publicKey: string) {
  return publicKey.trim().toLowerCase()
}

export function isValidAccessKey(publicKey: string) {
  return COMPRESSED_PUBLIC_KEY_RE.test(publicKey.trim())
}

function assertSignedIn() {
  if (!userSession.isUserSignedIn()) {
    throw new Error('Connect your wallet first')
  }
}

function normalizeRecipients(recipients: WillAccessRecipient[]) {
  const seen = new Set<string>()

  return recipients.map(recipient => {
    const addr = normalizeAddress(recipient.addr)
    const publicKey = normalizePublicKey(recipient.publicKey)

    if (!addr) {
      throw new Error('Each heir needs a wallet address')
    }

    if (!isValidAccessKey(publicKey)) {
      throw new Error(`Invalid access key for beneficiary ${addr}`)
    }

    if (seen.has(addr)) {
      throw new Error(`Duplicate beneficiary address detected: ${addr}`)
    }

    seen.add(addr)

    return {
      addr,
      publicKey,
      label: recipient.label?.trim() || undefined,
    }
  })
}

function isEncryptedWillEnvelope(value: unknown): value is EncryptedWillEnvelope {
  if (!value || typeof value !== 'object') return false

  const envelope = value as Partial<EncryptedWillEnvelope>

  return (
    envelope.version === '2.0' &&
    envelope.schema === 'bitlegacy-heir-access' &&
    Array.isArray(envelope.recipients)
  )
}

export async function uploadWillToIPFS(
  will: WillDocument,
  recipients: WillAccessRecipient[]
): Promise<string> {
  assertSignedIn()

  const normalizedRecipients = normalizeRecipients(recipients)
  if (!normalizedRecipients.length) {
    throw new Error('Add at least one heir access key before uploading a will')
  }

  const plaintext = JSON.stringify(will)
  const encryptedRecipients = await Promise.all(
    normalizedRecipients.map(async recipient => ({
      ...recipient,
      cipherText: await userSession.encryptContent(plaintext, {
        publicKey: recipient.publicKey,
      }),
    }))
  )

  const envelope: EncryptedWillEnvelope = {
    version: '2.0',
    schema: 'bitlegacy-heir-access',
    owner: normalizeAddress(will.owner),
    created_at: will.created_at,
    recipients: encryptedRecipients,
  }

  const res = await fetch('/api/will/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ envelope }),
  })

  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(errorBody || 'IPFS upload failed')
  }

  const data = (await res.json()) as { cid?: string }
  if (!data.cid) {
    throw new Error('Upload response did not include a CID')
  }

  return data.cid
}

export async function fetchWillFromIPFS(
  cid: string,
  beneficiaryAddress: string
): Promise<WillDocument> {
  assertSignedIn()

  const res = await fetch(`https://ipfs.io/ipfs/${cid}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`IPFS fetch failed: ${res.statusText}`)

  const envelope = (await res.json()) as unknown
  if (!isEncryptedWillEnvelope(envelope)) {
    throw new Error('Unsupported encrypted will format')
  }

  const entry = envelope.recipients.find(
    recipient => normalizeAddress(recipient.addr) === normalizeAddress(beneficiaryAddress)
  )
  if (!entry) {
    throw new Error('This wallet does not have access to decrypt the will')
  }

  const plaintext = await userSession.decryptContent(entry.cipherText, {
    privateKey: userSession.loadUserData().appPrivateKey,
  })

  const decoded =
    typeof plaintext === 'string' ? plaintext : new TextDecoder().decode(plaintext)

  return JSON.parse(decoded) as WillDocument
}
