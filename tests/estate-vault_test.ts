import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v2.0.0/index.ts'
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.170.0/testing/asserts.ts'

// ─── estate-vault tests ───────────────────────────────────────────────────────

Clarinet.test({
  name: 'create-estate: owner can create estate with valid shares',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get('deployer')!
    const heir1 = accounts.get('wallet_1')!
    const heir2 = accounts.get('wallet_2')!

    const block = chain.mineBlock([
      Tx.contractCall(
        'estate-vault',
        'create-estate',
        [
          types.principal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-token'),
          types.uint(1_000_000), // 0.01 sBTC in sats
          types.list([
            types.tuple({
              addr: types.principal(heir1.address),
              'share-pct': types.uint(60),
              label: types.ascii('Spouse'),
            }),
            types.tuple({
              addr: types.principal(heir2.address),
              'share-pct': types.uint(40),
              label: types.ascii('Child'),
            }),
          ]),
          types.uint(4320), // 30-day window
          types.bool(false),
          types.none(),
        ],
        owner.address
      ),
    ])

    assertEquals(block.receipts[0].result, '(ok true)')
    assertEquals(block.height, 2)
  },
})

Clarinet.test({
  name: 'create-estate: rejects if shares do not sum to 100',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get('deployer')!
    const heir1 = accounts.get('wallet_1')!

    const block = chain.mineBlock([
      Tx.contractCall(
        'estate-vault',
        'create-estate',
        [
          types.principal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-token'),
          types.uint(1_000_000),
          types.list([
            types.tuple({
              addr: types.principal(heir1.address),
              'share-pct': types.uint(50), // only 50%, should fail
              label: types.ascii('Spouse'),
            }),
          ]),
          types.uint(4320),
          types.bool(false),
          types.none(),
        ],
        owner.address
      ),
    ])

    assertStringIncludes(block.receipts[0].result, 'err u105')
  },
})

Clarinet.test({
  name: 'proof-of-life: owner resets countdown',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get('deployer')!
    const heir1 = accounts.get('wallet_1')!

    // First create the estate
    chain.mineBlock([
      Tx.contractCall('estate-vault', 'create-estate', [
        types.principal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-token'),
        types.uint(1_000_000),
        types.list([types.tuple({ addr: types.principal(heir1.address), 'share-pct': types.uint(100), label: types.ascii('Heir') })]),
        types.uint(4320),
        types.bool(false),
        types.none(),
      ], owner.address),
    ])

    // Mine some blocks
    chain.mineEmptyBlockUntil(10)

    // Proof of life
    const block = chain.mineBlock([
      Tx.contractCall('estate-vault', 'proof-of-life', [], owner.address),
    ])

    assertEquals(block.receipts[0].result.includes('ok'), true)
  },
})

Clarinet.test({
  name: 'trigger-estate: cannot trigger before window elapses',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get('deployer')!
    const heir1 = accounts.get('wallet_1')!

    chain.mineBlock([
      Tx.contractCall('estate-vault', 'create-estate', [
        types.principal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-token'),
        types.uint(1_000_000),
        types.list([types.tuple({ addr: types.principal(heir1.address), 'share-pct': types.uint(100), label: types.ascii('Heir') })]),
        types.uint(4320),
        types.bool(false),
        types.none(),
      ], owner.address),
    ])

    // Only mine 100 blocks (window is 4320)
    chain.mineEmptyBlockUntil(100)

    const block = chain.mineBlock([
      Tx.contractCall('estate-vault', 'trigger-estate', [
        types.principal(owner.address),
      ], heir1.address),
    ])

    assertStringIncludes(block.receipts[0].result, 'err u103') // ERR-STILL-ALIVE
  },
})

Clarinet.test({
  name: 'trigger-estate: can trigger after window elapses',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get('deployer')!
    const heir1 = accounts.get('wallet_1')!

    chain.mineBlock([
      Tx.contractCall('estate-vault', 'create-estate', [
        types.principal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-token'),
        types.uint(1_000_000),
        types.list([types.tuple({ addr: types.principal(heir1.address), 'share-pct': types.uint(100), label: types.ascii('Heir') })]),
        types.uint(100), // short window for test
        types.bool(false),
        types.none(),
      ], owner.address),
    ])

    // Mine past the window
    chain.mineEmptyBlockUntil(200)

    const block = chain.mineBlock([
      Tx.contractCall('estate-vault', 'trigger-estate', [
        types.principal(owner.address),
      ], heir1.address),
    ])

    assertEquals(block.receipts[0].result, '(ok true)')
  },
})

Clarinet.test({
  name: 'cancel-estate: owner can cancel before trigger',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get('deployer')!
    const heir1 = accounts.get('wallet_1')!

    chain.mineBlock([
      Tx.contractCall('estate-vault', 'create-estate', [
        types.principal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-token'),
        types.uint(1_000_000),
        types.list([types.tuple({ addr: types.principal(heir1.address), 'share-pct': types.uint(100), label: types.ascii('Heir') })]),
        types.uint(4320),
        types.bool(false),
        types.none(),
      ], owner.address),
    ])

    const block = chain.mineBlock([
      Tx.contractCall('estate-vault', 'cancel-estate', [
        types.principal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-token'),
      ], owner.address),
    ])

    assertEquals(block.receipts[0].result, '(ok true)')
  },
})

// ─── guardian.clar tests ──────────────────────────────────────────────────────

Clarinet.test({
  name: 'guardian: register panel and reach 2-of-3 threshold',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get('deployer')!
    const g1 = accounts.get('wallet_1')!
    const g2 = accounts.get('wallet_2')!
    const g3 = accounts.get('wallet_3')!

    // Register guardians
    chain.mineBlock([
      Tx.contractCall('guardian', 'register-guardians', [
        types.principal(owner.address),
        types.principal(g1.address),
        types.principal(g2.address),
        types.principal(g3.address),
      ], owner.address),
    ])

    // g1 confirms
    chain.mineBlock([
      Tx.contractCall('guardian', 'confirm-release', [
        types.principal(owner.address),
      ], g1.address),
    ])

    // g2 confirms — should hit threshold
    const block = chain.mineBlock([
      Tx.contractCall('guardian', 'confirm-release', [
        types.principal(owner.address),
      ], g2.address),
    ])

    assertEquals(block.receipts[0].result, '(ok true)') // threshold met
  },
})
