import type { LegalActionDescriptor } from '@/engine/commands'
import { commandFromAction } from '@/engine/commands'
import { getLegalActions } from '@/engine/legalActions'
import { resolveCommand, type ProvisionalCommandBatchV1 } from '@/engine/resolveCommand'
import { createEntityFromDefinition } from '@/engine/applyRecordedEvent'
import { createGameState } from '@/engine/setup'
import { getEntity, type AuthoritativeSessionStateV1, type EntityId, type EntityZone, type PlayerId } from '@/engine/state'

export type TutorialStepId = 'MANATHIRST' | 'POISONOUS' | 'ELUSIVE' | 'DISCOVER' | 'MAGNETIC' | 'TAUNT' | 'DIVINE_SHIELD' | 'WINDFURY' | 'DEATHRATTLE' | 'RUSH' | 'CHARGE' | 'STEALTH' | 'LIFESTEAL' | 'REBORN' | 'IMMUNE' | 'FREEZE' | 'SILENCE' | 'SPELLPOWER' | 'OVERLOAD' | 'COMBO'

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
  { id: 'TAUNT', title: '嘲讽', instruction: '攻击敌方随从，观察嘲讽迫使攻击优先命中它。', maximumActions: 1 },
  { id: 'DIVINE_SHIELD', title: '圣盾', instruction: '攻击带有圣盾的随从，观察第一次伤害只会破盾。', maximumActions: 1 },
  { id: 'WINDFURY', title: '风怒', instruction: '召唤奥拉基尔并连续攻击两次，观察风怒攻击次数。', maximumActions: 3 },
  { id: 'DEATHRATTLE', title: '亡语', instruction: '让麦田傀儡死亡，观察亡语召唤损坏的傀儡。', maximumActions: 1 },
  { id: 'RUSH', title: '突袭', instruction: '打出突袭随从并攻击敌方随从，观察它不能攻击英雄。', maximumActions: 2 },
  { id: 'CHARGE', title: '冲锋', instruction: '打出冲锋随从并立即攻击敌方英雄。', maximumActions: 2 },
  { id: 'STEALTH', title: '潜行', instruction: '打出潜踪大师奥普，观察潜行随从不能成为指向性目标。', maximumActions: 1 },
  { id: 'LIFESTEAL', title: '吸血', instruction: '用饮血术造成伤害，观察你的英雄按实际伤害恢复生命。', maximumActions: 1 },
  { id: 'REBORN', title: '复生', instruction: '先让血法师获得复生，再用火球术消灭它，观察它以 1 点生命回场。', maximumActions: 3 },
  { id: 'IMMUNE', title: '免疫', instruction: '打出迷失者塞尔杜林，观察本回合免疫与攻击所有敌人。', maximumActions: 1 },
  { id: 'FREEZE', title: '冻结', instruction: '用寒冰箭冻结敌方随从，观察它暂时不能攻击。', maximumActions: 1 },
  { id: 'SILENCE', title: '沉默', instruction: '打出掩息海星，移除其他随从的关键词与附加状态。', maximumActions: 1 },
  { id: 'SPELLPOWER', title: '法术伤害', instruction: '让血法师在场，再施放寒冰箭，观察法术伤害加成。', maximumActions: 1 },
  { id: 'OVERLOAD', title: '过载', instruction: '使用雷霆绽放复原法力，并观察下回合的过载锁定。', maximumActions: 1 },
  { id: 'COMBO', title: '连击', instruction: '先打出幸运币，再使用暮光祭礼触发连击伤害。', maximumActions: 2 },
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
    ?? createTutorialEntity(state, actorId, definitionId)
  removeEntityFromZones(state, entity.id)
  entity.controllerId = actorId
  entity.zone = zone
  entity.exhausted = false
  state.game.players[actorId][zone === 'HAND' ? 'hand' : 'board'].push(entity.id)
  return entity.id
}

