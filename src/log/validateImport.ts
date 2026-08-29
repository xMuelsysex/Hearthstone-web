import { z } from 'zod'
import { CARD_DATA_VERSION } from '@/cards/data/cards.v1'
import { resolveCommand } from '@/engine/resolveCommand'
import { RULES_VERSION } from '@/engine/state'
import { canonicalizeV1 } from '@/log/canonicalize'
import { hashCanonicalValue, hashStateV1 } from '@/log/hash'
import type { AnyGameLogV1 } from '@/log/schema'
import { replayLog } from '@/log/replay'
import { SCENARIO_VERSION } from '@/scenarios/state'
import { GameRepository } from '@/storage/repository'
import type { StorageRootV1 } from '@/storage/schema'

export const IMPORT_BYTE_LIMIT = 1_048_576
const shaSchema = z.string().regex(/^[a-f0-9]{64}$/)
const shortString = z.string().min(1).max(128)

const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('CONFIRM_MULLIGAN'), actorId: z.enum(['PLAYER', 'OPPONENT']), commandId: shortString, mulliganCardInstanceIds: z.array(z.number().int().positive()).max(10) }).strict(),
  z.object({ type: z.literal('PLAY_CARD'), actorId: z.enum(['PLAYER', 'OPPONENT']), commandId: shortString, cardInstanceId: z.number().int().positive(), playMode: z.enum(['NORMAL', 'MAGNETIC']), placementIndex: z.number().int().min(0).max(7).optional(), targetEntityId: z.number().int().positive().optional() }).strict(),
  z.object({ type: z.literal('SELECT_DISCOVER'), actorId: z.enum(['PLAYER', 'OPPONENT']), commandId: shortString, decisionId: shortString, discoverChoiceId: shortString }).strict(),
  z.object({ type: z.literal('ATTACK'), actorId: z.enum(['PLAYER', 'OPPONENT']), commandId: shortString, attackSourceId: z.number().int().positive(), attackTargetId: z.number().int().positive() }).strict(),
  z.object({ type: z.literal('USE_HERO_POWER'), actorId: z.enum(['PLAYER', 'OPPONENT']), commandId: shortString, targetEntityId: z.number().int().positive().optional() }).strict(),
  z.object({ type: z.literal('END_TURN'), actorId: z.enum(['PLAYER', 'OPPONENT']), commandId: shortString }).strict(),
  z.object({ type: z.literal('CONCEDE'), actorId: z.enum(['PLAYER', 'OPPONENT']), commandId: shortString }).strict(),
])

const evidenceSchema = z.object({
  actionKind: z.enum(['SPELL', 'HERO_POWER']),
  actorId: z.enum(['PLAYER', 'OPPONENT']),
  publicCandidateEntityIds: z.array(z.number().int().positive()).max(32),
  excluded: z.array(z.object({ entityId: z.number().int().positive(), reason: z.literal('ELUSIVE') }).strict()).max(32),
  selectedTargetEntityId: z.number().int().positive(),
}).strict()

const eventSchema = z.object({
  sequence: z.number().int().positive(),
  event: z.object({ scope: z.enum(['GAME', 'SCENARIO']), payload: z.object({ type: shortString }).passthrough() }).strict(),
  postStateHash: shaSchema,
}).strict()

const batchSchema = z.object({
  sequence: z.number().int().positive(),
  command: commandSchema,
  legalityEvidence: z.array(evidenceSchema).max(32),
  events: z.array(eventSchema).min(1).max(256),
  postBatchStateHash: shaSchema,
}).strict()

