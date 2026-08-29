import { M1_COLLECTIBLE_POOL_V1 } from '@/cards/data/collectible-pool.v1'
import { getCardDefinition } from '@/cards/registry'
import type { CardDefinitionId } from '@/cards/types'
import type { RngStateV1 } from '@/engine/state'
import type { Sha256Hex } from '@/log/hash'
import type { CollectionV2, PackStateV2, PackRarity } from '@/economy/types'

export type { PackRarity } from '@/economy/types'

export const M2_PACK_ALGORITHM_VERSION = 'm2-official-style-v1' as const
export const M2_PACK_PRICE = 100 as const
export const M2_PACK_SIZE = 5 as const
export const M2_COMPLETION_REWARD = 20 as const
export const M2_INITIAL_GOLD = 500 as const

export const M2_RARITY_WEIGHTS = {
  COMMON: 7165,
  RARE: 2284,
  EPIC: 442,
  LEGENDARY: 109,
} as const satisfies Record<PackRarity, number>

export const M2_RARITY_ORDER: readonly PackRarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY']
export const M2_RARITY_THRESHOLDS: Readonly<Record<PackRarity, number>> = {
  COMMON: 2,
  RARE: 2,
  EPIC: 2,
  LEGENDARY: 1,
}
export const M2_SAME_PACK_LIMITS: Readonly<Record<PackRarity, number>> = {
  COMMON: 2,
  RARE: 2,
  EPIC: 2,
  LEGENDARY: 1,
}

export type PackOverrideReason =
  | 'NONE'
  | 'FIRST_SET_TENTH_PACK_LEGENDARY_PITY'
  | 'LEGENDARY_PITY'
  | 'EPIC_PITY'
  | 'MINIMUM_RARE'

export type PackSlotRoll = {
  slot: number
  rawRoll: number
  rawRarity: PackRarity
  finalRarity: PackRarity
  overrideReason: PackOverrideReason
}

export type PackCardResult = {
  slot: number
  cardId: CardDefinitionId
  rarity: PackRarity
  duplicate: boolean
  ownedBefore: number
  ownedAfter: number
  everOwnedBefore: number
  everOwnedAfter: number
}

export type PackTransactionPayload = {
  algorithmVersion: typeof M2_PACK_ALGORITHM_VERSION
  packSequence: number
  seed: number
  rngVersion: 'mulberry32-v1'
  rngBefore: RngStateV1
  rngAfter: RngStateV1
  rawRolls: readonly number[]
  slots: readonly PackSlotRoll[]
  cards: readonly PackCardResult[]
  pityBefore: PackStateV2
  pityAfter: PackStateV2
  goldBefore: number
  goldAfter: number
  collectionDelta: Readonly<Record<CardDefinitionId, number>>
  overrideReasons: readonly PackOverrideReason[]
  finalRevision: number | null
}

export type PackTransactionFixture = PackTransactionPayload & {
  canonicalTransactionBytes: readonly number[]
  canonicalTransactionHash: Sha256Hex
}

export type PackPoolCard = {
  id: CardDefinitionId
  rarity: PackRarity
  numericId: number
}

function asPackRarity(value: string): PackRarity {
  if (value === 'COMMON' || value === 'RARE' || value === 'EPIC' || value === 'LEGENDARY') return value
  throw new Error(`PACK_POOL_INVALID_RARITY:${value}`)
}

export const M2_PACK_POOL_V1: readonly PackPoolCard[] = [...M1_COLLECTIBLE_POOL_V1]
  .map((id) => {
    const definition = getCardDefinition(id)
    if (!definition.collectible) throw new Error(`PACK_POOL_NON_COLLECTIBLE:${id}`)
    return { id, rarity: asPackRarity(definition.rarity), numericId: definition.dbfId }
  })
  .sort((left, right) => left.numericId - right.numericId)

function countRarity(rarity: PackRarity): number {
  return M2_PACK_POOL_V1.filter((card) => card.rarity === rarity).length
}

export const M2_POOL_COUNTS: Readonly<Record<PackRarity, number>> = {
  COMMON: countRarity('COMMON'),
  RARE: countRarity('RARE'),
  EPIC: countRarity('EPIC'),
  LEGENDARY: countRarity('LEGENDARY'),
}

export function validateM2PackContract(): void {
  const expectedCounts: Readonly<Record<PackRarity, number>> = { COMMON: 16, RARE: 12, EPIC: 8, LEGENDARY: 4 }
  if (M2_PACK_POOL_V1.length !== 40) throw new Error(`PACK_POOL_SIZE:${M2_PACK_POOL_V1.length}`)
  if (new Set(M2_PACK_POOL_V1.map((card) => card.id)).size !== M2_PACK_POOL_V1.length) throw new Error('PACK_POOL_DUPLICATE_ID')
  for (const rarity of M2_RARITY_ORDER) {
    if (M2_POOL_COUNTS[rarity] !== expectedCounts[rarity]) throw new Error(`PACK_POOL_RARITY_COUNT:${rarity}:${M2_POOL_COUNTS[rarity]}`)
  }
  if (Object.values(M2_RARITY_WEIGHTS).reduce((sum, weight) => sum + weight, 0) !== 10000) throw new Error('PACK_WEIGHTS_INVALID')
  if (M2_PACK_SIZE !== 5 || M2_PACK_PRICE !== 100 || M2_INITIAL_GOLD !== 500 || M2_COMPLETION_REWARD !== 20) throw new Error('PACK_LITERAL_CONTRACT_INVALID')
}

export function cardMaxOwned(rarity: PackRarity): number {
  return M2_RARITY_THRESHOLDS[rarity]
}

export function cardIsEligible(card: PackPoolCard, collection: CollectionV2): boolean {
  return (collection.everOwnedCount[card.id] ?? 0) < cardMaxOwned(card.rarity)
}

export function eligiblePool(rarity: PackRarity, collection: CollectionV2, selectedIds: ReadonlySet<CardDefinitionId> = new Set()): PackPoolCard[] {
  const available = M2_PACK_POOL_V1.filter((card) => card.rarity === rarity && !selectedIds.has(card.id))
  const protectedCards = available.filter((card) => cardIsEligible(card, collection))
  return protectedCards.length > 0 ? protectedCards : available
}

export function applyCollectionCard(collection: CollectionV2, card: PackPoolCard): {
  collection: CollectionV2
  result: Pick<PackCardResult, 'ownedBefore' | 'ownedAfter' | 'everOwnedBefore' | 'everOwnedAfter'>
} {
  const next: CollectionV2 = {
    ownedCount: { ...collection.ownedCount },
    everOwnedCount: { ...collection.everOwnedCount },
  }
  const ownedBefore = next.ownedCount[card.id] ?? 0
  const everOwnedBefore = next.everOwnedCount[card.id] ?? 0
  next.ownedCount[card.id] = ownedBefore + 1
  next.everOwnedCount[card.id] = everOwnedBefore + 1
  return {
    collection: next,
    result: {
      ownedBefore,
      ownedAfter: ownedBefore + 1,
      everOwnedBefore,
      everOwnedAfter: everOwnedBefore + 1,
    },
  }
}

export function packTransactionPayload(fixture: PackTransactionFixture | PackTransactionPayload): PackTransactionPayload {
  if ('canonicalTransactionBytes' in fixture && 'canonicalTransactionHash' in fixture) {
    const payload = { ...fixture }
    delete (payload as Partial<PackTransactionFixture>).canonicalTransactionBytes
    delete (payload as Partial<PackTransactionFixture>).canonicalTransactionHash
    return payload
  }
  return fixture
}
