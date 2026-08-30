import { createEntityFromDefinition } from '@/engine/applyRecordedEvent'
import { commandFromAction, validateCommand } from '@/engine/commands'
import { getLegalActions } from '@/engine/legalActions'
import { resolveCommand } from '@/engine/resolveCommand'
import { createGameState } from '@/engine/setup'
import { getEntity, type AuthoritativeSessionStateV1, type PlayerId } from '@/engine/state'

function enterPlay() {
  let state = createGameState({ seed: 4 })
  for (const actorId of ['PLAYER', 'OPPONENT'] as const) {
    const action = getLegalActions(state, actorId).find((item) => item.type === 'CONFIRM_MULLIGAN')
    if (!action) throw new Error('missing mulligan')
    state = resolveCommand(state, commandFromAction(action, actorId)).finalState
  }
  return state
}

function putOnBoard(state: AuthoritativeSessionStateV1, actorId: PlayerId, definitionId: string): number {
  const entity = createEntityFromDefinition(state.game.nextEntityId, definitionId, actorId, 'BOARD')
  state.game.nextEntityId += 1
  state.game.entities[String(entity.id)] = entity
  state.game.players[actorId].board.push(entity.id)
  return entity.id
}

describe('legal actions', () => {
  it('validates every enumerated descriptor through the same predicates', () => {
    const state = enterPlay()
    for (const action of getLegalActions(state, 'PLAYER')) {
      const command = commandFromAction(action, `command-${action.id}`)
      expect(validateCommand(state, command).ok).toBe(true)
    }
  })

  it('projects simultaneous combat deaths for both minion sides', () => {
    const state = enterPlay()
    state.game.activePlayerId = 'PLAYER'
    const attacker = putOnBoard(state, 'PLAYER', 'BOT_309')
    const defender = putOnBoard(state, 'OPPONENT', 'CS2_119')
    getEntity(state.game, attacker).attack = 4
    getEntity(state.game, attacker).health = 1
    getEntity(state.game, defender).attack = 4
    getEntity(state.game, defender).health = 1

    const action = getLegalActions(state, 'PLAYER').find((item) => item.type === 'ATTACK' && item.attackSourceId === attacker && item.attackTargetId === defender)
    expect(action?.type).toBe('ATTACK')
    if (action?.type !== 'ATTACK') throw new Error('missing projected combat action')
    expect(action.projectedDeathEntityIds).toEqual([defender, attacker])
  })

  it('only exposes concede to the non-active player', () => {
    const state = enterPlay()
    expect(getLegalActions(state, 'OPPONENT').map((item) => item.type)).toEqual(['CONCEDE'])
  })
})
