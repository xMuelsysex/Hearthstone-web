import { DECKS_V1 } from '@/cards/decks'
import { createEntityFromDefinition } from '@/engine/applyRecordedEvent'
import { createRng, shuffleWithRng } from '@/engine/rng'
import { RULES_VERSION, type AuthoritativeSessionStateV1, type EntityId, type GameEntityV1, type GameStateV1, type PlayerId, type PlayerStateV1 } from '@/engine/state'
import { createScenarioState, type ScenarioStateV1 } from '@/scenarios/state'

export type GameSetupV1 = {
  seed: number
  scenarioId?: ScenarioStateV1['id']
  startingPlayerId?: PlayerId
  playerDeck?: readonly string[]
  opponentDeck?: readonly string[]
  playerDeckTop?: readonly string[]
  opponentDeckTop?: readonly string[]
}

function createPlayer(id: PlayerId, heroEntityId: EntityId, heroPowerEntityId: EntityId): PlayerStateV1 {
  return {
    id,
    heroEntityId,
    heroPowerEntityId,
    deck: [],
    hand: [],
    board: [],
    graveyard: [],
    weaponEntityId: null,
    mana: { maximum: 0, current: 0, temporary: 0 },
    fatigue: 0,
    heroPowerUsed: false,
    mulliganConfirmed: false,
  }
}

function arrangeDeck(definitions: readonly string[], pinnedTop: readonly string[], rngSeed: number): { definitions: string[]; rngState: ReturnType<typeof createRng> } {
  const remaining = [...definitions]
  const top: string[] = []
  for (const definitionId of pinnedTop) {
    const index = remaining.indexOf(definitionId)
    if (index < 0) throw new Error(`PINNED_CARD_NOT_IN_DECK:${definitionId}`)
    top.push(remaining.splice(index, 1)[0] as string)
  }
  const shuffled = shuffleWithRng(remaining, createRng(rngSeed))
  return { definitions: [...top, ...shuffled.items], rngState: shuffled.rng }
}

export function createGameState(setup: GameSetupV1): AuthoritativeSessionStateV1 {
  const playerDeck = setup.playerDeck ?? DECKS_V1[0]?.cards
  const opponentDeck = setup.opponentDeck ?? DECKS_V1[1]?.cards
  if (!playerDeck || !opponentDeck) throw new Error('MISSING_DECKS')
  const startingPlayerId = setup.startingPlayerId ?? 'PLAYER'
  const playerOrder = arrangeDeck(playerDeck, setup.playerDeckTop ?? [], setup.seed)
  const opponentOrder = arrangeDeck(opponentDeck, setup.opponentDeckTop ?? [], playerOrder.rngState.state)
  let nextEntityId = 1
  const entities: Record<string, GameEntityV1> = {}

  function add(definitionId: string, ownerId: PlayerId, zone: GameEntityV1['zone']): EntityId {
    const entity = createEntityFromDefinition(nextEntityId, definitionId, ownerId, zone)
    entities[String(entity.id)] = entity
    nextEntityId += 1
    return entity.id
  }

  const playerHero = add('HERO_08', 'PLAYER', 'HERO')
  const playerPower = add('HERO_08bp', 'PLAYER', 'HERO_POWER')
  const opponentHero = add('HERO_01', 'OPPONENT', 'HERO')
  const opponentPower = add('HERO_01bp', 'OPPONENT', 'HERO_POWER')
  const players: Record<PlayerId, PlayerStateV1> = {
    PLAYER: createPlayer('PLAYER', playerHero, playerPower),
    OPPONENT: createPlayer('OPPONENT', opponentHero, opponentPower),
  }

  for (const definitionId of playerOrder.definitions) players.PLAYER.deck.push(add(definitionId, 'PLAYER', 'DECK'))
  for (const definitionId of opponentOrder.definitions) players.OPPONENT.deck.push(add(definitionId, 'OPPONENT', 'DECK'))

  const firstPlayer = players[startingPlayerId]
  const secondPlayer = players[startingPlayerId === 'PLAYER' ? 'OPPONENT' : 'PLAYER']
  for (let count = 0; count < 3; count += 1) {
    const entityId = firstPlayer.deck.shift()
    if (entityId === undefined) throw new Error('DECK_TOO_SMALL')
    firstPlayer.hand.push(entityId)
    entities[String(entityId)]!.zone = 'HAND'
  }
  for (let count = 0; count < 4; count += 1) {
    const entityId = secondPlayer.deck.shift()
    if (entityId === undefined) throw new Error('DECK_TOO_SMALL')
    secondPlayer.hand.push(entityId)
    entities[String(entityId)]!.zone = 'HAND'
  }
  const coinId = add('GAME_005', secondPlayer.id, 'HAND')
  secondPlayer.hand.push(coinId)

  const game: GameStateV1 = {
    version: 1,
    rulesVersion: RULES_VERSION,
    phase: 'MULLIGAN',
    turn: 0,
    activePlayerId: startingPlayerId,
    startingPlayerId,
    winnerId: null,
    endReason: null,
    players,
    entities,
    pendingDecision: { kind: 'MULLIGAN', waitingFor: ['PLAYER', 'OPPONENT'] },
    rng: opponentOrder.rngState,
    nextEntityId,
    nextEventSequence: 1,
    nextBatchSequence: 1,
  }
  return { game, scenario: createScenarioState(setup.scenarioId) }
}
