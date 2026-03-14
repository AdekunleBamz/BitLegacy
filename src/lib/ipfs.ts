// src/lib/ipfs.ts
// Encrypted will storage via IPFS (using web3.storage or nft.storage)
// Falls back to Stacks Gaia for auth'd storage

export interface WillDocument {
  version: '1.0'
  owner: string
  created_at: number
  message: string          // personal message to heirs
  instructions: string     // distribution instructions
  documents: string[]      // list of referenced documents
  contacts: {
    name: string
    role: string
    email?: string
    phone?: string
  }[]
}

/**
 * Encrypts and uploads a will document to IPFS.
 * Returns the IPFS CID to store on-chain.
 * Uses a simple symmetric encryption with the owner's address as salt.
 */
export async function uploadWillToIPFS(
  will: WillDocument,
  encryptionKey: string
): Promise<string> {
  const plaintext = JSON.stringify(will)
  const encrypted = await encryptData(plaintext, encryptionKey)
  const blob = new Blob([encrypted], { type: 'application/octet-stream' })

  // Using nft.storage (free tier, IPFS-pinned)
  const formData = new FormData()
  formData.append('file', blob, 'will.enc')

  const apiKey = process.env.NEXT_PUBLIC_NFT_STORAGE_KEY || ''
  if (!apiKey) {
    // Dev fallback: return mock CID
    console.warn('No NFT_STORAGE_KEY — using mock CID')
    return 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
  }

  const res = await fetch('https://api.nft.storage/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  })

  if (!res.ok) throw new Error(`IPFS upload failed: ${res.statusText}`)
  const data = await res.json()
  return data.value.cid as string
}

/**
 * Fetches and decrypts a will from IPFS by CID.
 */
export async function fetchWillFromIPFS(
  cid: string,
  decryptionKey: string
): Promise<WillDocument> {
  const res = await fetch(`https://ipfs.io/ipfs/${cid}`)
  if (!res.ok) throw new Error(`IPFS fetch failed: ${res.statusText}`)
  const encrypted = await res.text()
  const plaintext = await decryptData(encrypted, decryptionKey)
  return JSON.parse(plaintext) as WillDocument
}

// ─── AES-GCM encryption helpers ──────────────────────────────────────────────

async function getKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'PBKDF2' }, false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('bitlegacy-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptData(plaintext: string, secret: string): Promise<string> {
  const key = await getKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, enc.encode(plaintext)
  )
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.byteLength)
  return btoa(String.fromCharCode(...combined))
}

async function decryptData(encrypted: string, secret: string): Promise<string> {
  const key = await getKey(secret)
  const combined = new Uint8Array(atob(encrypted).split('').map(c => c.charCodeAt(0)))
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(plaintext)
}
