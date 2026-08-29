import { CARD_DEFINITIONS_V1, getCardDefinition } from '@/cards/registry'
import type { EffectExecutorId } from '@/cards/types'
import { createEntityFromDefinition } from '@/engine/applyRecordedEvent'
import { applyRecordedEvent, enemyHeroId } from '@/engine/applyRecordedEvent'
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
  | { type: 'EXECUTE_EFFECT'; actorId: PlayerId; sourceEntityId: EntityId; effect: EffectExecutorId; targetEntityId?: EntityId; manathirstActive?: boolean }
  | { type: 'DAMAGE'; packets: DamagePacketV1[] }
  | { type: 'SWEEP_DEATHS' }
  | { type: 'DRAW'; actorId: PlayerId; count: number }
  | { type: 'SUMMON'; actorId: PlayerId; definitionId: string; placementIndex?: number }
  | { type: 'OFFER_DISCOVER'; actorId: PlayerId; sourceEntityId: EntityId }
  | { type: 'CHECK_TERMINAL' }

export type ResolveDependencies = {
  discoverPool?: readonly string[]
}

export function resolveCommand(
  committedState: AuthoritativeSessionStateV1,
  command: GameCommand,
  dependencies: ResolveDependencies = {},
): ProvisionalCommandBatchV1 {
  const validation = validateCommand(committedState, command)
  if (!validation.ok) throw new Error(validation.code)
  const legalityEvidence = validation.evidence
  const baseState = structuredClone(committedState)
  let workingState = committedState
  const events: ProvisionalRecordedEventV1[] = []
  const queue: WorkItem[] = []
  const batchSequence = committedState.game.nextBatchSequence

  function emitRecorded(event: RecordedEventV1, derive = true): void {
    const sequence = workingState.game.nextEventSequence
    workingState = applyRecordedEvent(workingState, event)
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
        const availableMana = workingState.game.players[accepted.actorId].mana.current + workingState.game.players[accepted.actorId].mana.temporary
        const manathirstActive = card.manathirstThreshold > 0 && availableMana >= card.manathirstThreshold
        const destination = accepted.playMode === 'MAGNETIC' || card.type === 'WEAPON' ? 'SET_ASIDE' : card.type === 'MINION' ? 'BOARD' : 'GRAVEYARD'
        emitGame({ type: 'CARD_PLAYED', actorId: accepted.actorId, entityId: entity.id, manaCost: card.cost, destination, placementIndex: accepted.placementIndex ?? null })
        if (manathirstActive) emitGame({ type: 'MANATHIRST_BONUS_APPLIED', sourceEntityId: entity.id, threshold: card.manathirstThreshold, value: card.secondaryValue })
        if (accepted.playMode === 'MAGNETIC') {
          const target = getEntity(workingState.game, accepted.targetEntityId as EntityId)
          const inheritedKeywords = entity.keywords.filter((keyword) => keyword !== 'MAGNETIC')
          emitGame({ type: 'MAGNETIC_MERGED', actorId: accepted.actorId, sourceEntityId: entity.id, targetEntityId: target.id, attackGain: entity.attack, healthGain: entity.maxHealth, inheritedKeywords })
          return
        }
        queue.push(createEffectItem(accepted.actorId, entity.id, card.effect, accepted.targetEntityId, manathirstActive))
        return
      }
      case 'SELECT_DISCOVER': {
        const player = workingState.game.players[accepted.actorId]
        const entity = createEntityFromDefinition(workingState.game.nextEntityId, accepted.discoverChoiceId, accepted.actorId, player.hand.length >= 10 ? 'GRAVEYARD' : 'HAND')
        emitGame({ type: 'DISCOVER_RESOLVED', actorId: accepted.actorId, decisionId: accepted.decisionId, choiceDefinitionId: accepted.discoverChoiceId, entity, burned: player.hand.length >= 10 })
        return
      }
      case 'ATTACK': {
        const source = getEntity(workingState.game, accepted.attackSourceId)
        const target = getEntity(workingState.game, accepted.attackTargetId)
        emitGame({ type: 'ATTACK_DECLARED', actorId: accepted.actorId, sourceEntityId: source.id, targetEntityId: target.id })
        const sourceWeapon = source.type === 'HERO' ? workingState.game.players[accepted.actorId].weaponEntityId : null
        const sourceAttack = source.attack + (sourceWeapon === null ? 0 : getEntity(workingState.game, sourceWeapon).attack)
        const targetWeapon = target.type === 'HERO' ? workingState.game.players[target.controllerId].weaponEntityId : null
        const targetAttack = target.attack + (targetWeapon === null ? 0 : getEntity(workingState.game, targetWeapon).attack)
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
        emitGame({ type: 'HERO_POWER_USED', actorId: accepted.actorId, heroPowerEntityId: heroPower.id, manaCost: 2 })
        queue.push(createEffectItem(accepted.actorId, heroPower.id, getCardDefinition(heroPower.definitionId).effect, accepted.targetEntityId))
        return
      }
      case 'END_TURN': {
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
      case 'DAMAGE':
        if (item.packets.length > 0) emitGame({ type: 'DAMAGE_BATCH_APPLIED', packets: stablePackets(item.packets) })
        queue.unshift({ type: 'SWEEP_DEATHS' })
        return
      case 'SWEEP_DEATHS':
        sweepDeaths()
        return
      case 'DRAW':
        for (let count = 0; count < item.count; count += 1) drawCard(item.actorId)
        return
      case 'SUMMON':
        summon(item.actorId, item.definitionId, item.placementIndex)
        return
      case 'OFFER_DISCOVER':
        if (!heroesAreAlive()) return
        offerDiscover(item.actorId, item.sourceEntityId)
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
      case 'DRAW':
        queue.unshift({ type: 'DRAW', actorId: item.actorId, count: value })
        return
      case 'DAMAGE_AND_DISCOVER_SPELL':
        queue.unshift(
          { type: 'DAMAGE', packets: [{ sourceEntityId: item.sourceEntityId, targetEntityId: targetEntityId as EntityId, amount: value, poisonous: false, reason: 'SPELL' }] },
          { type: 'OFFER_DISCOVER', actorId: item.actorId, sourceEntityId: item.sourceEntityId },
        )
        return
      case 'SUMMON_TOKEN':
      case 'DEATHRATTLE_SUMMON_TOKEN':
        if (card.tokenCardId) queue.unshift({ type: 'SUMMON', actorId: item.actorId, definitionId: card.tokenCardId })
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

  function sweepDeaths(): void {
    const active = workingState.game.activePlayerId
    const order = [active, otherPlayer(active)] as const
    const deaths = order.flatMap((playerId) => workingState.game.players[playerId].board
      .map((id) => getEntity(workingState.game, id))
      .filter((entity) => entity.health <= 0 || entity.poisonousLethal || entity.destroyMarked)
      .sort((left, right) => left.createdSequence - right.createdSequence)
      .map((entity) => ({ entityId: entity.id, reason: entity.destroyMarked ? 'DESTROY' as const : entity.poisonousLethal ? 'POISONOUS' as const : 'HEALTH' as const })))
    if (deaths.length === 0) return
    const deathrattles = deaths
      .map((death) => getEntity(workingState.game, death.entityId))
      .filter((entity) => !entity.deathrattleResolved && getCardDefinition(entity.definitionId).effect.startsWith('DEATHRATTLE_'))
    emitGame({ type: 'MINION_DEATH_BATCH', deaths })
    const work: WorkItem[] = []
    for (const entity of deathrattles) {
      emitGame({ type: 'DEATHRATTLE_TRIGGERED', entityId: entity.id })
      work.push(createEffectItem(entity.controllerId, entity.id, getCardDefinition(entity.definitionId).effect))
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

  function summon(actorId: PlayerId, definitionId: string, placementIndex?: number): void {
    const player = workingState.game.players[actorId]
    if (player.board.length >= 7) return
    const entity = createEntityFromDefinition(workingState.game.nextEntityId, definitionId, actorId, 'BOARD', true)
    emitGame({ type: 'MINION_SUMMONED', actorId, entity, placementIndex: placementIndex ?? player.board.length })
  }

  function offerDiscover(actorId: PlayerId, sourceEntityId: EntityId): void {
    const pool = [...(dependencies.discoverPool ?? Object.values(CARD_DEFINITIONS_V1)
      .filter((card) => card.collectible && card.type === 'SPELL' && (card.cardClass === 'MAGE' || card.cardClass === 'NEUTRAL'))
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

function createEffectItem(actorId: PlayerId, sourceEntityId: EntityId, effect: EffectExecutorId, targetEntityId?: EntityId, manathirstActive?: boolean): Extract<WorkItem, { type: 'EXECUTE_EFFECT' }> {
  const item: Extract<WorkItem, { type: 'EXECUTE_EFFECT' }> = { type: 'EXECUTE_EFFECT', actorId, sourceEntityId, effect }
  if (targetEntityId !== undefined) item.targetEntityId = targetEntityId
  if (manathirstActive !== undefined) item.manathirstActive = manathirstActive
  return item
}

function stablePackets(packets: DamagePacketV1[]): DamagePacketV1[] {
  return [...packets].sort((left, right) => (left.sourceEntityId ?? 0) - (right.sourceEntityId ?? 0) || left.targetEntityId - right.targetEntityId)
}
