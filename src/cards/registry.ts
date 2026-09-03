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
  HERO_11bp: { effect: 'SUMMON_TOKEN', tokenCardId: 'HERO_11bpt' },
  HERO_10bp: { effect: 'TEMPORARY_HERO_ATTACK', effectValue: 1 },
  HERO_06bp: { effect: 'TEMPORARY_HERO_ATTACK_AND_ARMOR', effectValue: 1, secondaryValue: 1 },
  HERO_05bp: { effect: 'HERO_POWER_DAMAGE', effectValue: 2, targeting: 'ENEMY_HERO' },
  HERO_04bp: { effect: 'SUMMON_TOKEN', tokenCardId: 'CS2_101t' },
  HERO_09bp: { effect: 'HEAL_CHARACTER', effectValue: 2, targeting: 'ANY_CHARACTER' },
  HERO_03bp: { effect: 'EQUIP_TOKEN_WEAPON', tokenCardId: 'CS2_082' },
  HERO_02bp: { effect: 'SUMMON_RANDOM_BASIC_TOTEM' },
  HERO_07bp: { effect: 'DRAW_AND_DAMAGE_SELF', effectValue: 1, secondaryValue: 2 },
  CORE_EX1_169: { effect: 'TEMPORARY_MANA', effectValue: 1 },
  EDR_814: { effect: 'DAMAGE_AND_SUMMON_TOKEN', effectValue: 2, tokenCardId: 'EDR_810t', targeting: 'ANY_CHARACTER' },
  JAIL_441: { effect: 'DAMAGE_AND_HEAL_HERO_AND_RESET_POWER', effectValue: 3, targeting: 'ANY_MINION' },
  DINO_410: { effect: 'DEATHRATTLE_SUMMON_TOKEN', tokenCardId: 'DINO_410t2' },
  DINO_410t2: { effect: 'DEATHRATTLE_SUMMON_TOKEN', tokenCardId: 'DINO_410t3' },
  DINO_410t3: { effect: 'DEATHRATTLE_SUMMON_TOKEN', tokenCardId: 'DINO_410t4' },
  DINO_410t4: { effect: 'DEATHRATTLE_SUMMON_TOKEN', tokenCardId: 'DINO_410t5' },
  DINO_410t5: { effect: 'DEATHRATTLE_SUMMON_TOKEN', tokenCardId: 'DINO_410t' },
  DINO_136: { effect: 'SUMMON_TOKENS', effectValue: 3, tokenCardId: 'DINO_136t' },
  JAIL_891: { effect: 'DAMAGE_AND_ADD_CARD_IF_DEAD', effectValue: 3, tokenCardId: 'JAIL_732', targeting: 'ANY_MINION' },
  JAIL_733: { effect: 'DEATHRATTLE_ADD_CARD', tokenCardId: 'JAIL_732' },
  EX1_173: { effect: 'DAMAGE_AND_DRAW', effectValue: 5, secondaryValue: 1, targeting: 'ANY_CHARACTER' },
  CS2_012: { effect: 'DAMAGE_AND_SPLASH', effectValue: 4, secondaryValue: 1, targeting: 'ENEMY_CHARACTER' },
  WC_007: { effect: 'GRANT_POISONOUS', targeting: 'FRIENDLY_BEAST' },
  LOE_011: { effect: 'HEAL_HERO', effectValue: 30 },
  CATA_479: { effect: 'SUMMON_TOKENS_AND_BUFF', effectValue: 2, secondaryValue: 1, tokenCardId: 'CATA_479t3' },
  JAIL_516: { effect: 'SUMMON_CHEAP_DECK_MINIONS_RUSH' },
  CATA_302: { effect: 'HEAL_TARGET_AND_DRAW', effectValue: 999, secondaryValue: 1, targeting: 'FRIENDLY_MINION' },
  CORE_BAR_311: { effect: 'DAMAGE_SPLIT_ENEMY_MINIONS_AND_HEAL_HERO', effectValue: 4 },
  CORE_CS2_072: { effect: 'DIRECT_DAMAGE', effectValue: 2, targeting: 'UNHURT_ENEMY_MINION' },
  JAIL_457: { effect: 'BUFF_OTHER_FRIENDLY_MINIONS', effectValue: 1, secondaryValue: 1 },
  CATA_153: { effect: 'SUMMON_TOKENS', effectValue: 2, tokenCardId: 'CATA_153t' },
  CORE_UNG_809: { effect: 'ADD_TOKEN_CARD', tokenCardId: 'UNG_809t1' },
  TLC_515: { effect: 'DISCOVER_CARD' },
  JAIL_503: { effect: 'EQUIP_WEAPON' },
  LOOT_014: { effect: 'DRAW_AND_DAMAGE_SELF', effectValue: 1, secondaryValue: 2 },
  BOT_568: { effect: 'DRAW', effectValue: 3 },
  MIS_703: { effect: 'SET_HERO_HEALTH', effectValue: 15 },
  EDR_456: { effect: 'DISCOVER_CARD' },
  TLC_600: { effect: 'DAMAGE_ENEMY_HERO_AND_ARMOR', effectValue: 5, secondaryValue: 5 },
  GAME_005: { effect: 'TEMPORARY_MANA', effectValue: 1 },
}

