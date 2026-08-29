import { DECKS_V1, validateDeck } from '@/cards/decks'
import { CARD_DEFINITIONS_V1, getCardDefinition } from '@/cards/registry'

const excludedMechanics = ['SECRET', 'QUEST', 'LOCATION', 'TITAN', 'DORMANT', 'TRADEABLE', 'OVERLOAD', 'SILENCE', 'TRANSFORM', 'DIVINE_SHIELD', 'FREEZE', 'CHARGE', 'RUSH', 'WINDFURY', 'REBORN']

describe('card baseline', () => {
  it('contains two legal 30-card decks', () => {
    expect(DECKS_V1).toHaveLength(2)
    for (const deck of DECKS_V1) expect(validateDeck(deck)).toEqual([])
  })

  it('uses real frozen cards for all showcase keywords', () => {
    expect(getCardDefinition('RLK_843').keywords).toContain('MANATHIRST')
    expect(getCardDefinition('DRG_066').keywords).toEqual(expect.arrayContaining(['POISONOUS', 'ELUSIVE']))
    expect(getCardDefinition('BAR_541').keywords).toContain('DISCOVER')
    expect(getCardDefinition('BOT_563').keywords).toContain('MAGNETIC')
  })

  it('keeps excluded mechanics out of the registered baseline', () => {
    for (const card of Object.values(CARD_DEFINITIONS_V1)) {
      for (const mechanic of excludedMechanics) expect(card.keywords).not.toContain(mechanic)
    }
  })
})
