import { CARD_DATA_VERSION } from '@/cards/data/cards.v1'
import type { AuthoritativeSessionStateV1, PlayerId } from '@/engine/state'
import { hashStateV1, isSupportedCardDataVersion, type SupportedCardDataVersion } from '@/log/hash'
import { replayLogFrames, ReplayLogIntegrityError, type ReplayFrameMetaV1 } from '@/log/replay'
import type { AnyGameLogV1 } from '@/log/schema'
import {
  assertReplayViewer,
  projectReplayView,
  type ReplayArtifactOrigin,
  type ReplayArtifactStatus,
  type ReplayAuthorizationRequest,
  type ReplayViewer,
  type ReplayViewModel,
} from '@/replay/privacy'

export type ReplayVersionTupleV1 = {
  rulesVersion: string
  cardDataVersion: string
  scenarioVersion: string
  rngAlgorithmVersion: string
}

export type ReplayFrameKindV1 = 'initial' | 'active' | 'pending-discover' | 'terminal' | 'completed'

export type ReplayFrameV1 = {
  cursor: number
  kind: ReplayFrameKindV1
  sourceDigest: string
  batchSequence: number | null
  eventSequence: number | null
  eventType: string | null
  safeEventId: string | null
  frameHash: string
  version: ReplayVersionTupleV1
  view: ReplayViewModel
}

export type ReplayDivergenceV1 = {
  code: string
  sourceDigest: string
  batchSequence: number | null
  eventSequence: number | null
  safeEventId: string | null
  expectedHash: string | null
  actualHash: string | null
  version: ReplayVersionTupleV1
}

export type ReplayArtifactV1 = {
  log: AnyGameLogV1
  status: ReplayArtifactStatus
  origin: ReplayArtifactOrigin
  ownerId: PlayerId
}

export type ReplayRequestV1 = ReplayAuthorizationRequest & {
  log: AnyGameLogV1
}

export class ReplayIntegrityError extends Error {
  constructor(readonly divergence: ReplayDivergenceV1) {
    super(divergence.code)
    this.name = 'ReplayIntegrityError'
  }
}

export type ReplayValidationResultV1 =
  | { ok: true; artifact: ReplayArtifactV1; frames: readonly ReplayFrameV1[] }
  | { ok: false; divergence: ReplayDivergenceV1 }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function deepFreeze<T>(value: T): T {
  if (!isObject(value) || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value) as T
}

export function replayVersionTuple(log: AnyGameLogV1): ReplayVersionTupleV1 {
  return Object.freeze({
    rulesVersion: log.rulesVersion,
    cardDataVersion: log.cardDataVersion,
    scenarioVersion: log.scenarioVersion,
    rngAlgorithmVersion: log.rngAlgorithmVersion,
  })
}

export function freezeReplayLog(log: AnyGameLogV1): Readonly<AnyGameLogV1> {
  return deepFreeze(structuredClone(log)) as Readonly<AnyGameLogV1>
}

function artifactStatus(log: AnyGameLogV1, requested?: ReplayArtifactStatus): ReplayArtifactStatus {
  if (requested) return requested
  return log.status === 'completed' ? 'completed' : 'active'
}

function supportedCardDataVersion(log: AnyGameLogV1): SupportedCardDataVersion {
  return isSupportedCardDataVersion(log.cardDataVersion) ? log.cardDataVersion : CARD_DATA_VERSION
}

function frameKind(state: AuthoritativeSessionStateV1, meta: ReplayFrameMetaV1, log: AnyGameLogV1): ReplayFrameKindV1 {
  if (meta.kind === 'initial') return 'initial'
  if (state.game.pendingDecision?.kind === 'DISCOVER') return 'pending-discover'
  if (state.game.phase === 'GAME_OVER') return log.status === 'completed' ? 'completed' : 'terminal'
  return 'active'
}

function safeEventIdFromError(message: string): string | null {
  const match = /(?:COMMAND_ACCEPTED_MISMATCH|BATCH_HASH_MISMATCH|POST_STATE_HASH_MISMATCH|EVENT_SEQUENCE_MISMATCH|BATCH_SEQUENCE_MISMATCH):([^:]+)/.exec(message)
  return match?.[1] ?? null
}

function sequenceFromError(message: string, prefix: string): number | null {
  const match = new RegExp(`${prefix}:(\\d+)`).exec(message)
  return match ? Number(match[1]) : null
}

function divergenceFromError(log: AnyGameLogV1, error: unknown): ReplayDivergenceV1 {
  if (error instanceof ReplayLogIntegrityError) {
    return {
      code: error.details.code,
      sourceDigest: log.contentDigest,
      batchSequence: error.details.batchSequence,
      eventSequence: error.details.eventSequence,
      safeEventId: error.details.safeEventId,
      expectedHash: error.details.expectedHash,
      actualHash: error.details.actualHash,
      version: replayVersionTuple(log),
    }
  }
  const message = error instanceof Error ? error.message : 'REPLAY_FAILED'
  const version = replayVersionTuple(log)
  const eventSequence = sequenceFromError(message, 'POST_STATE_HASH_MISMATCH')
    ?? sequenceFromError(message, 'EVENT_SEQUENCE_MISMATCH')
  const batchSequence = sequenceFromError(message, 'BATCH_HASH_MISMATCH')
    ?? sequenceFromError(message, 'BATCH_SEQUENCE_MISMATCH')
    ?? sequenceFromError(message, 'COMMAND_ACCEPTED_MISMATCH')
  return {
    code: message,
    sourceDigest: log.contentDigest,
    batchSequence,
    eventSequence,
    safeEventId: safeEventIdFromError(message),
    expectedHash: null,
    actualHash: null,
    version,
  }
}

