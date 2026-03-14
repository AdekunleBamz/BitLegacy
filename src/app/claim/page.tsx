'use client'
// src/app/claim/page.tsx — Heir portal
// Uses x402 micropayment before showing claim details

import { useState } from 'react'
import Link from 'next/link'
import { openContractCall } from '@stacks/connect'
import { useWallet } from '@/hooks/useWallet'
import ConnectWallet from '@/components/ConnectWallet'
import {
  buildClaimInheritanceTx,
  buildTriggerEstateTx,
  getEstate,
  getGuardianPanel,
  isTriggered,
  satoshiToSBTC,
  type WalletContractCallOptions,
} from '@/lib/stacks'
import { x402Fetch, type X402PaymentRequired } from '@/lib/x402'

export default function ClaimPage() {
  const { connected, address } = useWallet()

  const [ownerAddress, setOwnerAddress] = useState('')
  const [estate, setEstate] = useState<any>(null)
  const [triggered, setTriggered] = useState(false)
  const [loading, setLoading] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [guardianConfirmed, setGuardianConfirmed] = useState<boolean | null>(null)
  const [txId, setTxId] = useState('')
  const [error, setError] = useState('')
  const [x402Paying, setX402Paying] = useState(false)

  async function syncGuardianStatus(nextEstate: any) {
    if (nextEstate?.['guardian-required']?.value !== 'true') {
      setGuardianConfirmed(null)
      return
    }

    const panel = await getGuardianPanel(ownerAddress)
    setGuardianConfirmed(panel?.value?.confirmed?.value === 'true')
  }

  async function openWalletTx(tx: WalletContractCallOptions) {
    return new Promise<any>((resolve, reject) => {
      void openContractCall({
        ...tx,
        appDetails: { name: 'BitLegacy', icon: '/logo.png' },
        onFinish: data => resolve(data),
        onCancel: () => reject(new Error('Transaction cancelled')),
      })
    })
  }

  async function lookupEstate() {
    if (!ownerAddress) return
    setLoading(true)
    setError('')
    try {
      // Use x402 to pay for the estate lookup — this is the bounty integration
      // The /api/estate/[owner] route returns 402 if no payment header
      setX402Paying(true)

      const res = await x402Fetch(
        `/api/estate/${ownerAddress}`,
        { method: 'GET' },
        async (payReq: X402PaymentRequired) => {
          // In production: open wallet to sign USDCx micropayment tx
          // Return base64-encoded signed tx payload
          console.log('x402 payment required:', payReq)
          // For hackathon demo: return a placeholder signed payload
          // Real: call openContractCall for a USDCx transfer
          return btoa(JSON.stringify({ demo: true, amount: payReq.maxAmountRequired }))
        }
      )

      setX402Paying(false)

      if (res.ok) {
        const data = await res.json()
        setEstate(data.estate)
        setTriggered(data.triggered)
        await syncGuardianStatus(data.estate)
      } else {
        // Fallback: direct on-chain read
        const [e, t] = await Promise.all([
          getEstate(ownerAddress),
          isTriggered(ownerAddress),
        ])
        setEstate(e)
        setTriggered(t?.value?.value === 'true')
        await syncGuardianStatus(e)
      }
    } catch {
      // Final fallback: direct chain reads
      try {
        const [e, t] = await Promise.all([
          getEstate(ownerAddress),
          isTriggered(ownerAddress),
        ])
        setEstate(e)
        setTriggered(t?.value?.value === 'true')
        await syncGuardianStatus(e)
      } catch (err: any) {
        setError('Could not find estate: ' + err.message)
      }
    }
    setLoading(false)
  }

  async function handleTrigger() {
    if (!address) return
    setTriggering(true)
    try {
      const tx = await buildTriggerEstateTx(ownerAddress, address)
      const result = await openWalletTx(tx)
      setTriggered(true)
      setTxId(result.txId)
    } catch (e: any) {
      setError(e.message)
    }
    setTriggering(false)
  }

  async function handleClaim() {
    if (!address) return
    setClaiming(true)
    setError('')
    try {
      const tx = await buildClaimInheritanceTx({ owner: ownerAddress, senderAddress: address })
      const result = await openWalletTx(tx)
      setTxId(result.txId)
    } catch (e: any) {
      setError(e.message)
    }
    setClaiming(false)
  }

  if (txId) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 gap-6">
        <div className="text-5xl">🎉</div>
        <h2 className="text-2xl font-bold">Inheritance Claimed!</h2>
        <a
          href={`https://explorer.hiro.so/txid/${txId}?chain=testnet`}
          target="_blank"
          rel="noreferrer"
          className="text-[#f7931a] text-sm underline"
        >
          View transaction: {txId.slice(0, 16)}…
        </a>
        <Link href="/" className="btn-secondary">Back to home</Link>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-4 py-8 max-w-xl mx-auto">
      <Link href="/" className="text-neutral-500 text-sm hover:text-white mb-6 block">← Home</Link>
      <h1 className="text-2xl font-bold mb-2">Claim Inheritance</h1>
      <p className="text-neutral-400 text-sm mb-8">
        Enter the estate owner&apos;s address to check if an inheritance is available for you.
      </p>

      {!connected && (
        <div className="card mb-6 flex flex-col items-center gap-4 py-8">
          <p className="text-neutral-400 text-sm">Connect your wallet to claim</p>
          <ConnectWallet />
        </div>
      )}

      {/* x402 badge */}
      <div className="flex items-center gap-2 mb-5 text-xs text-purple-400 bg-purple-950 border border-purple-800 rounded-xl px-4 py-2">
        <span>⚡</span>
        <span>Estate lookups powered by <strong>x402</strong> — pay <strong>$0.01 USDCx</strong> per verification query</span>
      </div>

      {/* Lookup form */}
      <div className="flex flex-col gap-3 mb-6">
        <label className="label">Estate owner address</label>
        <input
          type="text"
          placeholder="SP... or ST..."
          value={ownerAddress}
          onChange={e => setOwnerAddress(e.target.value)}
        />
        <button
          onClick={lookupEstate}
          disabled={loading || !ownerAddress}
          className="btn-primary"
        >
          {x402Paying ? '⚡ Processing x402 payment…' : loading ? 'Looking up…' : 'Look up estate'}
        </button>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Estate found */}
      {estate && (
        <div className="flex flex-col gap-4">
          <div className="card">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="label">Estate status</p>
                {triggered ? (
                  <span className="badge-green">Triggered — eligible to claim</span>
                ) : (
                  <span className="badge-orange">Active — owner still alive</span>
                )}
              </div>
              <div className="text-right">
                <p className="label">Total locked</p>
                <p className="text-xl font-bold text-[#f7931a]">
                  {satoshiToSBTC(Number(estate['total-locked']?.value || 0)).toFixed(6)} sBTC
                </p>
              </div>
            </div>

            {/* Check if caller is a beneficiary */}
            <div className="bg-[#1a1a1a] rounded-xl p-4 mb-4">
              <p className="label mb-2">Your share</p>
              {connected && address ? (
                (() => {
                  const benes = estate['beneficiaries']?.value || []
                  const myEntry = benes.find((b: any) => b.value?.addr?.value === address)
                  if (myEntry) {
                    const pct = myEntry.value?.['share-pct']?.value
                    const total = Number(estate['total-locked']?.value || 0)
                    const myShare = (total * pct) / 100
                    return (
                      <div>
                        <p className="text-lg font-bold text-green-400">
                          {satoshiToSBTC(myShare).toFixed(6)} sBTC
                        </p>
                        <p className="text-xs text-neutral-500 mt-0.5">{pct}% of estate · label: {myEntry.value?.label?.value}</p>
                      </div>
                    )
                  }
                  return <p className="text-sm text-neutral-500">Your address is not a beneficiary of this estate.</p>
                })()
              ) : (
                <p className="text-sm text-neutral-500">Connect wallet to check your share.</p>
              )}
            </div>

            {estate['guardian-required']?.value === 'true' && (
              <div className="bg-[#1a1a1a] rounded-xl p-4 mb-4">
                <p className="label mb-2">Guardian status</p>
                <p className="text-sm text-neutral-500">
                  {guardianConfirmed
                    ? 'Guardian approvals complete.'
                    : 'Waiting for 2-of-3 guardian confirmations before claims unlock.'}
                </p>
              </div>
            )}

            {/* Trigger button if window elapsed but not triggered */}
            {!triggered && (
              <button
                onClick={handleTrigger}
                disabled={triggering || !connected}
                className="btn-secondary w-full mb-3"
              >
                {triggering ? 'Broadcasting…' : 'Trigger estate (if window elapsed)'}
              </button>
            )}

            {/* Claim button */}
            {triggered && connected && guardianConfirmed !== false && (
              <button
                onClick={handleClaim}
                disabled={claiming}
                className="btn-primary w-full"
              >
                {claiming ? 'Broadcasting claim…' : 'Claim my inheritance →'}
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
