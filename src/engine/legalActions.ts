import { getCardDefinition } from '@/cards/registry'
import type { TargetingMode } from '@/cards/types'
import type { LegalActionDescriptor, TargetLegalityEvidence } from '@/engine/commands'
import { projectedCombatDeaths } from '@/engine/combat'
import { getEntity, otherPlayer, type AuthoritativeSessionStateV1, type EntityId, type PlayerId } from '@/engine/state'

export type LegalActionDependencies = {
  legacyCardDataVersion?: boolean
}

function allCharacterIds(state: AuthoritativeSessionStateV1): EntityId[] {
  const { game } = state
  return [
    game.players.PLAYER.heroEntityId,
    ...game.players.PLAYER.board,
    game.players.OPPONENT.heroEntityId,
    ...game.players.OPPONENT.board,
  ]
}

function targetOptions(
  state: AuthoritativeSessionStateV1,
  actorId: PlayerId,
  mode: TargetingMode,
  actionKind: 'SPELL' | 'HERO_POWER' | 'BATTLECRY',
  dependencies: LegalActionDependencies,
): Array<{ targetEntityId?: EntityId; evidence?: TargetLegalityEvidence }> {
  if (mode === 'NONE') return [{}]
  const candidates = mode === 'ANY_CHARACTER'
    ? allCharacterIds(state)
    : mode === 'FRIENDLY_CHARACTER'
      ? [state.game.players[actorId].heroEntityId, ...state.game.players[actorId].board]
      : mode === 'ENEMY_CHARACTER'
      ? [state.game.players[otherPlayer(actorId)].heroEntityId, ...state.game.players[otherPlayer(actorId)].board]
      : mode === 'ANY_MINION'
      ? [...state.game.players.PLAYER.board, ...state.game.players.OPPONENT.board]
      : mode === 'ENEMY_DAMAGED_MINION'
        ? state.game.players[otherPlayer(actorId)].board.filter((id) => getEntity(state.game, id).health < getEntity(state.game, id).maxHealth)
        : mode === 'ENEMY_HERO'
          ? [state.game.players[otherPlayer(actorId)].heroEntityId]
          : mode === 'FRIENDLY_MINION'
            ? [...state.game.players[actorId].board]
            : mode === 'FRIENDLY_BEAST'
              ? state.game.players[actorId].board.filter((id) => getEntity(state.game, id).races.includes('BEAST'))
              : state.game.players[otherPlayer(actorId)].board.filter((id) => {
                const entity = getEntity(state.game, id)
                return entity.health >= entity.maxHealth
              })
  const excluded = candidates
    .filter((id) => (dependencies.legacyCardDataVersion
      ? getEntity(state.game, id).controllerId !== actorId
      : actionKind !== 'BATTLECRY') && getEntity(state.game, id).keywords.includes('ELUSIVE'))
    .map((entityId) => ({ entityId, reason: 'ELUSIVE' as const }))
  const legal = candidates.filter((id) => !excluded.some((entry) => entry.entityId === id))
  return legal.map((targetEntityId) => {
    if (excluded.length === 0) return { targetEntityId }
    return {
      targetEntityId,
      evidence: { actionKind, actorId, publicCandidateEntityIds: candidates, excluded, selectedTargetEntityId: targetEntityId },
    }
  })
}

