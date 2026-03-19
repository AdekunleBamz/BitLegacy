'use client'
// src/app/page.tsx — Landing / hero

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useWallet } from '@/hooks/useWallet'
import Navbar from '@/components/Navbar'
import ConnectWallet from '@/components/ConnectWallet'
import { getEstate } from '@/lib/stacks'

export default function Home() {
  const { connected, address } = useWallet()
  const [checkingEstate, setCheckingEstate] = useState(false)
  const [hasEstate, setHasEstate] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function checkEstate() {
      if (!connected || !address) {
        setHasEstate(false)
        setCheckingEstate(false)
        return
      }

      setCheckingEstate(true)
      try {
        const estate = await getEstate(address)
        if (!cancelled) {
          setHasEstate(Boolean(estate))
        }
      } catch {
        if (!cancelled) {
          setHasEstate(false)
        }
      } finally {
        if (!cancelled) {
          setCheckingEstate(false)
        }
      }
    }

    void checkEstate()

    return () => {
      cancelled = true
    }
  }, [connected, address])

  return (
    <main className="min-h-screen flex flex-col">
      {/* Nav */}
      <Navbar />

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24 gap-8">
        <div className="inline-flex items-center gap-2 bg-orange-950 border border-orange-800 rounded-full px-4 py-1.5 text-xs text-orange-400 font-medium mb-2">
          Built on Stacks · Secured by Bitcoin
        </div>

        <h1 className="text-5xl md:text-7xl font-bold max-w-3xl leading-tight tracking-tight">
          Your Bitcoin.<br />
          <span className="text-[#f7931a]">Forever in the family.</span>
        </h1>

        <p className="text-lg text-neutral-400 max-w-xl leading-relaxed">
          $100B+ in Bitcoin is permanently lost every year because owners die without a
          succession plan. BitLegacy lets you pass down your sBTC to loved ones —
          trustlessly, on-chain, no lawyers required.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 mt-2">
          {!connected ? (
            <ConnectWallet cta="Connect to Create Estate" large />
          ) : checkingEstate ? (
            <button disabled className="btn-secondary text-base px-8 py-4 rounded-2xl">
              Checking estate…
            </button>
          ) : hasEstate ? (
            <Link href="/dashboard" className="btn-primary text-base px-8 py-4 rounded-2xl">
              Open Dashboard →
            </Link>
          ) : (
            <Link href="/create" className="btn-secondary text-base px-8 py-4 rounded-2xl">
              Create Your Estate
            </Link>
          )}
          <Link href="/claim" className="btn-secondary text-base px-8 py-4 rounded-2xl">
            I&apos;m a Beneficiary
          </Link>
        </div>
      </section>

      {/* Stats row */}
      <section className="border-t border-[#1a1a1a] grid grid-cols-2 md:grid-cols-4 divide-x divide-[#1a1a1a]">
        {[
          { label: 'Est. lost BTC', value: '$100B+' },
          { label: 'Protocol fee', value: '0.5%' },
          { label: 'Max beneficiaries', value: '5 heirs' },
          { label: 'Powered by', value: 'Clarity 4' },
        ].map(s => (
          <div key={s.label} className="flex flex-col items-center py-8 gap-1">
            <span className="text-2xl font-bold text-white">{s.value}</span>
            <span className="text-xs text-neutral-500">{s.label}</span>
          </div>
        ))}
      </section>

      {/* How it works */}
      <section className="px-6 py-20 max-w-4xl mx-auto w-full">
        <h2 className="text-3xl font-bold mb-12 text-center">How it works</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              step: '01',
              title: 'Lock your sBTC',
              desc: 'Deposit sBTC into the estate vault contract. Name up to 5 beneficiaries with percentage shares.',
            },
            {
              step: '02',
              title: 'Check in monthly',
              desc: 'Tap "I\'m alive" once a month. If you stop checking in, the countdown begins.',
            },
            {
              step: '03',
              title: 'Heirs claim automatically',
              desc: 'Once the window expires, beneficiaries can claim their share. No lawyers. No courts. Just code.',
            },
          ].map(item => (
            <div key={item.step} className="card">
              <div className="text-[#f7931a] text-xs font-bold mb-3">{item.step}</div>
              <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
              <p className="text-neutral-400 text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#1a1a1a] px-6 py-6 text-center text-xs text-neutral-600">
        BitLegacy · Built on Stacks · Buidl Battle 2026 ·{' '}
        <a
          href="https://github.com/AdekunleBamz/bitlegacy"
          className="hover:text-neutral-400 transition-colors"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </footer>
    </main>
  )
}
