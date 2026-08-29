import { SELECTED_CARD_SOURCE_V1 } from '@/cards/data/cards.v1'
import type { CardClass, CardDefinitionId, CardDefinitionV1, CardType, EffectExecutorId, Keyword, Race } from '@/cards/types'

const effects: Record<string, Partial<CardDefinitionV1> & { effect: EffectExecutorId }> = {
  RLK_843: { effect: 'DIRECT_DAMAGE', effectValue: 2, secondaryValue: 3, manathirstThreshold: 8, targeting: 'ANY_CHARACTER' },
  BAR_541: { effect: 'DAMAGE_AND_DISCOVER_SPELL', effectValue: 2, targeting: 'ANY_CHARACTER' },
  CS2_029: { effect: 'DIRECT_DAMAGE', effectValue: 6, targeting: 'ANY_CHARACTER' },
  CS2_023: { effect: 'DRAW', effectValue: 2 },
  CS2_189: { effect: 'BATTLECRY_DAMAGE', effectValue: 1, targeting: 'ANY_CHARACTER' },
  CS2_196: { effect: 'SUMMON_TOKEN', tokenCardId: 'CS2_boar' },
  BT_233: { effect: 'DAMAGE_AND_ARMOR', effectValue: 2, secondaryValue: 2, targeting: 'ANY_MINION' },
  EX1_606: { effect: 'ARMOR_AND_DRAW', effectValue: 5, secondaryValue: 1 },
  CS2_106: { effect: 'EQUIP_WEAPON' },
  EX1_400: { effect: 'DAMAGE_ALL_MINIONS', effectValue: 1 },
  CS2_105: { effect: 'TEMPORARY_HERO_ATTACK', effectValue: 4 },
  CS2_108: { effect: 'DESTROY_DAMAGED_MINION', targeting: 'ENEMY_DAMAGED_MINION' },
  CS2_150: { effect: 'BATTLECRY_DAMAGE', effectValue: 2, targeting: 'ANY_CHARACTER' },
  DS1_055: { effect: 'HEAL_FRIENDLY_CHARACTERS', effectValue: 2 },
  EX1_025: { effect: 'SUMMON_TOKEN', tokenCardId: 'EX1_025t' },
  CORE_GVG_053: { effect: 'GAIN_ARMOR', effectValue: 5 },
  CORE_OG_149: { effect: 'DAMAGE_ALL_OTHER_MINIONS', effectValue: 1 },
  EX1_029: { effect: 'DEATHRATTLE_DAMAGE_ENEMY_HERO', effectValue: 2 },
  EX1_556: { effect: 'DEATHRATTLE_SUMMON_TOKEN', tokenCardId: 'skele21' },
  HERO_08bp: { effect: 'HERO_POWER_DAMAGE', effectValue: 1, targeting: 'ANY_CHARACTER' },
  HERO_01bp: { effect: 'HERO_POWER_ARMOR', effectValue: 2 },
  GAME_005: { effect: 'TEMPORARY_MANA', effectValue: 1 },
}

const supportedKeywords = new Set<Keyword>([
  'MANATHIRST', 'POISONOUS', 'ELUSIVE', 'DISCOVER', 'MAGNETIC', 'TAUNT', 'DEATHRATTLE',
])
const supportedRaces = new Set<Race>(['BEAST', 'DRAGON', 'ELEMENTAL', 'MECHANICAL', 'MURLOC', 'NAGA', 'UNDEAD'])
const supportedTypes = new Set<CardType>(['MINION', 'SPELL', 'WEAPON', 'HERO', 'HERO_POWER'])
const supportedClasses = new Set<CardClass>(['MAGE', 'WARRIOR', 'NEUTRAL'])

function requireCardType(value: string): CardType {
  if (!supportedTypes.has(value as CardType)) throw new Error(`UNSUPPORTED_CARD_TYPE:${value}`)
  return value as CardType
}

function requireCardClass(value: string | undefined): CardClass {
  const resolved = value ?? 'NEUTRAL'
  if (!supportedClasses.has(resolved as CardClass)) throw new Error(`UNSUPPORTED_CARD_CLASS:${resolved}`)
  return resolved as CardClass
}

function createDefinition(source: (typeof SELECTED_CARD_SOURCE_V1)[number]): CardDefinitionV1 {
  const override = effects[source.id] ?? { effect: 'NONE' as const }
  const keywords = (source.mechanics ?? []).filter((value): value is Keyword => supportedKeywords.has(value as Keyword))
  const races = (source.races ?? []).filter((value): value is Race => supportedRaces.has(value as Race))
  const durability = source.type === 'WEAPON' ? (source.health ?? source.durability ?? 0) : (source.durability ?? 0)

  return {
    id: source.id,
    dbfId: source.dbfId,
    name: source.name,
    cost: source.cost ?? 0,
    attack: source.attack ?? 0,
    health: source.health ?? 0,
    durability,
    type: requireCardType(source.type),
    cardClass: requireCardClass(source.cardClass),
    rarity: source.rarity ?? 'FREE',
    set: source.set,
    text: source.text ?? '',
    collectible: source.collectible ?? false,
    keywords,
    races,
    effect: override.effect,
    effectValue: override.effectValue ?? 0,
    secondaryValue: override.secondaryValue ?? 0,
    manathirstThreshold: override.manathirstThreshold ?? 0,
    tokenCardId: override.tokenCardId ?? null,
    targeting: override.targeting ?? 'NONE',
    assetId: `card:${source.id}`,
  }
}

export const CARD_DEFINITIONS_V1 = Object.fromEntries(
  SELECTED_CARD_SOURCE_V1.map((source) => [source.id, createDefinition(source)]),
) as Readonly<Record<CardDefinitionId, CardDefinitionV1>>

export function getCardDefinition(cardId: CardDefinitionId): CardDefinitionV1 {
  const definition = CARD_DEFINITIONS_V1[cardId]
  if (!definition) {
    throw new Error(`UNKNOWN_CARD_DEFINITION:${cardId}`)
  }
  return definition
}
