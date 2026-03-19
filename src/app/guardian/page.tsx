'use client'
// src/app/guardian/page.tsx — Guardian confirmation portal

import { useState } from 'react'
import Link from 'next/link'
import { openContractCall } from '@stacks/connect'
import { useWallet } from '@/hooks/useWallet'
import ConnectWallet from '@/components/ConnectWallet'
import {
  buildConfirmReleaseTx,
  getGuardianPanel,
  getConfirmationCount,
  isCvTrue,
  type WalletContractCallOptions,
} from '@/lib/stacks'

export default function GuardianPage() {
  const { connected, address } = useWallet()

  const [ownerAddress, setOwnerAddress] = useState('')
  const [panel, setPanel] = useState<any>(null)
  const [confirmCount, setConfirmCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [txId, setTxId] = useState('')
  const [error, setError] = useState('')

  async function lookupPanel() {
    if (!ownerAddress) return
    setLoading(true)
    setError('')
    try {
      const [p, c] = await Promise.all([
        getGuardianPanel(ownerAddress),
        getConfirmationCount(ownerAddress),
      ])
      setPanel(p)
      setConfirmCount(Number(c?.value?.value || 0))
    } catch (e: any) {
      setError('Could not find guardian panel: ' + e.message)
    }
    setLoading(false)
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

  async function handleConfirm() {
    if (!address) return
    setConfirming(true)
    setError('')
    try {
      const tx = await buildConfirmReleaseTx(ownerAddress, address)
      const result = await openWalletTx(tx)
      setTxId(result.txId)
      setConfirmCount(prev => prev + 1)
    } catch (e: any) {
      setError(e.message)
    }
    setConfirming(false)
  }

  if (txId) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 gap-6">
        <div className="text-5xl">✅</div>
        <h2 className="text-2xl font-bold">Confirmation Submitted</h2>
        <p className="text-neutral-400 text-sm text-center max-w-sm">
          Your guardian confirmation has been recorded on-chain.
          {confirmCount >= 2 ? ' The estate is now releasable.' : ` ${2 - confirmCount} more confirmation(s) needed.`}
        </p>
        <a
          href={`https://explorer.hiro.so/txid/${txId}?chain=testnet`}
          target="_blank"
          rel="noreferrer"
          className="text-[#f7931a] text-sm underline"
        >
          View TX: {txId.slice(0, 16)}…
        </a>
        <Link href="/" className="btn-secondary">Back to home</Link>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-4 py-8 max-w-xl mx-auto">
      <Link href="/" className="text-neutral-500 text-sm hover:text-white mb-6 block">← Home</Link>
      <h1 className="text-2xl font-bold mb-2">Guardian Portal</h1>
      <p className="text-neutral-400 text-sm mb-8">
        If you are a named guardian for an estate, confirm the release here. 2 of 3 guardians must confirm before heirs can claim.
      </p>

      {!connected && (
        <div className="card mb-6 flex flex-col items-center gap-4 py-8">
          <p className="text-neutral-400 text-sm">Connect your wallet to confirm</p>
          <ConnectWallet />
        </div>
      )}

      <div className="flex flex-col gap-3 mb-6">
        <label className="label">Estate owner address</label>
        <input
          type="text"
          placeholder="SP... or ST..."
          value={ownerAddress}
          onChange={e => setOwnerAddress(e.target.value)}
        />
        <button
          onClick={lookupPanel}
          disabled={loading || !ownerAddress}
          className="btn-primary"
        >
          {loading ? 'Looking up…' : 'Look up panel'}
        </button>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      {panel && (
        <div className="flex flex-col gap-4">
          <div className="card">
            <p className="label mb-3">Guardian panel</p>

            {/* Confirmation progress */}
            <div className="bg-[#1a1a1a] rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-neutral-400">Confirmations</span>
                <span className={`text-sm font-bold ${confirmCount >= 2 ? 'text-green-400' : 'text-orange-400'}`}>
                  {confirmCount} / 2
                </span>
              </div>
              <div className="w-full bg-[#2a2a2a] rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${confirmCount >= 2 ? 'bg-green-500' : 'bg-[#f7931a]'}`}
                  style={{ width: `${(confirmCount / 2) * 100}%` }}
                />
              </div>
              {isCvTrue(panel?.confirmed?.value) && (
                <p className="text-xs text-green-400 mt-2">✓ Estate confirmed — heirs can now claim</p>
              )}
            </div>

            {/* Guardian list */}
            <div className="flex flex-col gap-2 mb-4">
              {(panel?.guardians?.value || []).map((g: any, i: number) => {
                const isConfirmed = isCvTrue(panel?.confirmations?.value?.[i]?.value)
                const isMe = connected && address && g.value === address
                return (
                  <div key={i} className={`flex items-center justify-between rounded-xl px-4 py-3 ${isMe ? 'bg-orange-950 border border-orange-800' : 'bg-[#1a1a1a]'}`}>
                    <div>
                      <p className="text-xs font-mono text-neutral-300">
                        {g.value?.slice(0, 12)}…{g.value?.slice(-6)}
                        {isMe && <span className="ml-2 text-orange-400">(you)</span>}
                      </p>
                    </div>
                    {isConfirmed ? (
                      <span className="badge-green">Confirmed</span>
                    ) : (
                      <span className="badge-orange">Pending</span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Confirm button */}
            {connected && !isCvTrue(panel?.confirmed?.value) && (
              <button
                onClick={handleConfirm}
                disabled={confirming || !connected}
                className="btn-primary w-full"
              >
                {confirming ? 'Signing confirmation…' : 'Submit my confirmation →'}
              </button>
            )}

            {isCvTrue(panel?.confirmed?.value) && (
              <div className="text-center text-green-400 text-sm py-2">
                ✅ This estate has been confirmed by guardians
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
