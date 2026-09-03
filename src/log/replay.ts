import { applyRecordedEvent } from '@/engine/applyRecordedEvent'
import { RNG_ALGORITHM_VERSION, RULES_VERSION, type AuthoritativeSessionStateV1 } from '@/engine/state'
import { canonicalizeV1 } from '@/log/canonicalize'
import { hashCanonicalValue, hashStateV1, isSupportedCardDataVersion, LEGACY_CARD_DATA_VERSIONS, normalizeStateForCardDataVersion, type Sha256Hex, type SupportedCardDataVersion } from '@/log/hash'
import type { AnyGameLogV1, RecordedEventWithHashV1 } from '@/log/schema'
import { SCENARIO_VERSION } from '@/scenarios/state'

export type ReplayFrameMetaV1 = {
  kind: 'initial' | 'event'
  batchSequence: number | null
  eventSequence: number | null
  eventType: string | null
  safeEventId: string | null
}

export type ReplayFrameCallbackV1 = (
  state: AuthoritativeSessionStateV1,
  meta: ReplayFrameMetaV1,
) => void | Promise<void>

export type ReplayFailureDetailsV1 = {
  code: string
  batchSequence: number | null
  eventSequence: number | null
  safeEventId: string | null
  expectedHash: Sha256Hex | null
  actualHash: Sha256Hex | null
}

export class ReplayLogIntegrityError extends Error {
  constructor(readonly details: ReplayFailureDetailsV1) {
    const suffix = details.eventSequence !== null
      ? `:${details.eventSequence}`
      : details.batchSequence !== null
        ? `:${details.batchSequence}`
        : ''
    super(`${details.code}${suffix}`)
    this.name = 'ReplayLogIntegrityError'
  }
}

function digestInputOf(log: AnyGameLogV1): Omit<AnyGameLogV1, 'contentDigest'> {
  const digestInput = structuredClone(log) as AnyGameLogV1
  delete (digestInput as Partial<AnyGameLogV1>).contentDigest
  return digestInput as Omit<AnyGameLogV1, 'contentDigest'>
}

function safeEventId(recorded: RecordedEventWithHashV1): string {
  const payload = recorded.event.payload
  if ('commandId' in payload && typeof payload.commandId === 'string') return payload.commandId
  if ('decisionId' in payload && typeof payload.decisionId === 'string') return payload.decisionId
  return `event-${recorded.sequence}`
}

