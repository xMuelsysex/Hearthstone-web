import type { LegalActionDescriptor } from '@/engine/commands'
import { commandFromAction } from '@/engine/commands'
import { getLegalActions } from '@/engine/legalActions'
import { resolveCommand, type ProvisionalCommandBatchV1 } from '@/engine/resolveCommand'
import { createGameState } from '@/engine/setup'
import { getEntity, type AuthoritativeSessionStateV1, type EntityId, type EntityZone, type PlayerId } from '@/engine/state'

export type TutorialStepId = 'MANATHIRST' | 'POISONOUS' | 'ELUSIVE' | 'DISCOVER' | 'MAGNETIC'

export type TutorialStepDefinition = {
  id: TutorialStepId
  title: string
  instruction: string
  maximumActions: number
}

export const TUTORIAL_STEPS: readonly TutorialStepDefinition[] = [
  { id: 'MANATHIRST', title: '法力渴求', instruction: '在拥有 8 点法力值时使用奥术箭。', maximumActions: 1 },
  { id: 'POISONOUS', title: '剧毒', instruction: '让辟法奇美拉攻击高生命值随从。', maximumActions: 1 },
  { id: 'ELUSIVE', title: '扰魔', instruction: '尝试使用指向性法术，观察辟法奇美拉被排除。', maximumActions: 1 },
  { id: 'DISCOVER', title: '发现', instruction: '使用符文宝珠并选择一张发现牌。', maximumActions: 2 },
  { id: 'MAGNETIC', title: '磁力', instruction: '将战争机兵磁力合体到可升级机器人。', maximumActions: 1 },
]

export type TutorialControlAction = { type: 'RESET_TUTORIAL_STEP'; stepId: TutorialStepId }
export type TutorialEngineAction = { type: 'ENGINE_ACTION'; descriptor: LegalActionDescriptor }
export type TutorialAction = TutorialControlAction | TutorialEngineAction

export type TutorialStepSession = {
  stepId: TutorialStepId
  state: AuthoritativeSessionStateV1
  complete: boolean
  acceptedActionCount: number
  lastBatch: ProvisionalCommandBatchV1 | null
}

function confirmMulligans(state: AuthoritativeSessionStateV1): AuthoritativeSessionStateV1 {
  let current = state
  for (const actorId of ['PLAYER', 'OPPONENT'] as const) {
    const action = getLegalActions(current, actorId).find((candidate) => candidate.type === 'CONFIRM_MULLIGAN')
    if (!action) throw new Error(`TUTORIAL_MULLIGAN_ACTION_MISSING:${actorId}`)
    current = resolveCommand(current, commandFromAction(action, `tutorial-setup-${actorId}`)).finalState
  }
  return current
}

function removeEntityFromZones(state: AuthoritativeSessionStateV1, entityId: EntityId): void {
  for (const player of Object.values(state.game.players)) {
    player.deck = player.deck.filter((id) => id !== entityId)
    player.hand = player.hand.filter((id) => id !== entityId)
    player.board = player.board.filter((id) => id !== entityId)
    player.graveyard = player.graveyard.filter((id) => id !== entityId)
    if (player.weaponEntityId === entityId) player.weaponEntityId = null
  }
}

function placeDefinition(state: AuthoritativeSessionStateV1, actorId: PlayerId, definitionId: string, zone: Extract<EntityZone, 'HAND' | 'BOARD'>): EntityId {
  const entity = Object.values(state.game.entities).find((candidate) => candidate.ownerId === actorId && candidate.definitionId === definitionId)
  if (!entity) throw new Error(`TUTORIAL_CARD_MISSING:${actorId}:${definitionId}`)
  removeEntityFromZones(state, entity.id)
  entity.controllerId = actorId
  entity.zone = zone
  entity.exhausted = false
  state.game.players[actorId][zone === 'HAND' ? 'hand' : 'board'].push(entity.id)
  return entity.id
}

