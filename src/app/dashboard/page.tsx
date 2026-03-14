'use client'
// src/app/dashboard/page.tsx — Owner portal

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { openContractCall } from '@stacks/connect'
import { useWallet } from '@/hooks/useWallet'
import ConnectWallet from '@/components/ConnectWallet'
import {
  getEstate,
  getTimeRemaining,
  getGuardianPanel,
  buildProofOfLifeTx,
  buildUpdateEstateTx,
  blocksToHuman,
  isCvTrue,
  satoshiToSBTC,
  type WalletContractCallOptions,
} from '@/lib/stacks'

const LEGACY_WINDOW_BLOCK_TO_SECONDS = 600
const LEGACY_WINDOW_VALUES = new Set([
  12, 36, 72, 144, 1008, 2016, 4320, 8640, 12960, 25920, 52560, 105120,
])

function isLegacyWindowValue(windowValue: number): boolean {
  return LEGACY_WINDOW_VALUES.has(windowValue)
}

function getIpfsCidFromEstate(estate: any): string | undefined {
  const raw = estate?.['ipfs-cid']?.value
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : undefined
}

export default function Dashboard() {
  const { connected, address } = useWallet()

  const [estate, setEstate] = useState<any>(null)
  const [guardianPanel, setGuardianPanel] = useState<any>(null)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [windowValue, setWindowValue] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [pinging, setPinging] = useState(false)
  const [repairingWindow, setRepairingWindow] = useState(false)
  const [txResult, setTxResult] = useState<string | null>(null)
  const legacyWindowDetected =
    windowValue !== null &&
    isLegacyWindowValue(windowValue) &&
    !isCvTrue(estate?.['triggered']?.value)

  useEffect(() => {
    if (!connected || !address) return
    load()
    // The load function depends on the current wallet state and is intentionally
    // re-run only when the connected address changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, address])

  async function load() {
    if (!address) return
    setLoading(true)
    try {
      const [e, t] = await Promise.all([getEstate(address), getTimeRemaining(address)])
      setEstate(e)
      setWindowValue(Number(e?.['window-blocks']?.value || 0))
      if (isCvTrue(e?.['guardian-required']?.value)) {
        const panel = await getGuardianPanel(address)
        setGuardianPanel(panel ?? null)
      } else {
        setGuardianPanel(null)
      }
      if (t?.value) setTimeLeft(Number(t.value.value))
    } catch {}
    setLoading(false)
  }

  async function openWalletTx(tx: WalletContractCallOptions) {
    return new Promise<any>((resolve, reject) => {
      void openContractCall({
        ...tx,
        appDetails: { name: 'BitLegacy', icon: '/logo.svg' },
        onFinish: data => resolve(data),
        onCancel: () => reject(new Error('Transaction cancelled')),
      })
    })
  }

  async function handleProofOfLife() {
    if (!address) return
    setPinging(true)
    try {
      const tx = await buildProofOfLifeTx(address)
      const result = await openWalletTx(tx)
      setTxResult(result.txId)
      setTimeout(load, 3000)
    } catch (e: any) {
      console.error(e)
    }
    setPinging(false)
  }

  async function handleRepairLegacyWindow() {
    if (!address || !estate || !windowValue) return
    if (!isLegacyWindowValue(windowValue)) return

    const correctedWindowSeconds = windowValue * LEGACY_WINDOW_BLOCK_TO_SECONDS
    setRepairingWindow(true)
    try {
      const updateTx = await buildUpdateEstateTx({
        newWindowSeconds: correctedWindowSeconds,
        ipfsCid: getIpfsCidFromEstate(estate),
        senderAddress: address,
      })
      const updateResult = await openWalletTx(updateTx)
      setTxResult(updateResult.txId)

      const proofTx = await buildProofOfLifeTx(address)
      const proofResult = await openWalletTx(proofTx)
      setTxResult(proofResult.txId)

      setTimeout(load, 3000)
    } catch (e: any) {
      console.error(e)
    }
    setRepairingWindow(false)
  }

  if (!connected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6">
        <p className="text-neutral-400">Connect your wallet to view your estate.</p>
        <ConnectWallet cta="Connect Wallet" />
      </div>
    )
  }

  return (
    <main className="min-h-screen px-4 py-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link href="/" className="text-neutral-500 text-sm hover:text-white">← Home</Link>
          <h1 className="text-2xl font-bold mt-1">My Estate</h1>
        </div>
        <ConnectWallet />
      </div>

      {loading ? (
        <div className="card animate-pulse h-40 flex items-center justify-center text-neutral-600">
          Loading estate…
        </div>
      ) : !estate ? (
        /* No estate yet */
        <div className="card text-center py-16 flex flex-col items-center gap-6">
          <div className="text-5xl">🔐</div>
          <div>
            <h2 className="text-xl font-semibold mb-2">No estate found</h2>
            <p className="text-neutral-400 text-sm max-w-sm">
              Create your estate to start protecting your Bitcoin for your family.
            </p>
          </div>
          <Link href="/create" className="btn-primary">
            Create Estate →
          </Link>
        </div>
      ) : (
        /* Estate exists */
        <div className="flex flex-col gap-4">

          {/* Status card */}
          <div className="card">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="label">Status</p>
                {isCvTrue(estate['triggered']?.value) ? (
                  <span className="badge-red">Triggered — heirs can claim</span>
                ) : (
                  <span className="badge-green">Active — you are alive</span>
                )}
              </div>
              <div className="text-right">
                <p className="label">Locked sBTC</p>
                <p className="text-2xl font-bold text-[#f7931a]">
                  {satoshiToSBTC(Number(estate['total-locked']?.value || 0)).toFixed(6)}
                  <span className="text-sm text-neutral-400 ml-1">sBTC</span>
                </p>
              </div>
            </div>

            {/* Countdown */}
            {timeLeft !== null && !isCvTrue(estate['triggered']?.value) && (
              <div className="bg-[#1a1a1a] rounded-xl p-4 mb-4">
                <p className="label">Time until estate can trigger</p>
                <p className="text-xl font-semibold">
                  {timeLeft === 0 ? (
                    <span className="text-red-400">Window expired!</span>
                  ) : (
                    blocksToHuman(timeLeft)
                  )}
                </p>
                <p className="text-xs text-neutral-500 mt-1">
                  ~{timeLeft} second{timeLeft === 1 ? '' : 's'} remaining
                </p>
              </div>
            )}

            {/* Legacy window repair */}
            {legacyWindowDetected && (
              <div className="bg-orange-950/40 border border-orange-800 rounded-xl p-4 mb-4">
                <p className="text-sm text-orange-300 font-semibold">Legacy window format detected</p>
                <p className="text-xs text-orange-200 mt-1">
                  This estate was created with an older block-based window value ({windowValue}), which now behaves like {windowValue} seconds.
                  Repairing sets it to {windowValue * LEGACY_WINDOW_BLOCK_TO_SECONDS} seconds (~{blocksToHuman(windowValue * LEGACY_WINDOW_BLOCK_TO_SECONDS)}),
                  then immediately resets the countdown.
                </p>
                <button
                  onClick={handleRepairLegacyWindow}
                  disabled={repairingWindow}
                  className="btn-secondary w-full mt-3"
                >
                  {repairingWindow ? 'Repairing + Resetting…' : 'Repair Window + Reset Countdown'}
                </button>
              </div>
            )}

            {/* Proof of life button */}
            {!isCvTrue(estate['triggered']?.value) && !legacyWindowDetected && (
              <button
                onClick={handleProofOfLife}
                disabled={pinging}
                className="btn-primary w-full"
              >
                {pinging ? 'Broadcasting…' : '✓ I\'m Alive — Reset Countdown'}
              </button>
            )}

            {txResult && (
              <p className="text-xs text-green-400 mt-3 text-center">
                TX broadcast:{' '}
                <a
                  href={`https://explorer.hiro.so/txid/${txResult}?chain=testnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {txResult.slice(0, 12)}…
                </a>
              </p>
            )}
          </div>

          {/* Beneficiaries */}
          <div className="card">
            <p className="label mb-3">Beneficiaries</p>
            <div className="flex flex-col gap-2">
              {(estate['beneficiaries']?.value || []).map((b: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-[#1a1a1a] rounded-xl px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-mono text-neutral-300">
                      {b.value?.addr?.value?.slice(0, 12)}…
                    </p>
                    <p className="text-xs text-neutral-500">{b.value?.label?.value}</p>
                  </div>
                  <span className="badge-orange">
                    {b.value?.['share-pct']?.value}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Guardian status */}
          {isCvTrue(estate['guardian-required']?.value) && (
            <div className="card">
              <p className="label mb-2">Guardian confirmation</p>
              <p className="text-sm text-neutral-400">
                {isCvTrue(guardianPanel?.confirmed?.value)
                  ? 'Guardians confirmed — estate can be released'
                  : guardianPanel
                    ? `Waiting for ${
                        2 -
                        (guardianPanel.confirmations?.value?.filter(
                          (entry: any) => isCvTrue(entry?.value)
                        ).length || 0)
                      } more confirmation(s)`
                    : 'Guardian panel still needs to be set up'}
              </p>
            </div>
          )}

          {/* IPFS will */}
          {estate['ipfs-cid']?.value && (
            <div className="card">
              <p className="label mb-2">Encrypted will</p>
              <a
                href={`https://ipfs.io/ipfs/${estate['ipfs-cid'].value}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-[#f7931a] hover:underline font-mono"
              >
                ipfs://{estate['ipfs-cid'].value.slice(0, 20)}…
              </a>
            </div>
          )}

          {/* Danger zone */}
          <div className="card border-red-900/50">
            <p className="label text-red-500 mb-3">Danger zone</p>
            <Link
              href="/create?action=cancel"
              className="text-sm text-red-400 hover:text-red-300 underline"
            >
              Cancel estate and reclaim sBTC
            </Link>
          </div>
        </div>
      )}
    </main>
  )
}
