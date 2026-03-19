'use client'
// src/app/create/page.tsx — Create estate form

import { useState } from 'react'
import Link from 'next/link'
import { openContractCall } from '@stacks/connect'
import { useWallet } from '@/hooks/useWallet'
import Navbar from '@/components/Navbar'
import ConnectWallet from '@/components/ConnectWallet'
import {
  buildCreateEstateTx,
  buildRegisterGuardiansTx,
  getGuardianPanel,
  sBTCToSatoshi,
  type Beneficiary,
  type WalletContractCallOptions,
} from '@/lib/stacks'
import { uploadWillToIPFS, type WillDocument } from '@/lib/ipfs'
import { DEFAULT_WINDOW_BLOCKS, WINDOW_OPTIONS } from '@/constants/contracts'

const EMPTY_BENE: Beneficiary = { addr: '', share_pct: 0, label: '' }

export default function CreateEstate() {
  const { connected, address } = useWallet()

  const [amount, setAmount] = useState('')
  const [window, setWindow] = useState(DEFAULT_WINDOW_BLOCKS) // 30 days default
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([{ ...EMPTY_BENE }])
  const [guardianRequired, setGuardianRequired] = useState(false)
  const [g1, setG1] = useState('')
  const [g2, setG2] = useState('')
  const [g3, setG3] = useState('')
  const [willMessage, setWillMessage] = useState('')
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [txId, setTxId] = useState('')
  const [guardianTxId, setGuardianTxId] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState(1) // 1=estate, 2=will, 3=confirm

  const totalPct = beneficiaries.reduce((a, b) => a + (Number(b.share_pct) || 0), 0)
  const isSubmittingLocked = submitting || uploading

  function addBeneficiary() {
    if (beneficiaries.length >= 5) return
    setBeneficiaries([...beneficiaries, { ...EMPTY_BENE }])
  }

  function updateBene(i: number, field: keyof Beneficiary, val: string | number) {
    const updated = [...beneficiaries]
    ;(updated[i] as any)[field] = val
    setBeneficiaries(updated)
  }

  function removeBene(i: number) {
    setBeneficiaries(beneficiaries.filter((_, idx) => idx !== i))
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

  async function handleSubmit() {
    setError('')
    if (!connected || !address) return setError('Connect your wallet first')
    if (!amount || Number(amount) <= 0) return setError('Enter a valid sBTC amount')
    if (totalPct !== 100) return setError('Beneficiary shares must total 100%')
    if (beneficiaries.some(b => !b.addr)) return setError('All beneficiary addresses required')
    if (guardianRequired && [g1, g2, g3].some(g => !g.trim())) {
      return setError('All three guardian addresses are required')
    }

    setSubmitting(true)
    try {
      if (guardianRequired) {
        const existingPanel = await getGuardianPanel(address)
        if (!existingPanel) {
          const guardianTx = await buildRegisterGuardiansTx({
            estateOwner: address,
            g1,
            g2,
            g3,
            senderAddress: address,
          })
          const guardianResult = await openWalletTx(guardianTx)
          setGuardianTxId(guardianResult.txId)
        }
      }

      let ipfsCid: string | undefined

      // Upload encrypted will if provided
      if (willMessage.trim()) {
        setUploading(true)
        const willDoc: WillDocument = {
          version: '1.0',
          owner: address,
          created_at: Date.now(),
          message: willMessage,
          instructions: '',
          documents: [],
          contacts: [],
        }
        try {
          ipfsCid = await uploadWillToIPFS(willDoc, address)
        } catch {
          // Non-fatal — estate created without will
        }
        setUploading(false)
      }

      const tx = await buildCreateEstateTx({
        amount: sBTCToSatoshi(Number(amount)),
        beneficiaries: beneficiaries.map(b => ({
          addr: b.addr,
          share_pct: Number(b.share_pct),
          label: b.label || 'Beneficiary',
        })),
        windowBlocks: window,
        guardianRequired,
        ipfsCid,
        senderAddress: address,
      })

      const result = await openWalletTx(tx)
      setTxId(result.txId)
    } catch (e: any) {
      setError(e.message || 'Transaction failed')
    }
    setSubmitting(false)
  }

  if (txId) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 gap-6">
        <div className="text-5xl">✅</div>
        <h2 className="text-2xl font-bold">Estate Created!</h2>
        <p className="text-neutral-400 text-sm text-center max-w-sm">
          Your estate is now live on Stacks. Remember to check in monthly to keep the countdown reset.
        </p>
        {guardianTxId && (
          <a
            href={`https://explorer.hiro.so/txid/${guardianTxId}?chain=testnet`}
            target="_blank"
            rel="noreferrer"
            className="text-neutral-400 text-xs underline font-mono"
          >
            Guardian setup TX: {guardianTxId.slice(0, 16)}…
          </a>
        )}
        <a
          href={`https://explorer.hiro.so/txid/${txId}?chain=testnet`}
          target="_blank"
          rel="noreferrer"
          className="text-[#f7931a] text-sm underline font-mono"
        >
          View TX: {txId.slice(0, 16)}…
        </a>
        <Link href="/dashboard" className="btn-primary">Go to Dashboard →</Link>
      </main>
    )
  }

  if (!connected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6">
        <p className="text-neutral-400">Connect your wallet to create an estate.</p>
        <ConnectWallet cta="Connect Wallet" />
      </div>
    )
  }

  return (
    <main className="min-h-screen px-4 pb-8 max-w-xl mx-auto">
      <Navbar />
      <div className="mt-8 mb-8">
        <h1 className="text-2xl font-bold mb-2">Create Your Estate</h1>
        <p className="text-neutral-400 text-sm">Set up your Bitcoin inheritance vault.</p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8">
        {['Estate', 'Will', 'Confirm'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <button
              onClick={() => setStep(i + 1)}
              className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition-colors
                ${step === i + 1 ? 'bg-[#f7931a] text-black' : step > i + 1 ? 'bg-green-600 text-white' : 'bg-[#2a2a2a] text-neutral-400'}`}
            >
              {step > i + 1 ? '✓' : i + 1}
            </button>
            <span className={`text-xs ${step === i + 1 ? 'text-white' : 'text-neutral-500'}`}>{s}</span>
            {i < 2 && <div className="w-8 h-px bg-[#2a2a2a]" />}
          </div>
        ))}
      </div>

      {/* Step 1: Estate details */}
      {step === 1 && (
        <div className="flex flex-col gap-5">
          <div>
            <label className="label">Amount to lock (sBTC)</label>
            <input
              type="number"
              placeholder="0.001"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              step="0.00001"
              min="0"
            />
            <p className="text-xs text-neutral-500 mt-1">
              ≈ ${(Number(amount) * 65000).toLocaleString()} USD at current prices
            </p>
          </div>

          <div>
            <label className="label">Inactivity window</label>
            <select value={window} onChange={e => setWindow(Number(e.target.value))}>
              {WINDOW_OPTIONS.map(o => (
                <option key={o.blocks} value={o.blocks}>{o.label}</option>
              ))}
            </select>
            <p className="text-xs text-neutral-500 mt-1">
              If you don&apos;t check in for this long, your heirs can claim.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Beneficiaries</label>
              <span className={`text-xs font-semibold ${totalPct === 100 ? 'text-green-400' : 'text-orange-400'}`}>
                {totalPct}% / 100%
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {beneficiaries.map((b, i) => (
                <div key={i} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-400">Heir {i + 1}</span>
                    {beneficiaries.length > 1 && (
                      <button onClick={() => removeBene(i)} className="text-xs text-red-500 hover:text-red-400">
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="SP... Stacks address"
                    value={b.addr}
                    onChange={e => updateBene(i, 'addr', e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Label (e.g. Spouse)"
                      value={b.label}
                      onChange={e => updateBene(i, 'label', e.target.value)}
                    />
                    <div className="relative">
                      <input
                        type="number"
                        placeholder="50"
                        value={b.share_pct || ''}
                        onChange={e => updateBene(i, 'share_pct', e.target.value)}
                        min="1"
                        max="100"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 text-sm">%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {beneficiaries.length < 5 && (
              <button onClick={addBeneficiary} className="btn-secondary w-full mt-3 text-xs">
                + Add beneficiary
              </button>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <div>
                <label className="label mb-0">Require guardian confirmation</label>
                <p className="text-xs text-neutral-500 mt-1">2-of-3 trusted contacts must confirm before release</p>
              </div>
              <button
                onClick={() => setGuardianRequired(!guardianRequired)}
                className={`w-12 h-6 rounded-full transition-colors relative ${guardianRequired ? 'bg-[#f7931a]' : 'bg-[#2a2a2a]'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${guardianRequired ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>

          {guardianRequired && (
            <div className="flex flex-col gap-3">
              <label className="label">Guardian addresses (2-of-3 must confirm)</label>
              {[g1, g2, g3].map((g, i) => (
                <input
                  key={i}
                  type="text"
                  placeholder={`Guardian ${i + 1} — SP...`}
                  value={g}
                  onChange={e => [setG1, setG2, setG3][i](e.target.value)}
                />
              ))}
            </div>
          )}

          <button onClick={() => setStep(2)} className="btn-primary">
            Next: Add Will Message →
          </button>
        </div>
      )}

      {/* Step 2: Will message */}
      {step === 2 && (
        <div className="flex flex-col gap-5">
          <div>
            <label className="label">Personal message to your heirs (optional)</label>
            <textarea
              rows={6}
              placeholder="Write a message for your loved ones to find when they access your estate..."
              value={willMessage}
              onChange={e => setWillMessage(e.target.value)}
              className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-orange-400 transition-colors w-full resize-none"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Encrypted with AES-256-GCM and stored on IPFS. Only heirs with your address key can decrypt.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="btn-secondary flex-1">← Back</button>
            <button onClick={() => setStep(3)} className="btn-primary flex-1">Review →</button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && (
        <div className="flex flex-col gap-5">
          <div className="card">
            <h3 className="font-semibold mb-4">Review your estate</h3>
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-400">Locking</span>
                <span className="font-semibold text-[#f7931a]">{amount} sBTC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Inactivity window</span>
                <span>{WINDOW_OPTIONS.find(o => o.blocks === window)?.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Beneficiaries</span>
                <span>{beneficiaries.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Guardian required</span>
                <span>{guardianRequired ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Will message</span>
                <span>{willMessage ? 'Included (encrypted)' : 'None'}</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-950 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {totalPct !== 100 && (
            <div className="bg-orange-950 border border-orange-800 rounded-xl px-4 py-3 text-orange-300 text-sm">
              Beneficiary shares are currently {totalPct}%. Set them to exactly 100% before creating the estate.
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="btn-secondary flex-1">← Back</button>
            <button
              onClick={handleSubmit}
              disabled={isSubmittingLocked}
              className="btn-primary flex-1"
            >
              {uploading ? 'Uploading will…' : submitting ? 'Confirm in wallet…' : 'Create Estate →'}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