const playerIdSchema = z.enum(['PLAYER', 'OPPONENT'])
const entityIdSchema = z.number().int().positive()
const entitySchema = z.object({
  id: entityIdSchema,
  definitionId: shortString,
  ownerId: playerIdSchema,
  controllerId: playerIdSchema,
  zone: z.enum(['DECK', 'HAND', 'BOARD', 'GRAVEYARD', 'HERO', 'HERO_POWER', 'WEAPON', 'ATTACHED', 'SET_ASIDE']),
  type: z.enum(['MINION', 'SPELL', 'WEAPON', 'HERO', 'HERO_POWER']),
  createdSequence: z.number().int().nonnegative(),
  attack: z.number().int().min(-1000).max(1000),
  health: z.number().int().min(-1000).max(1000),
  maxHealth: z.number().int().nonnegative().max(1000),
  armor: z.number().int().nonnegative().max(1000),
  durability: z.number().int().min(-1000).max(1000),
  exhausted: z.boolean(),
  poisonousLethal: z.boolean(),
  destroyMarked: z.boolean(),
  deathrattleResolved: z.boolean(),
  keywords: z.array(z.enum(['MANATHIRST', 'POISONOUS', 'ELUSIVE', 'DISCOVER', 'MAGNETIC', 'TAUNT', 'DEATHRATTLE'])).max(16),
  races: z.array(z.enum(['BEAST', 'DRAGON', 'ELEMENTAL', 'MECHANICAL', 'MURLOC', 'NAGA', 'UNDEAD'])).max(16),
  attachedCardIds: z.array(entityIdSchema).max(16),
}).strict()
const playerSchema = z.object({
  id: playerIdSchema,
  heroEntityId: entityIdSchema,
  heroPowerEntityId: entityIdSchema,
  deck: z.array(entityIdSchema).max(60),
  hand: z.array(entityIdSchema).max(10),
  board: z.array(entityIdSchema).max(7),
  graveyard: z.array(entityIdSchema).max(128),
  weaponEntityId: entityIdSchema.nullable(),
  mana: z.object({ maximum: z.number().int().min(0).max(10), current: z.number().int().min(0).max(10), temporary: z.number().int().min(0).max(10) }).strict(),
  fatigue: z.number().int().nonnegative().max(100),
  heroPowerUsed: z.boolean(),
  mulliganConfirmed: z.boolean(),
}).strict()
const pendingDecisionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('MULLIGAN'), waitingFor: z.array(playerIdSchema).max(2) }).strict(),
  z.object({ kind: z.literal('DISCOVER'), decisionId: shortString, actorId: playerIdSchema, sourceEntityId: entityIdSchema, choiceDefinitionIds: z.array(shortString).length(3) }).strict(),
])
const coverageSchema = z.object({
  MANATHIRST: z.number().int().positive().nullable(),
  POISONOUS: z.number().int().positive().nullable(),
  ELUSIVE: z.number().int().positive().nullable(),
  DISCOVER: z.number().int().positive().nullable(),
  MAGNETIC: z.number().int().positive().nullable(),
}).strict()
const sessionStateSchema = z.object({
  game: z.object({
    version: z.literal(1),
    rulesVersion: z.literal(RULES_VERSION),
    phase: z.enum(['MULLIGAN', 'PLAY', 'GAME_OVER']),
    turn: z.number().int().nonnegative().max(1000),
    activePlayerId: playerIdSchema,
    startingPlayerId: playerIdSchema,
    winnerId: playerIdSchema.nullable(),
    endReason: z.enum(['CONCEDE', 'HERO_DEFEATED']).nullable(),
    players: z.object({ PLAYER: playerSchema, OPPONENT: playerSchema }).strict(),
    entities: z.record(z.string(), entitySchema).refine((entities) => Object.keys(entities).length <= 256),
    pendingDecision: pendingDecisionSchema.nullable(),
    rng: z.object({ algorithm: z.literal('mulberry32-v1'), seed: z.number().int(), state: z.number().int(), cursor: z.number().int().nonnegative() }).strict(),
    nextEntityId: z.number().int().positive(),
    nextEventSequence: z.number().int().positive(),
    nextBatchSequence: z.number().int().positive(),
  }).strict(),
  scenario: z.object({
    id: z.enum(['showcase-v1', 'tutorial-v1', 'sandbox-v1']),
    version: z.literal(SCENARIO_VERSION),
    coverage: coverageSchema,
    stage: z.enum(['IN_PROGRESS', 'READY_FOR_AI_CONCEDE', 'COMPLETED']),
    aiConcedeRequested: z.boolean(),
    acceptedCommandCount: z.number().int().nonnegative().max(8192),
  }).strict(),
}).strict()

const activeSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.literal('in_progress'),
  gameId: shortString,
  createdAt: z.string().min(1).max(128),
  updatedAt: z.string().min(1).max(128),
  rulesVersion: shortString,
  cardDataVersion: shortString,
  scenarioVersion: shortString,
  rngAlgorithmVersion: z.literal('mulberry32-v1'),
  initialState: sessionStateSchema,
  initialStateHash: shaSchema,
  batches: z.array(batchSchema).max(1024),
  totalEventCount: z.number().int().min(0).max(8192),
  currentStateHash: shaSchema,
  contentDigest: shaSchema,
}).strict()

const completedSchema = activeSchema.omit({ status: true }).extend({
  status: z.literal('completed'),
  result: z.enum(['PLAYER_WIN', 'PLAYER_LOSS']),
  winnerId: z.enum(['PLAYER', 'OPPONENT']),
  endReason: z.enum(['CONCEDE', 'HERO_DEFEATED']),
  completedAt: z.string().min(1).max(128),
}).strict()

const logBoundarySchema = z.discriminatedUnion('status', [activeSchema, completedSchema])

export type ImportFileLike = { size: number; text(): Promise<string> }
export type ImportResult = { root: StorageRootV1; log: AnyGameLogV1; idempotent: boolean }

function assertInitialStateReferences(log: AnyGameLogV1): void {
  const { game } = log.initialState
  const entities = game.entities
  const referenced = new Set<number>()
  for (const [key, entity] of Object.entries(entities)) {
    if (key !== String(entity.id)) throw new Error('IMPORT_SEMANTIC_INVALID')
    for (const attachedId of entity.attachedCardIds) {
      if (!entities[String(attachedId)]) throw new Error('IMPORT_SEMANTIC_INVALID')
    }
  }
  for (const player of Object.values(game.players)) {
    for (const entityId of [player.heroEntityId, player.heroPowerEntityId, ...player.deck, ...player.hand, ...player.board, ...player.graveyard]) {
      if (!entities[String(entityId)] || referenced.has(entityId)) throw new Error('IMPORT_SEMANTIC_INVALID')
      referenced.add(entityId)
    }
    if (player.weaponEntityId !== null) {
      if (!entities[String(player.weaponEntityId)] || referenced.has(player.weaponEntityId)) throw new Error('IMPORT_SEMANTIC_INVALID')
      referenced.add(player.weaponEntityId)
    }
  }
  if (game.pendingDecision?.kind === 'DISCOVER' && !entities[String(game.pendingDecision.sourceEntityId)]) throw new Error('IMPORT_SEMANTIC_INVALID')
  const maximumEntityId = Math.max(0, ...Object.values(entities).map((entity) => entity.id))
  if (game.nextEntityId <= maximumEntityId) throw new Error('IMPORT_SEMANTIC_INVALID')
}

