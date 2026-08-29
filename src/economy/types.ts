import type { CardDefinitionId } from '@/cards/types'

export type PackRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'

export type WalletV2 = {
  gold: number
}

export type CollectionV2 = {
  ownedCount: Record<CardDefinitionId, number>
  everOwnedCount: Record<CardDefinitionId, number>
}

export type PackStateV2 = {
  openedPacks: number
  packsSinceLegendary: number
  packsSinceEpic: number
  firstSetLegendarySeen: boolean
}

export type RewardLedgerEntryV2 = {
  gameId: string
  status: 'GRANTED'
  amount: number
  grantedAt: string
  source: 'M2_LOCAL_FINALIZE'
}

export type RewardLedgerV2 = Record<string, RewardLedgerEntryV2>

export function createEmptyCollectionV2(): CollectionV2 {
  return { ownedCount: {}, everOwnedCount: {} }
}

export function createInitialWalletV2(): WalletV2 {
  return { gold: 500 }
}

export function createInitialPackStateV2(): PackStateV2 {
  return {
    openedPacks: 0,
    packsSinceLegendary: 0,
    packsSinceEpic: 0,
    firstSetLegendarySeen: false,
  }
}

export function cloneCollectionV2(collection: CollectionV2): CollectionV2 {
  return {
    ownedCount: { ...collection.ownedCount },
    everOwnedCount: { ...collection.everOwnedCount },
  }
}
