import type { CardDefinitionId } from '@/cards/types'
import { getLegalActions } from '@/engine/legalActions'
import type { AuthoritativeSessionStateV1, CommandId, DecisionId, EntityId, PlayerId } from '@/engine/state'

export type GameCommand =
  | { type: 'CONFIRM_MULLIGAN'; actorId: PlayerId; commandId: CommandId; mulliganCardInstanceIds: EntityId[] }
  | { type: 'PLAY_CARD'; actorId: PlayerId; commandId: CommandId; cardInstanceId: EntityId; playMode: 'NORMAL' | 'MAGNETIC'; placementIndex?: number; targetEntityId?: EntityId }
  | { type: 'SELECT_DISCOVER'; actorId: PlayerId; commandId: CommandId; decisionId: DecisionId; discoverChoiceId: CardDefinitionId }
  | { type: 'ATTACK'; actorId: PlayerId; commandId: CommandId; attackSourceId: EntityId; attackTargetId: EntityId }
  | { type: 'USE_HERO_POWER'; actorId: PlayerId; commandId: CommandId; targetEntityId?: EntityId }
  | { type: 'END_TURN' | 'CONCEDE'; actorId: PlayerId; commandId: CommandId }

export type TargetLegalityEvidence = {
  actionKind: 'SPELL' | 'HERO_POWER'
  actorId: PlayerId
  publicCandidateEntityIds: EntityId[]
  excluded: Array<{ entityId: EntityId; reason: 'ELUSIVE' }>
  selectedTargetEntityId: EntityId
}

export type MulliganActionDescriptor = {
  id: string
  type: 'CONFIRM_MULLIGAN'
  actorId: PlayerId
  selectableEntityIds: EntityId[]
}

export type LegalActionDescriptor =
  | MulliganActionDescriptor
  | { id: string; type: 'PLAY_CARD'; actorId: PlayerId; cardInstanceId: EntityId; playMode: 'NORMAL' | 'MAGNETIC'; placementIndex?: number; targetEntityId?: EntityId; evidence?: TargetLegalityEvidence }
  | { id: string; type: 'SELECT_DISCOVER'; actorId: PlayerId; decisionId: DecisionId; discoverChoiceId: CardDefinitionId }
  | { id: string; type: 'ATTACK'; actorId: PlayerId; attackSourceId: EntityId; attackTargetId: EntityId }
  | { id: string; type: 'USE_HERO_POWER'; actorId: PlayerId; targetEntityId?: EntityId; evidence?: TargetLegalityEvidence }
  | { id: string; type: 'END_TURN' | 'CONCEDE'; actorId: PlayerId }

export type ValidationResult =
  | { ok: true; descriptor: LegalActionDescriptor; evidence: TargetLegalityEvidence[] }
  | { ok: false; code: string }

export function commandFromAction(
  descriptor: LegalActionDescriptor,
  commandId: CommandId,
  mulliganCardInstanceIds: EntityId[] = [],
): GameCommand {
  switch (descriptor.type) {
    case 'CONFIRM_MULLIGAN':
      return { type: descriptor.type, actorId: descriptor.actorId, commandId, mulliganCardInstanceIds }
    case 'PLAY_CARD': {
      const command: Extract<GameCommand, { type: 'PLAY_CARD' }> = {
        type: descriptor.type,
        actorId: descriptor.actorId,
        commandId,
        cardInstanceId: descriptor.cardInstanceId,
        playMode: descriptor.playMode,
      }
      if (descriptor.placementIndex !== undefined) command.placementIndex = descriptor.placementIndex
      if (descriptor.targetEntityId !== undefined) command.targetEntityId = descriptor.targetEntityId
      return command
    }
    case 'SELECT_DISCOVER':
      return { type: descriptor.type, actorId: descriptor.actorId, commandId, decisionId: descriptor.decisionId, discoverChoiceId: descriptor.discoverChoiceId }
    case 'ATTACK':
      return { type: descriptor.type, actorId: descriptor.actorId, commandId, attackSourceId: descriptor.attackSourceId, attackTargetId: descriptor.attackTargetId }
    case 'USE_HERO_POWER': {
      const command: Extract<GameCommand, { type: 'USE_HERO_POWER' }> = { type: descriptor.type, actorId: descriptor.actorId, commandId }
      if (descriptor.targetEntityId !== undefined) command.targetEntityId = descriptor.targetEntityId
      return command
    }
    case 'END_TURN':
    case 'CONCEDE':
      return { type: descriptor.type, actorId: descriptor.actorId, commandId }
  }
}

export function validateCommand(state: AuthoritativeSessionStateV1, command: GameCommand): ValidationResult {
  return validateAgainstLegalActions(state, command)
}

function validateAgainstLegalActions(state: AuthoritativeSessionStateV1, command: GameCommand): ValidationResult {
  // Deferred import avoids a second legality implementation while keeping the public command module small.
  const actions = getLegalActions(state, command.actorId)
  if (command.type === 'CONFIRM_MULLIGAN') {
    const descriptor = actions.find((item): item is MulliganActionDescriptor => item.type === command.type)
    if (!descriptor) return { ok: false, code: 'ILLEGAL_MULLIGAN' }
    const selected = new Set(command.mulliganCardInstanceIds)
    if (selected.size !== command.mulliganCardInstanceIds.length || [...selected].some((id) => !descriptor.selectableEntityIds.includes(id))) {
      return { ok: false, code: 'ILLEGAL_MULLIGAN_SELECTION' }
    }
    return { ok: true, descriptor, evidence: [] }
  }
  const descriptor = actions.find((item) => actionMatchesCommand(item, command))
  if (!descriptor) return { ok: false, code: 'ILLEGAL_COMMAND' }
  const evidence = 'evidence' in descriptor && descriptor.evidence ? [descriptor.evidence] : []
  return { ok: true, descriptor, evidence }
}

function actionMatchesCommand(action: LegalActionDescriptor, command: GameCommand): boolean {
  if (action.type !== command.type || action.actorId !== command.actorId) return false
  switch (action.type) {
    case 'PLAY_CARD':
      return command.type === 'PLAY_CARD' && action.cardInstanceId === command.cardInstanceId && action.playMode === command.playMode && action.placementIndex === command.placementIndex && action.targetEntityId === command.targetEntityId
    case 'SELECT_DISCOVER':
      return command.type === 'SELECT_DISCOVER' && action.decisionId === command.decisionId && action.discoverChoiceId === command.discoverChoiceId
    case 'ATTACK':
      return command.type === 'ATTACK' && action.attackSourceId === command.attackSourceId && action.attackTargetId === command.attackTargetId
    case 'USE_HERO_POWER':
      return command.type === 'USE_HERO_POWER' && action.targetEntityId === command.targetEntityId
    case 'END_TURN':
    case 'CONCEDE':
      return true
    case 'CONFIRM_MULLIGAN':
      return false
  }
}