function createTutorialState(stepId: TutorialStepId): AuthoritativeSessionStateV1 {
  const state = confirmMulligans(createGameState({ seed: 7000 + TUTORIAL_STEPS.findIndex((step) => step.id === stepId), scenarioId: 'tutorial-v1', startingPlayerId: 'PLAYER' }))
  state.game.pendingDecision = null
  state.game.phase = 'PLAY'
  state.game.turn = 10
  state.game.activePlayerId = stepId === 'ELUSIVE' ? 'OPPONENT' : 'PLAYER'
  state.game.players.PLAYER.mana = { maximum: 10, current: 10, temporary: 0 }
  state.game.players.OPPONENT.mana = { maximum: 10, current: 10, temporary: 0 }

  switch (stepId) {
    case 'MANATHIRST':
      placeDefinition(state, 'PLAYER', 'RLK_843', 'HAND')
      break
    case 'POISONOUS':
      placeDefinition(state, 'PLAYER', 'DRG_066', 'BOARD')
      placeDefinition(state, 'OPPONENT', 'CS2_119', 'BOARD')
      break
    case 'ELUSIVE':
      placeDefinition(state, 'PLAYER', 'DRG_066', 'BOARD')
      placeDefinition(state, 'PLAYER', 'BOT_309', 'BOARD')
      placeDefinition(state, 'OPPONENT', 'BT_233', 'HAND')
      break
    case 'DISCOVER':
      placeDefinition(state, 'PLAYER', 'BAR_541', 'HAND')
      break
    case 'MAGNETIC':
      placeDefinition(state, 'PLAYER', 'BOT_309', 'BOARD')
      placeDefinition(state, 'PLAYER', 'BOT_563', 'HAND')
      break
  }
  return state
}

export function startTutorialStep(stepId: TutorialStepId): TutorialStepSession {
  return { stepId, state: createTutorialState(stepId), complete: false, acceptedActionCount: 0, lastBatch: null }
}

export function getTutorialActions(session: TutorialStepSession): TutorialAction[] {
  const reset: TutorialControlAction = { type: 'RESET_TUTORIAL_STEP', stepId: session.stepId }
  if (session.complete) return [reset]
  const actorId = session.state.game.pendingDecision?.kind === 'DISCOVER'
    ? session.state.game.pendingDecision.actorId
    : session.state.game.activePlayerId
  const legalActions = getLegalActions(session.state, actorId)
  const relevant = legalActions.filter((action) => isRelevantTutorialAction(session.stepId, session.state, action))
  return [reset, ...relevant.map((descriptor): TutorialEngineAction => ({ type: 'ENGINE_ACTION', descriptor }))]
}

function isRelevantTutorialAction(stepId: TutorialStepId, state: AuthoritativeSessionStateV1, action: LegalActionDescriptor): boolean {
  if (stepId === 'DISCOVER' && action.type === 'SELECT_DISCOVER') return true
  if (action.type === 'PLAY_CARD') {
    const definitionId = getEntity(state.game, action.cardInstanceId).definitionId
    if (stepId === 'MANATHIRST') return definitionId === 'RLK_843' && action.targetEntityId === state.game.players.OPPONENT.heroEntityId
    if (stepId === 'ELUSIVE') return definitionId === 'BT_233' && action.evidence?.excluded.some((entry) => entry.reason === 'ELUSIVE') === true
    if (stepId === 'DISCOVER') return definitionId === 'BAR_541' && action.targetEntityId === state.game.players.OPPONENT.heroEntityId
    if (stepId === 'MAGNETIC') return definitionId === 'BOT_563' && action.playMode === 'MAGNETIC'
  }
  if (stepId === 'POISONOUS' && action.type === 'ATTACK') {
    return getEntity(state.game, action.attackSourceId).definitionId === 'DRG_066'
      && getEntity(state.game, action.attackTargetId).definitionId === 'CS2_119'
  }
  return false
}

export function applyTutorialAction(session: TutorialStepSession, action: TutorialAction, commandId: string): TutorialStepSession {
  if (action.type === 'RESET_TUTORIAL_STEP') return startTutorialStep(action.stepId)
  const batch = resolveCommand(session.state, commandFromAction(action.descriptor, commandId))
  return {
    ...session,
    state: batch.finalState,
    complete: session.complete || batchCompletesStep(session.stepId, batch),
    acceptedActionCount: session.acceptedActionCount + 1,
    lastBatch: batch,
  }
}

function batchCompletesStep(stepId: TutorialStepId, batch: ProvisionalCommandBatchV1): boolean {
  if (stepId === 'ELUSIVE') return batch.legalityEvidence.some((evidence) => evidence.excluded.some((entry) => entry.reason === 'ELUSIVE'))
  return batch.events.some((recorded) => {
    if (recorded.event.scope !== 'GAME') return false
    const event = recorded.event.payload
    if (stepId === 'MANATHIRST') return event.type === 'MANATHIRST_BONUS_APPLIED'
    if (stepId === 'POISONOUS') return event.type === 'MINION_DEATH_BATCH' && event.deaths.some((death) => death.reason === 'POISONOUS')
    if (stepId === 'DISCOVER') return event.type === 'DISCOVER_RESOLVED'
    if (stepId === 'MAGNETIC') return event.type === 'MAGNETIC_MERGED'
    return false
  })
}
