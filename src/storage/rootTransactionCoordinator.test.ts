import { createShowcaseState } from '@/scenarios/showcase'
import { createActiveGameLog, withContentDigest } from '@/log/logBuilder'
import { GameRepository, MemoryStorageAdapter } from '@/storage/repository'
import { RootTransactionCoordinator, RootTransactionError } from '@/storage/rootTransactionCoordinator'
import type { CompletedGameLogV1 } from '@/log/schema'

type TestLog = CompletedGameLogV1

async function completedFixture(gameId: string, result: TestLog['result'] = 'PLAYER_WIN'): Promise<TestLog> {
  const initialState = createShowcaseState()
  initialState.game.phase = 'GAME_OVER'
  initialState.game.winnerId = result === 'PLAYER_WIN' ? 'PLAYER' : 'OPPONENT'
  initialState.game.endReason = 'CONCEDE'
  initialState.game.pendingDecision = null
  const active = await createActiveGameLog(gameId, '2026-08-24T00:00:00.000Z', initialState)
  return withContentDigest({
    ...active,
    status: 'completed',
    result,
    winnerId: initialState.game.winnerId,
    endReason: 'CONCEDE',
    completedAt: '2026-08-24T00:00:01.000Z',
  })
}

describe('RootTransactionCoordinator', () => {
  it('commits active install and finalize through one root with exactly-once reward', async () => {
    const storage = new MemoryStorageAdapter()
    const coordinator = new RootTransactionCoordinator(new GameRepository(storage), { now: () => '2026-08-24T00:00:02.000Z' })
    const log = await completedFixture('finalize-game')
    const active = { ...log, status: 'in_progress' as const }
    const installed = await coordinator.installActive(active)

    expect(installed.wrote).toBe(true)
    expect(installed.root.revision).toBe(1)
    expect(storage.writes).toBe(1)

    const finalized = await coordinator.finalize({ log }, installed.root.revision)
    expect(finalized.wrote).toBe(true)
    expect(finalized.root.revision).toBe(2)
    expect(finalized.root.activeGameLog).toBeNull()
    expect(finalized.root.completedGameLogs.map((item) => item.gameId)).toEqual(['finalize-game'])
    expect(finalized.root.wallet.gold).toBe(520)
    expect(finalized.root.rewardLedger['finalize-game']).toMatchObject({ amount: 20, status: 'GRANTED' })
    expect(storage.writes).toBe(2)

    const rewardRetry = await coordinator.grantReward('finalize-game', finalized.root.revision)
    expect(rewardRetry).toMatchObject({ wrote: false, result: { idempotent: true } })
    expect(rewardRetry.root.wallet.gold).toBe(520)
    expect(storage.writes).toBe(2)

    const finalizeRetry = await coordinator.finalize({ log }, finalized.root.revision)
    expect(finalizeRetry).toMatchObject({ wrote: false, result: { idempotent: true } })
    expect(finalizeRetry.root.wallet.gold).toBe(520)
  })

  it('rejects stale revisions and keeps the persisted root unchanged', async () => {
    const storage = new MemoryStorageAdapter()
    const coordinator = new RootTransactionCoordinator(new GameRepository(storage))
    const first = await completedFixture('first-game')
    const second = await completedFixture('second-game')
    const firstActive = { ...first, status: 'in_progress' as const }
    const secondActive = { ...second, status: 'in_progress' as const }
    await coordinator.installActive(firstActive, 0)

    await expect(coordinator.installActive(secondActive, 0)).rejects.toMatchObject({ code: 'STALE_ROOT' })
    expect((await coordinator.load()).activeGameLog?.gameId).toBe('first-game')
  })

  it('maps quota failures and preserves the previous root', async () => {
    const storage = new MemoryStorageAdapter()
    const coordinator = new RootTransactionCoordinator(new GameRepository(storage))
    const log = await completedFixture('quota-game')
    const active = { ...log, status: 'in_progress' as const }
    storage.failWrites = true

    await expect(coordinator.installActive(active)).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' })
    expect(storage.getItem('hearthstone-web:v1')).toBeNull()
  })

  it('rejects a conflicting game id without writing', async () => {
    const storage = new MemoryStorageAdapter()
    const coordinator = new RootTransactionCoordinator(new GameRepository(storage))
    const first = await completedFixture('same-game')
    const second = await completedFixture('same-game', 'PLAYER_LOSS')
    const firstActive = { ...first, status: 'in_progress' as const }
    await coordinator.installActive(firstActive)
    const rootBefore = await coordinator.load()
    const writesBefore = storage.writes

    await expect(coordinator.finalize({ log: second }, rootBefore.revision)).rejects.toBeInstanceOf(RootTransactionError)
    expect(storage.writes).toBe(writesBefore)
    expect((await coordinator.load()).revision).toBe(rootBefore.revision)
  })
})
