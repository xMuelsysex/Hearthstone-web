import { SHOWCASE_DECKS_V1 } from '@/cards/decks'
import { validateCommand } from '@/engine/commands'
import { chooseTavernKeeperAction, observeForAi } from '@/ai/tavernKeeper'
import { createShowcaseState, runShowcaseScript, SHOWCASE_MAX_COMMANDS, SHOWCASE_MAX_TURNS } from '@/scenarios/showcase'

function eventTypes(result: ReturnType<typeof runShowcaseScript>): string[] {
  return result.batches.flatMap((batch) => batch.events.map((recorded) => recorded.event.payload.type))
}

describe('showcase scenario', () => {
  it('completes all five real-card keyword demonstrations before the tavern keeper concedes', () => {
    const result = runShowcaseScript()
    expect(result.batches.length).toBeLessThanOrEqual(SHOWCASE_MAX_COMMANDS)
    expect(result.finalState.game.turn).toBeLessThanOrEqual(SHOWCASE_MAX_TURNS)
    expect(result.finalState.scenario.coverage).toEqual({
      MANATHIRST: expect.any(Number),
      POISONOUS: expect.any(Number),
      ELUSIVE: expect.any(Number),
      DISCOVER: expect.any(Number),
      MAGNETIC: expect.any(Number),
    })
    expect(result.finalState.scenario.stage).toBe('COMPLETED')
    expect(result.finalState.game.winnerId).toBe('PLAYER')
    expect(result.finalState.game.endReason).toBe('CONCEDE')

    const types = eventTypes(result)
    const concedeIndex = types.lastIndexOf('GAME_CONCEDED')
    const readyIndex = types.lastIndexOf('SHOWCASE_READY_FOR_CONCEDE')
    expect(readyIndex).toBeGreaterThan(-1)
    expect(concedeIndex).toBeGreaterThan(readyIndex)
    expect(types.filter((type) => type === 'GAME_CONCEDED')).toHaveLength(1)
    expect(types.filter((type) => type === 'GAME_ENDED')).toHaveLength(1)
  })

  it('builds a playable showcase state for every official hero and its class deck', () => {
    for (const deck of SHOWCASE_DECKS_V1) {
      const state = createShowcaseState(deck.ownerClass)
      const player = state.game.players.PLAYER
      expect(state.game.entities[String(player.heroEntityId)]?.definitionId).toBe(deck.heroId)
      expect(state.game.entities[String(player.heroPowerEntityId)]?.definitionId).toBe(deck.heroPowerId)
      expect(player.deck.length + player.hand.length + player.board.length).toBe(deck.cards.length)
      for (const cardId of deck.signatureCardIds) expect(deck.cards).toContain(cardId)
      expect(player.hand.map((id) => state.game.entities[String(id)]?.definitionId)).toEqual(expect.arrayContaining(deck.signatureCardIds.slice(0, 3)))
    }
  })

  it('keeps every selected AI descriptor within the public actor-scoped legality contract', () => {
    const state = createShowcaseState()
    const observation = observeForAi(state)
    const action = chooseTavernKeeperAction(observation)
    expect(action?.actorId).toBe('OPPONENT')
    if (!action) throw new Error('missing AI action')
    expect(validateCommand(state, { type: 'CONFIRM_MULLIGAN', actorId: 'OPPONENT', commandId: 'ai-check', mulliganCardInstanceIds: [] }).ok).toBe(true)
    expect(JSON.stringify(observation.view)).not.toContain('RLK_843')
  })
})
