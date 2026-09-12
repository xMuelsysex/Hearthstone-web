import {
  DECKS_V1,
  SOURCED_CARD_IDS_V1,
  SOURCED_DECKS_V1,
  validateDeck,
} from '@/cards/decks'
import {
  CARD_CATALOG_CUTOFF_SOURCE_V1,
  CARD_CATALOG_CUTOFF_V1,
} from '@/cards/data/sourced-decks.v1'
import sourceSnapshot from '@/cards/data/source-selected.250339.json' with { type: 'json' }
import { CARD_DEFINITIONS_V1, getCardDefinition } from '@/cards/registry'

const excludedMechanics = ['SECRET', 'QUEST', 'LOCATION', 'TITAN', 'DORMANT', 'TRADEABLE', 'SILENCE', 'TRANSFORM']

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
    expect(getCardDefinition('SCH_514').classes).toEqual(['PRIEST', 'WARLOCK'])
  })

  it('registers every hero and card from the dated standard and wild source decks', () => {
    expect(CARD_CATALOG_CUTOFF_V1).toBe('2026-08-31')
    expect(CARD_CATALOG_CUTOFF_SOURCE_V1.sourceUrl).toContain('hearthstone.blizzard.com')
    expect(SOURCED_DECKS_V1).toHaveLength(11)
    expect(sourceSnapshot.sourcedDecks).toEqual(SOURCED_DECKS_V1)
    expect(new Set(SOURCED_DECKS_V1.map((deck) => deck.ownerClass))).toEqual(new Set([
      'DEATHKNIGHT', 'DEMONHUNTER', 'DRUID', 'HUNTER', 'MAGE', 'PALADIN',
      'PRIEST', 'ROGUE', 'SHAMAN', 'WARLOCK', 'WARRIOR',
    ]))
    expect(new Set(SOURCED_DECKS_V1.map((deck) => deck.format))).toEqual(new Set(['STANDARD', 'WILD']))
    expect(SOURCED_CARD_IDS_V1).toHaveLength(219)
    expect(new Set(SOURCED_CARD_IDS_V1).size).toBe(SOURCED_CARD_IDS_V1.length)
    for (const cardId of SOURCED_CARD_IDS_V1) expect(getCardDefinition(cardId)).toBeDefined()
    for (const deck of SOURCED_DECKS_V1) {
      expect([30, 40]).toContain(deck.cardIds.length)
      expect(deck.sourceDate <= CARD_CATALOG_CUTOFF_V1).toBe(true)
      expect(getCardDefinition(deck.heroId)).toMatchObject({ type: 'HERO', cardClass: deck.ownerClass })
      expect(getCardDefinition(deck.heroPowerId)).toMatchObject({
        type: 'HERO_POWER',
        classes: expect.arrayContaining([deck.ownerClass]),
      })
      for (const cardId of deck.cardIds) {
        const card = getCardDefinition(cardId)
        expect(card.classes.includes('NEUTRAL') || card.classes.includes(deck.ownerClass)).toBe(true)
      }
      for (const sideboard of deck.sideboards) {
        expect(deck.cardIds).toContain(sideboard.ownerCardId)
        for (const cardId of sideboard.cardIds) expect(getCardDefinition(cardId).collectible).toBe(true)
      }
    }
  })

  it('keeps fallback evidence for the six unavailable source pages', () => {
    const expectedEvidence = new Map([
      ['standard-firestone-egg-death-knight-v1', 'https://hsreplay.net/decks/2Yz13CIhhcZEfY9Fw75U9f/'],
      ['wild-firestone-mill-druid-v1', 'https://hsreplay.net/decks/DGS5jsfZlvkLV1zZa5iq1f/'],
      ['wild-firestone-renathal-reno-hunter-v1', 'https://hsreplay.net/decks/0ZH6UjWYHFtqH7wFaq36Dh/'],
      ['standard-firestone-aura-paladin-v1', 'https://hsreplay.net/decks/gpwpBBtnoFNo67786XwgNf/'],
      ['standard-firestone-control-rogue-v1', 'https://hsreplay.net/decks/QDPCy0ZMusj50EJkbwlHuh/'],
      ['standard-firestone-menagerie-shaman-v1', 'https://hsreplay.net/decks/m6Yl6wdsRfTO8MIOunnIxh/'],
    ])

    const evidenceDecks = SOURCED_DECKS_V1.filter((deck) => deck.sourceEvidence)
    expect(evidenceDecks.map((deck) => deck.id)).toEqual([...expectedEvidence.keys()])
    for (const deck of evidenceDecks) {
      expect(deck.sourceEvidence).toMatchObject({
        provider: 'HSReplay',
        checkedAt: '2026-09-02',
        scope: 'DECK_CODE_AND_CARD_LIST',
        url: expectedEvidence.get(deck.id),
        deckCodeUrl: `https://hsreplay.net/decks/${encodeURIComponent(deck.deckCode)}/`,
      })
    }
  })

  it('keeps singular and multi-class data internally consistent', () => {
    for (const card of Object.values(CARD_DEFINITIONS_V1)) {
      expect(card.classes).toContain(card.cardClass)
    }
  })

  it('keeps unsupported mechanics out while preserving supported combat keywords', () => {
    for (const card of Object.values(CARD_DEFINITIONS_V1)) {
      for (const mechanic of excludedMechanics) expect(card.keywords).not.toContain(mechanic)
    }
    expect(getCardDefinition('HERO_11bpt').keywords).toContain('CHARGE')
    expect(getCardDefinition('DINO_136t').keywords).toContain('RUSH')
    expect(getCardDefinition('CORE_ICC_038').keywords).toContain('DIVINE_SHIELD')
    expect(getCardDefinition('CATA_153').keywords).toContain('WINDFURY')
    expect(getCardDefinition('CORE_CS2_024').keywords).toContain('FREEZE')
    expect(getCardDefinition('JAIL_441').keywords).toContain('LIFESTEAL')
    expect(getCardDefinition('TLC_522').keywords).toContain('STEALTH')
    expect(getCardDefinition('SCH_427').keywords).toContain('OVERLOAD')
  })
})
