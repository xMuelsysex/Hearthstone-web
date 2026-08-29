import { createEntityFromDefinition } from '@/engine/applyRecordedEvent'
import { commandFromAction, type GameCommand } from '@/engine/commands'
import { getLegalActions } from '@/engine/legalActions'
import { resolveCommand } from '@/engine/resolveCommand'
import { createGameState } from '@/engine/setup'
import { getEntity, type AuthoritativeSessionStateV1, type PlayerId } from '@/engine/state'

function enterPlay(state: AuthoritativeSessionStateV1): AuthoritativeSessionStateV1 {
  for (const actorId of ['PLAYER', 'OPPONENT'] as const) {
    const action = getLegalActions(state, actorId).find((item) => item.type === 'CONFIRM_MULLIGAN')
    if (!action) throw new Error('missing mulligan')
    state = resolveCommand(state, commandFromAction(action, `mulligan-${actorId}`)).finalState
  }
  return state
}

function putInHand(state: AuthoritativeSessionStateV1, actorId: PlayerId, definitionId: string): number {
  const entity = createEntityFromDefinition(state.game.nextEntityId, definitionId, actorId, 'HAND')
  state.game.nextEntityId += 1
  state.game.entities[String(entity.id)] = entity
  state.game.players[actorId].hand.push(entity.id)
  return entity.id
}

function putOnBoard(state: AuthoritativeSessionStateV1, actorId: PlayerId, definitionId: string, exhausted = false): number {
  const entity = createEntityFromDefinition(state.game.nextEntityId, definitionId, actorId, 'BOARD', exhausted)
  state.game.nextEntityId += 1
  state.game.entities[String(entity.id)] = entity
  state.game.players[actorId].board.push(entity.id)
  return entity.id
}

function playAction(state: AuthoritativeSessionStateV1, cardInstanceId: number, predicate: (item: ReturnType<typeof getLegalActions>[number]) => boolean = () => true) {
  const action = getLegalActions(state, 'PLAYER').find((item) => item.type === 'PLAY_CARD' && item.cardInstanceId === cardInstanceId && predicate(item))
  if (!action) throw new Error(`missing play action for ${cardInstanceId}`)
  return resolveCommand(state, commandFromAction(action, `play-${cardInstanceId}`))
}

