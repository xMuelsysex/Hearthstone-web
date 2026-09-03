import { getCardDefinition } from '@/cards/registry'
import type { DomainEventV1, RecordedEventV1 } from '@/engine/events'
import { cloneSessionState, getEntity, otherPlayer, type AuthoritativeSessionStateV1, type EntityId, type GameEntityV1, type PlayerId } from '@/engine/state'
import { applyScenarioEvent } from '@/scenarios/reducer'

function removeId(values: EntityId[], id: EntityId): void {
  const index = values.indexOf(id)
  if (index >= 0) values.splice(index, 1)
}

function spendMana(state: AuthoritativeSessionStateV1, actorId: PlayerId, amount: number): void {
  const mana = state.game.players[actorId].mana
  const temporarySpent = Math.min(mana.temporary, amount)
  mana.temporary -= temporarySpent
  mana.current -= amount - temporarySpent
}

function moveEntity(state: AuthoritativeSessionStateV1, entity: GameEntityV1, zone: GameEntityV1['zone']): void {
  const player = state.game.players[entity.controllerId]
  removeId(player.deck, entity.id)
  removeId(player.hand, entity.id)
  removeId(player.board, entity.id)
  removeId(player.graveyard, entity.id)
  if (player.weaponEntityId === entity.id) player.weaponEntityId = null
  entity.zone = zone
  if (zone === 'DECK') player.deck.push(entity.id)
  if (zone === 'HAND') player.hand.push(entity.id)
  if (zone === 'BOARD') player.board.push(entity.id)
  if (zone === 'GRAVEYARD') player.graveyard.push(entity.id)
  if (zone === 'WEAPON') player.weaponEntityId = entity.id
}

