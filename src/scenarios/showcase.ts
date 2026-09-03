import { getShowcaseDeck, type ShowcaseDeckDefinitionV1 } from '@/cards/decks'
import type { CardClass } from '@/cards/types'
import { commandFromAction } from '@/engine/commands'
import { getLegalActions } from '@/engine/legalActions'
import { projectPlayerView } from '@/engine/projection'
import { resolveCommand, type ProvisionalCommandBatchV1 } from '@/engine/resolveCommand'
import { createGameState } from '@/engine/setup'
import { getEntity, type AuthoritativeSessionStateV1, type EntityId, type PlayerId } from '@/engine/state'
import { chooseTavernKeeperAction, observeForAi } from '@/ai/tavernKeeper'
import { chooseShowcasePlayerDescriptor } from '@/scenarios/showcasePolicy'

export const SHOWCASE_SEED = 249896
export const SHOWCASE_MAX_COMMANDS = 32
export const SHOWCASE_MAX_TURNS = 16

function moveDeckCardToBoard(state: AuthoritativeSessionStateV1, actorId: PlayerId, definitionId: string): EntityId {
  const player = state.game.players[actorId]
  const index = player.deck.findIndex((entityId) => getEntity(state.game, entityId).definitionId === definitionId)
  if (index < 0) throw new Error(`SHOWCASE_CARD_NOT_IN_DECK:${definitionId}`)
  const [entityId] = player.deck.splice(index, 1)
  if (entityId === undefined) throw new Error(`SHOWCASE_CARD_NOT_IN_DECK:${definitionId}`)
  const entity = getEntity(state.game, entityId)
  entity.zone = 'BOARD'
  entity.exhausted = false
  player.board.push(entityId)
  return entityId
}

export type ShowcasePlayerClass = Exclude<CardClass, 'NEUTRAL'>

export function createShowcaseState(playerClass: ShowcasePlayerClass = 'MAGE'): AuthoritativeSessionStateV1 {
  const deck: ShowcaseDeckDefinitionV1 = getShowcaseDeck(playerClass)
  const isDefaultShowcase = playerClass === 'MAGE'
  const state = createGameState({
    seed: SHOWCASE_SEED,
    scenarioId: 'showcase-v1',
    startingPlayerId: 'PLAYER',
    playerProfile: { heroId: deck.heroId, heroPowerId: deck.heroPowerId, deck: deck.cards },
    playerDeckTop: isDefaultShowcase ? ['RLK_843', 'BAR_541', 'DRG_066', 'BOT_563'] : deck.signatureCardIds,
    opponentDeckTop: ['BT_233'],
  })
  if (isDefaultShowcase) moveDeckCardToBoard(state, 'PLAYER', 'BOT_309')
  moveDeckCardToBoard(state, 'OPPONENT', 'CS2_119')
  return state
}

export function chooseShowcasePlayerAction(state: AuthoritativeSessionStateV1) {
  return chooseShowcasePlayerDescriptor(projectPlayerView(state, 'PLAYER'), getLegalActions(state, 'PLAYER'))
}

export type ShowcaseRunResult = {
  finalState: AuthoritativeSessionStateV1
  batches: ProvisionalCommandBatchV1[]
}

export function runShowcaseScript(initialState = createShowcaseState()): ShowcaseRunResult {
  let state = initialState
  const batches: ProvisionalCommandBatchV1[] = []
  for (let index = 0; index < SHOWCASE_MAX_COMMANDS && state.game.phase !== 'GAME_OVER'; index += 1) {
    const pendingMulliganActor = state.game.pendingDecision?.kind === 'MULLIGAN' ? state.game.pendingDecision.waitingFor[0] : undefined
    const actorId = pendingMulliganActor ?? (state.game.pendingDecision?.kind === 'DISCOVER' ? state.game.pendingDecision.actorId : state.game.activePlayerId)
    const action = actorId === 'PLAYER' ? chooseShowcasePlayerAction(state) : chooseTavernKeeperAction(observeForAi(state))
    if (!action) throw new Error(`SHOWCASE_AI_HAS_NO_ACTION:${state.game.turn}`)
    const batch = resolveCommand(state, commandFromAction(action, `showcase-${index + 1}`))
    batches.push(batch)
    state = batch.finalState
    if (state.game.turn > SHOWCASE_MAX_TURNS) throw new Error(`SHOWCASE_TURN_LIMIT:${state.game.turn}:${JSON.stringify(state.scenario.coverage)}`)
  }
  if (state.game.phase !== 'GAME_OVER') throw new Error(`SHOWCASE_COMMAND_LIMIT:${JSON.stringify(state.scenario.coverage)}`)
  return { finalState: state, batches }
}
