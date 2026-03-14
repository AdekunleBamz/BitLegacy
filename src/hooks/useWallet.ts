'use client'
// src/hooks/useWallet.ts

import { useState, useEffect, useCallback } from 'react'
import { AppConfig, UserSession, showConnect } from '@stacks/connect'
import { NETWORK } from '@/constants/contracts'

const appConfig = new AppConfig(['store_write', 'publish_data'])
export const userSession = new UserSession({ appConfig })

export interface WalletState {
  connected: boolean
  address: string | null
  userSession: UserSession
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    connected: false,
    address: null,
    userSession,
  })

  useEffect(() => {
    if (userSession.isUserSignedIn()) {
      const userData = userSession.loadUserData()
      const address =
        NETWORK === 'mainnet'
          ? userData.profile.stxAddress.mainnet
          : userData.profile.stxAddress.testnet
      setState({ connected: true, address, userSession })
    }
  }, [])

  const connect = useCallback(() => {
    showConnect({
      appDetails: {
        name: 'BitLegacy',
        icon: '/logo.svg',
      },
      redirectTo: '/',
      onFinish: () => {
        const userData = userSession.loadUserData()
        const address =
          NETWORK === 'mainnet'
            ? userData.profile.stxAddress.mainnet
            : userData.profile.stxAddress.testnet
        setState({ connected: true, address, userSession })
      },
      userSession,
    })
  }, [])

  const disconnect = useCallback(() => {
    userSession.signUserOut('/')
    setState({ connected: false, address: null, userSession })
  }, [])

  return { ...state, connect, disconnect }
}
