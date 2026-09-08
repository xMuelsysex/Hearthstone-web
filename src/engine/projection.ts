import { getCardDefinition } from '@/cards/registry'
import type { CardDefinitionId } from '@/cards/types'
import { getLegalActions, type LegalActionDependencies } from '@/engine/legalActions'
import { getEntity, otherPlayer, type AuthoritativeSessionStateV1, type EntityId, type PlayerId } from '@/engine/state'

export type PublicEntityViewModel = {
  id: EntityId
  definitionId: string
  cost: number
  name: string
  assetPath: string
  attack: number
  health: number
  maxHealth: number
  armor: number
  durability: number
  exhausted: boolean
  keywords: string[]
  controllerId: PlayerId
}

export type HiddenCardViewModel = { id: EntityId; hidden: true }

export type PlayerViewModel = {
  viewerId: PlayerId
  turn: number
  phase: string
  activePlayerId: PlayerId
  winnerId: PlayerId | null
  endReason: string | null
  pendingDecision: { kind: string; choiceDefinitionIds?: CardDefinitionId[] } | null
  self: {
    hero: PublicEntityViewModel
    heroPower: PublicEntityViewModel
    weapon: PublicEntityViewModel | null
    hand: PublicEntityViewModel[]
    board: PublicEntityViewModel[]
    deckCount: number
    mana: { maximum: number; current: number; temporary: number }
  }
  opponent: {
    hero: PublicEntityViewModel
    heroPower: PublicEntityViewModel
    weapon: PublicEntityViewModel | null
    hand: HiddenCardViewModel[]
    board: PublicEntityViewModel[]
    deckCount: number
    mana: { maximum: number; current: number; temporary: number }
  }
  scenario: AuthoritativeSessionStateV1['scenario']
}

function publicEntity(state: AuthoritativeSessionStateV1, id: EntityId): PublicEntityViewModel {
  const entity = getEntity(state.game, id)
  const card = getCardDefinition(entity.definitionId)
  return {
    id,
    definitionId: entity.definitionId,
    cost: entity.cost ?? card.cost,
    name: card.name,
    assetPath: `/assets/${card.type === 'HERO' ? 'heroes' : card.type === 'HERO_POWER' ? 'hero-powers' : 'cards'}/${card.id}.png`,
    attack: entity.attack,
    health: entity.health,
    maxHealth: entity.maxHealth,
    armor: entity.armor,
    durability: entity.durability,
    exhausted: entity.exhausted,
    keywords: [...entity.keywords],
    controllerId: entity.controllerId,
  }
}

export function projectPlayerView(state: AuthoritativeSessionStateV1, viewerId: PlayerId): PlayerViewModel {
  const self = state.game.players[viewerId]
  const opponent = state.game.players[otherPlayer(viewerId)]
  const decision = state.game.pendingDecision
  return {
    viewerId,
    turn: state.game.turn,
    phase: state.game.phase,
    activePlayerId: state.game.activePlayerId,
    winnerId: state.game.winnerId,
    endReason: state.game.endReason,
    pendingDecision: decision === null ? null : decision.kind === 'DISCOVER' && decision.actorId === viewerId ? { kind: decision.kind, choiceDefinitionIds: [...decision.choiceDefinitionIds] } : { kind: decision.kind },
    self: {
      hero: publicEntity(state, self.heroEntityId),
      heroPower: publicEntity(state, self.heroPowerEntityId),
      weapon: self.weaponEntityId === null ? null : publicEntity(state, self.weaponEntityId),
      hand: self.hand.map((id) => publicEntity(state, id)),
      board: self.board.map((id) => publicEntity(state, id)),
      deckCount: self.deck.length,
      mana: { ...self.mana },
    },
    opponent: {
      hero: publicEntity(state, opponent.heroEntityId),
      heroPower: publicEntity(state, opponent.heroPowerEntityId),
      weapon: opponent.weaponEntityId === null ? null : publicEntity(state, opponent.weaponEntityId),
      hand: opponent.hand.map((id) => ({ id, hidden: true as const })),
      board: opponent.board.map((id) => publicEntity(state, id)),
      deckCount: opponent.deck.length,
      mana: { ...opponent.mana },
    },
    scenario: structuredClone(state.scenario),
  }
}

export function projectLegalActions(state: AuthoritativeSessionStateV1, viewerId: PlayerId, dependencies: LegalActionDependencies = {}) {
  return getLegalActions(state, viewerId, dependencies)
}