function createTutorialEntity(state: AuthoritativeSessionStateV1, actorId: PlayerId, definitionId: string) {
  const entity = createEntityFromDefinition(state.game.nextEntityId, definitionId, actorId, 'SET_ASIDE')
  state.game.nextEntityId += 1
  state.game.entities[String(entity.id)] = entity
  return entity
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
    case 'TAUNT':
      placeDefinition(state, 'PLAYER', 'DRG_066', 'BOARD')
      placeDefinition(state, 'OPPONENT', 'CORE_ICC_038', 'BOARD')
      placeDefinition(state, 'OPPONENT', 'CS2_119', 'BOARD')
      break
    case 'DIVINE_SHIELD':
      placeDefinition(state, 'PLAYER', 'DRG_066', 'BOARD')
      placeDefinition(state, 'OPPONENT', 'CORE_ICC_038', 'BOARD')
      break
    case 'WINDFURY':
      placeDefinition(state, 'PLAYER', 'CATA_153', 'HAND')
      placeDefinition(state, 'OPPONENT', 'CS2_119', 'BOARD')
      break
    case 'DEATHRATTLE':
      placeDefinition(state, 'PLAYER', 'EX1_556', 'BOARD')
      placeDefinition(state, 'OPPONENT', 'CS2_118', 'BOARD')
      break
    case 'RUSH':
      placeDefinition(state, 'PLAYER', 'DINO_136t', 'HAND')
      placeDefinition(state, 'OPPONENT', 'CS2_119', 'BOARD')
      break
    case 'CHARGE':
      placeDefinition(state, 'PLAYER', 'HERO_11bpt', 'HAND')
      break
    case 'STEALTH':
      placeDefinition(state, 'PLAYER', 'TLC_522', 'HAND')
      placeDefinition(state, 'OPPONENT', 'CS2_119', 'BOARD')
      break
    case 'LIFESTEAL':
      placeDefinition(state, 'PLAYER', 'JAIL_441', 'HAND')
      placeDefinition(state, 'OPPONENT', 'CS2_119', 'BOARD')
      state.game.players.PLAYER.mana.current = 8
      getEntity(state.game, state.game.players.PLAYER.heroEntityId).health = 20
      break
    case 'REBORN':
      placeDefinition(state, 'PLAYER', 'CAP_801', 'HAND')
      placeDefinition(state, 'PLAYER', 'CS2_029', 'HAND')
      placeDefinition(state, 'PLAYER', 'CORE_EX1_012', 'BOARD')
      break
    case 'IMMUNE':
      placeDefinition(state, 'PLAYER', 'WW_815', 'HAND')
      placeDefinition(state, 'OPPONENT', 'CS2_119', 'BOARD')
      break
    case 'FREEZE':
      placeDefinition(state, 'PLAYER', 'CORE_CS2_024', 'HAND')
      placeDefinition(state, 'OPPONENT', 'CS2_119', 'BOARD')
      break
    case 'SILENCE':
      placeDefinition(state, 'PLAYER', 'TSC_926', 'HAND')
      placeDefinition(state, 'PLAYER', 'CORE_EX1_012', 'BOARD')
      placeDefinition(state, 'OPPONENT', 'CS2_119', 'BOARD')
      break
    case 'SPELLPOWER':
      placeDefinition(state, 'PLAYER', 'CORE_EX1_012', 'BOARD')
      placeDefinition(state, 'PLAYER', 'CORE_CS2_024', 'HAND')
      placeDefinition(state, 'OPPONENT', 'CS2_119', 'BOARD')
      break
    case 'OVERLOAD':
      placeDefinition(state, 'PLAYER', 'SCH_427', 'HAND')
      break
    case 'COMBO':
      placeDefinition(state, 'PLAYER', 'GAME_005', 'HAND')
      placeDefinition(state, 'PLAYER', 'CATA_785', 'HAND')
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
    if (stepId === 'TAUNT') return definitionId === 'DRG_066' || definitionId === 'CORE_ICC_038'
    if (stepId === 'DIVINE_SHIELD') return definitionId === 'DRG_066'
    if (stepId === 'WINDFURY') return definitionId === 'CATA_153'
    if (stepId === 'DEATHRATTLE') return definitionId === 'EX1_556'
    if (stepId === 'RUSH') return definitionId === 'DINO_136t'
    if (stepId === 'CHARGE') return definitionId === 'HERO_11bpt'
    if (stepId === 'STEALTH') return definitionId === 'TLC_522' && action.playMode === 'NORMAL'
    if (stepId === 'LIFESTEAL') return definitionId === 'JAIL_441' && action.targetEntityId !== undefined && getEntity(state.game, action.targetEntityId).controllerId === 'OPPONENT'
    if (stepId === 'REBORN') {
      return (definitionId === 'CAP_801' && action.targetEntityId !== undefined && getEntity(state.game, action.targetEntityId).definitionId === 'CORE_EX1_012')
        || (definitionId === 'CS2_029' && action.targetEntityId !== undefined && getEntity(state.game, action.targetEntityId).definitionId === 'CORE_EX1_012')
    }
    if (stepId === 'IMMUNE') return definitionId === 'WW_815' && action.playMode === 'NORMAL'
    if (stepId === 'FREEZE') return definitionId === 'CORE_CS2_024' && action.targetEntityId !== undefined && getEntity(state.game, action.targetEntityId).controllerId === 'OPPONENT'
    if (stepId === 'SILENCE') return definitionId === 'TSC_926' && action.playMode === 'NORMAL'
    if (stepId === 'SPELLPOWER') return definitionId === 'CORE_CS2_024' && action.targetEntityId !== undefined && getEntity(state.game, action.targetEntityId).controllerId === 'OPPONENT'
    if (stepId === 'OVERLOAD') return definitionId === 'SCH_427' && action.playMode === 'NORMAL'
    if (stepId === 'COMBO') return definitionId === 'GAME_005' || definitionId === 'CATA_785'
  }
  if (action.type === 'ATTACK') {
    const source = getEntity(state.game, action.attackSourceId)
    const target = getEntity(state.game, action.attackTargetId)
    if (stepId === 'POISONOUS') return source.definitionId === 'DRG_066' && target.definitionId === 'CS2_119'
    if (stepId === 'TAUNT' || stepId === 'DIVINE_SHIELD') return source.definitionId === 'DRG_066' && target.definitionId === 'CORE_ICC_038'
    if (stepId === 'WINDFURY') return source.definitionId === 'CATA_153' && target.definitionId === 'CS2_119'
    if (stepId === 'DEATHRATTLE') return source.definitionId === 'EX1_556' && target.definitionId === 'CS2_118'
    if (stepId === 'RUSH') return source.definitionId === 'DINO_136t' && target.definitionId === 'CS2_119'
    if (stepId === 'CHARGE') return source.definitionId === 'HERO_11bpt' && target.id === state.game.players.OPPONENT.heroEntityId
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
    if (stepId === 'TAUNT') return event.type === 'ATTACK_DECLARED' && getEntity(recorded.postState.game, event.targetEntityId).definitionId === 'CORE_ICC_038'
    if (stepId === 'DIVINE_SHIELD') return event.type === 'DAMAGE_BATCH_APPLIED' && event.packets.some((packet) => {
      if (getEntity(recorded.postState.game, packet.targetEntityId).definitionId !== 'CORE_ICC_038') return false
      return !getEntity(recorded.postState.game, packet.targetEntityId).keywords.includes('DIVINE_SHIELD')
    })
    if (stepId === 'WINDFURY') return event.type === 'ATTACK_DECLARED'
      && getEntity(recorded.postState.game, event.sourceEntityId).definitionId === 'CATA_153'
      && getEntity(recorded.postState.game, event.sourceEntityId).attacksRemaining === 0
    if (stepId === 'DEATHRATTLE') return event.type === 'DEATHRATTLE_TRIGGERED'
      && getEntity(recorded.postState.game, event.entityId).definitionId === 'EX1_556'
    if (stepId === 'RUSH') return event.type === 'ATTACK_DECLARED'
      && getEntity(recorded.postState.game, event.sourceEntityId).definitionId === 'DINO_136t'
    if (stepId === 'CHARGE') return event.type === 'ATTACK_DECLARED'
      && getEntity(recorded.postState.game, event.sourceEntityId).definitionId === 'HERO_11bpt'
      && event.targetEntityId === batch.finalState.game.players.OPPONENT.heroEntityId
    if (stepId === 'STEALTH') return event.type === 'CARD_PLAYED' && getEntity(recorded.postState.game, event.entityId).definitionId === 'TLC_522'
    if (stepId === 'LIFESTEAL') return event.type === 'DAMAGE_BATCH_APPLIED' && event.packets.some((packet) => packet.lifesteal === true)
    if (stepId === 'REBORN') return event.type === 'MINION_SUMMONED' && event.reborn === true
    if (stepId === 'IMMUNE') return event.type === 'CHARACTER_IMMUNITY_GRANTED'
    if (stepId === 'FREEZE') return event.type === 'CHARACTER_FROZEN'
    if (stepId === 'SILENCE') return event.type === 'MINION_SILENCED'
    if (stepId === 'SPELLPOWER') return event.type === 'DAMAGE_BATCH_APPLIED' && event.packets.some((packet) => {
      if (packet.sourceEntityId === null) return false
      return getEntity(recorded.postState.game, packet.sourceEntityId).definitionId === 'CORE_CS2_024' && packet.amount >= 4
    })
    if (stepId === 'OVERLOAD') return event.type === 'OVERLOAD_APPLIED'
    if (stepId === 'COMBO') return event.type === 'DAMAGE_BATCH_APPLIED' && event.packets.some((packet) => {
      if (packet.sourceEntityId === null) return false
      return getEntity(recorded.postState.game, packet.sourceEntityId).definitionId === 'CATA_785'
    })
    return false
  })
}
