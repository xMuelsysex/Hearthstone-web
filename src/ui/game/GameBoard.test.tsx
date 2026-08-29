import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlayerSessionProvider } from '@/app/context/PlayerSessionContext'
import type { LegalActionDescriptor, PlayerSessionValue, PlayerViewModel, PublicEntityViewModel } from '@/app/context/playerSession'
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
    expect(screen.getByLabelText('法力 2/5，临时 1')).toBeInTheDocument()

    const heroPowers = screen.getAllByRole('button', { name: /英雄技能/ })
    const ownPower = heroPowers.find((power) => power.closest('.hero-player'))
    const opponentPower = heroPowers.find((power) => power.closest('.hero-opponent'))
    expect(ownPower).toBeDefined()
    expect(opponentPower).toBeDisabled()
    expect(ownPower).not.toBeDisabled()
    expect(screen.getAllByRole('button', { name: '结束回合' })).toHaveLength(1)
    expect(container.querySelectorAll('.game-status')).toHaveLength(1)

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
    const weaponCard = container.querySelector(`[data-entity-id="${weapon.id}"]`)
    expect(minionCard).toHaveAttribute('data-card-attack-current', '4')
    expect(minionCard).toHaveAttribute('data-card-value-current', '6')
    expect(minionCard?.querySelector('.card-attack')).toHaveTextContent('4')
    expect(minionCard?.querySelector('.card-health')).toHaveTextContent('6')
    expect(minionCard?.querySelector('img')).toHaveAttribute('src', '/assets/cards/BOT_309.png')
    expect(minionCard?.querySelector('.card-name')).toBeNull()
    expect(minionCard?.querySelector('.card-keywords')).toBeNull()
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
    const manaCrystal = playerHero.querySelector('.mana-crystal')
    expect(manaCrystal).toHaveAttribute('data-mana-current', String(view.self.mana.current))
    expect(manaCrystal).toHaveAttribute('data-mana-max', String(view.self.mana.maximum))
    expect(manaCrystal).toHaveTextContent(`${view.self.mana.current}/${view.self.mana.maximum}`)
    if (!(heroPower instanceof HTMLElement) || !(weaponSlot instanceof HTMLElement)) throw new Error('hero HUD fixture missing')

    fireEvent.focus(heroPower)
    const powerInspection = container.querySelector('.inspection-card-copy')
    expect(powerInspection).toHaveTextContent('费用 2')
    expect(powerInspection).not.toHaveTextContent('攻击 0')

    fireEvent.focus(weaponSlot)
    const weaponInspection = container.querySelector('.inspection-card-copy')
    expect(weaponInspection).toHaveTextContent('耐久 1/2')
    expect(container.querySelector('.inspection-card-art .card-health')).toHaveTextContent('1')
  })

  it('uses the official hero render as a cropped portrait without a placeholder sigil', () => {
    const view = publicView()
    const { container } = renderBoard(makeSession(view))
    const playerPortrait = container.querySelector('.hero-player .hero-portrait')
    expect(playerPortrait?.querySelector('.hero-art-window')).toBeInTheDocument()
    expect(playerPortrait?.querySelector('.hero-art')).toHaveAttribute('src', '/assets/heroes/HERO_08.png')
    expect(playerPortrait?.querySelector('.hero-sigil')).toBeNull()
  })

  it('refreshes focused inspection values from the latest projection', () => {
    const view = publicView()
    const minion = view.self.board.find((entity) => entity.definitionId === 'BOT_309')
    if (!minion) throw new Error('BOT_309 fixture missing from public board')
    const { container, rerender } = renderBoard(makeSession(view))
    const card = container.querySelector(`[data-entity-id="${minion.id}"]`)
    if (!(card instanceof HTMLElement)) throw new Error('board card fixture missing')

    fireEvent.focus(card)
    expect(container.querySelector('.inspection-card-copy')).toHaveTextContent(`生命 ${minion.health}/${minion.maxHealth}`)

    const updatedView = structuredClone(view)
    updatedView.self.board = [{ ...minion, health: 2 }]
    rerender(
      <PlayerSessionProvider value={makeSession(updatedView)}>
        <GameBoard />
      </PlayerSessionProvider>,
    )
    expect(container.querySelector('.inspection-card-copy')).toHaveTextContent('生命 2/5')
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
