import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlayerSessionProvider } from '@/app/context/PlayerSessionContext'
import type { LegalActionDescriptor, PlayerSessionValue, PlayerViewModel, PublicEntityViewModel } from '@/app/context/playerSession'
import { CARD_DEFINITIONS_V1 } from '@/cards/registry'
import { projectPlayerView } from '@/engine/projection'
import { createShowcaseState } from '@/scenarios/showcase'
import { GameBoard } from '@/ui/game/GameBoard'

type SessionOverrides = Partial<Pick<PlayerSessionValue, 'mode' | 'tutorial' | 'error' | 'busy' | 'lastEventKey' | 'lastEventTypes'>>

function publicView(): PlayerViewModel {
  return projectPlayerView(createShowcaseState(), 'PLAYER')
}

function makeSession(view: PlayerViewModel, legalActions: LegalActionDescriptor[] = [], overrides: SessionOverrides = {}): PlayerSessionValue {
  return {
    mode: 'showcase',
    view,
    legalActions,
    lastEventTypes: [],
    lastEventKey: '',
    busy: false,
    error: null,
    tutorial: null,
    dispatchAction: vi.fn(async () => undefined),
    resetTutorialStep: vi.fn(),
    nextTutorialStep: vi.fn(),
    skipTutorial: vi.fn(),
    startShowcase: vi.fn(async () => undefined),
    restartShowcase: vi.fn(async () => undefined),
    exportLog: vi.fn(),
    exitToMenu: vi.fn(),
    ...overrides,
  }
}

function renderBoard(session: PlayerSessionValue) {
  return render(
    <PlayerSessionProvider value={session}>
      <GameBoard />
    </PlayerSessionProvider>,
  )
}

function playCardAction(card: PublicEntityViewModel, targetEntityId?: number): LegalActionDescriptor {
  return {
    id: `play-${card.id}`,
    type: 'PLAY_CARD',
    actorId: 'PLAYER',
    cardInstanceId: card.id,
    playMode: 'NORMAL',
    ...(targetEntityId === undefined ? {} : { targetEntityId }),
  }
}

function multiKeywordFixture(view: PlayerViewModel): PublicEntityViewModel {
  return {
    id: 9401,
    definitionId: 'DRG_066',
    name: '多关键词测试随从',
    assetPath: '/assets/cards/DRG_066.png',
    attack: 3,
    health: 3,
    maxHealth: 3,
    armor: 0,
    durability: 0,
    exhausted: false,
    keywords: ['POISONOUS', 'ELUSIVE'],
    controllerId: view.viewerId,
  }
}

