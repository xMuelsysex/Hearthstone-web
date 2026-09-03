import { MAGE_DECK_V1, WARRIOR_DECK_V1 } from '@/cards/data/decks.v1'
import {
  SOURCED_CARD_IDS_V1 as SOURCED_CARD_IDS_SOURCE_V1,
  SOURCED_DECKS_V1 as SOURCED_DECKS_SOURCE_V1,
} from '@/cards/data/sourced-decks.v1'
import { getCardDefinition } from '@/cards/registry'
import type { CardClass, CardDefinitionId } from '@/cards/types'

export type DeckDefinitionV1 = {
  id: 'mage-showcase-v1' | 'warrior-tavern-v1'
  ownerClass: Exclude<CardClass, 'NEUTRAL'>
  cards: readonly CardDefinitionId[]
}

export const DECKS_V1: readonly DeckDefinitionV1[] = [
  { id: 'mage-showcase-v1', ownerClass: 'MAGE', cards: MAGE_DECK_V1 },
  { id: 'warrior-tavern-v1', ownerClass: 'WARRIOR', cards: WARRIOR_DECK_V1 },
]

export type ShowcaseDeckDefinitionV1 = {
  id: string
  name: string
  format?: SourcedDeckFormatV1
  ownerClass: Exclude<CardClass, 'NEUTRAL'>
  cards: readonly CardDefinitionId[]
  heroId: CardDefinitionId
  heroPowerId: CardDefinitionId
  signatureCardIds: readonly CardDefinitionId[]
}

const SIGNATURE_CARD_IDS_BY_CLASS: Record<Exclude<CardClass, 'NEUTRAL'>, readonly CardDefinitionId[]> = {
  DEATHKNIGHT: ['JAIL_441', 'EDR_814', 'DINO_410'],
  DEMONHUNTER: ['DINO_136', 'JAIL_891', 'JAIL_733'],
  DRUID: ['EX1_173', 'CS2_012', 'CORE_EX1_169'],
  HUNTER: ['WC_007', 'LOE_011', 'AV_113'],
  MAGE: ['RLK_843', 'BAR_541', 'DRG_066'],
  PALADIN: ['CATA_479', 'JAIL_516', 'CORE_ICC_038'],
  PRIEST: ['CATA_302', 'CORE_BAR_311', 'TLC_817'],
  ROGUE: ['CORE_CS2_072', 'TLC_515', 'JAIL_503'],
  SHAMAN: ['JAIL_457', 'CATA_153', 'CORE_UNG_809'],
  WARLOCK: ['LOOT_014', 'BOT_568', 'MIS_703'],
  WARRIOR: ['EDR_456', 'TLC_600', 'JAIL_421'],
}

const MAGE_SHOWCASE_DECK: ShowcaseDeckDefinitionV1 = {
  id: 'mage-showcase-v1',
  name: '法师·展示战演示牌组',
  ownerClass: 'MAGE',
  cards: MAGE_DECK_V1,
  heroId: 'HERO_08',
  heroPowerId: 'HERO_08bp',
  signatureCardIds: SIGNATURE_CARD_IDS_BY_CLASS.MAGE,
}

const sourcedShowcaseDecks = SOURCED_DECKS_SOURCE_V1
  .filter((deck) => deck.ownerClass !== 'MAGE')
  .map((deck): ShowcaseDeckDefinitionV1 => ({
    id: deck.id,
    name: deck.name,
    format: deck.format,
    ownerClass: deck.ownerClass,
    cards: deck.cardIds,
    heroId: deck.heroId,
    heroPowerId: deck.heroPowerId,
    signatureCardIds: SIGNATURE_CARD_IDS_BY_CLASS[deck.ownerClass],
  }))

export const SHOWCASE_DECKS_V1: readonly ShowcaseDeckDefinitionV1[] = [
  MAGE_SHOWCASE_DECK,
  ...sourcedShowcaseDecks,
]

export function getShowcaseDeck(ownerClass: Exclude<CardClass, 'NEUTRAL'>): ShowcaseDeckDefinitionV1 {
  const deck = SHOWCASE_DECKS_V1.find((candidate) => candidate.ownerClass === ownerClass)
  if (!deck) throw new Error(`SHOWCASE_DECK_NOT_FOUND:${ownerClass}`)
  return deck
}

export type SourcedDeckFormatV1 = 'STANDARD' | 'WILD'

export type SourcedDeckEvidenceV1 = {
  provider: 'HSReplay'
  url: string
  deckCodeUrl: string
  checkedAt: string
  scope: 'DECK_CODE_AND_CARD_LIST'
}

export type SourcedDeckDefinitionV1 = {
  id: string
  name: string
  format: SourcedDeckFormatV1
  ownerClass: Exclude<CardClass, 'NEUTRAL'>
  sourceDate: string
  sourceName: string
  sourceUrl: string
  sourceEvidence?: SourcedDeckEvidenceV1
  deckCode: string
  heroId: CardDefinitionId
  heroPowerId: CardDefinitionId
  cardIds: readonly CardDefinitionId[]
  sideboards: readonly {
    ownerCardId: CardDefinitionId
    cardIds: readonly CardDefinitionId[]
  }[]
}

export const SOURCED_CARD_IDS_V1 = SOURCED_CARD_IDS_SOURCE_V1
export const SOURCED_DECKS_V1: readonly SourcedDeckDefinitionV1[] = SOURCED_DECKS_SOURCE_V1

export function validateDeck(deck: DeckDefinitionV1): string[] {
  const errors: string[] = []
  const counts = new Map<CardDefinitionId, number>()
  if (deck.cards.length !== 30) errors.push(`DECK_SIZE:${deck.cards.length}`)

  for (const cardId of deck.cards) {
    const card = getCardDefinition(cardId)
    counts.set(cardId, (counts.get(cardId) ?? 0) + 1)
    if (!card.collectible) errors.push(`NON_COLLECTIBLE:${cardId}`)
    if (!card.classes.includes('NEUTRAL') && !card.classes.includes(deck.ownerClass)) {
      errors.push(`WRONG_CLASS:${cardId}`)
    }
  }

  for (const [cardId, count] of counts) {
    const card = getCardDefinition(cardId)
    const maximum = card.rarity === 'LEGENDARY' ? 1 : 2
    if (count > maximum) errors.push(`TOO_MANY_COPIES:${cardId}:${count}`)
  }
  return errors
}
