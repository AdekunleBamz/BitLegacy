'use client'
// src/app/claim/page.tsx — Heir portal
// Uses x402 micropayment before showing claim details

import { useState } from 'react'
import Link from 'next/link'
import { openContractCall, openSTXTransfer } from '@stacks/connect'
import { useWallet } from '@/hooks/useWallet'
import Navbar from '@/components/Navbar'
import ConnectWallet from '@/components/ConnectWallet'
import {
  buildClaimInheritanceTx,
  buildTriggerEstateTx,
  getGuardianPanel,
  isCvTrue,
  satoshiToSBTC,
  type WalletContractCallOptions,
} from '@/lib/stacks'
import {
  fetchWillFromIPFS,
  type WillDocument,
} from '@/lib/ipfs'
import {
  getX402PriceLabel,
  x402Fetch,
  type X402PaymentRequired,
  type X402SignedPayment,
} from '@/lib/x402'
import { NETWORK } from '@/constants/contracts'

function getBeneficiaryEntry(estate: any, walletAddress: string | null) {
  if (!walletAddress) return null

  const beneficiaries = estate?.['beneficiaries']?.value || []
  return (
    beneficiaries.find((beneficiary: any) => beneficiary.value?.addr?.value === walletAddress) || null
  )
}

export default function ClaimPage() {
  const { connected, address, accessKey } = useWallet()

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
  const [willData, setWillData] = useState<WillDocument | null>(null)
  const [willLoading, setWillLoading] = useState(false)
  const [willError, setWillError] = useState('')
  const [copied, setCopied] = useState(false)

  async function syncGuardianStatus(nextEstate: any, nextOwnerAddress: string) {
    if (!isCvTrue(nextEstate?.['guardian-required']?.value)) {
      setGuardianConfirmed(null)
      return
    }

    const panel = await getGuardianPanel(nextOwnerAddress)
    setGuardianConfirmed(isCvTrue(panel?.confirmed?.value))
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

  async function requestX402Payment(
    paymentRequired: X402PaymentRequired
  ): Promise<X402SignedPayment> {
    if (!connected || !address) {
      throw new Error('Connect your wallet to pay for estate lookup')
    }

    if (paymentRequired.paymentRequirements.asset !== 'STX') {
      throw new Error('This browser wallet flow currently supports STX x402 payments only')
    }

    return new Promise<X402SignedPayment>((resolve, reject) => {
      void openSTXTransfer({
        network: NETWORK,
        stxAddress: address,
        recipient: paymentRequired.paymentRequirements.payTo,
        amount: paymentRequired.paymentRequirements.amount,
        memo: paymentRequired.paymentRequirements.memo,
        appDetails: { name: 'BitLegacy', icon: '/logo.png' },
        onFinish: data =>
          resolve({
            transaction: data.txRaw,
            txId: data.txId,
          }),
        onCancel: () => reject(new Error('x402 payment cancelled')),
      })
    })
  }

  async function copyAccessKey() {
    if (!accessKey) return

    await navigator.clipboard.writeText(accessKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function lookupEstate() {
    if (!ownerAddress) return
    setLoading(true)
    setError('')
    setWillData(null)
    setWillError('')
    setEstate(null)

    try {
      setX402Paying(true)

      const res = await x402Fetch(`/api/estate/${ownerAddress}`, { method: 'GET' }, requestX402Payment)
      setX402Paying(false)

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || 'x402 payment verification failed')
      }

      const data = await res.json()
      setEstate(data.estate)
      setTriggered(data.triggered)
      await syncGuardianStatus(data.estate, ownerAddress)
    } catch (err: any) {
      setError(err?.message || 'Could not look up estate')
      setGuardianConfirmed(null)
    } finally {
      setLoading(false)
      setX402Paying(false)
    }
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

  async function handleDecryptWill() {
    if (!estate?.['ipfs-cid']?.value || !address) return

    setWillLoading(true)
    setWillError('')

    try {
      const will = await fetchWillFromIPFS(estate['ipfs-cid'].value, address)
      setWillData(will)
    } catch (err: any) {
      setWillData(null)
      setWillError(err?.message || 'Could not decrypt will')
    } finally {
      setWillLoading(false)
    }
  }

  if (txId) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 gap-6">
        <div className="text-5xl">🎉</div>
        <h2 className="text-2xl font-bold">Inheritance Claimed!</h2>
        <a
          href={`https://explorer.hiro.so/txid/${txId}?chain=${NETWORK}`}
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

  const myEntry = getBeneficiaryEntry(estate, address)
  const hasEncryptedWill = Boolean(estate?.['ipfs-cid']?.value)

  return (
    <main className="min-h-screen px-4 pb-8 max-w-xl mx-auto">
      <Navbar />
      <div className="mt-8 mb-8">
        <h1 className="text-2xl font-bold mb-2">Claim Inheritance</h1>
        <p className="text-neutral-400 text-sm">
          Look up an estate, pay the x402 fee, and unlock beneficiary-only will access.
        </p>
      </div>

      {!connected && (
        <div className="card mb-6 flex flex-col items-center gap-4 py-8">
          <p className="text-neutral-400 text-sm">Connect your wallet to pay and claim</p>
          <ConnectWallet />
        </div>
      )}

      {connected && accessKey && (
        <div className="card mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="label mb-2">Your heir access key</p>
              <p className="text-xs text-neutral-500 mb-3">
                Share this with the estate owner before they encrypt a will for you.
              </p>
              <p className="text-xs font-mono break-all text-neutral-300">{accessKey}</p>
            </div>
            <button onClick={copyAccessKey} className="btn-secondary text-xs shrink-0">
              {copied ? 'Copied' : 'Copy key'}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-5 text-xs text-orange-300 bg-orange-950 border border-orange-800 rounded-xl px-4 py-2">
        <span>402</span>
        <span>
          Estate lookups use live <strong>x402</strong> payments on <strong>{NETWORK}</strong> at{' '}
          <strong>{getX402PriceLabel()}</strong> per request.
        </span>
      </div>

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
          disabled={loading || !ownerAddress || !connected}
          className="btn-primary"
        >
          {x402Paying ? 'Opening wallet for x402 payment…' : loading ? 'Looking up…' : 'Pay + look up estate'}
        </button>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

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

            <div className="bg-[#1a1a1a] rounded-xl p-4 mb-4">
              <p className="label mb-2">Your share</p>
              {connected && address ? (
                myEntry ? (
                  <div>
                    <p className="text-lg font-bold text-green-400">
                      {satoshiToSBTC(
                        (Number(estate['total-locked']?.value || 0) *
                          Number(myEntry.value?.['share-pct']?.value || 0)) /
                          100
                      ).toFixed(6)}{' '}
                      sBTC
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {myEntry.value?.['share-pct']?.value}% of estate · label: {myEntry.value?.label?.value}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500">Your address is not a beneficiary of this estate.</p>
                )
              ) : (
                <p className="text-sm text-neutral-500">Connect wallet to check your share.</p>
              )}
            </div>

            {isCvTrue(estate['guardian-required']?.value) && (
              <div className="bg-[#1a1a1a] rounded-xl p-4 mb-4">
                <p className="label mb-2">Guardian status</p>
                <p className="text-sm text-neutral-500">
                  {guardianConfirmed
                    ? 'Guardian approvals complete.'
                    : 'Waiting for 2-of-3 guardian confirmations before claims unlock.'}
                </p>
              </div>
            )}

            {hasEncryptedWill && myEntry && (
              <div className="bg-[#1a1a1a] rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="label mb-1">Encrypted will</p>
                    <p className="text-xs text-neutral-500">
                      Only heirs with registered BitLegacy access keys can decrypt this message.
                    </p>
                  </div>
                  <button
                    onClick={handleDecryptWill}
                    disabled={willLoading}
                    className="btn-secondary text-xs shrink-0"
                  >
                    {willLoading ? 'Decrypting…' : willData ? 'Decrypt again' : 'Decrypt will'}
                  </button>
                </div>

                {willError && (
                  <p className="text-sm text-red-400">{willError}</p>
                )}

                {willData && (
                  <div className="border border-[#2a2a2a] rounded-xl p-4">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{willData.message}</p>
                  </div>
                )}
              </div>
            )}

            {!triggered && (
              <button
                onClick={handleTrigger}
                disabled={triggering || !connected}
                className="btn-secondary w-full mb-3"
              >
                {triggering ? 'Broadcasting…' : 'Trigger estate (if window elapsed)'}
              </button>
            )}

            {triggered && connected && guardianConfirmed !== false && myEntry && (
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
