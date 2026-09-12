import type { CardDefinitionId, CardType, Keyword, Race } from '@/cards/types'
import type { ScenarioStateV1 } from '@/scenarios/state'

export const RULES_VERSION = 'm1-rules-v1' as const
export const RNG_ALGORITHM_VERSION = 'mulberry32-v1' as const

export type PlayerId = 'PLAYER' | 'OPPONENT'
export type EntityId = number
export type CommandId = string
export type DecisionId = string
export type EntityZone = 'DECK' | 'HAND' | 'BOARD' | 'GRAVEYARD' | 'HERO' | 'HERO_POWER' | 'WEAPON' | 'ATTACHED' | 'SET_ASIDE'
export type GamePhase = 'MULLIGAN' | 'PLAY' | 'GAME_OVER'
export type EndReason = 'CONCEDE' | 'HERO_DEFEATED'

export type RngStateV1 = {
  algorithm: typeof RNG_ALGORITHM_VERSION
  seed: number
  state: number
  cursor: number
}

export type GameEntityV1 = {
  id: EntityId
  definitionId: CardDefinitionId
  /** 当前有效费用；旧日志快照缺失时由兼容路径按卡牌定义读取。 */
  cost?: number
  ownerId: PlayerId
  controllerId: PlayerId
  zone: EntityZone
  type: CardType
  createdSequence: number
  attack: number
  health: number
  maxHealth: number
  armor: number
  durability: number
  exhausted: boolean
  /** True only during the turn a rush/charge minion was summoned. */
  summonedThisTurn?: boolean
  /** Remaining attacks in the current turn; windfury starts with two. */
  attacksRemaining?: number
  /** Base stats retained only after a stat enchantment so silence can remove it. */
  baseAttack?: number
  baseMaxHealth?: number
  /** A frozen character cannot attack until its controller's next turn starts. */
  frozen?: boolean
  /** Immune prevents damage for the current turn. */
  immune?: boolean
  poisonousLethal: boolean
  destroyMarked: boolean
  deathrattleResolved: boolean
  keywords: Keyword[]
  races: Race[]
  attachedCardIds: EntityId[]
}

export type ManaStateV1 = {
  maximum: number
  current: number
  temporary: number
}

export type PlayerStateV1 = {
  id: PlayerId
  heroEntityId: EntityId
  heroPowerEntityId: EntityId
  deck: EntityId[]
  hand: EntityId[]
  board: EntityId[]
  graveyard: EntityId[]
  weaponEntityId: EntityId | null
  mana: ManaStateV1
  fatigue: number
  heroPowerUsed: boolean
  mulliganConfirmed: boolean
  /** Number of cards played by this player during the current turn. */
  cardsPlayedThisTurn?: number
  /** Crystals locked by overload for the next turn. */
  overloadLocked?: number
}

export type MulliganDecisionV1 = {
  kind: 'MULLIGAN'
  waitingFor: PlayerId[]
}

export type DiscoverDecisionV1 = {
  kind: 'DISCOVER'
  decisionId: DecisionId
  actorId: PlayerId
  sourceEntityId: EntityId
  choiceDefinitionIds: CardDefinitionId[]
}

export type PendingDecisionV1 = MulliganDecisionV1 | DiscoverDecisionV1

export type GameStateV1 = {
  version: 1
  rulesVersion: typeof RULES_VERSION
  phase: GamePhase
  turn: number
  activePlayerId: PlayerId
  startingPlayerId: PlayerId
  winnerId: PlayerId | null
  endReason: EndReason | null
  players: Record<PlayerId, PlayerStateV1>
  entities: Record<string, GameEntityV1>
  pendingDecision: PendingDecisionV1 | null
  rng: RngStateV1
  nextEntityId: number
  nextEventSequence: number
  nextBatchSequence: number
}

export type AuthoritativeSessionStateV1 = {
  game: GameStateV1
  scenario: ScenarioStateV1
}

export function otherPlayer(playerId: PlayerId): PlayerId {
  return playerId === 'PLAYER' ? 'OPPONENT' : 'PLAYER'
}

export function getEntity(state: GameStateV1, entityId: EntityId): GameEntityV1 {
  const entity = state.entities[String(entityId)]
  if (!entity) throw new Error(`UNKNOWN_ENTITY:${entityId}`)
  return entity
}

export function cloneSessionState(state: AuthoritativeSessionStateV1): AuthoritativeSessionStateV1 {
  return structuredClone(state)
}
