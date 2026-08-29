import type { CardDefinitionId } from '@/cards/types'
import { createRng, nextRandom } from '@/engine/rng'
import type { RngStateV1 } from '@/engine/state'
import { canonicalUtf8V1 } from '@/log/canonicalize'
import { hashCanonicalValue, type Sha256Hex } from '@/log/hash'
import {
  M2_COMPLETION_REWARD,
  M2_PACK_ALGORITHM_VERSION,
  M2_PACK_POOL_V1,
  M2_PACK_PRICE,
  M2_PACK_SIZE,
  M2_RARITY_ORDER,
  M2_RARITY_WEIGHTS,
  M2_SAME_PACK_LIMITS,
  applyCollectionCard,
  eligiblePool,
  packTransactionPayload,
  type PackCardResult,
  type PackOverrideReason,
  type PackPoolCard,
  type PackRarity,
  type PackSlotRoll,
  type PackTransactionFixture,
  type PackTransactionPayload,
} from '@/economy/packContract'
import { cloneCollectionV2, type CollectionV2, type PackStateV2, type WalletV2 } from '@/economy/types'

export type PackOpenInput = {
  seed: number
  packSequence: number
  collection: CollectionV2
  packState: PackStateV2
  wallet: WalletV2
}

export type PackOpenResult = {
  collection: CollectionV2
  packState: PackStateV2
  wallet: WalletV2
  rng: RngStateV1
  fixture: PackTransactionFixture
}

export class PackAlgorithmError extends Error {
  constructor(readonly code: 'INSUFFICIENT_GOLD' | 'PACK_SEQUENCE_MISMATCH' | 'PACK_POOL_EXHAUSTED' | 'PACK_STATE_INVALID', message = code) {
    super(message)
    this.name = 'PackAlgorithmError'
  }
}

const ROLL_RANGE = 10_000
const LEGENDARY_PITY_SLOT = 4
const EPIC_PITY_SLOT = 3

function assertPackInput(input: PackOpenInput): void {
  if (input.packSequence !== input.packState.openedPacks + 1) throw new PackAlgorithmError('PACK_SEQUENCE_MISMATCH')
  if (!Number.isSafeInteger(input.seed) || input.seed < 0) throw new PackAlgorithmError('PACK_STATE_INVALID')
  if (!Number.isSafeInteger(input.wallet.gold) || input.wallet.gold < M2_PACK_PRICE) throw new PackAlgorithmError('INSUFFICIENT_GOLD')
  if (input.packState.packsSinceLegendary < 0 || input.packState.packsSinceEpic < 0) throw new PackAlgorithmError('PACK_STATE_INVALID')
}

function rarityFromRoll(rawRoll: number): PackRarity {
  let cursor = 0
  for (const rarity of M2_RARITY_ORDER) {
    cursor += M2_RARITY_WEIGHTS[rarity]
    if (rawRoll < cursor) return rarity
  }
  return 'LEGENDARY'
}

function isRareOrBetter(rarity: PackRarity): boolean {
  return rarity !== 'COMMON'
}

function isExactRarityPresent(slots: readonly PackSlotRoll[], rarity: PackRarity): boolean {
  return slots.some((slot) => slot.finalRarity === rarity)
}

function setSlotRarity(slot: PackSlotRoll, finalRarity: PackRarity, overrideReason: PackOverrideReason): PackSlotRoll {
  return { ...slot, finalRarity, overrideReason }
}

function applyRarityOverrides(slots: readonly PackSlotRoll[], input: PackOpenInput): PackSlotRoll[] {
  const next = [...slots]
  const hasLegendary = isExactRarityPresent(next, 'LEGENDARY')
  const needsFirstSetPity = input.packSequence === 10 && !input.packState.firstSetLegendarySeen && !hasLegendary
  const needsLegendaryPity = input.packState.packsSinceLegendary === 39 && !hasLegendary
  if (needsFirstSetPity || needsLegendaryPity) {
    const index = LEGENDARY_PITY_SLOT
    next[index] = setSlotRarity(next[index]!, 'LEGENDARY', needsFirstSetPity ? 'FIRST_SET_TENTH_PACK_LEGENDARY_PITY' : 'LEGENDARY_PITY')
  }

  if (input.packState.packsSinceEpic === 9 && !isExactRarityPresent(next, 'EPIC')) {
    const index = EPIC_PITY_SLOT
    if (next[index]!.finalRarity !== 'LEGENDARY') next[index] = setSlotRarity(next[index]!, 'EPIC', 'EPIC_PITY')
  }

  if (!next.some((slot) => isRareOrBetter(slot.finalRarity))) {
    const index = next.findIndex((slot) => slot.finalRarity !== 'LEGENDARY')
    if (index >= 0) next[index] = setSlotRarity(next[index]!, 'RARE', 'MINIMUM_RARE')
  }
  return next
}

function rarityPool(rarity: PackRarity): readonly PackPoolCard[] {
  return M2_PACK_POOL_V1.filter((card) => card.rarity === rarity)
}

