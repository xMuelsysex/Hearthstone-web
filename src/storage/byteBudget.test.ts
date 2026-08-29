import { canonicalBytes, fitCompletedLogs } from '@/storage/byteBudget'
import type { CompletedGameLogV1 } from '@/log/schema'

describe('storage byte budgets', () => {
  it('counts UTF-8 bytes', () => {
    expect(canonicalBytes('中')).toBe(5)
    expect(canonicalBytes('a')).toBe(3)
  })

  it('retains only the newest 20 completed logs', () => {
    const logs = Array.from({ length: 21 }, (_, index) => ({
      gameId: `game-${index}`,
      completedAt: `2026-08-24T00:00:${String(index).padStart(2, '0')}.000Z`,
    } as CompletedGameLogV1))
    const kept = fitCompletedLogs(logs)
    expect(kept).toHaveLength(20)
    expect(kept[0]?.gameId).toBe('game-1')
  })
})
