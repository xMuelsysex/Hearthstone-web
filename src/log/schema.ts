import type { GameCommand, TargetLegalityEvidence } from '@/engine/commands'
import type { RecordedEventV1 } from '@/engine/events'
import type { AuthoritativeSessionStateV1, EndReason, PlayerId } from '@/engine/state'
import type { Sha256Hex } from '@/log/hash'

export const LOG_SCHEMA_VERSION = 1 as const

export type RecordedEventWithHashV1 = {
  sequence: number
  event: RecordedEventV1
  postStateHash: Sha256Hex
}

export type CommandBatchV1 = {
  sequence: number
  command: GameCommand
  legalityEvidence: TargetLegalityEvidence[]
  events: RecordedEventWithHashV1[]
  postBatchStateHash: Sha256Hex
}

export type ActiveGameLogV1 = {
  schemaVersion: typeof LOG_SCHEMA_VERSION
  status: 'in_progress'
  gameId: string
  createdAt: string
  updatedAt: string
  rulesVersion: string
  cardDataVersion: string
  scenarioVersion: string
  rngAlgorithmVersion: 'mulberry32-v1'
  initialState: AuthoritativeSessionStateV1
  initialStateHash: Sha256Hex
  batches: CommandBatchV1[]
  totalEventCount: number
  currentStateHash: Sha256Hex
  contentDigest: Sha256Hex
}

export type CompletedGameLogV1 = Omit<ActiveGameLogV1, 'status'> & {
  status: 'completed'
  result: 'PLAYER_WIN' | 'PLAYER_LOSS'
  winnerId: PlayerId
  endReason: EndReason
  completedAt: string
}

export type GameLogV1 = CompletedGameLogV1
export type AnyGameLogV1 = ActiveGameLogV1 | CompletedGameLogV1
