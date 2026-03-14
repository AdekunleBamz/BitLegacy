'use client'
// src/components/ConnectWallet.tsx

import { useWallet } from '@/hooks/useWallet'

interface Props {
  cta?: string
  large?: boolean
}

export default function ConnectWallet({ cta = 'Connect Wallet', large = false }: Props) {
  const { connected, address, connect, disconnect } = useWallet()

  if (connected && address) {
    return (
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-xs text-neutral-300 font-mono">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        </div>
        <button onClick={disconnect} className="btn-secondary text-xs px-3 py-2">
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={connect}
      className={large ? 'btn-primary text-base px-8 py-4 rounded-2xl' : 'btn-primary'}
    >
      {cta}
    </button>
  )
}
