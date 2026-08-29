export type CardDefinitionId = string
export type CardClass = 'MAGE' | 'WARRIOR' | 'NEUTRAL'
export type CardType = 'MINION' | 'SPELL' | 'WEAPON' | 'HERO' | 'HERO_POWER'
export type Keyword = 'MANATHIRST' | 'POISONOUS' | 'ELUSIVE' | 'DISCOVER' | 'MAGNETIC' | 'TAUNT' | 'DEATHRATTLE'
export type Race = 'BEAST' | 'DRAGON' | 'ELEMENTAL' | 'MECHANICAL' | 'MURLOC' | 'NAGA' | 'UNDEAD'
export type TargetingMode = 'NONE' | 'ANY_CHARACTER' | 'ANY_MINION' | 'ENEMY_DAMAGED_MINION'

export type EffectExecutorId =
  | 'NONE'
  | 'DIRECT_DAMAGE'
  | 'DRAW'
  | 'DAMAGE_AND_DISCOVER_SPELL'
  | 'BATTLECRY_DAMAGE'
  | 'SUMMON_TOKEN'
  | 'DAMAGE_AND_ARMOR'
  | 'ARMOR_AND_DRAW'
  | 'EQUIP_WEAPON'
  | 'DAMAGE_ALL_MINIONS'
  | 'TEMPORARY_HERO_ATTACK'
  | 'DESTROY_DAMAGED_MINION'
  | 'HEAL_FRIENDLY_CHARACTERS'
  | 'GAIN_ARMOR'
  | 'DAMAGE_ALL_OTHER_MINIONS'
  | 'DEATHRATTLE_DAMAGE_ENEMY_HERO'
  | 'DEATHRATTLE_SUMMON_TOKEN'
  | 'HERO_POWER_DAMAGE'
  | 'HERO_POWER_ARMOR'
  | 'TEMPORARY_MANA'

export type CardDefinitionV1 = {
  id: CardDefinitionId
  dbfId: number
  name: string
  cost: number
  attack: number
  health: number
  durability: number
  type: CardType
  cardClass: CardClass
  rarity: string
  set: string
  text: string
  collectible: boolean
  keywords: Keyword[]
  races: Race[]
  effect: EffectExecutorId
  effectValue: number
  secondaryValue: number
  manathirstThreshold: number
  tokenCardId: CardDefinitionId | null
  targeting: TargetingMode
  assetId: string
}
