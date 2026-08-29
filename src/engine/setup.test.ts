import { commandFromAction } from '@/engine/commands'
import { getLegalActions } from '@/engine/legalActions'
import { resolveCommand } from '@/engine/resolveCommand'
import { createGameState } from '@/engine/setup'
import { getEntity } from '@/engine/state'

function confirmMulligan(state: ReturnType<typeof createGameState>, actorId: 'PLAYER' | 'OPPONENT') {
  const action = getLegalActions(state, actorId).find((item) => item.type === 'CONFIRM_MULLIGAN')
  if (!action) throw new Error('missing mulligan action')
  return resolveCommand(state, commandFromAction(action, `command-${actorId}`)).finalState
}

describe('game setup', () => {
  it('creates official opening hands and enters play after both mulligans', () => {
    let state = createGameState({ seed: 7, startingPlayerId: 'PLAYER' })
    expect(state.game.players.PLAYER.hand).toHaveLength(3)
    expect(state.game.players.OPPONENT.hand).toHaveLength(5)
    expect(state.game.players.OPPONENT.hand.map((id) => getEntity(state.game, id).definitionId)).toContain('GAME_005')

    state = confirmMulligan(state, 'PLAYER')
    state = confirmMulligan(state, 'OPPONENT')
    expect(state.game.phase).toBe('PLAY')
    expect(state.game.turn).toBe(1)
    expect(state.game.players.PLAYER.mana).toEqual({ maximum: 1, current: 1, temporary: 0 })
    expect(state.game.players.PLAYER.hand).toHaveLength(4)
  })
})
