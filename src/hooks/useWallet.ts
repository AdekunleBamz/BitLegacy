'use client'
// src/hooks/useWallet.ts

import { useState, useEffect, useCallback } from 'react'
import { AppConfig, UserSession, showConnect } from '@stacks/connect'
import { safeGetPublicKey } from 'micro-stacks/connect'
import { NETWORK } from '@/constants/contracts'

const appConfig = new AppConfig(['store_write', 'publish_data'])
export const userSession = new UserSession({ appConfig })

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

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    connected: false,
    address: null,
    accessKey: null,
    userSession,
  })

  useEffect(() => {
    setState(getWalletState())
  }, [])

  const connect = useCallback(() => {
    showConnect({
      appDetails: {
        name: 'BitLegacy',
        icon: '/logo.png',
      },
      redirectTo: '/',
      onFinish: () => {
        setState(getWalletState())
      },
      userSession,
    })
  }, [])

  const disconnect = useCallback(() => {
    userSession.signUserOut('/')
    setState({ connected: false, address: null, accessKey: null, userSession })
  }, [])

  return { ...state, connect, disconnect }
}
