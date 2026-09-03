import { SHOWCASE_DECKS_V1 } from '@/cards/decks'
import { createEntityFromDefinition } from '@/engine/applyRecordedEvent'
import { commandFromAction, type GameCommand } from '@/engine/commands'
import { getLegalActions } from '@/engine/legalActions'
import { resolveCommand } from '@/engine/resolveCommand'
import { createGameState } from '@/engine/setup'
import { getEntity, type AuthoritativeSessionStateV1, type PlayerId } from '@/engine/state'

function enterPlay(state: AuthoritativeSessionStateV1): AuthoritativeSessionStateV1 {
  for (const actorId of ['PLAYER', 'OPPONENT'] as const) {
    const action = getLegalActions(state, actorId).find((item) => item.type === 'CONFIRM_MULLIGAN')
    if (!action) throw new Error('missing mulligan')
    state = resolveCommand(state, commandFromAction(action, `mulligan-${actorId}`)).finalState
  }
  return state
}

function putInHand(state: AuthoritativeSessionStateV1, actorId: PlayerId, definitionId: string): number {
  const entity = createEntityFromDefinition(state.game.nextEntityId, definitionId, actorId, 'HAND')
  state.game.nextEntityId += 1
  state.game.entities[String(entity.id)] = entity
  state.game.players[actorId].hand.push(entity.id)
  return entity.id
}

function putOnBoard(state: AuthoritativeSessionStateV1, actorId: PlayerId, definitionId: string, exhausted = false): number {
  const entity = createEntityFromDefinition(state.game.nextEntityId, definitionId, actorId, 'BOARD', exhausted)
  state.game.nextEntityId += 1
  state.game.entities[String(entity.id)] = entity
  state.game.players[actorId].board.push(entity.id)
  return entity.id
}

function playAction(state: AuthoritativeSessionStateV1, cardInstanceId: number, predicate: (item: ReturnType<typeof getLegalActions>[number]) => boolean = () => true) {
  const action = getLegalActions(state, 'PLAYER').find((item) => item.type === 'PLAY_CARD' && item.cardInstanceId === cardInstanceId && predicate(item))
  if (!action) throw new Error(`missing play action for ${cardInstanceId}`)
  return resolveCommand(state, commandFromAction(action, `play-${cardInstanceId}`))
}

