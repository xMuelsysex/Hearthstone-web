import {
  M2_COMPLETION_REWARD,
  M2_INITIAL_GOLD,
  M2_PACK_ALGORITHM_VERSION,
  M2_PACK_PRICE,
  M2_PACK_SIZE,
  M2_PACK_POOL_V1,
  M2_POOL_COUNTS,
  M2_RARITY_WEIGHTS,
  validateM2PackContract,
} from '@/economy/packContract'

describe('M2 pack contract', () => {
  it('freezes the 40-card normal pool and rarity distribution', () => {
    validateM2PackContract()

    expect(M2_PACK_POOL_V1).toHaveLength(40)
    expect(new Set(M2_PACK_POOL_V1.map((card) => card.id)).size).toBe(40)
    expect(M2_POOL_COUNTS).toEqual({ COMMON: 16, RARE: 12, EPIC: 8, LEGENDARY: 4 })
    expect(M2_PACK_POOL_V1).toEqual([...M2_PACK_POOL_V1].sort((left, right) => left.numericId - right.numericId))
  })

  it('keeps the frozen economy literals and one per-slot rarity mechanism', () => {
    expect(M2_PACK_ALGORITHM_VERSION).toBe('m2-official-style-v1')
    expect(M2_PACK_SIZE).toBe(5)
    expect(M2_PACK_PRICE).toBe(100)
    expect(M2_INITIAL_GOLD).toBe(500)
    expect(M2_COMPLETION_REWARD).toBe(20)
    expect(M2_RARITY_WEIGHTS).toEqual({ COMMON: 7165, RARE: 2284, EPIC: 442, LEGENDARY: 109 })
    expect(Object.values(M2_RARITY_WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBe(10_000)
  })
})
