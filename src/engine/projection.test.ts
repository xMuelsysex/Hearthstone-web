import { projectPlayerView } from '@/engine/projection'
import { createGameState } from '@/engine/setup'
import { getEntity } from '@/engine/state'

describe('player projection', () => {
  it('hides opponent hand identities and deck order', () => {
    const state = createGameState({ seed: 5 })
    const view = projectPlayerView(state, 'PLAYER')
    expect(view.opponent.hand.every((card) => card.hidden)).toBe(true)
    const opponentDefinitionIds = state.game.players.OPPONENT.hand.map((id) => getEntity(state.game, id).definitionId)
    expect(JSON.stringify(view)).not.toContain(opponentDefinitionIds[0])
    expect(view.opponent).not.toHaveProperty('deck')
  })

  it('projects equipped weapons as public combat information', () => {
    const state = createGameState({ seed: 6 })
    const weaponId = state.game.players.OPPONENT.deck.find((id) => getEntity(state.game, id).definitionId === 'CS2_106')
    if (!weaponId) throw new Error('missing weapon fixture')
    state.game.players.OPPONENT.deck = state.game.players.OPPONENT.deck.filter((id) => id !== weaponId)
    state.game.players.OPPONENT.weaponEntityId = weaponId
    getEntity(state.game, weaponId).zone = 'WEAPON'

    const view = projectPlayerView(state, 'PLAYER')
    expect(view.opponent.weapon).toMatchObject({ definitionId: 'CS2_106', attack: 3, durability: 2 })
  })
})
