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

  it('projects the current cost carried by the entity', () => {
    const state = createGameState({ seed: 7 })
    const entityId = state.game.players.PLAYER.hand[0]
    if (entityId === undefined) throw new Error('missing hand fixture')
    const entity = getEntity(state.game, entityId)
    entity.cost = 0

    const view = projectPlayerView(state, 'PLAYER')
    expect(view.self.hand.find((card) => card.id === entityId)).toHaveProperty('cost', 0)
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
