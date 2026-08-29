import { applyRecordedEvent } from '@/engine/applyRecordedEvent'
import { commandFromAction } from '@/engine/commands'
import { getLegalActions } from '@/engine/legalActions'
import { resolveCommand } from '@/engine/resolveCommand'
import { createGameState } from '@/engine/setup'
import { appendBatch, createActiveGameLog, withContentDigest } from '@/log/logBuilder'
import { hashStateV1, type Sha256Hex } from '@/log/hash'
import type { CompletedGameLogV1 } from '@/log/schema'
import { createReplayCursor, validateReplayArtifact } from '@/replay/replay'

async function createCompletedFixture(): Promise<CompletedGameLogV1> {
  let state = createGameState({ seed: 901 })
  let log = await createActiveGameLog('replay-fixture', '2026-08-27T00:00:00.000Z', state)
  for (const actorId of ['PLAYER', 'OPPONENT'] as const) {
    const action = getLegalActions(state, actorId).find((candidate) => candidate.type === 'CONFIRM_MULLIGAN')
    if (!action) throw new Error(`MISSING_MULLIGAN:${actorId}`)
    const provisional = resolveCommand(state, commandFromAction(action, `mulligan-${actorId}`))
    const nextLog = await appendBatch(log, provisional, '2026-08-27T00:00:01.000Z')
    if (nextLog.status !== 'in_progress') throw new Error('UNEXPECTED_COMPLETION')
    log = nextLog
    state = provisional.finalState
  }
  const concede = getLegalActions(state, 'PLAYER').find((candidate) => candidate.type === 'CONCEDE')
  if (!concede) throw new Error('MISSING_CONCEDE')
  const completed = await appendBatch(log, resolveCommand(state, commandFromAction(concede, 'concede')), '2026-08-27T00:00:02.000Z')
  if (completed.status !== 'completed') throw new Error('MISSING_COMPLETED_FIXTURE')
  return completed
}

describe('replay artifacts', () => {
  it('keeps the replay input immutable while the cursor returns isolated frames', async () => {
    const log = await createCompletedFixture()
    const cursor = await createReplayCursor({ log, status: 'completed', origin: 'local', ownerId: 'PLAYER', viewer: 'PLAYER' })
    const initial = cursor.current
    if (!initial) throw new Error('MISSING_INITIAL_FRAME')
    const initialHandLength = initial.view.self.hand.length

    expect(Object.isFrozen(cursor.artifact)).toBe(true)
    expect(Object.isFrozen(cursor.artifact.log)).toBe(true)
    expect(Object.isFrozen(cursor.artifact.log.initialState)).toBe(true)
    expect(Object.isFrozen(cursor.frames)).toBe(true)

    initial.view.self.hand.splice(0)
    expect(cursor.current?.view.self.hand).toHaveLength(initialHandLength)
    expect(cursor.step(2)?.cursor).toBe(2)
    expect(cursor.cursor).toBe(2)
    expect(log.batches).toHaveLength(3)
  })

  it('reports the first divergent event with the supplied and rebuilt hashes', async () => {
    const log = await createCompletedFixture()
    const firstEvent = log.batches[0]?.events[0]
    if (!firstEvent) throw new Error('MISSING_FIRST_EVENT')
    const actualState = applyRecordedEvent(log.initialState, firstEvent.event)
    const actualHash = await hashStateV1(actualState)
    const expectedHash = firstEvent.postStateHash
    const corrupted = structuredClone(log)
    const corruptedEvent = corrupted.batches[0]?.events[0]
    if (!corruptedEvent) throw new Error('MISSING_CORRUPTED_EVENT')
    corruptedEvent.postStateHash = '0'.repeat(64) as Sha256Hex
    const corruptedWithDigest = await withContentDigest(corrupted)

    const result = await validateReplayArtifact({
      log: corruptedWithDigest,
      status: 'completed',
      origin: 'local',
      ownerId: 'PLAYER',
      viewer: 'PLAYER',
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('EXPECTED_REPLAY_FAILURE')
    expect(result.divergence.code).toBe('POST_STATE_HASH_MISMATCH')
    expect(result.divergence.batchSequence).toBe(firstEvent.sequence)
    expect(result.divergence.eventSequence).toBe(firstEvent.sequence)
    expect(result.divergence.safeEventId).toBe('mulligan-PLAYER')
    expect(result.divergence.expectedHash).toBe('0'.repeat(64))
    expect(result.divergence.expectedHash).not.toBe(expectedHash)
    expect(result.divergence.actualHash).toBe(actualHash)
  })
})
