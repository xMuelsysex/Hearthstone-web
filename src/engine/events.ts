import type { CardDefinitionId, Keyword } from '@/cards/types'
import type { CommandId, DecisionId, EndReason, EntityId, GameEntityV1, PlayerId, RngStateV1 } from '@/engine/state'
import type { ScenarioEventV1 } from '@/scenarios/events'

export type DamageReason = 'COMBAT' | 'SPELL' | 'HERO_POWER' | 'BATTLECRY' | 'DEATHRATTLE' | 'FATIGUE' | 'AREA'
export type DeathReason = 'HEALTH' | 'POISONOUS' | 'DESTROY'

export type DamagePacketV1 = {
  sourceEntityId: EntityId | null
  targetEntityId: EntityId
  amount: number
  poisonous: boolean
  reason: DamageReason
}

export type DomainEventV1 =
  | { type: 'COMMAND_ACCEPTED'; commandId: CommandId; actorId: PlayerId; commandType: string }
  | { type: 'MULLIGAN_CONFIRMED'; actorId: PlayerId; replacedEntityIds: EntityId[]; drawnEntityIds: EntityId[]; deckOrder: EntityId[]; rng: RngStateV1 }
  | { type: 'MULLIGAN_PHASE_COMPLETED' }
  | { type: 'TURN_ENDED'; actorId: PlayerId }
  | { type: 'TURN_STARTED'; actorId: PlayerId; turn: number }
  | { type: 'CARD_DRAWN'; actorId: PlayerId; entityId: EntityId; burned: boolean }
  | { type: 'FATIGUE_INCREASED'; actorId: PlayerId; amount: number }
  | { type: 'CARD_PLAYED'; actorId: PlayerId; entityId: EntityId; manaCost: number; destination: 'BOARD' | 'GRAVEYARD' | 'SET_ASIDE'; placementIndex: number | null }
  | { type: 'MANATHIRST_BONUS_APPLIED'; sourceEntityId: EntityId; threshold: number; value: number }
  | { type: 'ATTACK_DECLARED'; actorId: PlayerId; sourceEntityId: EntityId; targetEntityId: EntityId }
  | { type: 'HERO_POWER_USED'; actorId: PlayerId; heroPowerEntityId: EntityId; manaCost: number }
  | { type: 'DAMAGE_BATCH_APPLIED'; packets: DamagePacketV1[] }
  | { type: 'MINION_MARKED_DESTROYED'; entityId: EntityId }
  | { type: 'MINION_DEATH_BATCH'; deaths: Array<{ entityId: EntityId; reason: DeathReason }> }
  | { type: 'DEATHRATTLE_TRIGGERED'; entityId: EntityId }
  | { type: 'MINION_SUMMONED'; actorId: PlayerId; entity: GameEntityV1; placementIndex: number }
  | { type: 'ARMOR_GAINED'; actorId: PlayerId; amount: number }
  | { type: 'CHARACTER_HEALED'; targetEntityId: EntityId; amount: number }
  | { type: 'TEMPORARY_HERO_ATTACK_GAINED'; actorId: PlayerId; amount: number }
  | { type: 'TEMPORARY_MANA_GAINED'; actorId: PlayerId; amount: number }
  | { type: 'WEAPON_EQUIPPED'; actorId: PlayerId; entityId: EntityId; replacedEntityId: EntityId | null }
  | { type: 'WEAPON_DURABILITY_LOST'; actorId: PlayerId; entityId: EntityId; amount: number; destroyed: boolean }
  | { type: 'DISCOVER_OFFERED'; actorId: PlayerId; sourceEntityId: EntityId; decisionId: DecisionId; choiceDefinitionIds: CardDefinitionId[]; rng: RngStateV1 }
  | { type: 'DISCOVER_RESOLVED'; actorId: PlayerId; decisionId: DecisionId; choiceDefinitionId: CardDefinitionId; entity: GameEntityV1; burned: boolean }
  | { type: 'MAGNETIC_MERGED'; actorId: PlayerId; sourceEntityId: EntityId; targetEntityId: EntityId; attackGain: number; healthGain: number; inheritedKeywords: Keyword[] }
  | { type: 'GAME_CONCEDED'; actorId: PlayerId }
  | { type: 'GAME_ENDED'; winnerId: PlayerId; endReason: EndReason }

export type RecordedEventV1 =
  | { scope: 'GAME'; payload: DomainEventV1 }
  | { scope: 'SCENARIO'; payload: ScenarioEventV1 }