export async function validateAndImportLog(
  file: ImportFileLike,
  root: StorageRootV1,
  repository: GameRepository,
): Promise<ImportResult> {
  if (file.size > IMPORT_BYTE_LIMIT) throw new Error('IMPORT_FILE_TOO_LARGE')
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('IMPORT_INVALID_JSON')
  }
  const boundary = logBoundarySchema.safeParse(parsed)
  if (!boundary.success) throw new Error('IMPORT_SCHEMA_INVALID')
  const log = boundary.data as AnyGameLogV1
  if (log.rulesVersion !== RULES_VERSION || log.cardDataVersion !== CARD_DATA_VERSION || log.scenarioVersion !== SCENARIO_VERSION) {
    throw new Error('UNSUPPORTED_VERSION')
  }
  assertInitialStateReferences(log)
  const replayedState = await replayLog(log)
  if (log.batches.reduce((sum, batch) => sum + batch.events.length, 0) !== log.totalEventCount) throw new Error('TOTAL_EVENT_COUNT_MISMATCH')

  let state = structuredClone(log.initialState)
  let expectedBatchSequence = state.game.nextBatchSequence
  let expectedEventSequence = state.game.nextEventSequence
  for (const batch of log.batches) {
    if (batch.sequence !== expectedBatchSequence) throw new Error(`BATCH_SEQUENCE_MISMATCH:${expectedBatchSequence}`)
    const provisional = resolveCommand(state, batch.command)
    if (canonicalizeV1(provisional.legalityEvidence) !== canonicalizeV1(batch.legalityEvidence)) throw new Error(`LEGALITY_EVIDENCE_MISMATCH:${batch.sequence}`)
    if (provisional.events.length !== batch.events.length) throw new Error(`EVENT_COUNT_MISMATCH:${batch.sequence}`)
    for (let index = 0; index < batch.events.length; index += 1) {
      const supplied = batch.events[index]
      const expected = provisional.events[index]
      if (!supplied || !expected) throw new Error(`EVENT_MISSING:${batch.sequence}:${index}`)
      if (supplied.sequence !== expectedEventSequence || supplied.sequence !== expected.sequence) throw new Error(`EVENT_SEQUENCE_MISMATCH:${expectedEventSequence}`)
      if (canonicalizeV1(supplied.event) !== canonicalizeV1(expected.event)) throw new Error(`EVENT_PAYLOAD_MISMATCH:${supplied.sequence}`)
      const actualHash = await hashStateV1(expected.postState)
      if (actualHash !== supplied.postStateHash) throw new Error(`POST_STATE_HASH_MISMATCH:${supplied.sequence}`)
      expectedEventSequence += 1
    }
    if (batch.postBatchStateHash !== batch.events.at(-1)?.postStateHash) throw new Error(`BATCH_HASH_MISMATCH:${batch.sequence}`)
    state = provisional.finalState
    expectedBatchSequence += 1
  }
  if (await hashStateV1(state) !== log.currentStateHash || await hashStateV1(replayedState) !== log.currentStateHash) throw new Error('CURRENT_STATE_HASH_MISMATCH')
  if (log.status === 'completed') {
    if (state.game.phase !== 'GAME_OVER' || state.game.winnerId !== log.winnerId || state.game.endReason !== log.endReason) throw new Error('TERMINAL_SUMMARY_MISMATCH')
    const expectedResult = log.winnerId === 'PLAYER' ? 'PLAYER_WIN' : 'PLAYER_LOSS'
    if (log.result !== expectedResult) throw new Error('RESULT_MISMATCH')
  }
  const digestInput = { ...log } as AnyGameLogV1
  delete (digestInput as Partial<AnyGameLogV1>).contentDigest
  if (await hashCanonicalValue(digestInput) !== log.contentDigest) throw new Error('CONTENT_DIGEST_MISMATCH')

  const existing = [root.activeGameLog, ...root.completedGameLogs].find((item) => item?.gameId === log.gameId)
  if (existing) {
    if (existing.contentDigest === log.contentDigest) return { root, log, idempotent: true }
    throw new Error('GAME_ID_CONFLICT')
  }
  const nextRoot = log.status === 'in_progress' ? repository.installActive(root, log) : repository.importCompleted(root, log)
  return { root: nextRoot, log, idempotent: false }
}

export function exportLog(log: AnyGameLogV1): string {
  return canonicalizeV1(log)
}