async function replayLogInternal(log: AnyGameLogV1, onFrame?: ReplayFrameCallbackV1): Promise<AuthoritativeSessionStateV1> {
  if (log.rulesVersion !== RULES_VERSION || log.scenarioVersion !== SCENARIO_VERSION || log.rngAlgorithmVersion !== RNG_ALGORITHM_VERSION || !isSupportedCardDataVersion(log.cardDataVersion)) {
    throw new ReplayLogIntegrityError({
      code: 'UNSUPPORTED_VERSION',
      batchSequence: null,
      eventSequence: null,
      safeEventId: null,
      expectedHash: null,
      actualHash: null,
    })
  }
  const cardDataVersion: SupportedCardDataVersion = log.cardDataVersion
  const actualContentDigest = await hashCanonicalValue(digestInputOf(log))
  if (actualContentDigest !== log.contentDigest) throw new ReplayLogIntegrityError({
    code: 'CONTENT_DIGEST_MISMATCH',
    batchSequence: null,
    eventSequence: null,
    safeEventId: null,
    expectedHash: log.contentDigest,
    actualHash: actualContentDigest,
  })
  let state = structuredClone(log.initialState)
  const initialHash = await hashStateV1(state, cardDataVersion)
  if (initialHash !== log.initialStateHash) throw new ReplayLogIntegrityError({
    code: 'INITIAL_STATE_HASH_MISMATCH',
    batchSequence: null,
    eventSequence: null,
    safeEventId: null,
    expectedHash: log.initialStateHash,
    actualHash: initialHash,
  })
  await onFrame?.(structuredClone(state), {
    kind: 'initial',
    batchSequence: null,
    eventSequence: null,
    eventType: null,
    safeEventId: null,
  })

  let expectedSequence = state.game.nextEventSequence
  let expectedBatchSequence = state.game.nextBatchSequence
  let totalEventCount = 0
  for (const batch of log.batches) {
    if (batch.sequence !== expectedBatchSequence) throw new ReplayLogIntegrityError({
      code: 'BATCH_SEQUENCE_MISMATCH',
      batchSequence: batch.sequence,
      eventSequence: null,
      safeEventId: batch.command.commandId,
      expectedHash: null,
      actualHash: null,
    })
    const accepted = batch.events[0]
    if (accepted?.event.scope !== 'GAME' || accepted.event.payload.type !== 'COMMAND_ACCEPTED' || accepted.event.payload.commandId !== batch.command.commandId) {
      throw new ReplayLogIntegrityError({
        code: 'COMMAND_ACCEPTED_MISMATCH',
        batchSequence: batch.sequence,
        eventSequence: accepted?.sequence ?? null,
        safeEventId: batch.command.commandId,
        expectedHash: null,
        actualHash: null,
      })
    }
    for (const recorded of batch.events) {
      if (recorded.sequence !== expectedSequence) throw new ReplayLogIntegrityError({
        code: 'EVENT_SEQUENCE_MISMATCH',
        batchSequence: batch.sequence,
        eventSequence: recorded.sequence,
        safeEventId: safeEventId(recorded),
        expectedHash: null,
        actualHash: null,
      })
      state = normalizeStateForCardDataVersion(applyRecordedEvent(state, recorded.event, { legacyCardDataVersion: cardDataVersion === LEGACY_CARD_DATA_VERSIONS[0] }), cardDataVersion)
      const actualHash = await hashStateV1(state, cardDataVersion)
      if (actualHash !== recorded.postStateHash) throw new ReplayLogIntegrityError({
        code: 'POST_STATE_HASH_MISMATCH',
        batchSequence: batch.sequence,
        eventSequence: recorded.sequence,
        safeEventId: safeEventId(recorded),
        expectedHash: recorded.postStateHash,
        actualHash,
      })
      await onFrame?.(structuredClone(state), {
        kind: 'event',
        batchSequence: batch.sequence,
        eventSequence: recorded.sequence,
        eventType: recorded.event.payload.type,
        safeEventId: safeEventId(recorded),
      })
      expectedSequence += 1
      totalEventCount += 1
    }
    const actualBatchStateHash = batch.events.at(-1)?.postStateHash ?? null
    const lastRecorded = batch.events.at(-1)
    if (batch.postBatchStateHash !== actualBatchStateHash) throw new ReplayLogIntegrityError({
      code: 'BATCH_HASH_MISMATCH',
      batchSequence: batch.sequence,
      eventSequence: lastRecorded?.sequence ?? null,
      safeEventId: lastRecorded ? safeEventId(lastRecorded) : batch.command.commandId,
      expectedHash: batch.postBatchStateHash,
      actualHash: actualBatchStateHash,
    })
    expectedBatchSequence += 1
  }
  if (totalEventCount !== log.totalEventCount) throw new ReplayLogIntegrityError({
    code: 'TOTAL_EVENT_COUNT_MISMATCH',
    batchSequence: null,
    eventSequence: null,
    safeEventId: null,
    expectedHash: null,
    actualHash: null,
  })
  const actualCurrentStateHash = await hashStateV1(state, cardDataVersion)
  if (actualCurrentStateHash !== log.currentStateHash) throw new ReplayLogIntegrityError({
    code: 'CURRENT_STATE_HASH_MISMATCH',
    batchSequence: log.batches.at(-1)?.sequence ?? null,
    eventSequence: log.batches.at(-1)?.events.at(-1)?.sequence ?? null,
    safeEventId: log.batches.at(-1)?.events.at(-1) ? safeEventId(log.batches.at(-1)!.events.at(-1)!) : null,
    expectedHash: log.currentStateHash,
    actualHash: actualCurrentStateHash,
  })
  if (log.status === 'completed') {
    if (state.game.phase !== 'GAME_OVER' || state.game.winnerId !== log.winnerId || state.game.endReason !== log.endReason) throw new Error('TERMINAL_SUMMARY_MISMATCH')
    if (log.result !== (log.winnerId === 'PLAYER' ? 'PLAYER_WIN' : 'PLAYER_LOSS')) throw new Error('RESULT_MISMATCH')
  } else if (state.game.phase === 'GAME_OVER') {
    throw new Error('ACTIVE_LOG_IS_TERMINAL')
  }
  return state
}

export async function replayLog(log: AnyGameLogV1): Promise<AuthoritativeSessionStateV1> {
  return replayLogInternal(log)
}

export async function replayLogFrames(log: AnyGameLogV1, onFrame: ReplayFrameCallbackV1): Promise<AuthoritativeSessionStateV1> {
  return replayLogInternal(log, onFrame)
}

export function eventsCanonicalEqual(left: unknown, right: unknown): boolean {
  return canonicalizeV1(left) === canonicalizeV1(right)
}
