import { commandFromAction } from '@/engine/commands'
import { getLegalActions } from '@/engine/legalActions'
import { resolveCommand } from '@/engine/resolveCommand'
import { createGameState } from '@/engine/setup'
import { appendBatch, createActiveGameLog } from '@/log/logBuilder'
import { replayLog } from '@/log/replay'

describe('authoritative log', () => {
  it('hashes every event and rebuilds the committed state', async () => {
    let state = createGameState({ seed: 99 })
    let log = await createActiveGameLog('game-fixed', '2026-08-24T00:00:00.000Z', state)
    for (const actorId of ['PLAYER', 'OPPONENT'] as const) {
      const action = getLegalActions(state, actorId).find((item) => item.type === 'CONFIRM_MULLIGAN')
      if (!action) throw new Error('missing mulligan')
      const provisional = resolveCommand(state, commandFromAction(action, `command-${actorId}`))
      const nextLog = await appendBatch(log, provisional, '2026-08-24T00:00:01.000Z')
      if (nextLog.status !== 'in_progress') throw new Error('unexpected completed log')
      log = nextLog
      state = provisional.finalState
    }
    expect(log.batches.every((batch) => batch.postBatchStateHash === batch.events.at(-1)?.postStateHash)).toBe(true)
    expect(await replayLog(log)).toEqual(state)
  })
})