export function getLegalActions(state: AuthoritativeSessionStateV1, actorId: PlayerId, dependencies: LegalActionDependencies = {}): LegalActionDescriptor[] {
  const { game } = state
  if (game.phase === 'GAME_OVER') return []
  const player = game.players[actorId]
  const actions: LegalActionDescriptor[] = [{ id: `${actorId}:concede`, type: 'CONCEDE', actorId }]

  if (game.pendingDecision?.kind === 'MULLIGAN') {
    if (game.pendingDecision.waitingFor.includes(actorId)) {
      actions.unshift({ id: `${actorId}:mulligan`, type: 'CONFIRM_MULLIGAN', actorId, selectableEntityIds: player.hand.filter((id) => getEntity(game, id).definitionId !== 'GAME_005') })
    }
    return actions
  }

  if (game.pendingDecision?.kind === 'DISCOVER') {
    if (game.pendingDecision.actorId === actorId) {
      const decision = game.pendingDecision
      const choices: LegalActionDescriptor[] = decision.choiceDefinitionIds.map((discoverChoiceId) => ({
        id: `${actorId}:discover:${discoverChoiceId}`,
        type: 'SELECT_DISCOVER',
        actorId,
        decisionId: decision.decisionId,
        discoverChoiceId,
      }))
      return [...choices, ...actions]
    }
    return actions
  }

  if (game.phase !== 'PLAY' || game.activePlayerId !== actorId) return actions
  actions.unshift({ id: `${actorId}:end-turn`, type: 'END_TURN', actorId })
  const availableMana = player.mana.current + player.mana.temporary

  for (const entityId of player.hand) {
    const entity = getEntity(game, entityId)
    const card = getCardDefinition(entity.definitionId)
    if ((entity.cost ?? card.cost) > availableMana) continue
    if (card.type === 'MINION') {
      if (player.board.length < 7) {
        for (let placementIndex = 0; placementIndex <= player.board.length; placementIndex += 1) {
          const targets = targetOptions(state, actorId, card.targeting, dependencies.legacyCardDataVersion ? 'SPELL' : 'BATTLECRY', dependencies)
          for (const option of targets) actions.push({ id: `${actorId}:play:${entityId}:normal:${placementIndex}:${option.targetEntityId ?? 'none'}`, type: 'PLAY_CARD', actorId, cardInstanceId: entityId, playMode: 'NORMAL', placementIndex, ...option })
        }
      }
      if (card.keywords.includes('MAGNETIC')) {
        for (const targetEntityId of player.board.filter((id) => getEntity(game, id).races.includes('MECHANICAL'))) {
          actions.push({ id: `${actorId}:play:${entityId}:magnetic:${targetEntityId}`, type: 'PLAY_CARD', actorId, cardInstanceId: entityId, playMode: 'MAGNETIC', targetEntityId })
        }
      }
      continue
    }
    const targets = targetOptions(state, actorId, card.targeting, 'SPELL', dependencies)
    for (const option of targets) actions.push({ id: `${actorId}:play:${entityId}:normal:${option.targetEntityId ?? 'none'}`, type: 'PLAY_CARD', actorId, cardInstanceId: entityId, playMode: 'NORMAL', ...option })
  }

  const enemy = game.players[otherPlayer(actorId)]
  const taunts = enemy.board.filter((id) => getEntity(game, id).keywords.includes('TAUNT'))
  const attackers = [...player.board.filter((id) => !getEntity(game, id).exhausted && getEntity(game, id).attack > 0)]
  const hero = getEntity(game, player.heroEntityId)
  const weaponAttack = player.weaponEntityId === null ? 0 : getEntity(game, player.weaponEntityId).attack
  if (!hero.exhausted && hero.attack + weaponAttack > 0) attackers.push(hero.id)
  for (const attackSourceId of attackers) {
    const source = getEntity(game, attackSourceId)
    const rushOnly = !dependencies.legacyCardDataVersion && source.summonedThisTurn === true && source.keywords.includes('RUSH')
    const attackTargets = taunts.length > 0
      ? taunts
      : rushOnly
        ? enemy.board
        : [enemy.heroEntityId, ...enemy.board]
    for (const attackTargetId of attackTargets) actions.push({
      id: `${actorId}:attack:${attackSourceId}:${attackTargetId}`,
      type: 'ATTACK',
      actorId,
      attackSourceId,
      attackTargetId,
      projectedDeathEntityIds: projectedCombatDeaths(state, attackSourceId, attackTargetId),
    })
  }

  const heroPowerEntity = getEntity(game, player.heroPowerEntityId)
  const heroPower = getCardDefinition(heroPowerEntity.definitionId)
  const heroPowerCost = heroPowerEntity.cost ?? heroPower.cost
  const heroPowerNeedsBoardSpace = heroPower.effect === 'SUMMON_TOKEN'
    || heroPower.effect === 'SUMMON_TOKENS'
    || heroPower.effect === 'SUMMON_RANDOM_BASIC_TOTEM'
  const heroPowerCanBeUsed = dependencies.legacyCardDataVersion
    ? availableMana >= 2
    : availableMana >= heroPowerCost && (!heroPowerNeedsBoardSpace || player.board.length < 7)
  if (!player.heroPowerUsed && heroPowerCanBeUsed) {
    for (const option of targetOptions(state, actorId, heroPower.targeting, 'HERO_POWER', dependencies)) {
      actions.push({ id: `${actorId}:hero-power:${option.targetEntityId ?? 'none'}`, type: 'USE_HERO_POWER', actorId, ...option })
    }
  }
  return actions
}
