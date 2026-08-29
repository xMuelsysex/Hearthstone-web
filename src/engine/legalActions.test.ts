import { commandFromAction, validateCommand } from '@/engine/commands'
import { getLegalActions } from '@/engine/legalActions'
import { resolveCommand } from '@/engine/resolveCommand'
import { createGameState } from '@/engine/setup'

function enterPlay() {
  let state = createGameState({ seed: 4 })
  for (const actorId of ['PLAYER', 'OPPONENT'] as const) {
    const action = getLegalActions(state, actorId).find((item) => item.type === 'CONFIRM_MULLIGAN')
    if (!action) throw new Error('missing mulligan')
    state = resolveCommand(state, commandFromAction(action, actorId)).finalState
  }
  return state
}

describe('legal actions', () => {
  it('validates every enumerated descriptor through the same predicates', () => {
    const state = enterPlay()
    for (const action of getLegalActions(state, 'PLAYER')) {
      const command = commandFromAction(action, `command-${action.id}`)
      expect(validateCommand(state, command).ok).toBe(true)
    }
  })

  it('only exposes concede to the non-active player', () => {
    const state = enterPlay()
    expect(getLegalActions(state, 'OPPONENT').map((item) => item.type)).toEqual(['CONCEDE'])
  })
})
