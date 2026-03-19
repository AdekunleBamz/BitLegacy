'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import ConnectWallet from './ConnectWallet'

export default function Navbar() {
  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b border-[#1a1a1a]">
      <Link href="/" className="inline-flex items-center" aria-label="BitLegacy home">
        <Image
          src="/logo.png"
          alt="BitLegacy"
          width={240}
          height={54}
          priority
          className="h-9 w-auto sm:h-10"
        />
      </Link>
      <ConnectWallet />
    </nav>
  )
}
