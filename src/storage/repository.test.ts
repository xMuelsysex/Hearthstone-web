import { createGameState } from '@/engine/setup'
import { createActiveGameLog } from '@/log/logBuilder'
import { GameRepository, MemoryStorageAdapter } from '@/storage/repository'

describe('GameRepository', () => {
  it('uses the persisted root as the atomic active-game conflict source', async () => {
    const storage = new MemoryStorageAdapter()
    const firstRepository = new GameRepository(storage)
    const secondRepository = new GameRepository(storage)
    const firstStaleRoot = firstRepository.loadRoot()
    const secondStaleRoot = secondRepository.loadRoot()
    const first = await createActiveGameLog('first-game', '2026-08-24T00:00:00.000Z', createGameState({ seed: 1 }))
    const second = await createActiveGameLog('second-game', '2026-08-24T00:00:01.000Z', createGameState({ seed: 2 }))

    firstRepository.installActive(firstStaleRoot, first)

    expect(() => secondRepository.installActive(secondStaleRoot, second)).toThrow('ACTIVE_GAME_CONFLICT')
    expect(secondRepository.loadRoot().activeGameLog?.gameId).toBe('first-game')
  })
})