const supportedKeywords = new Set<Keyword>([
  'MANATHIRST', 'POISONOUS', 'ELUSIVE', 'DISCOVER', 'MAGNETIC', 'TAUNT', 'DEATHRATTLE', 'CHARGE', 'RUSH', 'DIVINE_SHIELD', 'WINDFURY',
])
const supportedRaces = new Set<Race>(['BEAST', 'DRAGON', 'ELEMENTAL', 'MECHANICAL', 'MURLOC', 'NAGA', 'UNDEAD'])
const supportedTypes = new Set<CardType>(['MINION', 'SPELL', 'WEAPON', 'HERO', 'HERO_POWER', 'LOCATION'])
const supportedClasses = new Set<CardClass>([
  'DEATHKNIGHT', 'DEMONHUNTER', 'DRUID', 'HUNTER', 'MAGE', 'PALADIN',
  'PRIEST', 'ROGUE', 'SHAMAN', 'WARLOCK', 'WARRIOR', 'NEUTRAL',
])

function requireCardType(value: string): CardType {
  if (!supportedTypes.has(value as CardType)) throw new Error(`UNSUPPORTED_CARD_TYPE:${value}`)
  return value as CardType
}

function requireCardClass(value: string | undefined): CardClass {
  const resolved = value ?? 'NEUTRAL'
  if (!supportedClasses.has(resolved as CardClass)) throw new Error(`UNSUPPORTED_CARD_CLASS:${resolved}`)
  return resolved as CardClass
}

function requireCardClasses(value: readonly string[] | undefined, fallback: CardClass): CardClass[] {
  const candidates = value && value.length > 0 ? value : [fallback]
  return [...new Set(candidates.map((candidate) => requireCardClass(candidate)))]
}

function createDefinition(source: (typeof SELECTED_CARD_SOURCE_V1)[number]): CardDefinitionV1 {
  const override = effects[source.id] ?? { effect: 'NONE' as const }
  const keywords = (source.mechanics ?? []).filter((value): value is Keyword => supportedKeywords.has(value as Keyword))
  const races = (source.races ?? []).filter((value): value is Race => supportedRaces.has(value as Race))
  const durability = source.type === 'WEAPON' ? (source.health ?? source.durability ?? 0) : (source.durability ?? 0)
  const type = requireCardType(source.type)
  const fallbackCardClass = requireCardClass(source.cardClass)
  const classes = requireCardClasses(source.classes, fallbackCardClass)
  const cardClass = source.cardClass === undefined ? (classes[0] ?? fallbackCardClass) : fallbackCardClass

  return {
    id: source.id,
    dbfId: source.dbfId,
    name: source.name,
    cost: source.cost ?? 0,
    attack: source.attack ?? 0,
    health: source.health ?? 0,
    durability,
    type,
    cardClass,
    classes,
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
    assetId: `${type === 'HERO' ? 'hero' : type === 'HERO_POWER' ? 'hero_power' : 'card'}:${source.id}`,
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
