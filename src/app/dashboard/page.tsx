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
  getYieldDeposit,
  getAccruedYield,
  buildProofOfLifeTx,
  buildUpdateEstateTx,
  buildDepositToYieldTx,
  buildWithdrawFromYieldTx,
  buildHarvestYieldTx,
  sBTCToSatoshi,
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
  const [liveTimeLeft, setLiveTimeLeft] = useState<number | null>(null)
  const [windowValue, setWindowValue] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [pinging, setPinging] = useState(false)
  const [repairingWindow, setRepairingWindow] = useState(false)
  const [txResult, setTxResult] = useState<string | null>(null)
  // Yield state
  const [yieldDeposit, setYieldDeposit] = useState<any>(null)
  const [accruedYield, setAccruedYield] = useState<number>(0)
  const [yieldAmount, setYieldAmount] = useState('')
  const [yieldAction, setYieldAction] = useState<string | null>(null)
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

  useEffect(() => {
    if (legacyWindowDetected || isCvTrue(estate?.['triggered']?.value)) return

    const timer = setInterval(() => {
      setLiveTimeLeft(prev => {
        if (prev === null) return null
        return prev > 0 ? prev - 1 : 0
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [legacyWindowDetected, estate])

  useEffect(() => {
    if (!connected || !address) return
    if (legacyWindowDetected || isCvTrue(estate?.['triggered']?.value)) return

    const syncTimer = setInterval(() => {
      void syncTimeRemaining(address)
    }, 30000)

    return () => clearInterval(syncTimer)
  }, [connected, address, legacyWindowDetected, estate])

  async function syncTimeRemaining(owner: string) {
    try {
      const t = await getTimeRemaining(owner)
      if (t?.value) {
        const next = Math.max(0, Number(t.value.value))
        setTimeLeft(next)
        setLiveTimeLeft(next)
      }
    } catch {}
  }

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
      if (t?.value) {
        const next = Math.max(0, Number(t.value.value))
        setTimeLeft(next)
        setLiveTimeLeft(next)
      } else {
        setTimeLeft(null)
        setLiveTimeLeft(null)
      }
    } catch {
      setTimeLeft(null)
      setLiveTimeLeft(null)
    }
    // Load yield data
    try {
      const yd = await getYieldDeposit(address)
      setYieldDeposit(yd)
      if (yd) {
        const ay = await getAccruedYield(address)
        setAccruedYield(Number(ay?.value?.value || 0))
      }
    } catch {
      setYieldDeposit(null)
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

  async function handleYieldDeposit() {
    if (!address || !yieldAmount) return
    setYieldAction('deposit')
    try {
      const tx = await buildDepositToYieldTx({
        amount: sBTCToSatoshi(Number(yieldAmount)),
        senderAddress: address,
      })
      const result = await openWalletTx(tx)
      setTxResult(result.txId)
      setYieldAmount('')
      setTimeout(load, 3000)
    } catch (e: any) {
      console.error(e)
    }
    setYieldAction(null)
  }

  async function handleYieldWithdraw() {
    if (!address) return
    setYieldAction('withdraw')
    try {
      const tx = await buildWithdrawFromYieldTx(address)
      const result = await openWalletTx(tx)
      setTxResult(result.txId)
      setTimeout(load, 3000)
    } catch (e: any) {
      console.error(e)
    }
    setYieldAction(null)
  }

  async function handleYieldHarvest() {
    if (!address) return
    setYieldAction('harvest')
    try {
      const tx = await buildHarvestYieldTx(address)
      const result = await openWalletTx(tx)
      setTxResult(result.txId)
      setTimeout(load, 3000)
    } catch (e: any) {
      console.error(e)
    }
    setYieldAction(null)
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
            {liveTimeLeft !== null && !isCvTrue(estate['triggered']?.value) && !legacyWindowDetected && (
              <div className="bg-[#1a1a1a] rounded-xl p-4 mb-4">
                <p className="label">Time until estate can trigger</p>
                <p className="text-xl font-semibold">
                  {liveTimeLeft === 0 ? (
                    <span className="text-red-400">Window expired!</span>
                  ) : (
                    blocksToHuman(liveTimeLeft)
                  )}
                </p>
                <p className="text-xs text-neutral-500 mt-1">
                  ~{liveTimeLeft} second{liveTimeLeft === 1 ? '' : 's'} remaining
                </p>
                {timeLeft !== null && Math.abs(timeLeft - liveTimeLeft) > 5 && (
                  <p className="text-[11px] text-neutral-600 mt-1">Syncing with on-chain time…</p>
                )}
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
                <p className="text-xs text-orange-200 mt-2">
                  Countdown display is hidden until this migration runs, to avoid showing a misleading expired state.
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

          <div className="card">
            <p className="label mb-2">Need another estate?</p>
            <p className="text-sm text-neutral-400">
              One estate is allowed per wallet address. To create a separate estate, switch to a different wallet.
            </p>
            <Link href="/create" className="btn-secondary w-full mt-3 text-center">
              Create Separate Estate →
            </Link>
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

          {/* sBTC Yield Vault */}
          <div className="card border-green-900/30">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="label">sBTC Yield Vault</p>
                <p className="text-xs text-neutral-500 mt-0.5">Earn 3.5% APY on deposited sBTC</p>
              </div>
              <span className="badge-green">3.5% APY</span>
            </div>

            {yieldDeposit ? (
              <div className="flex flex-col gap-3">
                <div className="bg-[#1a1a1a] rounded-xl p-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-neutral-400">Deposited</span>
                    <span className="font-semibold text-green-400">
                      {satoshiToSBTC(Number(yieldDeposit?.amount?.value || 0)).toFixed(6)} sBTC
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-400">Accrued yield</span>
                    <span className="font-semibold text-[#f7931a]">
                      {satoshiToSBTC(accruedYield).toFixed(8)} sBTC
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleYieldHarvest}
                    disabled={!!yieldAction || accruedYield === 0}
                    className="btn-secondary flex-1 text-xs"
                  >
                    {yieldAction === 'harvest' ? 'Harvesting…' : 'Harvest Yield'}
                  </button>
                  <button
                    onClick={handleYieldWithdraw}
                    disabled={!!yieldAction}
                    className="btn-secondary flex-1 text-xs"
                  >
                    {yieldAction === 'withdraw' ? 'Withdrawing…' : 'Withdraw All'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-neutral-400">
                  Deposit sBTC to start earning passive yield.
                </p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="0.001 sBTC"
                    value={yieldAmount}
                    onChange={e => setYieldAmount(e.target.value)}
                    step="0.00001"
                    min="0"
                    className="flex-1"
                  />
                  <button
                    onClick={handleYieldDeposit}
                    disabled={!!yieldAction || !yieldAmount}
                    className="btn-primary text-xs px-4"
                  >
                    {yieldAction === 'deposit' ? 'Depositing…' : 'Deposit'}
                  </button>
                </div>
              </div>
            )}
          </div>

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
