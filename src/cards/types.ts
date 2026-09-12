export type CardDefinitionId = string
export type CardClass = 'DEATHKNIGHT' | 'DEMONHUNTER' | 'DRUID' | 'HUNTER' | 'MAGE' | 'PALADIN' | 'PRIEST' | 'ROGUE' | 'SHAMAN' | 'WARLOCK' | 'WARRIOR' | 'NEUTRAL'
export type CardType = 'MINION' | 'SPELL' | 'WEAPON' | 'HERO' | 'HERO_POWER' | 'LOCATION'
export type Keyword = 'MANATHIRST' | 'POISONOUS' | 'ELUSIVE' | 'DISCOVER' | 'MAGNETIC' | 'TAUNT' | 'DEATHRATTLE' | 'CHARGE' | 'RUSH' | 'DIVINE_SHIELD' | 'WINDFURY' | 'STEALTH' | 'LIFESTEAL' | 'REBORN' | 'IMMUNE' | 'FREEZE' | 'SPELLPOWER' | 'OVERLOAD' | 'COMBO'
export type Race = 'BEAST' | 'DRAGON' | 'ELEMENTAL' | 'MECHANICAL' | 'MURLOC' | 'NAGA' | 'UNDEAD'
export type TargetingMode = 'NONE' | 'ANY_CHARACTER' | 'FRIENDLY_CHARACTER' | 'ENEMY_CHARACTER' | 'ANY_MINION' | 'ENEMY_DAMAGED_MINION' | 'ENEMY_HERO' | 'FRIENDLY_MINION' | 'FRIENDLY_BEAST' | 'UNHURT_ENEMY_MINION'

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
  | 'DRAW_AND_DAMAGE_SELF'
  | 'SUMMON_TOKENS'
  | 'DAMAGE_AND_SUMMON_TOKEN'
  | 'DAMAGE_AND_SPLASH'
  | 'DAMAGE_ALL_ENEMY_MINIONS_AND_HEAL_HERO'
  | 'DAMAGE_SPLIT_ENEMY_MINIONS_AND_HEAL_HERO'
  | 'DAMAGE_ENEMY_HERO_AND_ARMOR'
  | 'DAMAGE_AND_DRAW'
  | 'DAMAGE_AND_HEAL_HERO'
  | 'DAMAGE_AND_HEAL_HERO_AND_RESET_POWER'
  | 'DAMAGE_AND_ADD_CARD_IF_DEAD'
  | 'DEATHRATTLE_ADD_CARD'
  | 'HEAL_HERO'
  | 'HEAL_CHARACTER'
  | 'SET_HERO_HEALTH'
  | 'HEAL_TARGET_AND_DRAW'
  | 'BUFF_OTHER_FRIENDLY_MINIONS'
  | 'GRANT_POISONOUS'
  | 'SUMMON_TOKENS_AND_BUFF'
  | 'SUMMON_CHEAP_DECK_MINIONS_RUSH'
  | 'EQUIP_TOKEN_WEAPON'
  | 'SUMMON_RANDOM_BASIC_TOTEM'
  | 'ADD_TOKEN_CARD'
  | 'DISCOVER_CARD'
  | 'TEMPORARY_HERO_ATTACK_AND_ARMOR'
  | 'DAMAGE_AND_FREEZE'
  | 'FREEZE_CHARACTER'
  | 'SILENCE_OTHER_MINIONS'
  | 'SILENCE_MINION'
  | 'BUFF_AND_GRANT_REBORN_TAUNT'
  | 'GRANT_IMMUNITY_AND_ATTACK_ALL'
  | 'MANA_RESTORE_AND_OVERLOAD'
  | 'COMBO_DAMAGE'
  | 'FAN_OF_KNIVES'
  | 'DEATHRATTLE_DRAW'

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
  classes: CardClass[]
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
  battlecryEffect: EffectExecutorId | null
  comboEffect: EffectExecutorId | null
  deathrattleEffect: EffectExecutorId | null
  assetId: string
}