function selectCard(
  rarity: PackRarity,
  collection: CollectionV2,
  selectedCounts: Readonly<Record<CardDefinitionId, number>>,
  rng: RngStateV1,
): { card: PackPoolCard; rng: RngStateV1 } {
  const protectedPool = eligiblePool(rarity, collection)
  const fullPool = rarityPool(rarity)
  const canSelect = (card: PackPoolCard): boolean => (selectedCounts[card.id] ?? 0) < M2_SAME_PACK_LIMITS[rarity]
  const pool = protectedPool.some(canSelect) ? protectedPool : fullPool
  if (!pool.some(canSelect)) throw new PackAlgorithmError('PACK_POOL_EXHAUSTED')

  let currentRng = rng
  while (true) {
    const random = nextRandom(currentRng)
    currentRng = random.rng
    const card = pool[Math.floor(random.value * pool.length)]
    if (card && canSelect(card)) return { card, rng: currentRng }
  }
}

function collectionDelta(cards: readonly PackCardResult[]): Readonly<Record<CardDefinitionId, number>> {
  const delta: Record<CardDefinitionId, number> = {}
  for (const card of cards) delta[card.cardId] = (delta[card.cardId] ?? 0) + 1
  return delta
}

function createFixturePayload(input: PackOpenInput, rngBefore: RngStateV1, rngAfter: RngStateV1, rawRolls: readonly number[], slots: readonly PackSlotRoll[], cards: readonly PackCardResult[], nextPackState: PackStateV2, nextWallet: WalletV2, nextCollection: CollectionV2): PackTransactionPayload {
  void nextCollection
  return {
    algorithmVersion: M2_PACK_ALGORITHM_VERSION,
    packSequence: input.packSequence,
    seed: input.seed >>> 0,
    rngVersion: 'mulberry32-v1',
    rngBefore: structuredClone(rngBefore),
    rngAfter: structuredClone(rngAfter),
    rawRolls,
    slots,
    cards,
    pityBefore: structuredClone(input.packState),
    pityAfter: structuredClone(nextPackState),
    goldBefore: input.wallet.gold,
    goldAfter: nextWallet.gold,
    collectionDelta: collectionDelta(cards),
    overrideReasons: slots.map((slot) => slot.overrideReason),
    finalRevision: null,
  }
}

export async function openPack(input: PackOpenInput): Promise<PackOpenResult> {
  assertPackInput(input)
  const rngBefore = createRng(input.seed)
  let rng = rngBefore
  const rawRolls: number[] = []
  const rawSlots: PackSlotRoll[] = []
  for (let slot = 0; slot < M2_PACK_SIZE; slot += 1) {
    const random = nextRandom(rng)
    rng = random.rng
    const rawRoll = Math.floor(random.value * ROLL_RANGE)
    const rawRarity = rarityFromRoll(rawRoll)
    rawRolls.push(rawRoll)
    rawSlots.push({ slot, rawRoll, rawRarity, finalRarity: rawRarity, overrideReason: 'NONE' })
  }

  const slots = applyRarityOverrides(rawSlots, input)
  const nextCollection = cloneCollectionV2(input.collection)
  const selectedCounts: Record<CardDefinitionId, number> = {}
  const cards: PackCardResult[] = []
  for (const slot of slots) {
    const selected = selectCard(slot.finalRarity, nextCollection, selectedCounts, rng)
    rng = selected.rng
    const applied = applyCollectionCard(nextCollection, selected.card)
    nextCollection.ownedCount = applied.collection.ownedCount
    nextCollection.everOwnedCount = applied.collection.everOwnedCount
    selectedCounts[selected.card.id] = (selectedCounts[selected.card.id] ?? 0) + 1
    cards.push({
      slot: slot.slot,
      cardId: selected.card.id,
      rarity: selected.card.rarity,
      duplicate: applied.result.ownedBefore > 0,
      ownedBefore: applied.result.ownedBefore,
      ownedAfter: applied.result.ownedAfter,
      everOwnedBefore: applied.result.everOwnedBefore,
      everOwnedAfter: applied.result.everOwnedAfter,
    })
  }

  const hasLegendary = cards.some((card) => card.rarity === 'LEGENDARY')
  const hasEpic = cards.some((card) => card.rarity === 'EPIC')
  const nextPackState: PackStateV2 = {
    openedPacks: input.packSequence,
    packsSinceLegendary: hasLegendary ? 0 : input.packState.packsSinceLegendary + 1,
    packsSinceEpic: hasEpic ? 0 : input.packState.packsSinceEpic + 1,
    firstSetLegendarySeen: input.packState.firstSetLegendarySeen || hasLegendary,
  }
  const nextWallet = { gold: input.wallet.gold - M2_PACK_PRICE }
  const payload = createFixturePayload(input, rngBefore, rng, rawRolls, slots, cards, nextPackState, nextWallet, nextCollection)
  const transactionBytes = Array.from(canonicalUtf8V1(payload))
  const transactionHash = await hashCanonicalValue(payload)
  const fixture: PackTransactionFixture = {
    ...payload,
    canonicalTransactionBytes: transactionBytes,
    canonicalTransactionHash: transactionHash,
  }
  return { collection: nextCollection, packState: nextPackState, wallet: nextWallet, rng, fixture }
}

export function packFixtureBytes(fixture: PackTransactionFixture): Uint8Array {
  return Uint8Array.from(canonicalUtf8V1(packTransactionPayload(fixture)))
}

export async function hashPackFixture(fixture: PackTransactionFixture): Promise<Sha256Hex> {
  return hashCanonicalValue(packTransactionPayload(fixture))
}

export const M2_REWARD_AMOUNT = M2_COMPLETION_REWARD
