'use client'
// src/hooks/useWallet.ts

import { useState, useEffect, useCallback } from 'react'
import { AppConfig, UserSession, showConnect } from '@stacks/connect'
import { safeGetPublicKey } from 'micro-stacks/connect'
import { NETWORK } from '@/constants/contracts'

const appConfig = new AppConfig(['store_write', 'publish_data'])
export const userSession = new UserSession({ appConfig })
const WALLET_SYNC_EVENT = 'bitlegacy-wallet-sync'

export interface WalletState {
  connected: boolean
  address: string | null
  accessKey: string | null
  userSession: UserSession
}

function getWalletState(): WalletState {
  if (!userSession.isUserSignedIn()) {
    return {
      connected: false,
      address: null,
      accessKey: null,
      userSession,
    }
  }

  const userData = userSession.loadUserData()
  const address =
    NETWORK === 'mainnet'
      ? userData.profile.stxAddress.mainnet
      : userData.profile.stxAddress.testnet

  return {
    connected: true,
    address,
    accessKey: safeGetPublicKey(userData.appPrivateKey),
    userSession,
  }
}

function emitWalletSync() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(WALLET_SYNC_EVENT))
}

export function useWallet() {
  const [state, setState] = useState<WalletState>(getWalletState)

  useEffect(() => {
    async function syncWalletState() {
      if (userSession.isSignInPending()) {
        try {
          await userSession.handlePendingSignIn()
        } catch {
          // If pending sign-in cannot be completed, we still fall back to the
          // current cached session state.
        }
      }

      setState(getWalletState())
    }

    void syncWalletState()

    function handleSync() {
      void syncWalletState()
    }

    if (typeof window !== 'undefined') {
      window.addEventListener(WALLET_SYNC_EVENT, handleSync)
      window.addEventListener('focus', handleSync)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(WALLET_SYNC_EVENT, handleSync)
        window.removeEventListener('focus', handleSync)
      }
    }
  }, [])

  const connect = useCallback(() => {
    const redirectTo =
      typeof window === 'undefined'
        ? '/'
        : `${window.location.pathname}${window.location.search}${window.location.hash}`

    showConnect({
      appDetails: {
        name: 'BitLegacy',
        icon: '/logo.png',
      },
      redirectTo,
      onFinish: () => {
        setState(getWalletState())
        emitWalletSync()
      },
      userSession,
    })
  }, [])

  const disconnect = useCallback(() => {
    userSession.signUserOut('/')
    setState({ connected: false, address: null, accessKey: null, userSession })
    emitWalletSync()
  }, [])

  return { ...state, connect, disconnect }
}
