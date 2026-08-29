import { MAGE_DECK_V1, WARRIOR_DECK_V1 } from '@/cards/data/decks.v1'
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

export function validateDeck(deck: DeckDefinitionV1): string[] {
  const errors: string[] = []
  const counts = new Map<CardDefinitionId, number>()
  if (deck.cards.length !== 30) errors.push(`DECK_SIZE:${deck.cards.length}`)

  for (const cardId of deck.cards) {
    const card = getCardDefinition(cardId)
    counts.set(cardId, (counts.get(cardId) ?? 0) + 1)
    if (!card.collectible) errors.push(`NON_COLLECTIBLE:${cardId}`)
    if (card.cardClass !== 'NEUTRAL' && card.cardClass !== deck.ownerClass) {
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