describe('command resolver', () => {
  it('applies manathirst, discover and magnetic through recorded events', () => {
    let state = enterPlay(createGameState({ seed: 11 }))
    state.game.players.PLAYER.mana = { maximum: 10, current: 10, temporary: 0 }
    const opponentHero = state.game.players.OPPONENT.heroEntityId

    const bolt = putInHand(state, 'PLAYER', 'RLK_843')
    let batch = playAction(state, bolt, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === opponentHero)
    expect(batch.events.map((item) => item.event.scope === 'GAME' ? item.event.payload.type : item.event.payload.type)).toContain('MANATHIRST_BONUS_APPLIED')
    expect(getEntity(batch.finalState.game, opponentHero).health).toBe(27)
    expect(batch.finalState.scenario.coverage.MANATHIRST).not.toBeNull()

    state = batch.finalState
    state.game.players.PLAYER.mana.current = 10
    const runeOrb = putInHand(state, 'PLAYER', 'BAR_541')
    batch = playAction(state, runeOrb, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === opponentHero)
    expect(batch.finalState.game.pendingDecision?.kind).toBe('DISCOVER')
    const discover = getLegalActions(batch.finalState, 'PLAYER').find((item) => item.type === 'SELECT_DISCOVER')
    if (!discover) throw new Error('missing discover')
    batch = resolveCommand(batch.finalState, commandFromAction(discover, 'discover-choice'))
    expect(batch.finalState.scenario.coverage.DISCOVER).not.toBeNull()

    state = batch.finalState
    state.game.players.PLAYER.mana.current = 10
    const mech = putOnBoard(state, 'PLAYER', 'BOT_309')
    const magnetic = putInHand(state, 'PLAYER', 'BOT_563')
    const beforeAttack = getEntity(state.game, mech).attack
    batch = playAction(state, magnetic, (item) => item.type === 'PLAY_CARD' && item.playMode === 'MAGNETIC' && item.targetEntityId === mech)
    expect(getEntity(batch.finalState.game, mech).attack).toBe(beforeAttack + 6)
    expect(batch.finalState.scenario.coverage.MAGNETIC).not.toBeNull()
  })

  it('records elusive target evidence and poisonous death', () => {
    let state = enterPlay(createGameState({ seed: 12 }))
    state.game.players.OPPONENT.mana = { maximum: 10, current: 10, temporary: 0 }
    state.game.activePlayerId = 'OPPONENT'
    const elusive = putOnBoard(state, 'PLAYER', 'DRG_066')
    const otherTarget = putOnBoard(state, 'PLAYER', 'BOT_309')
    const targetedSpell = putInHand(state, 'OPPONENT', 'BT_233')
    const action = getLegalActions(state, 'OPPONENT').find((item) => item.type === 'PLAY_CARD' && item.cardInstanceId === targetedSpell && item.targetEntityId === otherTarget)
    if (!action) throw new Error('missing targeted spell action')
    let batch = resolveCommand(state, commandFromAction(action, 'targeted-spell'))
    expect(batch.legalityEvidence[0]?.excluded).toEqual([{ entityId: elusive, reason: 'ELUSIVE' }])
    expect(batch.finalState.scenario.coverage.ELUSIVE).not.toBeNull()

    state = batch.finalState
    state.game.activePlayerId = 'PLAYER'
    getEntity(state.game, elusive).exhausted = false
    const largeMinion = putOnBoard(state, 'OPPONENT', 'BOT_563')
    const attack: GameCommand = { type: 'ATTACK', actorId: 'PLAYER', commandId: 'poison', attackSourceId: elusive, attackTargetId: largeMinion }
    batch = resolveCommand(state, attack)
    const deathEvent = batch.events.find((item) => item.event.scope === 'GAME' && item.event.payload.type === 'MINION_DEATH_BATCH')
    expect(deathEvent?.event.scope === 'GAME' && deathEvent.event.payload.type === 'MINION_DEATH_BATCH' ? deathEvent.event.payload.deaths : []).toEqual(expect.arrayContaining([{ entityId: largeMinion, reason: 'POISONOUS' }]))
    expect(batch.finalState.scenario.coverage.POISONOUS).not.toBeNull()
  })

  it('does not complete the showcase on an early player concede', () => {
    const state = enterPlay(createGameState({ seed: 14 }))
    const concede = getLegalActions(state, 'PLAYER').find((item) => item.type === 'CONCEDE')
    if (!concede) throw new Error('missing concede')
    const batch = resolveCommand(state, commandFromAction(concede, 'early-concede'))
    expect(batch.finalState.game.phase).toBe('GAME_OVER')
    expect(batch.finalState.scenario.stage).toBe('IN_PROGRESS')
  })

  it('resolves a golden simultaneous-death queue before terminal', () => {
    const state = enterPlay(createGameState({ seed: 13 }))
    state.game.activePlayerId = 'PLAYER'
    const attacker = putOnBoard(state, 'PLAYER', 'EX1_029')
    const harvest = putOnBoard(state, 'OPPONENT', 'EX1_556')
    getEntity(state.game, attacker).attack = 4
    getEntity(state.game, attacker).health = 1
    getEntity(state.game, harvest).attack = 4
    getEntity(state.game, harvest).health = 1
    getEntity(state.game, state.game.players.OPPONENT.heroEntityId).health = 2

    const batch = resolveCommand(state, { type: 'ATTACK', actorId: 'PLAYER', commandId: 'golden', attackSourceId: attacker, attackTargetId: harvest })
    const eventTypes = batch.events.map((item) => item.event.payload.type)
    expect(eventTypes).toEqual([
      'COMMAND_ACCEPTED', 'SCENARIO_COMMAND_ACCEPTED', 'ATTACK_DECLARED', 'DAMAGE_BATCH_APPLIED',
      'MINION_DEATH_BATCH', 'DEATHRATTLE_TRIGGERED', 'DEATHRATTLE_TRIGGERED',
      'DAMAGE_BATCH_APPLIED', 'MINION_SUMMONED', 'GAME_ENDED',
    ])
    expect(batch.finalState.game.winnerId).toBe('PLAYER')
  })
})