function applyGameEvent(state: AuthoritativeSessionStateV1, event: DomainEventV1, legacyCardDataVersion: boolean): void {
  const { game } = state
  switch (event.type) {
    case 'COMMAND_ACCEPTED':
      game.nextBatchSequence += 1
      return
    case 'MULLIGAN_CONFIRMED': {
      const player = game.players[event.actorId]
      for (const id of event.replacedEntityIds) moveEntity(state, getEntity(game, id), 'DECK')
      for (const id of event.drawnEntityIds) moveEntity(state, getEntity(game, id), 'HAND')
      player.deck = [...event.deckOrder]
      for (const id of player.deck) getEntity(game, id).zone = 'DECK'
      player.mulliganConfirmed = true
      game.rng = event.rng
      if (game.pendingDecision?.kind === 'MULLIGAN') game.pendingDecision.waitingFor = game.pendingDecision.waitingFor.filter((id) => id !== event.actorId)
      return
    }
    case 'MULLIGAN_PHASE_COMPLETED':
      game.phase = 'PLAY'
      game.pendingDecision = null
      return
    case 'RNG_ADVANCED':
      game.rng = event.rng
      return
    case 'TURN_ENDED': {
      const player = game.players[event.actorId]
      player.mana.temporary = 0
      getEntity(game, player.heroEntityId).attack = 0
      return
    }
    case 'TURN_STARTED': {
      game.activePlayerId = event.actorId
      game.turn = event.turn
      const player = game.players[event.actorId]
      player.mana.maximum = Math.min(10, player.mana.maximum + 1)
      player.mana.current = player.mana.maximum
      player.mana.temporary = 0
      player.heroPowerUsed = false
      const hero = getEntity(game, player.heroEntityId)
      hero.exhausted = false
      if (legacyCardDataVersion) {
        for (const id of player.board) getEntity(game, id).exhausted = false
        return
      }
      hero.attacksRemaining = 1
      for (const id of player.board) {
        const entity = getEntity(game, id)
        entity.exhausted = false
        entity.attacksRemaining = entity.keywords.includes('WINDFURY') ? 2 : 1
        entity.summonedThisTurn = false
      }
      return
    }
    case 'CARD_DRAWN': {
      const entity = getEntity(game, event.entityId)
      const player = game.players[event.actorId]
      removeId(player.deck, entity.id)
      moveEntity(state, entity, event.burned ? 'GRAVEYARD' : 'HAND')
      return
    }
    case 'CARD_ADDED': {
      game.entities[String(event.entity.id)] = structuredClone(event.entity)
      game.nextEntityId = Math.max(game.nextEntityId, event.entity.id + 1)
      moveEntity(state, getEntity(game, event.entity.id), event.burned ? 'GRAVEYARD' : 'HAND')
      return
    }
    case 'FATIGUE_INCREASED':
      game.players[event.actorId].fatigue = event.amount
      return
    case 'CARD_PLAYED': {
      const entity = getEntity(game, event.entityId)
      spendMana(state, event.actorId, event.manaCost)
      moveEntity(state, entity, event.destination)
      if (event.destination === 'BOARD') {
        const board = game.players[event.actorId].board
        removeId(board, entity.id)
        board.splice(event.placementIndex ?? board.length, 0, entity.id)
        if (legacyCardDataVersion) {
          entity.exhausted = true
          delete entity.summonedThisTurn
          delete entity.attacksRemaining
        } else {
          const canAttackImmediately = entity.keywords.includes('CHARGE') || entity.keywords.includes('RUSH')
          entity.exhausted = !canAttackImmediately
          entity.summonedThisTurn = canAttackImmediately
          entity.attacksRemaining = canAttackImmediately ? (entity.keywords.includes('WINDFURY') ? 2 : 1) : 0
        }
      }
      return
    }
    case 'MANATHIRST_BONUS_APPLIED':
      return
    case 'ATTACK_DECLARED': {
      const source = getEntity(game, event.sourceEntityId)
      if (legacyCardDataVersion) {
        source.exhausted = true
        return
      }
      if (source.attacksRemaining === undefined) source.attacksRemaining = 1
      source.attacksRemaining = Math.max(0, source.attacksRemaining - 1)
      source.exhausted = source.attacksRemaining === 0
      return
    }
    case 'HERO_POWER_USED':
      spendMana(state, event.actorId, event.manaCost)
      game.players[event.actorId].heroPowerUsed = true
      return
    case 'HERO_POWER_REFRESHED':
      game.players[event.actorId].heroPowerUsed = false
      return
    case 'DAMAGE_BATCH_APPLIED':
      for (const packet of event.packets) {
        const target = getEntity(game, packet.targetEntityId)
        if (!legacyCardDataVersion && target.type === 'MINION' && target.keywords.includes('DIVINE_SHIELD')) {
          target.keywords = target.keywords.filter((keyword) => keyword !== 'DIVINE_SHIELD')
          continue
        }
        let remaining = packet.amount
        if (target.type === 'HERO' && target.armor > 0) {
          const absorbed = Math.min(target.armor, remaining)
          target.armor -= absorbed
          remaining -= absorbed
        }
        target.health -= remaining
        if (packet.poisonous && remaining > 0 && target.type === 'MINION') target.poisonousLethal = true
      }
      return
    case 'MINION_MARKED_DESTROYED':
      getEntity(game, event.entityId).destroyMarked = true
      return
    case 'MINION_DEATH_BATCH':
      for (const death of event.deaths) {
        const entity = getEntity(game, death.entityId)
        entity.poisonousLethal = false
        entity.destroyMarked = false
        moveEntity(state, entity, 'GRAVEYARD')
      }
      return
    case 'DEATHRATTLE_TRIGGERED':
      getEntity(game, event.entityId).deathrattleResolved = true
      return
    case 'MINION_SUMMONED': {
      game.entities[String(event.entity.id)] = structuredClone(event.entity)
      game.nextEntityId = Math.max(game.nextEntityId, event.entity.id + 1)
      if (event.fromDeck) removeId(game.players[event.actorId].deck, event.entity.id)
      const board = game.players[event.actorId].board
      board.splice(Math.min(event.placementIndex, board.length), 0, event.entity.id)
      return
    }
    case 'MINION_BUFFED': {
      const entity = getEntity(game, event.targetEntityId)
      entity.attack += event.attackGain
      entity.health += event.healthGain
      entity.maxHealth += event.healthGain
      return
    }
    case 'MINION_KEYWORD_GRANTED': {
      const entity = getEntity(game, event.targetEntityId)
      entity.keywords = [...new Set([...entity.keywords, event.keyword])]
      return
    }
    case 'ARMOR_GAINED':
      getEntity(game, game.players[event.actorId].heroEntityId).armor += event.amount
      return
    case 'CHARACTER_HEALED': {
      const entity = getEntity(game, event.targetEntityId)
      entity.health = Math.min(entity.maxHealth, entity.health + event.amount)
      return
    }
    case 'HERO_HEALTH_SET': {
      const hero = getEntity(game, game.players[event.actorId].heroEntityId)
      hero.health = Math.max(0, Math.min(hero.maxHealth, event.health))
      return
    }
    case 'TEMPORARY_HERO_ATTACK_GAINED':
      getEntity(game, game.players[event.actorId].heroEntityId).attack += event.amount
      return
    case 'TEMPORARY_MANA_GAINED':
      game.players[event.actorId].mana.temporary += event.amount
      return
    case 'WEAPON_EQUIPPED': {
      const player = game.players[event.actorId]
      if (event.replacedEntityId !== null) moveEntity(state, getEntity(game, event.replacedEntityId), 'GRAVEYARD')
      moveEntity(state, getEntity(game, event.entityId), 'WEAPON')
      player.weaponEntityId = event.entityId
      return
    }
    case 'WEAPON_CREATED_AND_EQUIPPED': {
      const player = game.players[event.actorId]
      game.entities[String(event.entity.id)] = structuredClone(event.entity)
      game.nextEntityId = Math.max(game.nextEntityId, event.entity.id + 1)
      if (event.replacedEntityId !== null) moveEntity(state, getEntity(game, event.replacedEntityId), 'GRAVEYARD')
      moveEntity(state, getEntity(game, event.entity.id), 'WEAPON')
      player.weaponEntityId = event.entity.id
      return
    }
    case 'WEAPON_DURABILITY_LOST': {
      const weapon = getEntity(game, event.entityId)
      weapon.durability -= event.amount
      if (event.destroyed) moveEntity(state, weapon, 'GRAVEYARD')
      return
    }
    case 'DISCOVER_OFFERED':
      game.pendingDecision = { kind: 'DISCOVER', decisionId: event.decisionId, actorId: event.actorId, sourceEntityId: event.sourceEntityId, choiceDefinitionIds: [...event.choiceDefinitionIds] }
      game.rng = event.rng
      return
    case 'DISCOVER_RESOLVED': {
      game.entities[String(event.entity.id)] = structuredClone(event.entity)
      game.nextEntityId = Math.max(game.nextEntityId, event.entity.id + 1)
      const player = game.players[event.actorId]
      if (event.burned) player.graveyard.push(event.entity.id)
      else player.hand.push(event.entity.id)
      game.pendingDecision = null
      return
    }
    case 'MAGNETIC_MERGED': {
      const source = getEntity(game, event.sourceEntityId)
      const target = getEntity(game, event.targetEntityId)
      source.zone = 'ATTACHED'
      source.controllerId = event.actorId
      target.attack += event.attackGain
      target.health += event.healthGain
      target.maxHealth += event.healthGain
      target.keywords = [...new Set([...target.keywords, ...event.inheritedKeywords])]
      target.attachedCardIds.push(source.id)
      return
    }
    case 'GAME_CONCEDED':
      return
    case 'GAME_ENDED':
      game.phase = 'GAME_OVER'
      game.winnerId = event.winnerId
      game.endReason = event.endReason
      game.pendingDecision = null
      return
  }
}

