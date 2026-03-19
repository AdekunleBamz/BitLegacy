// src/app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'

const metadataBase = new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://bitlegacy.vercel.app')

export const metadata: Metadata = {
  metadataBase,
  title: 'BitLegacy — Bitcoin Inheritance Protocol',
  description:
    'The first trustless, on-chain Bitcoin inheritance protocol. Pass down your sBTC to loved ones — no intermediaries, no lawyers, no lost keys.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.png', type: 'image/png' },
    ],
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
  openGraph: {
    title: 'BitLegacy',
    description: 'Bitcoin inheritance on Stacks',
    images: ['/logo.png'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0a0a0a] text-white antialiased">
        {children}
      </body>
    </html>
  )
}