describe('command resolver', () => {
  it('applies manathirst, discover and magnetic through recorded events', () => {
    let state = enterPlay(createGameState({ seed: 11 }))
    state.game.players.PLAYER.mana = { maximum: 10, current: 10, temporary: 0 }
    const opponentHero = state.game.players.OPPONENT.heroEntityId

    const bolt = putInHand(state, 'PLAYER', 'RLK_843')
    let batch = playAction(state, bolt, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === opponentHero)
    expect(batch.events.map((item) => item.event.scope === 'GAME' ? item.event.payload.type : item.event.payload.type)).toContain('MANATHIRST_BONUS_APPLIED')
    expect(getEntity(batch.finalState.game, opponentHero).health).toBe(27)
    expect(batch.finalState.scenario.coverage.MANATHIRST).not.toBeNull()

    state = batch.finalState
    state.game.players.PLAYER.mana.current = 10
    const runeOrb = putInHand(state, 'PLAYER', 'BAR_541')
    batch = playAction(state, runeOrb, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === opponentHero)
    expect(batch.finalState.game.pendingDecision?.kind).toBe('DISCOVER')
    const discover = getLegalActions(batch.finalState, 'PLAYER').find((item) => item.type === 'SELECT_DISCOVER')
    if (!discover) throw new Error('missing discover')
    batch = resolveCommand(batch.finalState, commandFromAction(discover, 'discover-choice'))
    expect(batch.finalState.scenario.coverage.DISCOVER).not.toBeNull()

    state = batch.finalState
    state.game.players.PLAYER.mana.current = 10
    const mech = putOnBoard(state, 'PLAYER', 'BOT_309')
    const magnetic = putInHand(state, 'PLAYER', 'BOT_563')
    const beforeAttack = getEntity(state.game, mech).attack
    batch = playAction(state, magnetic, (item) => item.type === 'PLAY_CARD' && item.playMode === 'MAGNETIC' && item.targetEntityId === mech)
    expect(getEntity(batch.finalState.game, mech).attack).toBe(beforeAttack + 6)
    expect(batch.finalState.scenario.coverage.MAGNETIC).not.toBeNull()
  })

  it('resolves the official hero power for every non-mage showcase class', () => {
    for (const deck of SHOWCASE_DECKS_V1.filter((candidate) => candidate.ownerClass !== 'MAGE')) {
      const state = enterPlay(createGameState({
        seed: 31,
        playerProfile: { heroId: deck.heroId, heroPowerId: deck.heroPowerId, deck: deck.cards },
        playerDeckTop: deck.signatureCardIds.slice(0, 3),
      }))
      state.game.players.PLAYER.mana = { maximum: 10, current: 10, temporary: 0 }
      const priestTarget = deck.ownerClass === 'PRIEST' ? putOnBoard(state, 'PLAYER', 'CORE_UNG_809') : null
      const priestElusiveTarget = deck.ownerClass === 'PRIEST' ? putOnBoard(state, 'PLAYER', 'DRG_066') : null
      const enemyPriestElusiveTarget = deck.ownerClass === 'PRIEST' ? putOnBoard(state, 'OPPONENT', 'DRG_066') : null
      if (priestTarget !== null && priestElusiveTarget !== null && enemyPriestElusiveTarget !== null) {
        getEntity(state.game, state.game.players.PLAYER.heroEntityId).health = 25
        getEntity(state.game, priestTarget).health = 1
        const enemyHeroId = state.game.players.OPPONENT.heroEntityId
        const priestActions = getLegalActions(state, 'PLAYER')
        expect(priestActions.some((item) => item.type === 'USE_HERO_POWER' && item.targetEntityId === enemyHeroId)).toBe(true)
        expect(priestActions.some((item) => item.type === 'USE_HERO_POWER' && item.targetEntityId === priestElusiveTarget)).toBe(false)
        expect(priestActions.some((item) => item.type === 'USE_HERO_POWER' && item.targetEntityId === enemyPriestElusiveTarget)).toBe(false)
      }
      const action = getLegalActions(state, 'PLAYER').find((item) => item.type === 'USE_HERO_POWER' && (priestTarget === null || item.targetEntityId === priestTarget))
      if (!action) throw new Error(`missing hero power action for ${deck.ownerClass}`)
      const batch = resolveCommand(state, commandFromAction(action, `hero-power-${deck.ownerClass}`))
      const player = batch.finalState.game.players.PLAYER
      const hero = getEntity(batch.finalState.game, player.heroEntityId)
      expect(player.heroPowerUsed, deck.ownerClass).toBe(true)
      if (deck.ownerClass === 'DEATHKNIGHT') {
        const ghoul = player.board.map((id) => getEntity(batch.finalState.game, id)).find((entity) => entity.definitionId === 'HERO_11bpt')
        expect(ghoul).toMatchObject({ attack: 1, health: 1, exhausted: false, summonedThisTurn: true })
      } else if (deck.ownerClass === 'DEMONHUNTER') {
        expect(hero.attack).toBe(1)
      } else if (deck.ownerClass === 'DRUID') {
        expect(hero).toMatchObject({ attack: 1, armor: 1 })
      } else if (deck.ownerClass === 'HUNTER') {
        expect(getEntity(batch.finalState.game, batch.finalState.game.players.OPPONENT.heroEntityId).health).toBe(28)
      } else if (deck.ownerClass === 'PALADIN') {
        expect(player.board.map((id) => getEntity(batch.finalState.game, id).definitionId)).toContain('CS2_101t')
      } else if (deck.ownerClass === 'PRIEST') {
        expect(hero.health).toBe(25)
        expect(getEntity(batch.finalState.game, priestTarget as number).health).toBe(2)
      } else if (deck.ownerClass === 'ROGUE') {
        expect(player.weaponEntityId).not.toBeNull()
        expect(getEntity(batch.finalState.game, player.weaponEntityId as number)).toMatchObject({ definitionId: 'CS2_082', attack: 1, durability: 2 })
      } else if (deck.ownerClass === 'SHAMAN') {
        expect(['CS2_050', 'CS2_051', 'CS2_052', 'CS2_058']).toContain(player.board.map((id) => getEntity(batch.finalState.game, id).definitionId).at(-1))
      } else if (deck.ownerClass === 'WARLOCK') {
        expect(hero.health).toBe(28)
        expect(player.hand.length).toBeGreaterThan(3)
      } else if (deck.ownerClass === 'WARRIOR') {
        expect(hero.armor).toBe(2)
      }
    }
  })

  it('does not offer a board-filling hero power on a full board', () => {
    for (const ownerClass of ['DEATHKNIGHT', 'PALADIN', 'SHAMAN'] as const) {
      const deck = SHOWCASE_DECKS_V1.find((candidate) => candidate.ownerClass === ownerClass)
      if (!deck) throw new Error(`missing deck ${ownerClass}`)
      const state = enterPlay(createGameState({
        seed: 43,
        playerProfile: { heroId: deck.heroId, heroPowerId: deck.heroPowerId, deck: deck.cards },
        playerDeckTop: deck.signatureCardIds.slice(0, 3),
      }))
      while (state.game.players.PLAYER.board.length < 7) putOnBoard(state, 'PLAYER', 'CORE_UNG_809')
      state.game.players.PLAYER.mana = { maximum: 10, current: 10, temporary: 0 }
      expect(getLegalActions(state, 'PLAYER').some((item) => item.type === 'USE_HERO_POWER')).toBe(false)
    }
  })

  it('allows battlecry targets that spells and hero powers must exclude', () => {
    const state = enterPlay(createGameState({ seed: 45 }))
    state.game.players.PLAYER.mana = { maximum: 10, current: 10, temporary: 0 }
    const target = putOnBoard(state, 'OPPONENT', 'DRG_066')
    const card = putInHand(state, 'PLAYER', 'CS2_189')
    expect(getLegalActions(state, 'PLAYER').some((item) => item.type === 'PLAY_CARD' && item.cardInstanceId === card && item.targetEntityId === target)).toBe(true)
  })

  it('executes one class-defining card for every non-mage showcase deck', () => {
    const startClass = (ownerClass: typeof SHOWCASE_DECKS_V1[number]['ownerClass']) => {
      const deck = SHOWCASE_DECKS_V1.find((candidate) => candidate.ownerClass === ownerClass)
      if (!deck) throw new Error(`missing deck ${ownerClass}`)
      const state = enterPlay(createGameState({
        seed: 47,
        playerProfile: { heroId: deck.heroId, heroPowerId: deck.heroPowerId, deck: deck.cards },
        playerDeckTop: deck.signatureCardIds.slice(0, 3),
      }))
      state.game.players.PLAYER.mana = { maximum: 10, current: 10, temporary: 0 }
      return state
    }

    {
      const state = startClass('DEATHKNIGHT')
      const card = putInHand(state, 'PLAYER', 'EDR_814')
      const target = state.game.players.OPPONENT.heroEntityId
      const batch = playAction(state, card, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === target)
      expect(getEntity(batch.finalState.game, target).health).toBe(28)
      expect(batch.finalState.game.players.PLAYER.board.map((id) => getEntity(batch.finalState.game, id).definitionId)).toContain('EDR_810t')
    }
    {
      const state = startClass('DEMONHUNTER')
      const card = putInHand(state, 'PLAYER', 'DINO_136')
      const batch = playAction(state, card, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === undefined)
      const raptors = batch.finalState.game.players.PLAYER.board.map((id) => getEntity(batch.finalState.game, id)).filter((entity) => entity.definitionId === 'DINO_136t')
      expect(raptors).toHaveLength(3)
      expect(raptors.every((entity) => entity.exhausted === false && entity.summonedThisTurn === true)).toBe(true)
    }
    {
      const state = startClass('DRUID')
      const card = putInHand(state, 'PLAYER', 'EX1_173')
      const target = state.game.players.OPPONENT.heroEntityId
      const beforeHand = state.game.players.PLAYER.hand.length
      const batch = playAction(state, card, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === target)
      expect(getEntity(batch.finalState.game, target).health).toBe(25)
      expect(batch.finalState.game.players.PLAYER.hand.length).toBe(beforeHand)
    }
    {
      const state = startClass('HUNTER')
      const beast = putOnBoard(state, 'PLAYER', 'CS2_119')
      const card = putInHand(state, 'PLAYER', 'WC_007')
      const batch = playAction(state, card, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === beast)
      expect(getEntity(batch.finalState.game, beast).keywords).toContain('POISONOUS')
    }
    {
      const state = startClass('PALADIN')
      const card = putInHand(state, 'PLAYER', 'CATA_479')
      const batch = playAction(state, card, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === undefined)
      const dragons = batch.finalState.game.players.PLAYER.board.map((id) => getEntity(batch.finalState.game, id)).filter((entity) => entity.definitionId === 'CATA_479t3')
      expect(dragons).toHaveLength(2)
      expect(dragons.every((entity) => entity.attack === 5 && entity.keywords.includes('DIVINE_SHIELD'))).toBe(true)
    }
    {
      const state = startClass('PALADIN')
      const card = putInHand(state, 'PLAYER', 'JAIL_516')
      const batch = playAction(state, card, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === undefined)
      const summoned = batch.finalState.game.players.PLAYER.board.map((id) => getEntity(batch.finalState.game, id)).filter((entity) => entity.definitionId !== 'JAIL_516')
      const rushed = summoned.filter((entity) => entity.keywords.includes('RUSH'))
      expect(rushed).toHaveLength(2)
      expect(rushed.every((entity) => entity.summonedThisTurn === true)).toBe(true)
      expect(rushed.every((entity) => !batch.finalState.game.players.PLAYER.deck.includes(entity.id))).toBe(true)
    }
    {
      const state = startClass('PRIEST')
      const target = putOnBoard(state, 'PLAYER', 'CORE_ICC_038')
      getEntity(state.game, target).health = 1
      const card = putInHand(state, 'PLAYER', 'CATA_302')
      const beforeHand = state.game.players.PLAYER.hand.length
      const batch = playAction(state, card, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === target)
      expect(getEntity(batch.finalState.game, target).health).toBe(getEntity(batch.finalState.game, target).maxHealth)
      expect(batch.finalState.game.players.PLAYER.hand.length).toBe(beforeHand)
    }
    {
      const state = startClass('ROGUE')
      const target = putOnBoard(state, 'OPPONENT', 'CS2_119')
      const card = putInHand(state, 'PLAYER', 'CORE_CS2_072')
      const batch = playAction(state, card, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === target)
      expect(getEntity(batch.finalState.game, target).health).toBe(5)
    }
    {
      const state = startClass('SHAMAN')
      const ally = putOnBoard(state, 'PLAYER', 'CORE_UNG_809')
      const card = putInHand(state, 'PLAYER', 'JAIL_457')
      const batch = playAction(state, card, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === undefined)
      expect(getEntity(batch.finalState.game, ally)).toMatchObject({ attack: 2, maxHealth: 3, health: 3 })
    }
    {
      const state = startClass('SHAMAN')
      const card = putInHand(state, 'PLAYER', 'CATA_153')
      const batch = playAction(state, card, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === undefined)
      const appendages = batch.finalState.game.players.PLAYER.board.map((id) => getEntity(batch.finalState.game, id).definitionId).filter((definitionId) => definitionId === 'CATA_153t')
      expect(appendages).toHaveLength(2)
    }
    {
      const state = startClass('SHAMAN')
      const card = putInHand(state, 'PLAYER', 'CORE_UNG_809')
      const batch = playAction(state, card, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === undefined)
      expect(batch.finalState.game.players.PLAYER.hand.map((id) => getEntity(batch.finalState.game, id).definitionId)).toContain('UNG_809t1')
    }
    {
      const state = startClass('PRIEST')
      const hero = state.game.players.PLAYER.heroEntityId
      getEntity(state.game, hero).health = 20
      const firstTarget = putOnBoard(state, 'OPPONENT', 'CS2_119')
      const secondTarget = putOnBoard(state, 'OPPONENT', 'CORE_ICC_038')
      const card = putInHand(state, 'PLAYER', 'CORE_BAR_311')
      const batch = playAction(state, card, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === undefined)
      const firstHealthLoss = 7 - getEntity(batch.finalState.game, firstTarget).health
      const secondHealthLoss = 1 - getEntity(batch.finalState.game, secondTarget).health
      expect(firstHealthLoss + secondHealthLoss).toBe(3)
      expect(getEntity(batch.finalState.game, hero).health).toBe(23)
    }
    {
      const state = startClass('WARRIOR')
      const target = state.game.players.OPPONENT.heroEntityId
      const card = putInHand(state, 'PLAYER', 'TLC_600')
      const batch = playAction(state, card, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === undefined)
      expect(getEntity(batch.finalState.game, target).health).toBe(25)
      expect(getEntity(batch.finalState.game, state.game.players.PLAYER.heroEntityId).armor).toBe(5)
    }
    {
      const state = startClass('WARLOCK')
      const card = putInHand(state, 'PLAYER', 'LOOT_014')
      const hero = state.game.players.PLAYER.heroEntityId
      const beforeHand = state.game.players.PLAYER.hand.length
      const batch = playAction(state, card, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === undefined)
      expect(getEntity(batch.finalState.game, hero).health).toBe(28)
      expect(batch.finalState.game.players.PLAYER.hand.length).toBe(beforeHand)
    }
    {
      const state = startClass('WARRIOR')
      const card = putInHand(state, 'PLAYER', 'EDR_456')
      const batch = playAction(state, card, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === undefined)
      const decision = batch.finalState.game.pendingDecision
      expect(decision?.kind).toBe('DISCOVER')
      if (!decision || decision.kind !== 'DISCOVER') throw new Error('missing discover decision')
      expect(decision.actorId).toBe('PLAYER')
    }
  })

  it('keeps windfury attacks and class-specific secondary effects replayable', () => {
    {
      const state = enterPlay(createGameState({ seed: 53 }))
      state.game.players.PLAYER.mana = { maximum: 10, current: 10, temporary: 0 }
      const attacker = putOnBoard(state, 'PLAYER', 'CATA_153')
      const target = putOnBoard(state, 'OPPONENT', 'CS2_119')
      const first = getLegalActions(state, 'PLAYER').find((item) => item.type === 'ATTACK' && item.attackSourceId === attacker && item.attackTargetId === target)
      if (!first || first.type !== 'ATTACK') throw new Error('missing first windfury attack')
      const afterFirst = resolveCommand(state, commandFromAction(first, 'windfury-first')).finalState
      expect(getEntity(afterFirst.game, attacker).exhausted).toBe(false)
      expect(getEntity(afterFirst.game, attacker).attacksRemaining).toBe(1)
      expect(getLegalActions(afterFirst, 'PLAYER').some((item) => item.type === 'ATTACK' && item.attackSourceId === attacker)).toBe(true)
    }
    {
      const state = enterPlay(createGameState({ seed: 59 }))
      state.game.players.PLAYER.mana = { maximum: 10, current: 10, temporary: 0 }
      const target = putOnBoard(state, 'OPPONENT', 'CS2_119')
      const power = getLegalActions(state, 'PLAYER').find((item) => item.type === 'USE_HERO_POWER')
      if (!power) throw new Error('missing death knight hero power')
      const afterPower = resolveCommand(state, commandFromAction(power, 'death-knight-power')).finalState
      expect(afterPower.game.players.PLAYER.heroPowerUsed).toBe(true)
      const card = putInHand(afterPower, 'PLAYER', 'JAIL_441')
      const batch = playAction(afterPower, card, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === target)
      expect(batch.finalState.game.players.PLAYER.heroPowerUsed).toBe(false)
      expect(getEntity(batch.finalState.game, target).health).toBe(4)
    }
    {
      const state = enterPlay(createGameState({ seed: 61 }))
      state.game.players.PLAYER.mana = { maximum: 10, current: 10, temporary: 0 }
      const egg = putInHand(state, 'PLAYER', 'DINO_410')
      const eggBatch = playAction(state, egg, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === undefined)
      const eggEntity = eggBatch.finalState.game.players.PLAYER.board.find((id) => getEntity(eggBatch.finalState.game, id).definitionId === 'DINO_410')
      if (eggEntity === undefined) throw new Error('missing egg')
      getEntity(eggBatch.finalState.game, eggEntity).health = 1
      const sweep = putInHand(eggBatch.finalState, 'PLAYER', 'EX1_400')
      const sweepBatch = playAction(eggBatch.finalState, sweep, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === undefined)
      expect(sweepBatch.finalState.game.players.PLAYER.board.map((id) => getEntity(sweepBatch.finalState.game, id).definitionId)).toContain('DINO_410t2')
    }
    {
      const state = enterPlay(createGameState({ seed: 67 }))
      state.game.players.PLAYER.mana = { maximum: 10, current: 10, temporary: 0 }
      const target = putOnBoard(state, 'OPPONENT', 'CS2_119')
      getEntity(state.game, target).health = 3
      const card = putInHand(state, 'PLAYER', 'JAIL_891')
      const batch = playAction(state, card, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === target)
      expect(batch.finalState.game.players.PLAYER.hand.map((id) => getEntity(batch.finalState.game, id).definitionId)).toContain('JAIL_732')
    }
    {
      const deck = SHOWCASE_DECKS_V1.find((candidate) => candidate.ownerClass === 'DEMONHUNTER')
      if (!deck) throw new Error('missing demon hunter deck')
      const state = enterPlay(createGameState({
        seed: 68,
        playerProfile: { heroId: deck.heroId, heroPowerId: deck.heroPowerId, deck: deck.cards },
        playerDeckTop: deck.signatureCardIds.slice(0, 3),
      }))
      state.game.players.PLAYER.mana = { maximum: 10, current: 10, temporary: 0 }
      const target = putOnBoard(state, 'OPPONENT', 'CS2_119')
      const card = putInHand(state, 'PLAYER', 'JAIL_891')
      const batch = playAction(state, card, (item) => item.type === 'PLAY_CARD' && item.targetEntityId === target)
      expect(getEntity(batch.finalState.game, target).zone).toBe('BOARD')
      expect(batch.finalState.game.players.PLAYER.hand.map((id) => getEntity(batch.finalState.game, id).definitionId)).not.toContain('JAIL_732')
    }
  })

  it('records elusive target evidence and poisonous death', () => {
    let state = enterPlay(createGameState({ seed: 12 }))
    state.game.players.OPPONENT.mana = { maximum: 10, current: 10, temporary: 0 }
    state.game.activePlayerId = 'OPPONENT'
    const elusive = putOnBoard(state, 'PLAYER', 'DRG_066')
    const otherTarget = putOnBoard(state, 'PLAYER', 'BOT_309')
    const targetedSpell = putInHand(state, 'OPPONENT', 'BT_233')
    const action = getLegalActions(state, 'OPPONENT').find((item) => item.type === 'PLAY_CARD' && item.cardInstanceId === targetedSpell && item.targetEntityId === otherTarget)
    if (!action) throw new Error('missing targeted spell action')
    let batch = resolveCommand(state, commandFromAction(action, 'targeted-spell'))
    expect(batch.legalityEvidence[0]?.excluded).toEqual([{ entityId: elusive, reason: 'ELUSIVE' }])
    expect(batch.finalState.scenario.coverage.ELUSIVE).not.toBeNull()

    state = batch.finalState
    state.game.activePlayerId = 'PLAYER'
    getEntity(state.game, elusive).exhausted = false
    const largeMinion = putOnBoard(state, 'OPPONENT', 'BOT_563')
    const attack: GameCommand = { type: 'ATTACK', actorId: 'PLAYER', commandId: 'poison', attackSourceId: elusive, attackTargetId: largeMinion }
    batch = resolveCommand(state, attack)
    const deathEvent = batch.events.find((item) => item.event.scope === 'GAME' && item.event.payload.type === 'MINION_DEATH_BATCH')
    expect(deathEvent?.event.scope === 'GAME' && deathEvent.event.payload.type === 'MINION_DEATH_BATCH' ? deathEvent.event.payload.deaths : []).toEqual(expect.arrayContaining([{ entityId: largeMinion, reason: 'POISONOUS' }]))
    expect(batch.finalState.scenario.coverage.POISONOUS).not.toBeNull()
  })

  it('does not complete the showcase on an early player concede', () => {
    const state = enterPlay(createGameState({ seed: 14 }))
    const concede = getLegalActions(state, 'PLAYER').find((item) => item.type === 'CONCEDE')
    if (!concede) throw new Error('missing concede')
    const batch = resolveCommand(state, commandFromAction(concede, 'early-concede'))
    expect(batch.finalState.game.phase).toBe('GAME_OVER')
    expect(batch.finalState.scenario.stage).toBe('IN_PROGRESS')
  })

  it('resolves a golden simultaneous-death queue before terminal', () => {
    const state = enterPlay(createGameState({ seed: 13 }))
    state.game.activePlayerId = 'PLAYER'
    const attacker = putOnBoard(state, 'PLAYER', 'EX1_029')
    const harvest = putOnBoard(state, 'OPPONENT', 'EX1_556')
    getEntity(state.game, attacker).attack = 4
    getEntity(state.game, attacker).health = 1
    getEntity(state.game, harvest).attack = 4
    getEntity(state.game, harvest).health = 1
    getEntity(state.game, state.game.players.OPPONENT.heroEntityId).health = 2

    const batch = resolveCommand(state, { type: 'ATTACK', actorId: 'PLAYER', commandId: 'golden', attackSourceId: attacker, attackTargetId: harvest })
    const eventTypes = batch.events.map((item) => item.event.payload.type)
    expect(eventTypes).toEqual([
      'COMMAND_ACCEPTED', 'SCENARIO_COMMAND_ACCEPTED', 'ATTACK_DECLARED', 'DAMAGE_BATCH_APPLIED',
      'MINION_DEATH_BATCH', 'DEATHRATTLE_TRIGGERED', 'DEATHRATTLE_TRIGGERED',
      'DAMAGE_BATCH_APPLIED', 'MINION_SUMMONED', 'GAME_ENDED',
    ])
    expect(batch.finalState.game.winnerId).toBe('PLAYER')
  })
})