export function applyRecordedEvent(state: AuthoritativeSessionStateV1, event: RecordedEventV1, options: { legacyCardDataVersion?: boolean } = {}): AuthoritativeSessionStateV1 {
  const next = cloneSessionState(state)
  if (event.scope === 'GAME') applyGameEvent(next, event.payload, options.legacyCardDataVersion === true)
  else next.scenario = applyScenarioEvent(next.scenario, event.payload)
  next.game.nextEventSequence += 1
  return next
}

export function createEntityFromDefinition(
  id: EntityId,
  definitionId: string,
  ownerId: PlayerId,
  zone: GameEntityV1['zone'],
  exhausted = false,
  options: { legacyCardDataVersion?: boolean } = {},
): GameEntityV1 {
  const card = getCardDefinition(definitionId)
  const entity: GameEntityV1 = {
    id,
    definitionId,
    ownerId,
    controllerId: ownerId,
    zone,
    type: card.type,
    createdSequence: id,
    attack: card.attack,
    health: card.type === 'HERO' ? 30 : card.health,
    maxHealth: card.type === 'HERO' ? 30 : card.health,
    armor: 0,
    durability: card.durability,
    exhausted,
    poisonousLethal: false,
    destroyMarked: false,
    deathrattleResolved: false,
    keywords: [...card.keywords],
    races: [...card.races],
    attachedCardIds: [],
    summonedThisTurn: false,
    attacksRemaining: exhausted ? 0 : card.keywords.includes('WINDFURY') ? 2 : 1,
  }
  if (options.legacyCardDataVersion) {
    delete entity.summonedThisTurn
    delete entity.attacksRemaining
  }
  return entity
}

export function playerForEntity(state: AuthoritativeSessionStateV1, entityId: EntityId): PlayerId {
  return getEntity(state.game, entityId).controllerId
}

export function enemyHeroId(state: AuthoritativeSessionStateV1, actorId: PlayerId): EntityId {
  return state.game.players[otherPlayer(actorId)].heroEntityId
}
