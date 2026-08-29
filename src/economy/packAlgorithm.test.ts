import {
  packFixtureBytes,
  hashPackFixture,
  openPack,
  PackAlgorithmError,
} from '@/economy/packAlgorithm'
import { M2_PACK_SIZE, M2_RARITY_ORDER, M2_SAME_PACK_LIMITS } from '@/economy/packContract'
import { createEmptyCollectionV2, createInitialPackStateV2, createInitialWalletV2 } from '@/economy/types'

type PackInput = Parameters<typeof openPack>[0]

function input(overrides: Partial<PackInput> = {}): PackInput {
  return {
    seed: 0x1234,
    packSequence: 1,
    collection: createEmptyCollectionV2(),
    packState: createInitialPackStateV2(),
    wallet: createInitialWalletV2(),
    ...overrides,
  }
}

describe('M2 pack algorithm', () => {
  it('produces byte-identical five-card fixtures for the same input', async () => {
    const first = await openPack(input())
    const second = await openPack(input())

    expect(first.fixture).toEqual(second.fixture)
    expect(first.fixture.rawRolls).toHaveLength(M2_PACK_SIZE)
    expect(first.fixture.slots).toHaveLength(M2_PACK_SIZE)
    expect(first.fixture.cards).toHaveLength(M2_PACK_SIZE)
    expect(first.fixture.slots.map((slot) => slot.rawRoll)).toEqual(first.fixture.rawRolls)
    expect(first.fixture.canonicalTransactionBytes).toEqual(Array.from(packFixtureBytes(first.fixture)))
    expect(await hashPackFixture(first.fixture)).toBe(first.fixture.canonicalTransactionHash)
    expect(first.wallet.gold).toBe(400)
    expect(first.fixture.goldBefore).toBe(500)
    expect(first.fixture.goldAfter).toBe(400)
  })

  it('records one raw rarity roll per slot and keeps final rarities in the contract order', async () => {
    const result = await openPack(input({
      seed: 0xfeed,
      packSequence: 2,
      packState: { ...createInitialPackStateV2(), openedPacks: 1 },
    }))

    expect(result.fixture.slots.map((slot) => slot.slot)).toEqual([0, 1, 2, 3, 4])
    expect(result.fixture.rawRolls.every((roll) => Number.isInteger(roll) && roll >= 0 && roll < 10_000)).toBe(true)
    expect(result.fixture.cards.map((card) => card.slot)).toEqual([0, 1, 2, 3, 4])
    expect(result.fixture.cards.every((card) => M2_RARITY_ORDER.includes(card.rarity))).toBe(true)
    expect(result.fixture.cards.every((card) => card.ownedAfter === card.ownedBefore + 1)).toBe(true)
  })

  it('applies the tenth-pack legendary guarantee to the designated slot', async () => {
    const result = await openPack(input({
      seed: 0x101,
      packSequence: 10,
      packState: { openedPacks: 9, packsSinceLegendary: 9, packsSinceEpic: 0, firstSetLegendarySeen: false },
    }))

    if (result.fixture.slots.some((slot) => slot.finalRarity === 'LEGENDARY' && slot.overrideReason === 'NONE')) {
      expect(result.fixture.slots.some((slot) => slot.overrideReason === 'FIRST_SET_TENTH_PACK_LEGENDARY_PITY')).toBe(false)
    } else {
      expect(result.fixture.slots[4]).toMatchObject({ finalRarity: 'LEGENDARY', overrideReason: 'FIRST_SET_TENTH_PACK_LEGENDARY_PITY' })
    }
  })

  it('preserves all input economy state when gold is insufficient', async () => {
    const source = input({ wallet: { gold: 99 } })

    await expect(openPack(source)).rejects.toMatchObject({ code: 'INSUFFICIENT_GOLD' })
    expect(source).toEqual(input({ wallet: { gold: 99 } }))
  })

  it('enforces same-card per-pack duplicate limits within each rarity', async () => {
    const result = await openPack(input({ seed: 0xabcdef }))
    const counts = new Map<string, { rarity: typeof result.fixture.cards[number]['rarity']; count: number }>()
    for (const card of result.fixture.cards) {
      const current = counts.get(card.cardId)
      counts.set(card.cardId, { rarity: card.rarity, count: (current?.count ?? 0) + 1 })
    }
    for (const { rarity, count } of counts.values()) expect(count).toBeLessThanOrEqual(M2_SAME_PACK_LIMITS[rarity])
  })

  it('exposes a typed exhaustion error for impossible state transitions', async () => {
    const invalid = input({ packSequence: 2 })
    await expect(openPack(invalid)).rejects.toBeInstanceOf(PackAlgorithmError)
    await expect(openPack(invalid)).rejects.toMatchObject({ code: 'PACK_SEQUENCE_MISMATCH' })
  })
})
