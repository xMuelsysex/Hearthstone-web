import { CARD_DEFINITIONS_V1, getCardDefinition } from '@/cards/registry'
import type { EffectExecutorId, Keyword } from '@/cards/types'
import { createEntityFromDefinition } from '@/engine/applyRecordedEvent'
import { applyRecordedEvent, enemyHeroId } from '@/engine/applyRecordedEvent'
import { combatAttackValue } from '@/engine/combat'
import { validateCommand, type GameCommand, type TargetLegalityEvidence } from '@/engine/commands'
import type { DamagePacketV1, DomainEventV1, RecordedEventV1 } from '@/engine/events'
import { nextRandom, shuffleWithRng } from '@/engine/rng'
import { getEntity, otherPlayer, type AuthoritativeSessionStateV1, type EntityId, type PlayerId } from '@/engine/state'
import { deriveScenarioEvents } from '@/scenarios/deriveEvents'

export type ProvisionalRecordedEventV1 = {
  sequence: number
  event: RecordedEventV1
  postState: AuthoritativeSessionStateV1
}

export type ProvisionalCommandBatchV1 = {
  sequence: number
  baseState: AuthoritativeSessionStateV1
  command: GameCommand
  legalityEvidence: TargetLegalityEvidence[]
  events: ProvisionalRecordedEventV1[]
  finalState: AuthoritativeSessionStateV1
}

type WorkItem =
  | { type: 'EXECUTE_EFFECT'; actorId: PlayerId; sourceEntityId: EntityId; effect: EffectExecutorId; targetEntityId?: EntityId; manathirstActive?: boolean; comboActive?: boolean }
  | { type: 'DAMAGE'; packets: DamagePacketV1[] }
  | { type: 'SWEEP_DEATHS' }
  | { type: 'DRAW'; actorId: PlayerId; count: number }
  | { type: 'HEAL'; targetEntityId: EntityId; amount: number }
  | { type: 'ADD_CARD'; actorId: PlayerId; definitionId: string }
  | { type: 'ADD_CARD_IF_DEAD'; actorId: PlayerId; definitionId: string; targetEntityId: EntityId }
  | { type: 'REFRESH_HERO_POWER'; actorId: PlayerId }
  | { type: 'SUMMON'; actorId: PlayerId; definitionId: string; placementIndex?: number; ready?: boolean }
  | { type: 'OFFER_DISCOVER'; actorId: PlayerId; sourceEntityId: EntityId; kind?: 'SPELL' | 'CARD' }
  | { type: 'CHECK_TERMINAL' }

export type ResolveDependencies = {
  discoverPool?: readonly string[]
  legacyCardDataVersion?: boolean
}

