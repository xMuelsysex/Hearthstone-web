import { MAGE_DECK_V1 } from '@/cards/data/decks.v1'
import { commandFromAction, type LegalActionDescriptor } from '@/engine/commands'
import { getLegalActions } from '@/engine/legalActions'
import { projectPlayerView, type PlayerViewModel } from '@/engine/projection'
import { resolveCommand } from '@/engine/resolveCommand'
import { createGameState } from '@/engine/setup'
import type { AuthoritativeSessionStateV1, PlayerId } from '@/engine/state'
import type { CardDefinitionId } from '@/cards/types'

const RUNTIME_CARD_ID: CardDefinitionId = 'CS2_196'
const RUNTIME_ATTACKER_ID: CardDefinitionId = 'CS2_189'

export type CardPreviewRuntimeModel = {
  view: PlayerViewModel
  canAttack: boolean
  attack(): CardPreviewRuntimeModel
}

function removeEntityFromZones(state: AuthoritativeSessionStateV1, entityId: number): void {
  for (const player of Object.values(state.game.players)) {
    player.deck = player.deck.filter((id) => id !== entityId)
    player.hand = player.hand.filter((id) => id !== entityId)
    player.board = player.board.filter((id) => id !== entityId)
    player.graveyard = player.graveyard.filter((id) => id !== entityId)
    if (player.weaponEntityId === entityId) player.weaponEntityId = null
  }
}

function placeEntityOnBoard(state: AuthoritativeSessionStateV1, ownerId: PlayerId, definitionId: CardDefinitionId): number {
  const entity = Object.values(state.game.entities).find((candidate) => candidate.ownerId === ownerId && candidate.definitionId === definitionId)
  if (!entity) throw new Error(`CARD_PREVIEW_RUNTIME_CARD_MISSING:${ownerId}:${definitionId}`)
  removeEntityFromZones(state, entity.id)
  entity.zone = 'BOARD'
  entity.controllerId = ownerId
  entity.exhausted = false
  entity.summonedThisTurn = false
  entity.attacksRemaining = 1
  state.game.players[ownerId].board.push(entity.id)
  return entity.id
}

function createRuntimeState(): AuthoritativeSessionStateV1 {
  const state = createGameState({
    seed: 249896,
    scenarioId: 'showcase-v1',
    startingPlayerId: 'OPPONENT',
    playerProfile: { heroId: 'HERO_08', heroPowerId: 'HERO_08bp', deck: MAGE_DECK_V1 },
    opponentProfile: { heroId: 'HERO_01', heroPowerId: 'HERO_01bp', deck: MAGE_DECK_V1 },
  })
  state.game.pendingDecision = null
  state.game.phase = 'PLAY'
  state.game.turn = 1
  state.game.activePlayerId = 'OPPONENT'
  state.game.players.PLAYER.mana = { maximum: 10, current: 10, temporary: 0 }
  state.game.players.OPPONENT.mana = { maximum: 10, current: 10, temporary: 0 }
  placeEntityOnBoard(state, 'PLAYER', RUNTIME_CARD_ID)
  placeEntityOnBoard(state, 'OPPONENT', RUNTIME_ATTACKER_ID)
  return state
}

function runtimeTargetId(state: AuthoritativeSessionStateV1): number {
  const targetId = state.game.players.PLAYER.board.find((entityId) => state.game.entities[String(entityId)]?.definitionId === RUNTIME_CARD_ID)
  if (targetId === undefined) throw new Error('CARD_PREVIEW_RUNTIME_TARGET_MISSING')
  return targetId
}

function runtimeAttack(state: AuthoritativeSessionStateV1): AuthoritativeSessionStateV1 {
  const targetId = runtimeTargetId(state)
  const attack = getLegalActions(state, 'OPPONENT').find((action): action is Extract<LegalActionDescriptor, { type: 'ATTACK' }> => action.type === 'ATTACK' && action.attackTargetId === targetId)
  if (!attack) throw new Error('CARD_PREVIEW_RUNTIME_ATTACK_MISSING')
  return resolveCommand(state, commandFromAction(attack, `card-preview-runtime-${state.game.nextBatchSequence}`)).finalState
}

function createRuntimeModel(state: AuthoritativeSessionStateV1): CardPreviewRuntimeModel {
  const view = projectPlayerView(state, 'PLAYER')
  const targetId = runtimeTargetId(state)
  const attack = getLegalActions(state, 'OPPONENT').find((action) => action.type === 'ATTACK' && action.attackTargetId === targetId)
  return {
    view,
    canAttack: attack !== undefined,
    attack: () => createRuntimeModel(runtimeAttack(state)),
  }
}

export function createCardPreviewRuntime(): CardPreviewRuntimeModel {
  return createRuntimeModel(createRuntimeState())
}