async function buildFrames(log: AnyGameLogV1, viewer: ReplayViewer): Promise<readonly ReplayFrameV1[]> {
  const version = replayVersionTuple(log)
  const cardDataVersion = supportedCardDataVersion(log)
  const frames: ReplayFrameV1[] = []
  let finalState: AuthoritativeSessionStateV1 | null = null
  await replayLogFrames(log, async (state, meta) => {
    finalState = state
    const frame: ReplayFrameV1 = {
      cursor: frames.length,
      kind: frameKind(state, meta, log),
      sourceDigest: log.contentDigest,
      batchSequence: meta.batchSequence,
      eventSequence: meta.eventSequence,
      eventType: meta.eventType,
      safeEventId: meta.safeEventId,
      frameHash: await hashStateV1(state, cardDataVersion),
      version,
      view: projectReplayView(state, viewer),
    }
    frames.push(Object.freeze(frame))
  })
  if (log.status === 'completed' && finalState !== null && frames.at(-1)?.kind !== 'completed') {
    frames.push(Object.freeze({
      cursor: frames.length,
      kind: 'completed',
      sourceDigest: log.contentDigest,
      batchSequence: frames.at(-1)?.batchSequence ?? null,
      eventSequence: frames.at(-1)?.eventSequence ?? null,
      eventType: frames.at(-1)?.eventType ?? null,
      safeEventId: frames.at(-1)?.safeEventId ?? null,
      frameHash: await hashStateV1(finalState, cardDataVersion),
      version,
      view: projectReplayView(finalState, viewer),
    }))
  }
  return deepFreeze(frames)
}

export async function validateReplayArtifact(request: ReplayRequestV1): Promise<ReplayValidationResultV1> {
  const status = artifactStatus(request.log, request.status)
  try {
    assertReplayViewer({ ...request, status })
    const log = freezeReplayLog(request.log)
    const frames = await buildFrames(log, request.viewer)
    return {
      ok: true,
      artifact: deepFreeze({
        log,
        status,
        origin: request.origin,
        ownerId: request.ownerId,
      }),
      frames,
    }
  } catch (error) {
    if (error instanceof ReplayIntegrityError) return { ok: false, divergence: error.divergence }
    if (error instanceof Error && error.message === 'REPLAY_VIEW_FORBIDDEN') throw error
    return { ok: false, divergence: divergenceFromError(request.log, error) }
  }
}

export class ReplayCursorV1 {
  private cursorIndex = 0
  private playingState = false
  private speedValue = 1

  constructor(
    readonly artifact: ReplayArtifactV1,
    readonly frames: readonly ReplayFrameV1[],
    readonly viewer: ReplayViewer,
  ) {
    deepFreeze(artifact)
    deepFreeze(frames)
  }

  get cursor(): number { return this.cursorIndex }
  get playing(): boolean { return this.playingState }
  get speed(): number { return this.speedValue }
  get current(): ReplayFrameV1 | null {
    const frame = this.frames[this.cursorIndex]
    return frame ? structuredClone(frame) : null
  }

  step(delta = 1): ReplayFrameV1 | null {
    if (this.frames.length === 0) return null
    if (!Number.isSafeInteger(delta)) throw new Error('REPLAY_CURSOR_DELTA_INVALID')
    this.cursorIndex = Math.min(this.frames.length - 1, Math.max(0, this.cursorIndex + delta))
    return this.current
  }

  restart(): ReplayFrameV1 | null {
    this.cursorIndex = 0
    this.playingState = false
    return this.current
  }

  play(): ReplayFrameV1 | null {
    this.playingState = true
    return this.current
  }

  pause(): ReplayFrameV1 | null {
    this.playingState = false
    return this.current
  }

  setSpeed(speed: number): void {
    if (!Number.isFinite(speed) || speed <= 0 || speed > 8) throw new Error('REPLAY_SPEED_INVALID')
    this.speedValue = speed
  }
}

export async function createReplayCursor(request: ReplayRequestV1): Promise<ReplayCursorV1> {
  const result = await validateReplayArtifact(request)
  if (!result.ok) throw new ReplayIntegrityError(result.divergence)
  return new ReplayCursorV1(result.artifact, result.frames, request.viewer)
}

export const createReplaySession = createReplayCursor
export const replayArtifact = validateReplayArtifact
export const buildReplayFrames = async (request: ReplayRequestV1): Promise<readonly ReplayFrameV1[]> => {
  const result = await validateReplayArtifact(request)
  if (!result.ok) throw new ReplayIntegrityError(result.divergence)
  return result.frames
}