export function resolveCommand(
  committedState: AuthoritativeSessionStateV1,
  command: GameCommand,
  dependencies: ResolveDependencies = {},
): ProvisionalCommandBatchV1 {
  const validation = validateCommand(committedState, command, dependencies)
  if (!validation.ok) throw new Error(validation.code)
  const legalityEvidence = validation.evidence
  const baseState = structuredClone(committedState)
  let workingState = committedState
  const events: ProvisionalRecordedEventV1[] = []
  const queue: WorkItem[] = []
  const batchSequence = committedState.game.nextBatchSequence
  const entityOptions = dependencies.legacyCardDataVersion ? { legacyCardDataVersion: true } : {}
  const eventOptions = dependencies.legacyCardDataVersion ? { legacyCardDataVersion: true } : {}

  function emitRecorded(event: RecordedEventV1, derive = true): void {
    const sequence = workingState.game.nextEventSequence
    workingState = applyRecordedEvent(workingState, event, eventOptions)
    events.push({ sequence, event, postState: workingState })
    if (!derive) return
    const scenarioEvents = deriveScenarioEvents(workingState, event, sequence, event.scope === 'GAME' && event.payload.type === 'COMMAND_ACCEPTED' ? legalityEvidence : [])
    for (const scenarioEvent of scenarioEvents) emitRecorded({ scope: 'SCENARIO', payload: scenarioEvent }, false)
  }

  function emitGame(payload: DomainEventV1): void {
    emitRecorded({ scope: 'GAME', payload })
  }

  emitGame({ type: 'COMMAND_ACCEPTED', commandId: command.commandId, actorId: command.actorId, commandType: command.type })
  enqueueCommand(command)
  queue.push({ type: 'CHECK_TERMINAL' })

  while (queue.length > 0 && workingState.game.phase !== 'GAME_OVER') {
    const item = queue.shift()
    if (!item) break
    resolveWorkItem(item)
  }

  if (events.length === 0) throw new Error('EMPTY_ACCEPTED_COMMAND')
  return { sequence: batchSequence, baseState, command, legalityEvidence, events, finalState: workingState }

  function enqueueCommand(accepted: GameCommand): void {
    switch (accepted.type) {
      case 'CONFIRM_MULLIGAN': {
        const player = workingState.game.players[accepted.actorId]
        const count = accepted.mulliganCardInstanceIds.length
        const drawnEntityIds = player.deck.slice(0, count)
        const remaining = player.deck.slice(count)
        const shuffled = shuffleWithRng([...remaining, ...accepted.mulliganCardInstanceIds], workingState.game.rng)
        emitGame({ type: 'MULLIGAN_CONFIRMED', actorId: accepted.actorId, replacedEntityIds: [...accepted.mulliganCardInstanceIds], drawnEntityIds, deckOrder: shuffled.items, rng: shuffled.rng })
        if (workingState.game.pendingDecision?.kind === 'MULLIGAN' && workingState.game.pendingDecision.waitingFor.length === 0) {
          emitGame({ type: 'MULLIGAN_PHASE_COMPLETED' })
          emitGame({ type: 'TURN_STARTED', actorId: workingState.game.startingPlayerId, turn: 1 })
          queue.push({ type: 'DRAW', actorId: workingState.game.startingPlayerId, count: 1 })
        }
        return
      }
      case 'PLAY_CARD': {
        const entity = getEntity(workingState.game, accepted.cardInstanceId)
        const card = getCardDefinition(entity.definitionId)
        const manaCost = entity.cost ?? card.cost
        const availableMana = workingState.game.players[accepted.actorId].mana.current + workingState.game.players[accepted.actorId].mana.temporary
        const player = workingState.game.players[accepted.actorId]
        const manathirstActive = card.manathirstThreshold > 0 && availableMana >= card.manathirstThreshold
        const comboActive = !dependencies.legacyCardDataVersion && (player.cardsPlayedThisTurn ?? 0) > 0
        const destination = accepted.playMode === 'MAGNETIC' || card.type === 'WEAPON' ? 'SET_ASIDE' : card.type === 'MINION' || card.type === 'LOCATION' ? 'BOARD' : 'GRAVEYARD'
        const cardPlayedEvent: Extract<DomainEventV1, { type: 'CARD_PLAYED' }> = { type: 'CARD_PLAYED', actorId: accepted.actorId, entityId: entity.id, manaCost, destination, placementIndex: accepted.placementIndex ?? null }
        if (!dependencies.legacyCardDataVersion) cardPlayedEvent.comboActive = comboActive
        emitGame(cardPlayedEvent)
        if (manathirstActive) emitGame({ type: 'MANATHIRST_BONUS_APPLIED', sourceEntityId: entity.id, threshold: card.manathirstThreshold, value: card.secondaryValue })
        if (accepted.playMode === 'MAGNETIC') {
          const target = getEntity(workingState.game, accepted.targetEntityId as EntityId)
          const inheritedKeywords = entity.keywords.filter((keyword) => keyword !== 'MAGNETIC')
          emitGame({ type: 'MAGNETIC_MERGED', actorId: accepted.actorId, sourceEntityId: entity.id, targetEntityId: target.id, attackGain: entity.attack, healthGain: entity.maxHealth, inheritedKeywords })
          return
        }
        if (card.type === 'LOCATION') return
        if (!card.effect.startsWith('DEATHRATTLE_') && card.effect !== 'NONE') {
          queue.push(createEffectItem(accepted.actorId, entity.id, card.effect, accepted.targetEntityId, manathirstActive, comboActive))
        }
        if (card.battlecryEffect !== null) {
          queue.push(createEffectItem(accepted.actorId, entity.id, card.battlecryEffect, accepted.targetEntityId, false, comboActive))
        }
        if (comboActive && card.comboEffect !== null) {
          queue.push(createEffectItem(accepted.actorId, entity.id, card.comboEffect, accepted.targetEntityId, false, true))
        }
        return
      }
      case 'ACTIVATE_LOCATION': {
        const location = getEntity(workingState.game, accepted.locationEntityId)
        const destroyed = location.durability <= 1
        emitGame({ type: 'LOCATION_ACTIVATED', actorId: accepted.actorId, entityId: location.id, durabilityCost: 1, destroyed })
        return
      }
      case 'SELECT_DISCOVER': {
        const player = workingState.game.players[accepted.actorId]
        const entity = createEntityFromDefinition(
          workingState.game.nextEntityId,
          accepted.discoverChoiceId,
          accepted.actorId,
          player.hand.length >= 10 ? 'GRAVEYARD' : 'HAND',
          false,
          entityOptions,
        )
        emitGame({ type: 'DISCOVER_RESOLVED', actorId: accepted.actorId, decisionId: accepted.decisionId, choiceDefinitionId: accepted.discoverChoiceId, entity, burned: player.hand.length >= 10 })
        return
      }
      case 'ATTACK': {
        const source = getEntity(workingState.game, accepted.attackSourceId)
        const target = getEntity(workingState.game, accepted.attackTargetId)
        emitGame({ type: 'ATTACK_DECLARED', actorId: accepted.actorId, sourceEntityId: source.id, targetEntityId: target.id })
        const sourceWeapon = source.type === 'HERO' ? workingState.game.players[accepted.actorId].weaponEntityId : null
        const sourceAttack = combatAttackValue(workingState.game, source.id)
        const targetAttack = combatAttackValue(workingState.game, target.id)
        const packets: DamagePacketV1[] = [{ sourceEntityId: source.id, targetEntityId: target.id, amount: sourceAttack, poisonous: source.keywords.includes('POISONOUS'), reason: 'COMBAT' }]
        if (targetAttack > 0) packets.push({ sourceEntityId: target.id, targetEntityId: source.id, amount: targetAttack, poisonous: target.keywords.includes('POISONOUS'), reason: 'COMBAT' })
        queue.push({ type: 'DAMAGE', packets })
        if (sourceWeapon !== null) {
          const weapon = getEntity(workingState.game, sourceWeapon)
          const destroyed = weapon.durability <= 1
          emitGame({ type: 'WEAPON_DURABILITY_LOST', actorId: accepted.actorId, entityId: weapon.id, amount: 1, destroyed })
        }
        return
      }
      case 'USE_HERO_POWER': {
        const player = workingState.game.players[accepted.actorId]
        const heroPower = getEntity(workingState.game, player.heroPowerEntityId)
        const heroPowerDefinition = getCardDefinition(heroPower.definitionId)
        const manaCost = heroPower.cost ?? heroPowerDefinition.cost
        emitGame({ type: 'HERO_POWER_USED', actorId: accepted.actorId, heroPowerEntityId: heroPower.id, manaCost })
        queue.push(createEffectItem(accepted.actorId, heroPower.id, heroPowerDefinition.effect, accepted.targetEntityId))
        return
      }
      case 'END_TURN': {
        const temporaryGhouls = workingState.game.players[accepted.actorId].board.filter((id) => getEntity(workingState.game, id).definitionId === 'HERO_11bpt')
        for (const entityId of temporaryGhouls) emitGame({ type: 'MINION_MARKED_DESTROYED', entityId })
        if (temporaryGhouls.length > 0) queue.unshift({ type: 'SWEEP_DEATHS' })
        emitGame({ type: 'TURN_ENDED', actorId: accepted.actorId })
        const nextActor = otherPlayer(accepted.actorId)
        emitGame({ type: 'TURN_STARTED', actorId: nextActor, turn: workingState.game.turn + 1 })
        queue.push({ type: 'DRAW', actorId: nextActor, count: 1 })
        return
      }
      case 'CONCEDE':
        emitGame({ type: 'GAME_CONCEDED', actorId: accepted.actorId })
        if (accepted.actorId === 'OPPONENT' && workingState.scenario.stage === 'READY_FOR_AI_CONCEDE') {
          emitRecorded({ scope: 'SCENARIO', payload: { type: 'AI_CONCEDE_REQUESTED' } }, false)
        }
        emitGame({ type: 'GAME_ENDED', winnerId: otherPlayer(accepted.actorId), endReason: 'CONCEDE' })
        queue.length = 0
        return
    }
  }

  function resolveWorkItem(item: WorkItem): void {
    switch (item.type) {
      case 'EXECUTE_EFFECT':
        executeEffect(item)
        return
      case 'DAMAGE': {
        const packets = item.packets.map(enrichDamagePacket)
        if (packets.length > 0) emitGame({ type: 'DAMAGE_BATCH_APPLIED', packets: stablePackets(packets) })
        queue.unshift({ type: 'SWEEP_DEATHS' })
        return
      }
      case 'SWEEP_DEATHS':
        sweepDeaths()
        return
      case 'DRAW':
        for (let count = 0; count < item.count; count += 1) drawCard(item.actorId)
        return
      case 'HEAL':
        emitGame({ type: 'CHARACTER_HEALED', targetEntityId: item.targetEntityId, amount: item.amount })
        return
      case 'ADD_CARD':
        addCard(item.actorId, item.definitionId)
        return
      case 'ADD_CARD_IF_DEAD':
        if (getEntity(workingState.game, item.targetEntityId).zone === 'GRAVEYARD') addCard(item.actorId, item.definitionId)
        return
      case 'REFRESH_HERO_POWER':
        emitGame({ type: 'HERO_POWER_REFRESHED', actorId: item.actorId })
        return
      case 'SUMMON':
        summon(item.actorId, item.definitionId, item.placementIndex, item.ready)
        return
      case 'OFFER_DISCOVER':
        if (!heroesAreAlive()) return
        offerDiscover(item.actorId, item.sourceEntityId, item.kind)
        return
      case 'CHECK_TERMINAL':
        if (queue.length > 0) {
          queue.push(item)
          return
        }
        checkTerminal()
        return
    }
  }

  function executeEffect(item: Extract<WorkItem, { type: 'EXECUTE_EFFECT' }>): void {
    const card = getCardDefinition(getEntity(workingState.game, item.sourceEntityId).definitionId)
    const value = item.manathirstActive && card.secondaryValue > 0 ? card.secondaryValue : card.effectValue
    const targetEntityId = item.targetEntityId
    switch (item.effect) {
      case 'NONE':
        return
      case 'DIRECT_DAMAGE':
      case 'BATTLECRY_DAMAGE':
      case 'HERO_POWER_DAMAGE':
        queue.unshift({ type: 'DAMAGE', packets: [{ sourceEntityId: item.sourceEntityId, targetEntityId: targetEntityId as EntityId, amount: value, poisonous: false, reason: item.effect === 'HERO_POWER_DAMAGE' ? 'HERO_POWER' : item.effect === 'BATTLECRY_DAMAGE' ? 'BATTLECRY' : 'SPELL' }] })
        return
      case 'DAMAGE_AND_FREEZE':
        queue.unshift(
          { type: 'DAMAGE', packets: [{ sourceEntityId: item.sourceEntityId, targetEntityId: targetEntityId as EntityId, amount: value, poisonous: false, reason: 'SPELL' }] },
          createEffectItem(item.actorId, item.sourceEntityId, 'FREEZE_CHARACTER', targetEntityId),
        )
        return
      case 'FREEZE_CHARACTER':
        emitGame({ type: 'CHARACTER_FROZEN', targetEntityId: targetEntityId as EntityId })
        return
      case 'DRAW':
        queue.unshift({ type: 'DRAW', actorId: item.actorId, count: value })
        return
      case 'DAMAGE_AND_DISCOVER_SPELL':
        queue.unshift(
          { type: 'DAMAGE', packets: [{ sourceEntityId: item.sourceEntityId, targetEntityId: targetEntityId as EntityId, amount: value, poisonous: false, reason: 'SPELL' }] },
          { type: 'OFFER_DISCOVER', actorId: item.actorId, sourceEntityId: item.sourceEntityId, kind: 'SPELL' },
        )
        return
      case 'DISCOVER_CARD':
        queue.unshift({ type: 'OFFER_DISCOVER', actorId: item.actorId, sourceEntityId: item.sourceEntityId, kind: 'CARD' })
        return
      case 'SILENCE_MINION':
        emitGame({ type: 'MINION_SILENCED', targetEntityId: targetEntityId as EntityId })
        return
      case 'SILENCE_OTHER_MINIONS':
        for (const playerId of ['PLAYER', 'OPPONENT'] as const) {
          for (const entityId of workingState.game.players[playerId].board) {
            const entity = getEntity(workingState.game, entityId)
            if (entityId !== item.sourceEntityId && entity.type === 'MINION') emitGame({ type: 'MINION_SILENCED', targetEntityId: entityId })
          }
        }
        return
      case 'BUFF_AND_GRANT_REBORN_TAUNT':
        emitGame({ type: 'MINION_BUFFED', targetEntityId: targetEntityId as EntityId, attackGain: value, healthGain: card.secondaryValue })
        emitGame({ type: 'MINION_KEYWORD_GRANTED', targetEntityId: targetEntityId as EntityId, keyword: 'REBORN' })
        emitGame({ type: 'MINION_KEYWORD_GRANTED', targetEntityId: targetEntityId as EntityId, keyword: 'TAUNT' })
        return
      case 'GRANT_IMMUNITY_AND_ATTACK_ALL': {
        emitGame({ type: 'CHARACTER_IMMUNITY_GRANTED', targetEntityId: item.sourceEntityId })
        const enemy = otherPlayer(item.actorId)
        const targets = [workingState.game.players[enemy].heroEntityId, ...workingState.game.players[enemy].board]
        const attack = combatAttackValue(workingState.game, item.sourceEntityId)
        queue.unshift({ type: 'DAMAGE', packets: targets.map((targetId) => ({ sourceEntityId: item.sourceEntityId, targetEntityId: targetId, amount: attack, poisonous: false, reason: 'BATTLECRY' as const })) })
        return
      }
      case 'MANA_RESTORE_AND_OVERLOAD':
        emitGame({ type: 'MANA_RESTORED', actorId: item.actorId, amount: value })
        emitGame({ type: 'OVERLOAD_APPLIED', actorId: item.actorId, amount: card.secondaryValue })
        return
      case 'COMBO_DAMAGE':
        if (!item.comboActive) return
        queue.unshift({ type: 'DAMAGE', packets: [{ sourceEntityId: item.sourceEntityId, targetEntityId: enemyHeroId(workingState, item.actorId), amount: value, poisonous: false, reason: 'SPELL' }] })
        return
      case 'FAN_OF_KNIVES': {
        const enemy = otherPlayer(item.actorId)
        const targets = workingState.game.players[enemy].board
        queue.unshift(
          { type: 'DAMAGE', packets: targets.map((targetId) => ({ sourceEntityId: item.sourceEntityId, targetEntityId: targetId, amount: 1, poisonous: false, reason: 'BATTLECRY' as const })) },
          { type: 'DRAW', actorId: item.actorId, count: 1 },
        )
        return
      }
      case 'DEATHRATTLE_DRAW':
        queue.unshift({ type: 'DRAW', actorId: item.actorId, count: value || 1 })
        return
      case 'SUMMON_TOKEN':
      case 'DEATHRATTLE_SUMMON_TOKEN':
        if (card.tokenCardId) queue.unshift({ type: 'SUMMON', actorId: item.actorId, definitionId: card.tokenCardId })
        return
      case 'SUMMON_TOKENS':
        if (card.tokenCardId) {
          for (let count = 0; count < value; count += 1) queue.unshift({ type: 'SUMMON', actorId: item.actorId, definitionId: card.tokenCardId })
        }
        return
      case 'DAMAGE_AND_SUMMON_TOKEN':
        if (card.tokenCardId) queue.unshift({ type: 'DAMAGE', packets: [{ sourceEntityId: item.sourceEntityId, targetEntityId: targetEntityId as EntityId, amount: value, poisonous: false, reason: 'SPELL' }] }, { type: 'SUMMON', actorId: item.actorId, definitionId: card.tokenCardId })
        return
      case 'DAMAGE_AND_ADD_CARD_IF_DEAD':
        if (card.tokenCardId) queue.unshift(
          { type: 'DAMAGE', packets: [{ sourceEntityId: item.sourceEntityId, targetEntityId: targetEntityId as EntityId, amount: value, poisonous: false, reason: 'SPELL' }] },
          { type: 'ADD_CARD_IF_DEAD', actorId: item.actorId, definitionId: card.tokenCardId, targetEntityId: targetEntityId as EntityId },
        )
        return
      case 'DAMAGE_AND_SPLASH': {
        const enemy = otherPlayer(item.actorId)
        const enemyIds = [workingState.game.players[enemy].heroEntityId, ...workingState.game.players[enemy].board]
        const packets = enemyIds.map((targetId) => ({
          sourceEntityId: item.sourceEntityId,
          targetEntityId: targetId,
          amount: targetId === targetEntityId ? value : card.secondaryValue,
          poisonous: false,
          reason: targetId === targetEntityId ? 'SPELL' as const : 'AREA' as const,
        }))
        queue.unshift({ type: 'DAMAGE', packets })
        return
      }
      case 'DAMAGE_ALL_ENEMY_MINIONS_AND_HEAL_HERO': {
        const targets = workingState.game.players[otherPlayer(item.actorId)].board
        const healAmount = targets.reduce((total, id) => {
          const target = getEntity(workingState.game, id)
          return total + (target.keywords.includes('DIVINE_SHIELD') ? 0 : Math.min(value, Math.max(0, target.health)))
        }, 0)
        queue.unshift(
          { type: 'DAMAGE', packets: targets.map((targetEntityId) => ({ sourceEntityId: item.sourceEntityId, targetEntityId, amount: value, poisonous: false, reason: 'AREA' as const })) },
          { type: 'HEAL', targetEntityId: workingState.game.players[item.actorId].heroEntityId, amount: healAmount },
        )
        return
      }
      case 'DAMAGE_SPLIT_ENEMY_MINIONS_AND_HEAL_HERO': {
        const targets = workingState.game.players[otherPlayer(item.actorId)].board
        if (targets.length === 0) return
        const packets: DamagePacketV1[] = []
        for (let point = 0; point < value; point += 1) {
          const random = nextRandom(workingState.game.rng)
          emitGame({ type: 'RNG_ADVANCED', rng: random.rng })
          const targetEntityId = targets[Math.min(targets.length - 1, Math.floor(random.value * targets.length))] as EntityId
          packets.push({ sourceEntityId: item.sourceEntityId, targetEntityId, amount: 1, poisonous: false, reason: 'AREA' })
        }
        queue.unshift({ type: 'DAMAGE', packets })
        return
      }
      case 'DAMAGE_ENEMY_HERO_AND_ARMOR':
        emitGame({ type: 'ARMOR_GAINED', actorId: item.actorId, amount: card.secondaryValue })
        queue.unshift({ type: 'DAMAGE', packets: [{ sourceEntityId: item.sourceEntityId, targetEntityId: enemyHeroId(workingState, item.actorId), amount: value, poisonous: false, reason: 'BATTLECRY' }] })
        return
      case 'DAMAGE_AND_DRAW':
        queue.unshift(
          { type: 'DAMAGE', packets: [{ sourceEntityId: item.sourceEntityId, targetEntityId: targetEntityId as EntityId, amount: value, poisonous: false, reason: 'SPELL' }] },
          { type: 'DRAW', actorId: item.actorId, count: card.secondaryValue },
        )
        return
      case 'DAMAGE_AND_HEAL_HERO':
        queue.unshift(
          { type: 'DAMAGE', packets: [{ sourceEntityId: item.sourceEntityId, targetEntityId: targetEntityId as EntityId, amount: value, poisonous: false, reason: 'SPELL' }] },
          { type: 'HEAL', targetEntityId: workingState.game.players[item.actorId].heroEntityId, amount: value },
        )
        return
      case 'DAMAGE_AND_HEAL_HERO_AND_RESET_POWER':
        queue.unshift(
          { type: 'DAMAGE', packets: [{ sourceEntityId: item.sourceEntityId, targetEntityId: targetEntityId as EntityId, amount: value, poisonous: false, lifesteal: true, reason: 'SPELL' }] },
          { type: 'REFRESH_HERO_POWER', actorId: item.actorId },
        )
        return
      case 'DAMAGE_AND_ARMOR':
        emitGame({ type: 'ARMOR_GAINED', actorId: item.actorId, amount: card.secondaryValue })
        queue.unshift({ type: 'DAMAGE', packets: [{ sourceEntityId: item.sourceEntityId, targetEntityId: targetEntityId as EntityId, amount: value, poisonous: false, reason: 'SPELL' }] })
        return
      case 'ARMOR_AND_DRAW':
        emitGame({ type: 'ARMOR_GAINED', actorId: item.actorId, amount: value })
        queue.unshift({ type: 'DRAW', actorId: item.actorId, count: card.secondaryValue })
        return
      case 'EQUIP_WEAPON': {
        const player = workingState.game.players[item.actorId]
        emitGame({ type: 'WEAPON_EQUIPPED', actorId: item.actorId, entityId: item.sourceEntityId, replacedEntityId: player.weaponEntityId })
        return
      }
      case 'DAMAGE_ALL_MINIONS':
      case 'DAMAGE_ALL_OTHER_MINIONS': {
        const ids = [...workingState.game.players.PLAYER.board, ...workingState.game.players.OPPONENT.board]
          .filter((id) => item.effect !== 'DAMAGE_ALL_OTHER_MINIONS' || id !== item.sourceEntityId)
        queue.unshift({ type: 'DAMAGE', packets: ids.map((targetId) => ({ sourceEntityId: item.sourceEntityId, targetEntityId: targetId, amount: value, poisonous: false, reason: 'AREA' })) })
        return
      }
      case 'TEMPORARY_HERO_ATTACK':
        emitGame({ type: 'TEMPORARY_HERO_ATTACK_GAINED', actorId: item.actorId, amount: value })
        return
      case 'TEMPORARY_HERO_ATTACK_AND_ARMOR':
        emitGame({ type: 'TEMPORARY_HERO_ATTACK_GAINED', actorId: item.actorId, amount: value })
        emitGame({ type: 'ARMOR_GAINED', actorId: item.actorId, amount: card.secondaryValue })
        return
      case 'DRAW_AND_DAMAGE_SELF':
        queue.unshift(
          { type: 'DRAW', actorId: item.actorId, count: value },
          { type: 'DAMAGE', packets: [{ sourceEntityId: item.sourceEntityId, targetEntityId: workingState.game.players[item.actorId].heroEntityId, amount: card.secondaryValue, poisonous: false, reason: getEntity(workingState.game, item.sourceEntityId).type === 'HERO_POWER' ? 'HERO_POWER' : 'BATTLECRY' }] },
        )
        return
      case 'HEAL_HERO':
        queue.unshift({ type: 'HEAL', targetEntityId: workingState.game.players[item.actorId].heroEntityId, amount: value })
        return
      case 'HEAL_CHARACTER':
        queue.unshift({ type: 'HEAL', targetEntityId: targetEntityId as EntityId, amount: value })
        return
      case 'SET_HERO_HEALTH':
        emitGame({ type: 'HERO_HEALTH_SET', actorId: item.actorId, health: value })
        return
      case 'HEAL_TARGET_AND_DRAW':
        queue.unshift(
          { type: 'HEAL', targetEntityId: targetEntityId as EntityId, amount: value },
          { type: 'DRAW', actorId: item.actorId, count: card.secondaryValue },
        )
        return
      case 'BUFF_OTHER_FRIENDLY_MINIONS': {
        const sourceId = item.sourceEntityId
        for (const targetId of workingState.game.players[item.actorId].board.filter((id) => id !== sourceId)) {
          emitGame({ type: 'MINION_BUFFED', targetEntityId: targetId, attackGain: value, healthGain: card.secondaryValue })
        }
        return
      }
      case 'GRANT_POISONOUS':
        emitGame({ type: 'MINION_KEYWORD_GRANTED', targetEntityId: targetEntityId as EntityId, keyword: 'POISONOUS' })
        return
      case 'DEATHRATTLE_ADD_CARD':
        if (card.tokenCardId) queue.unshift({ type: 'ADD_CARD', actorId: item.actorId, definitionId: card.tokenCardId })
        return
      case 'SUMMON_TOKENS_AND_BUFF':
        if (card.tokenCardId) {
          for (let count = 0; count < value; count += 1) summon(item.actorId, card.tokenCardId)
        }
        for (const targetId of workingState.game.players[item.actorId].board) {
          emitGame({ type: 'MINION_BUFFED', targetEntityId: targetId, attackGain: card.secondaryValue, healthGain: 0 })
          emitGame({ type: 'MINION_KEYWORD_GRANTED', targetEntityId: targetId, keyword: 'DIVINE_SHIELD' })
        }
        return
      case 'SUMMON_CHEAP_DECK_MINIONS_RUSH': {
        let summonedCount = 0
        for (const entityId of [...workingState.game.players[item.actorId].deck]) {
          if (summonedCount >= 2 || workingState.game.players[item.actorId].board.length >= 7) break
          const entity = structuredClone(getEntity(workingState.game, entityId))
          const definition = getCardDefinition(entity.definitionId)
          if (definition.type !== 'MINION' || definition.cost > 2) continue
          entity.zone = 'BOARD'
          entity.exhausted = false
          entity.summonedThisTurn = true
          entity.attacksRemaining = definition.keywords.includes('WINDFURY') ? 2 : 1
          entity.keywords = [...new Set([...entity.keywords, 'RUSH' as Keyword])]
          emitGame({ type: 'MINION_SUMMONED', actorId: item.actorId, entity, placementIndex: workingState.game.players[item.actorId].board.length, fromDeck: true })
          summonedCount += 1
        }
        return
      }
      case 'EQUIP_TOKEN_WEAPON': {
        if (!card.tokenCardId) return
        const player = workingState.game.players[item.actorId]
        const entity = createEntityFromDefinition(
          workingState.game.nextEntityId,
          card.tokenCardId,
          item.actorId,
          'WEAPON',
          false,
          entityOptions,
        )
        emitGame({ type: 'WEAPON_CREATED_AND_EQUIPPED', actorId: item.actorId, entity, replacedEntityId: player.weaponEntityId })
        return
      }
      case 'SUMMON_RANDOM_BASIC_TOTEM': {
        const tokens = ['CS2_050', 'CS2_051', 'CS2_052', 'CS2_058']
        const random = nextRandom(workingState.game.rng)
        emitGame({ type: 'RNG_ADVANCED', rng: random.rng })
        summon(item.actorId, tokens[Math.floor(random.value * tokens.length)] as string)
        return
      }
      case 'ADD_TOKEN_CARD':
        if (card.tokenCardId) addCard(item.actorId, card.tokenCardId)
        return
      case 'DESTROY_DAMAGED_MINION':
        emitGame({ type: 'MINION_MARKED_DESTROYED', entityId: targetEntityId as EntityId })
        queue.unshift({ type: 'SWEEP_DEATHS' })
        return
      case 'HEAL_FRIENDLY_CHARACTERS': {
        const player = workingState.game.players[item.actorId]
        for (const targetId of [player.heroEntityId, ...player.board]) emitGame({ type: 'CHARACTER_HEALED', targetEntityId: targetId, amount: value })
        return
      }
      case 'GAIN_ARMOR':
      case 'HERO_POWER_ARMOR':
        emitGame({ type: 'ARMOR_GAINED', actorId: item.actorId, amount: value })
        return
      case 'DEATHRATTLE_DAMAGE_ENEMY_HERO':
        queue.unshift({ type: 'DAMAGE', packets: [{ sourceEntityId: item.sourceEntityId, targetEntityId: enemyHeroId(workingState, item.actorId), amount: value, poisonous: false, reason: 'DEATHRATTLE' }] })
        return
      case 'TEMPORARY_MANA':
        emitGame({ type: 'TEMPORARY_MANA_GAINED', actorId: item.actorId, amount: value })
        return
    }
  }

  function enrichDamagePacket(packet: DamagePacketV1): DamagePacketV1 {
    if (packet.sourceEntityId === null) return packet
    const source = getEntity(workingState.game, packet.sourceEntityId)
    const sourceCard = getCardDefinition(source.definitionId)
    const spellDamage = sourceCard.type === 'SPELL' && (packet.reason === 'SPELL' || packet.reason === 'AREA')
    const amount = packet.amount + (spellDamage ? spellPowerFor(source.controllerId) : 0)
    const enriched: DamagePacketV1 = amount === packet.amount ? { ...packet } : { ...packet, amount }
    if (packet.lifesteal === false || packet.lifesteal === true) return { ...enriched, lifesteal: packet.lifesteal }
    if (source.keywords.includes('LIFESTEAL')) return { ...enriched, lifesteal: true }
    return enriched
  }

  function spellPowerFor(actorId: PlayerId): number {
    return workingState.game.players[actorId].board.reduce((total, entityId) => {
      return total + (getEntity(workingState.game, entityId).keywords.includes('SPELLPOWER') ? 1 : 0)
    }, 0)
  }

  function sweepDeaths(): void {
    const active = workingState.game.activePlayerId
    const order = [active, otherPlayer(active)] as const
    const deaths = order.flatMap((playerId) => workingState.game.players[playerId].board
      .map((id) => getEntity(workingState.game, id))
      .filter((entity) => entity.health <= 0 || entity.poisonousLethal || entity.destroyMarked)
      .sort((left, right) => left.createdSequence - right.createdSequence)
      .map((entity) => ({
        entityId: entity.id,
        placementIndex: workingState.game.players[playerId].board.indexOf(entity.id),
        reason: entity.destroyMarked ? 'DESTROY' as const : entity.poisonousLethal ? 'POISONOUS' as const : 'HEALTH' as const,
      })))
    if (deaths.length === 0) return
    const deathEntities = deaths.map((death) => getEntity(workingState.game, death.entityId))
    const deathrattles = deathEntities.filter((entity) => {
      const card = getCardDefinition(entity.definitionId)
      return !entity.deathrattleResolved && entity.keywords.includes('DEATHRATTLE') && (card.deathrattleEffect ?? card.effect) !== 'NONE'
    })
    const reborns = deaths.filter((death) => getEntity(workingState.game, death.entityId).keywords.includes('REBORN'))
    emitGame({ type: 'MINION_DEATH_BATCH', deaths: deaths.map(({ entityId, reason }) => ({ entityId, reason })) })
    const work: WorkItem[] = []
    for (const entity of deathrattles) {
      const card = getCardDefinition(entity.definitionId)
      emitGame({ type: 'DEATHRATTLE_TRIGGERED', entityId: entity.id })
      work.push(createEffectItem(entity.controllerId, entity.id, card.deathrattleEffect ?? card.effect))
    }
    for (const death of reborns) {
      const original = getEntity(workingState.game, death.entityId)
      const player = workingState.game.players[original.controllerId]
      if (player.board.length >= 7) continue
      const entity = createEntityFromDefinition(workingState.game.nextEntityId, original.definitionId, original.ownerId, 'BOARD', true, entityOptions)
      entity.controllerId = original.controllerId
      entity.attack = original.attack
      entity.health = 1
      entity.maxHealth = 1
      if (original.baseAttack !== undefined) entity.baseAttack = original.baseAttack
      if (original.baseMaxHealth !== undefined) entity.baseMaxHealth = original.baseMaxHealth
      entity.keywords = original.keywords.filter((keyword) => keyword !== 'REBORN')
      entity.exhausted = true
      if (!dependencies.legacyCardDataVersion) {
        entity.summonedThisTurn = false
        entity.attacksRemaining = 0
      }
      emitGame({ type: 'MINION_SUMMONED', actorId: original.controllerId, entity, placementIndex: Math.min(death.placementIndex, player.board.length), reborn: true })
    }
    queue.unshift(...work, { type: 'SWEEP_DEATHS' })
  }

  function drawCard(actorId: PlayerId): void {
    const player = workingState.game.players[actorId]
    const entityId = player.deck[0]
    if (entityId === undefined) {
      const amount = player.fatigue + 1
      emitGame({ type: 'FATIGUE_INCREASED', actorId, amount })
      queue.unshift({ type: 'DAMAGE', packets: [{ sourceEntityId: null, targetEntityId: player.heroEntityId, amount, poisonous: false, reason: 'FATIGUE' }] })
      return
    }
    emitGame({ type: 'CARD_DRAWN', actorId, entityId, burned: player.hand.length >= 10 })
  }

  function addCard(actorId: PlayerId, definitionId: string): void {
    const player = workingState.game.players[actorId]
    const entity = createEntityFromDefinition(
      workingState.game.nextEntityId,
      definitionId,
      actorId,
      'HAND',
      false,
      entityOptions,
    )
    emitGame({ type: 'CARD_ADDED', actorId, entity, burned: player.hand.length >= 10 })
  }

  function summon(actorId: PlayerId, definitionId: string, placementIndex?: number, ready?: boolean): void {
    const player = workingState.game.players[actorId]
    if (player.board.length >= 7) return
    const card = getCardDefinition(definitionId)
    const canAttackImmediately = dependencies.legacyCardDataVersion
      ? false
      : ready ?? (card.keywords.includes('CHARGE') || card.keywords.includes('RUSH'))
    const entity = createEntityFromDefinition(
      workingState.game.nextEntityId,
      definitionId,
      actorId,
      'BOARD',
      !canAttackImmediately,
      entityOptions,
    )
    if (!dependencies.legacyCardDataVersion) {
      entity.summonedThisTurn = canAttackImmediately
      entity.attacksRemaining = canAttackImmediately ? (card.keywords.includes('WINDFURY') ? 2 : 1) : 0
    }
    emitGame({ type: 'MINION_SUMMONED', actorId, entity, placementIndex: placementIndex ?? player.board.length })
  }

  function offerDiscover(actorId: PlayerId, sourceEntityId: EntityId, kind: 'SPELL' | 'CARD' = 'SPELL'): void {
    const player = workingState.game.players[actorId]
    const actorClass = getCardDefinition(getEntity(workingState.game, player.heroEntityId).definitionId).cardClass
    const pool = [...(dependencies.discoverPool ?? Object.values(CARD_DEFINITIONS_V1)
      .filter((card) => card.collectible
        && (kind === 'CARD' ? ['MINION', 'SPELL', 'WEAPON'].includes(card.type) : card.type === 'SPELL')
        && (card.classes.includes('NEUTRAL') || card.classes.includes(actorClass)))
      .map((card) => card.id))].sort()
    if (pool.length < 3) throw new Error('DISCOVER_POOL_TOO_SMALL')
    const candidates = [...pool]
    const choices: string[] = []
    let rng = workingState.game.rng
    while (choices.length < 3) {
      const random = nextRandom(rng)
      rng = random.rng
      const index = Math.floor(random.value * candidates.length)
      choices.push(candidates.splice(index, 1)[0] as string)
    }
    emitGame({ type: 'DISCOVER_OFFERED', actorId, sourceEntityId, decisionId: `decision-${workingState.game.nextEventSequence}`, choiceDefinitionIds: choices, rng })
  }

  function checkTerminal(): void {
    const playerAlive = getEntity(workingState.game, workingState.game.players.PLAYER.heroEntityId).health > 0
    const opponentAlive = getEntity(workingState.game, workingState.game.players.OPPONENT.heroEntityId).health > 0
    if (playerAlive && opponentAlive) return
    const winnerId: PlayerId = playerAlive ? 'PLAYER' : 'OPPONENT'
    emitGame({ type: 'GAME_ENDED', winnerId, endReason: 'HERO_DEFEATED' })
    queue.length = 0
  }

  function heroesAreAlive(): boolean {
    return getEntity(workingState.game, workingState.game.players.PLAYER.heroEntityId).health > 0
      && getEntity(workingState.game, workingState.game.players.OPPONENT.heroEntityId).health > 0
  }
}

function createEffectItem(actorId: PlayerId, sourceEntityId: EntityId, effect: EffectExecutorId, targetEntityId?: EntityId, manathirstActive?: boolean, comboActive?: boolean): Extract<WorkItem, { type: 'EXECUTE_EFFECT' }> {
  const item: Extract<WorkItem, { type: 'EXECUTE_EFFECT' }> = { type: 'EXECUTE_EFFECT', actorId, sourceEntityId, effect }
  if (targetEntityId !== undefined) item.targetEntityId = targetEntityId
  if (manathirstActive !== undefined) item.manathirstActive = manathirstActive
  if (comboActive !== undefined) item.comboActive = comboActive
  return item
}

function stablePackets(packets: DamagePacketV1[]): DamagePacketV1[] {
  return [...packets].sort((left, right) => (left.sourceEntityId ?? 0) - (right.sourceEntityId ?? 0) || left.targetEntityId - right.targetEntityId)
}
