import { commandFromAction } from '@/engine/commands'
import { getLegalActions } from '@/engine/legalActions'
import { resolveCommand } from '@/engine/resolveCommand'
import { createShowcaseState } from '@/scenarios/showcase'
import { appendBatch, createActiveGameLog } from '@/log/logBuilder'
import { GameRepository, MemoryStorageAdapter } from '@/storage/repository'
import { RootTransactionCoordinator } from '@/storage/rootTransactionCoordinator'
import type { CompletedGameLogV1 } from '@/log/schema'

async function completedLog(gameId: string, result: CompletedGameLogV1['result'] = 'PLAYER_LOSS'): Promise<CompletedGameLogV1> {
  const active = await createActiveGameLog(gameId, '2026-08-24T00:00:00.000Z', createShowcaseState())
  const actorId = result === 'PLAYER_WIN' ? 'PLAYER' : 'OPPONENT'
  const concede = getLegalActions(active.initialState, actorId).find((action) => action.type === 'CONCEDE')
  if (!concede) throw new Error('missing concede fixture')
  const provisional = resolveCommand(active.initialState, commandFromAction(concede, `${gameId}:1`))
  const completed = await appendBatch(active, provisional, '2026-08-24T00:00:01.000Z')
  if (completed.status !== 'completed') throw new Error('concede did not complete fixture')
  return completed
}

describe('M2 reward eligibility', () => {
  it('grants +20 only for a local finalize and keeps imported/migrated paths at zero', async () => {
    const storage = new MemoryStorageAdapter()
    const coordinator = new RootTransactionCoordinator(new GameRepository(storage))
    const localLog = await completedLog('local-loss')
    const importedLog = await completedLog('imported-loss')

    await coordinator.installActive({ ...localLog, status: 'in_progress' })
    const finalized = await coordinator.finalize({ log: localLog }, 1)
    expect(finalized.root.wallet.gold).toBe(520)
    expect(finalized.root.finalizedGames['local-loss']?.eligible).toBe(true)

    const imported = await coordinator.importCompleted(importedLog, finalized.root.revision)
    expect(imported.root.wallet.gold).toBe(520)
    expect(imported.root.finalizedGames['imported-loss']).toMatchObject({ eligible: false, source: 'V1_IMPORT' })
    expect(imported.root.rewardLedger['imported-loss']).toBeUndefined()
  })
})
