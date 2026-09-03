import { CARD_DATA_VERSION } from '@/cards/data/cards.v1'
import { RULES_VERSION, type AuthoritativeSessionStateV1 } from '@/engine/state'
import type { ProvisionalCommandBatchV1 } from '@/engine/resolveCommand'
import { hashCanonicalValue, hashStateV1, isSupportedCardDataVersion, type Sha256Hex, type SupportedCardDataVersion } from '@/log/hash'
import { LOG_SCHEMA_VERSION, type ActiveGameLogV1, type AnyGameLogV1, type CommandBatchV1, type CompletedGameLogV1 } from '@/log/schema'
import { SCENARIO_VERSION } from '@/scenarios/state'

function withoutDigest<T extends AnyGameLogV1>(log: T): Omit<T, 'contentDigest'> {
  const copy = { ...log }
  delete (copy as Partial<AnyGameLogV1>).contentDigest
  return copy as Omit<T, 'contentDigest'>
}

export async function withContentDigest<T extends AnyGameLogV1>(log: T): Promise<T> {
  return { ...log, contentDigest: await hashCanonicalValue(withoutDigest(log)) }
}

export async function createActiveGameLog(
  gameId: string,
  createdAt: string,
  initialState: AuthoritativeSessionStateV1,
): Promise<ActiveGameLogV1> {
  const initialStateSnapshot = structuredClone(initialState)
  const initialStateHash = await hashStateV1(initialStateSnapshot)
  const log: ActiveGameLogV1 = {
    schemaVersion: LOG_SCHEMA_VERSION,
    status: 'in_progress',
    gameId,
    createdAt,
    updatedAt: createdAt,
    rulesVersion: RULES_VERSION,
    cardDataVersion: CARD_DATA_VERSION,
    scenarioVersion: SCENARIO_VERSION,
    rngAlgorithmVersion: 'mulberry32-v1',
    initialState: initialStateSnapshot,
    initialStateHash,
    batches: [],
    totalEventCount: 0,
    currentStateHash: initialStateHash,
    contentDigest: '' as Sha256Hex,
  }
  return withContentDigest(log)
}

export async function hashProvisionalBatch(batch: ProvisionalCommandBatchV1, cardDataVersion: SupportedCardDataVersion = CARD_DATA_VERSION): Promise<CommandBatchV1> {
  const events = []
  for (const item of batch.events) {
    events.push({ sequence: item.sequence, event: item.event, postStateHash: await hashStateV1(item.postState, cardDataVersion) })
  }
  const last = events.at(-1)
  if (!last) throw new Error('EMPTY_BATCH')
  return { sequence: batch.sequence, command: batch.command, legalityEvidence: batch.legalityEvidence, events, postBatchStateHash: last.postStateHash }
}

export async function appendBatch(log: ActiveGameLogV1, provisional: ProvisionalCommandBatchV1, updatedAt: string): Promise<ActiveGameLogV1 | CompletedGameLogV1> {
  if (!isSupportedCardDataVersion(log.cardDataVersion)) throw new Error(`UNSUPPORTED_CARD_DATA_VERSION:${log.cardDataVersion}`)
  const cardDataVersion = log.cardDataVersion
  if (await hashStateV1(provisional.baseState, cardDataVersion) !== log.currentStateHash) throw new Error('BATCH_BASE_STATE_MISMATCH')
  const expectedBatchSequence = log.batches.at(-1)?.sequence === undefined ? log.initialState.game.nextBatchSequence : (log.batches.at(-1)?.sequence ?? 0) + 1
  if (provisional.sequence !== expectedBatchSequence) throw new Error(`BATCH_SEQUENCE_MISMATCH:${expectedBatchSequence}`)
  const expectedEventSequence = log.batches.at(-1)?.events.at(-1)?.sequence === undefined ? log.initialState.game.nextEventSequence : (log.batches.at(-1)?.events.at(-1)?.sequence ?? 0) + 1
  if (provisional.events[0]?.sequence !== expectedEventSequence) throw new Error(`EVENT_SEQUENCE_MISMATCH:${expectedEventSequence}`)
  const batch = await hashProvisionalBatch(provisional, cardDataVersion)
  const base: ActiveGameLogV1 = {
    ...log,
    updatedAt,
    batches: [...log.batches, batch],
    totalEventCount: log.totalEventCount + batch.events.length,
    currentStateHash: batch.postBatchStateHash,
    contentDigest: '' as Sha256Hex,
  }
  if (provisional.finalState.game.phase !== 'GAME_OVER' || provisional.finalState.game.winnerId === null || provisional.finalState.game.endReason === null) {
    return withContentDigest(base)
  }
  const completed: CompletedGameLogV1 = {
    ...base,
    status: 'completed',
    result: provisional.finalState.game.winnerId === 'PLAYER' ? 'PLAYER_WIN' : 'PLAYER_LOSS',
    winnerId: provisional.finalState.game.winnerId,
    endReason: provisional.finalState.game.endReason,
    completedAt: updatedAt,
  }
  return withContentDigest(completed)
}