describe('GameBoard public UI boundaries', () => {
  it('keeps hidden opponent cards opaque while exposing public keyword inspection', async () => {
    const user = userEvent.setup()
    const view = publicView()
    const card = view.self.hand.find((entity) => entity.definitionId === 'RLK_843')
    if (!card) throw new Error('RLK_843 fixture missing from public hand')
    const session = makeSession(view, [playCardAction(card, view.opponent.hero.id)])

    renderBoard(session)

    const hiddenCards = screen.getAllByRole('img', { name: '对手隐藏手牌' })
    expect(hiddenCards.length).toBeGreaterThan(0)
    for (const hiddenImage of hiddenCards) {
      const hiddenCard = hiddenImage.parentElement
      expect(hiddenCard).toHaveAttribute('data-hidden-card', 'true')
      expect(hiddenCard).not.toHaveAttribute('data-card-definition-id')
      expect(hiddenCard).not.toHaveAttribute('data-inspection-key')
      expect(hiddenCard).not.toHaveAttribute('tabindex')
      expect(hiddenCard).not.toHaveAttribute('aria-describedby')
      expect(hiddenCard).not.toHaveTextContent(/法力渴求|剧毒|扰魔|发现|磁力/)
    }

    const publicCard = screen.getByRole('button', { name: new RegExp(card.name) })
    await user.hover(publicCard)
    expect(publicCard).toHaveAttribute('data-inspection-key', `entity:${card.id}`)
    expect(publicCard).toHaveAttribute('aria-describedby', 'card-keyword-tooltip')
    expect(screen.getByRole('img', { name: `${card.name}公开预览` })).toBeInTheDocument()
    expect(screen.getByRole('tooltip')).toHaveTextContent('法力渴求')
  })

  it('gives focus inspection priority and keeps pointerleave/blur cleanup independent', async () => {
    const user = userEvent.setup()
    const view = publicView()
    const card = view.self.hand.find((entity) => entity.definitionId === 'RLK_843')
    if (!card) throw new Error('RLK_843 fixture missing from public hand')
    const session = makeSession(view, [playCardAction(card, view.opponent.hero.id)])
    const { container } = renderBoard(session)
    const publicCard = screen.getByRole('button', { name: new RegExp(card.name) })
    const opponentHero = container.querySelector('.opponent-lane .hero-portrait')
    if (!(opponentHero instanceof HTMLElement)) throw new Error('opponent hero fixture missing')

    await user.hover(publicCard)
    expect(container.querySelector('[data-inspection-overlay]')).toHaveAttribute('data-inspection-entity-id', String(card.id))
    opponentHero.focus()
    await user.hover(publicCard)
    expect(container.querySelector('[data-inspection-overlay]')).toHaveAttribute('data-inspection-entity-id', String(view.opponent.hero.id))

    fireEvent.blur(opponentHero)
    expect(container.querySelector('[data-inspection-overlay]')).toHaveAttribute('data-inspection-entity-id', String(card.id))
    fireEvent.pointerLeave(publicCard)
    expect(container.querySelector('[data-inspection-overlay]')).toBeNull()
  })

  it('keeps inspection-only entities inert while actionable public cards dispatch once from keyboard', async () => {
    const user = userEvent.setup()
    const view = publicView()
    const card = view.self.hand.find((entity) => entity.definitionId === 'RLK_843')
    if (!card) throw new Error('RLK_843 fixture missing from public hand')
    const session = makeSession(view, [playCardAction(card, view.opponent.hero.id)])
    const dispatchAction = session.dispatchAction as ReturnType<typeof vi.fn>
    const { container } = renderBoard(session)
    const opponentHero = container.querySelector('.opponent-lane .hero-portrait')
    const publicCard = screen.getByRole('button', { name: new RegExp(card.name) })
    if (!(opponentHero instanceof HTMLElement)) throw new Error('opponent hero fixture missing')

    opponentHero.focus()
    await user.keyboard('{Enter}{Space}')
    expect(dispatchAction).not.toHaveBeenCalled()

    publicCard.focus()
    await user.keyboard('{Enter}')
    expect(dispatchAction).toHaveBeenCalledTimes(1)
    expect(dispatchAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'PLAY_CARD', cardInstanceId: card.id }), [])
  })

  it('renders live projection state, native power semantics, one scene control, and both keyword explanations', async () => {
    const user = userEvent.setup()
    const view = publicView()
    view.opponent.hero = { ...view.opponent.hero, health: 28, armor: 2 }
    view.opponent.mana = { current: 2, maximum: 5, temporary: 1 }
    const multiKeywordCard = multiKeywordFixture(view)
    view.self.hand = [...view.self.hand, multiKeywordCard]
    const legalActions: LegalActionDescriptor[] = [
      playCardAction(multiKeywordCard, view.opponent.hero.id),
      { id: 'hero-power', type: 'USE_HERO_POWER', actorId: 'PLAYER' },
      { id: 'end-turn', type: 'END_TURN', actorId: 'PLAYER' },
    ]
    const session = makeSession(view, legalActions)
    const { container } = renderBoard(session)

    const opponentHero = screen.getByRole('region', { name: '旅店老板' })
    expect(opponentHero).toHaveAttribute('data-health-current', '28')
    expect(opponentHero).toHaveAttribute('data-armor', '2')
    expect(opponentHero.querySelector('.health-fill')).toHaveStyle({ width: '93%' })
    const opponentManaTray = screen.getByLabelText('法力 2/5，临时 1')
    expect(opponentManaTray).toBeInTheDocument()
    expect(opponentManaTray.querySelectorAll('[data-mana-kind="permanent"]')).toHaveLength(5)
    expect(opponentManaTray.querySelectorAll('[data-mana-state="filled"]')).toHaveLength(2)
    expect(opponentManaTray.querySelectorAll('[data-mana-state="empty"]')).toHaveLength(3)
    expect(opponentManaTray.querySelectorAll('[data-mana-kind="temporary"]')).toHaveLength(1)

    const heroPowers = screen.getAllByRole('button', { name: /英雄技能/ })
    const ownPower = heroPowers.find((power) => power.closest('.hero-player'))
    const opponentPower = heroPowers.find((power) => power.closest('.hero-opponent'))
    expect(ownPower).toBeDefined()
    expect(opponentPower).toBeDisabled()
    expect(ownPower).not.toBeDisabled()
    expect(screen.getAllByRole('button', { name: '结束回合' })).toHaveLength(1)
    expect(container.querySelectorAll('.game-status')).toHaveLength(1)

    const sceneControl = container.querySelector('.scene-control')
    const sceneTrackerList = sceneControl?.querySelector('.deck-tracker-list')
    const sceneTurnControl = sceneTrackerList?.children[1]
    expect(sceneTrackerList?.children[0]).toHaveAttribute('data-deck-owner', 'opponent')
    expect(sceneTurnControl).toHaveClass('scene-turn-control')
    expect(sceneTurnControl?.querySelector('.secondary')).toHaveTextContent('结束回合')
    expect(sceneTrackerList?.children[2]).toHaveAttribute('data-deck-owner', 'self')
    expect(container.querySelector('.game-status .deck-panel')).toBeNull()

    const multiKeywordDomCard = screen.getByRole('button', { name: /多关键词测试随从/ })
    await user.hover(multiKeywordDomCard)
    expect(screen.getByRole('tooltip')).toHaveTextContent('剧毒')
    expect(screen.getByRole('tooltip')).toHaveTextContent('扰魔')
    expect(multiKeywordDomCard).toHaveAttribute('aria-describedby', 'card-keyword-tooltip')
  })

  it('keeps the action panel to turn controls and opens the empty settings shell on Escape', () => {
    const view = publicView()
    const session = makeSession(view, [
      { id: 'end-turn', type: 'END_TURN', actorId: 'PLAYER' },
      { id: 'concede', type: 'CONCEDE', actorId: 'PLAYER' },
    ])
    const { container } = renderBoard(session)
    const actionPanel = container.querySelector('.action-panel')
    expect(actionPanel).toHaveTextContent('结束回合')
    expect(actionPanel).not.toHaveTextContent('认输')
    expect(actionPanel?.querySelector('.drag-hint')).toBeNull()
    expect(screen.queryByRole('dialog', { name: '设置' })).toBeNull()

    fireEvent.keyDown(window, { key: 'Escape' })

    const settings = screen.getByRole('dialog', { name: '设置' })
    expect(settings).toHaveAttribute('data-settings-dialog', 'true')
    expect(settings).toHaveTextContent('设置页面暂时保留空壳')
    expect(screen.getByRole('button', { name: '认输' })).toBeInTheDocument()
  })

  it('anchors hand preview at the pointer and delays spell arrows until the card leaves hand', () => {
    const view = publicView()
    const card = view.self.hand.find((entity) => entity.definitionId === 'RLK_843')
    if (!card) throw new Error('RLK_843 fixture missing from public hand')
    const session = makeSession(view, [playCardAction(card, view.opponent.hero.id)])
    const { container } = renderBoard(session)
    const handCard = container.querySelector(`.player-hand [data-entity-id="${card.id}"]`)
    if (!(handCard instanceof HTMLElement)) throw new Error('hand card fixture missing')

    fireEvent.pointerEnter(handCard, { clientX: 160, clientY: 560, pointerId: 1 })
    const handPreview = container.querySelector('[data-inspection-overlay]')
    expect(handPreview).toHaveAttribute('data-inspection-mode', 'hand')
    expect(handPreview).toHaveStyle({ left: '160px', top: '560px' })

    fireEvent.pointerDown(handCard, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 160, clientY: 560 })
    expect(container.querySelector('[data-drag-preview]')).toHaveAttribute('data-hand-exited', 'false')
    expect(container.querySelector('[data-target-arrow]')).toBeNull()

    fireEvent.pointerMove(window, { pointerId: 1, clientX: 400, clientY: -200 })
    expect(container.querySelector('[data-drag-preview]')).toBeNull()
    expect(container.querySelector(`.player-hand [data-entity-id="${card.id}"]`)).toHaveStyle({ visibility: 'hidden' })
    expect(container.querySelector('[data-target-arrow]')).toHaveAttribute('data-arrow-kind', 'spell')

    fireEvent.pointerMove(window, { pointerId: 1, clientX: 0, clientY: 0 })
    expect(container.querySelector('[data-drag-preview]')).toHaveAttribute('data-hand-exited', 'false')
    expect(container.querySelector(`.player-hand [data-entity-id="${card.id}"]`)).toBeInTheDocument()
    expect(container.querySelector('[data-target-arrow]')).toBeNull()

    fireEvent.pointerUp(window, { pointerId: 1, clientX: 0, clientY: 0 })
    expect(container.querySelector('[data-drag-preview]')).toBeNull()
    expect(container.querySelector('[data-target-arrow]')).toBeNull()
  })

  it('shows an attack arrow immediately when dragging an actionable battlefield card', () => {
    const view = publicView()
    const source = view.self.board.find((entity) => entity.definitionId === 'BOT_309')
    const target = view.opponent.board[0]
    if (!source || !target) throw new Error('attack card fixtures missing')
    const session = makeSession(view, [{ id: 'attack-arrow', type: 'ATTACK', actorId: 'PLAYER', attackSourceId: source.id, attackTargetId: target.id, projectedDeathEntityIds: [] }])
    const { container } = renderBoard(session)
    const sourceCard = container.querySelector(`.player-board [data-entity-id="${source.id}"]`)
    if (!(sourceCard instanceof HTMLElement)) throw new Error('battlefield card fixture missing')

    fireEvent.pointerDown(sourceCard, { pointerId: 2, pointerType: 'mouse', button: 0, clientX: 320, clientY: 280 })
    const arrow = container.querySelector('[data-target-arrow]')
    expect(arrow).toHaveAttribute('data-arrow-kind', 'attack')
    expect(arrow).toHaveAttribute('data-arrow-source-entity-id', String(source.id))

    fireEvent.pointerUp(window, { pointerId: 2, clientX: 320, clientY: 280 })
    expect(container.querySelector('[data-target-arrow]')).toBeNull()
  })

  it('shows a target arrow immediately for an actionable targeted hero power', () => {
    const view = publicView()
    const target = view.opponent.hero
    const session = makeSession(view, [{ id: 'hero-power-arrow', type: 'USE_HERO_POWER', actorId: 'PLAYER', targetEntityId: target.id }])
    const { container } = renderBoard(session)
    const heroPower = container.querySelector('.hero-player .hero-power-slot')
    if (!(heroPower instanceof HTMLElement)) throw new Error('hero power fixture missing')

    fireEvent.pointerDown(heroPower, { pointerId: 3, pointerType: 'mouse', button: 0, clientX: 240, clientY: 240 })
    const arrow = container.querySelector('[data-target-arrow]')
    expect(arrow).toHaveAttribute('data-arrow-kind', 'hero-power')
    expect(arrow).toHaveAttribute('data-arrow-source-entity-id', String(view.self.heroPower.id))
    expect(container.querySelector('[data-drag-preview]')).toBeNull()

    fireEvent.pointerUp(window, { pointerId: 3, clientX: 240, clientY: 240 })
    expect(container.querySelector('[data-target-arrow]')).toBeNull()
  })

  it('requests original art for every supported minion on the battlefield', () => {
    const view = publicView()
    const minions = Object.values(CARD_DEFINITIONS_V1).filter((definition) => definition.type === 'MINION')
    view.self.board = minions.map((definition, index) => ({
      id: 9500 + index,
      definitionId: definition.id,
      name: definition.name,
      assetPath: `/assets/cards/${definition.id}.png`,
      attack: definition.attack,
      health: definition.health,
      maxHealth: definition.health,
      armor: 0,
      durability: 0,
      exhausted: false,
      keywords: definition.keywords,
      controllerId: view.viewerId,
    }))

    const { container } = renderBoard(makeSession(view))
    expect(container.querySelectorAll('.player-board .battlefield-card')).toHaveLength(minions.length)
    for (const [index, definition] of minions.entries()) {
      const card = container.querySelector(`.player-board [data-entity-id="${9500 + index}"]`)
      expect(card).toHaveClass('battlefield-card')
      expect(card?.querySelector('.battlefield-card-art')).toHaveAttribute('src', `/assets/card-art/${definition.id}.png`)
      expect(card).toHaveAttribute('data-card-definition-id', definition.id)
      expect(card).toHaveAttribute('data-card-attack-current', String(definition.attack))
      expect(card).toHaveAttribute('data-card-value-current', String(definition.health))
    }
  })

  it('keeps rendered card values synchronized with projection state for minions and weapons', () => {
    const view = publicView()
    const minion = view.self.board.find((entity) => entity.definitionId === 'BOT_309')
    if (!minion) throw new Error('BOT_309 fixture missing from public board')
    view.self.board = [{ ...minion, attack: 4, health: 6, maxHealth: 8 }]
    const weapon: PublicEntityViewModel = {
      id: 9402,
      definitionId: 'CS2_106',
      name: '炽炎战斧',
      assetPath: '/assets/cards/CS2_106.png',
      attack: 3,
      health: 2,
      maxHealth: 2,
      armor: 0,
      durability: 1,
      exhausted: false,
      keywords: [],
      controllerId: view.viewerId,
    }
    view.self.hand = [...view.self.hand, weapon]

    const { container } = renderBoard(makeSession(view))
    const minionCard = container.querySelector(`[data-entity-id="${minion.id}"]`)
    const opponentMinionCard = container.querySelector('[data-card-definition-id="CS2_119"]')
    const weaponCard = container.querySelector(`[data-entity-id="${weapon.id}"]`)
    expect(minionCard).toHaveAttribute('data-card-attack-current', '4')
    expect(minionCard).toHaveAttribute('data-card-value-current', '6')
    expect(minionCard?.querySelector('.card-attack')).toHaveTextContent('4')
    expect(minionCard?.querySelector('.card-health')).toHaveTextContent('6')
    expect(minionCard).toHaveClass('battlefield-card')
    expect(minionCard?.querySelector('.battlefield-art-window')).toBeInTheDocument()
    expect(minionCard?.querySelector('.battlefield-card-art')).toHaveAttribute('src', '/assets/card-art/BOT_309.png')
    expect(minionCard?.querySelector('.card-cost')).toBeNull()
    expect(minionCard?.querySelector('.card-name')).toBeNull()
    expect(minionCard?.querySelector('.card-keywords')).toBeNull()
    expect(opponentMinionCard?.querySelector('.battlefield-card-art')).toHaveAttribute('src', '/assets/card-art/CS2_119.png')
    expect(opponentMinionCard?.querySelector('.card-cost')).toBeNull()
    expect(weaponCard).toHaveAttribute('data-card-value-label', '耐久')
    expect(weaponCard).toHaveAttribute('data-card-value-current', '1')
    expect(weaponCard?.querySelector('.card-health')).toHaveTextContent('1')
    expect(weaponCard).toHaveAttribute('aria-label', '炽炎战斧，攻击 3，耐久 1/2')
  })

  it('renders official-style deck states with public hand and deck counts', () => {
    const view = publicView()
    view.opponent.deckCount = 0
    const { container } = renderBoard(makeSession(view))
    const opponentDeck = container.querySelector('[data-deck-owner="opponent"]')
    const selfDeck = container.querySelector('[data-deck-owner="self"]')
    expect(opponentDeck).toHaveAttribute('data-deck-state', 'empty')
    expect(opponentDeck).toHaveAttribute('data-deck-count', '0')
    expect(opponentDeck).toHaveTextContent('空牌库')
    expect(selfDeck).toHaveAttribute('data-deck-state', 'has-cards')
    expect(selfDeck).toHaveAttribute('data-deck-count', String(view.self.deckCount))
    expect(selfDeck).toHaveAttribute('data-hand-count', String(view.self.hand.length))
    expect(selfDeck?.querySelector('.deck-pile-art')).toHaveAttribute('src', '/assets/card-back/in-a-dark-wood.png')
    expect(selfDeck).toHaveTextContent(`手牌 ${view.self.hand.length} · 牌库 ${view.self.deckCount}`)
  })

  it('binds hero attack totals, hero power cost, and weapon HUD stats to public projection', () => {
    const view = publicView()
    view.self.hero = { ...view.self.hero, attack: 1, armor: 3 }
    const weapon: PublicEntityViewModel = {
      id: 9403,
      definitionId: 'CS2_106',
      name: '炽炎战斧',
      assetPath: '/assets/cards/CS2_106.png',
      attack: 3,
      health: 2,
      maxHealth: 2,
      armor: 0,
      durability: 1,
      exhausted: false,
      keywords: [],
      controllerId: view.viewerId,
    }
    view.self.weapon = weapon

    const { container } = renderBoard(makeSession(view, [{ id: 'hero-power', type: 'USE_HERO_POWER', actorId: 'PLAYER' }]))
    const playerHero = container.querySelector('.hero-player')
    if (!(playerHero instanceof HTMLElement)) throw new Error('player hero fixture missing')
    const opponentHero = container.querySelector('.hero-opponent')
    const opponentLane = container.querySelector('.opponent-lane')
    expect(opponentLane?.children[0]).toHaveClass('opponent-hand')
    expect(opponentLane?.children[1]).toHaveClass('hero-strip')
    expect(opponentLane?.children[2]).toHaveClass('opponent-board')
    expect(playerHero.querySelector('.hero-portrait')?.parentElement).toHaveClass('hero-core')
    expect(playerHero.querySelector('.hero-core .hero-power-slot')).toBeInTheDocument()
    expect(opponentHero?.querySelector('.hero-portrait')?.parentElement).toHaveClass('hero-core')
    expect(opponentHero?.querySelector('.hero-core .hero-power-slot')).toBeInTheDocument()
    expect(playerHero).toHaveAttribute('data-hero-attack-current', '4')
    expect(playerHero.querySelector('.hero-attack-badge')).toHaveTextContent('4')
    expect(playerHero.querySelector('.hero-armor-badge')).toHaveTextContent('3')

    const weaponSlot = playerHero.querySelector('.weapon-slot')
    expect(weaponSlot).toHaveAttribute('data-card-attack-current', '3')
    expect(weaponSlot).toHaveAttribute('data-card-value-current', '1')
    expect(weaponSlot?.querySelector('.weapon-attack')).toHaveTextContent('3')
    expect(weaponSlot?.querySelector('.weapon-durability')).toHaveTextContent('1')

    const heroPower = playerHero.querySelector('.hero-power-slot')
    expect(heroPower).toHaveAttribute('data-card-cost-current', '2')
    expect(heroPower?.querySelector('.hero-power-cost')).toHaveTextContent('2')
    const manaCrystal = container.querySelector('.player-hand .mana-crystal')
    expect(manaCrystal).toHaveClass('mana-tray')
    expect(manaCrystal).toHaveAttribute('data-mana-current', String(view.self.mana.current))
    expect(manaCrystal).toHaveAttribute('data-mana-max', String(view.self.mana.maximum))
    expect(manaCrystal).toHaveTextContent(`${view.self.mana.current}/${view.self.mana.maximum}`)
    if (!(heroPower instanceof HTMLElement) || !(weaponSlot instanceof HTMLElement)) throw new Error('hero HUD fixture missing')

    fireEvent.focus(heroPower)
    const powerInspection = container.querySelector('[data-inspection-overlay]')
    expect(powerInspection).toHaveClass('large-card-preview')
    expect(powerInspection).toHaveAttribute('data-inspection-presentation', 'card-only')
    expect(powerInspection?.querySelector('.large-inspection-card--hero_power')).toBeInTheDocument()
    expect(powerInspection?.querySelector('.card-cost')).toHaveTextContent('2')
    expect(powerInspection?.querySelector('.inspection-card-copy')).toBeNull()

    fireEvent.focus(weaponSlot)
    const weaponInspection = container.querySelector('.inspection-card-copy')
    expect(weaponInspection).toHaveTextContent('耐久 1/2')
    expect(container.querySelector('.inspection-card-art .card-health')).toHaveTextContent('1')
  })

  it('uses original hero and hero-power art without extra frame placeholders', () => {
    const view = publicView()
    const { container } = renderBoard(makeSession(view))
    const playerPortrait = container.querySelector('.hero-player .hero-portrait')
    expect(playerPortrait?.querySelector('.hero-art-window')).toBeInTheDocument()
    expect(playerPortrait?.querySelector('.hero-art')).toHaveAttribute('src', '/assets/hero-art/HERO_08.png')
    expect(playerPortrait?.querySelector('.hero-sigil')).toBeNull()
    expect(container.querySelector('.hero-player .hero-power-art')).toHaveAttribute('src', '/assets/hero-power-art/HERO_08bp.png')
  })

  it('highlights usable, attackable, effect-ready, and predicted-death cards', () => {
    const view = publicView()
    const spell = view.self.hand.find((entity) => entity.definitionId === 'RLK_843')
    const source = view.self.board.find((entity) => entity.definitionId === 'BOT_309')
    const target = view.opponent.board.find((entity) => entity.definitionId === 'CS2_119')
    if (!spell || !source || !target) throw new Error('card highlight fixtures missing')
    const session = makeSession(view, [
      playCardAction(spell, view.opponent.hero.id),
      { id: 'attack-highlight', type: 'ATTACK', actorId: 'PLAYER', attackSourceId: source.id, attackTargetId: target.id, projectedDeathEntityIds: [source.id, target.id] },
    ])
    const { container } = renderBoard(session)

    const spellCard = container.querySelector(`.player-hand [data-entity-id="${spell.id}"]`)
    expect(spellCard).toHaveClass('card-playable', 'card-effect-ready')
    expect(spellCard).toHaveAttribute('data-card-playable', 'true')
    expect(spellCard).toHaveAttribute('data-card-effect-ready', 'true')

    const sourceCard = container.querySelector(`.player-board [data-entity-id="${source.id}"]`)
    expect(sourceCard).toHaveClass('card-attackable')
    expect(sourceCard).not.toHaveClass('card-projected-death')
    expect(sourceCard).toHaveAttribute('data-card-attackable', 'true')
    expect(sourceCard).not.toHaveAttribute('data-predicted-death')

    const targetCard = container.querySelector(`.opponent-board [data-entity-id="${target.id}"]`)
    expect(targetCard).not.toHaveClass('card-projected-death')
    expect(targetCard).not.toHaveAttribute('data-predicted-death')

    if (!(sourceCard instanceof HTMLElement) || !(targetCard instanceof HTMLElement)) throw new Error('attack highlight card fixtures missing')
    fireEvent.pointerDown(sourceCard, { pointerId: 4, pointerType: 'mouse', button: 0, clientX: 320, clientY: 280 })
    expect(sourceCard).not.toHaveClass('card-projected-death')

    const originalElementFromPoint = document.elementFromPoint
    try {
      Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => targetCard) })
      fireEvent.pointerMove(window, { pointerId: 4, clientX: 420, clientY: 220 })
      expect(sourceCard).toHaveClass('card-projected-death')
      expect(targetCard).toHaveClass('card-projected-death')
      expect(sourceCard?.querySelector('[data-predicted-death]')).toHaveAccessibleName('预告：攻击后预计死亡')

      Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => sourceCard) })
      fireEvent.pointerMove(window, { pointerId: 4, clientX: 320, clientY: 280 })
      expect(sourceCard).not.toHaveClass('card-projected-death')
      expect(targetCard).not.toHaveClass('card-projected-death')
    } finally {
      Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: originalElementFromPoint })
    }
    fireEvent.pointerUp(window, { pointerId: 4, clientX: 320, clientY: 280 })
  })

  it('uses the battlefield card size for hero and hero-power inspections', () => {
    const view = publicView()
    const { container } = renderBoard(makeSession(view))
    const hero = container.querySelector('.hero-player .hero-portrait')
    const heroPower = container.querySelector('.hero-player .hero-power-slot')
    if (!(hero instanceof HTMLElement) || !(heroPower instanceof HTMLElement)) throw new Error('hero inspection fixtures missing')

    fireEvent.focus(hero)
    const heroPreview = container.querySelector('[data-inspection-overlay]')
    expect(heroPreview).toHaveClass('large-card-preview')
    expect(heroPreview).toHaveAttribute('data-inspection-presentation', 'card-only')
    expect(heroPreview?.querySelector('.large-inspection-card--hero')).toBeInTheDocument()
    expect(heroPreview?.querySelector('.inspection-card-copy')).toBeNull()

    fireEvent.focus(heroPower)
    const heroPowerPreview = container.querySelector('[data-inspection-overlay]')
    expect(heroPowerPreview).toHaveClass('large-card-preview')
    expect(heroPowerPreview).toHaveAttribute('data-inspection-presentation', 'card-only')
    expect(heroPowerPreview?.querySelector('.large-inspection-card--hero_power')).toBeInTheDocument()
    expect(heroPowerPreview?.querySelector('.inspection-card-copy')).toBeNull()
  })

  it('refreshes focused inspection values from the latest projection', () => {
    const view = publicView()
    const minion = view.self.board.find((entity) => entity.definitionId === 'BOT_309')
    if (!minion) throw new Error('BOT_309 fixture missing from public board')
    const { container, rerender } = renderBoard(makeSession(view))
    const card = container.querySelector(`[data-entity-id="${minion.id}"]`)
    if (!(card instanceof HTMLElement)) throw new Error('board card fixture missing')

    fireEvent.focus(card)
    const preview = container.querySelector('[data-inspection-overlay]')
    expect(preview).toHaveAttribute('data-inspection-presentation', 'card-only')
    expect(preview?.querySelector('.battlefield-inspection-card')).toBeInTheDocument()
    expect(preview?.querySelector('.inspection-card-copy')).toBeNull()
    expect(preview?.querySelector('.card-cost')).toHaveAttribute('data-card-cost-current')
    expect(preview?.querySelector('.card-attack')).toHaveTextContent(String(minion.attack))
    expect(preview?.querySelector('.card-health')).toHaveTextContent(String(minion.health))
    expect(preview?.querySelector('[data-card-value-current]')).toHaveAttribute('data-card-value-current', String(minion.health))

    const updatedView = structuredClone(view)
    updatedView.self.board = [{ ...minion, health: 2 }]
    rerender(
      <PlayerSessionProvider value={makeSession(updatedView)}>
        <GameBoard />
      </PlayerSessionProvider>,
    )
    expect(container.querySelector('[data-inspection-overlay] .inspection-card-copy')).toBeNull()
    expect(container.querySelector('[data-inspection-overlay] [data-card-value-current]')).toHaveAttribute('data-card-value-current', '2')
  })

  it('derives tutorial source and target markers from legal actions', () => {
    const view = publicView()
    const card = view.self.hand.find((entity) => entity.definitionId === 'RLK_843')
    if (!card) throw new Error('RLK_843 fixture missing from public hand')
    const tutorial = { stepId: 'MANATHIRST' as const, title: '法力渴求', instruction: '使用奥术箭。', stepNumber: 1, totalSteps: 5, complete: false }
    const session = makeSession(view, [playCardAction(card, view.opponent.hero.id)], { tutorial })
    const { container } = renderBoard(session)

    expect(container.querySelector(`[data-card-definition-id="${card.definitionId}"][data-tutorial-role="source"]`)).toBeInTheDocument()
    const target = container.querySelector(`[data-entity-id="${view.opponent.hero.id}"][data-tutorial-role="target"]`)
    expect(target).toBeInTheDocument()
    expect(target).toHaveAttribute('data-tutorial-highlight', 'true')
  })
})
