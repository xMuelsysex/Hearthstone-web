import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '@/app/App'
import { SessionController } from '@/app/session/SessionController'
import { createShowcaseState } from '@/scenarios/showcase'
import { GameRepository, MemoryStorageAdapter } from '@/storage/repository'
import { STORAGE_KEY } from '@/storage/schema'

beforeEach(() => localStorage.clear())

describe('App', () => {
  it('opens the tutorial on first launch and persists an explicit skip', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('heading', { name: '法力渴求' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '跳过教程' }))

    expect(screen.getByRole('heading', { name: '炉石传说：旅店展示战' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新教程' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({ tutorialCompleted: true })
  })

  it('starts the showcase with a CSS battlefield and live hero health', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '跳过教程' }))
    await user.click(screen.getByRole('button', { name: '开始展示战' }))
    await user.click(screen.getByRole('button', { name: /确认换牌/ }))
    expect(await screen.findByRole('button', { name: '结束回合' })).toBeInTheDocument()

    expect(screen.queryByText('拖动手牌到战场或目标；拖动随从/英雄攻击。')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: '牌库' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '执行推荐动作' })).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: '巫妖森林棋盘' })).not.toBeInTheDocument()
    const opponentHero = screen.getByRole('region', { name: '旅店老板' })
    expect(opponentHero).toHaveAttribute('data-health-current', '30')
    expect(opponentHero).toHaveAttribute('data-health-max', '30')
    expect(opponentHero.querySelector('.hero-health-badge')).toHaveTextContent('30')
    expect(opponentHero.querySelector('.health-fill')).toHaveStyle({ width: '100%' })
    expect(screen.getByLabelText('你的手牌')).toHaveAttribute('data-hand-count', '4')
    const opponentHand = screen.getByLabelText(/对手手牌/)
    expect(Number(opponentHand.getAttribute('data-hand-count'))).toBeGreaterThan(0)
  })

  it('isolates malformed storage and preserves a raw-download path', () => {
    localStorage.setItem(STORAGE_KEY, '{broken')
    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent('本地存储损坏')
    expect(screen.getByRole('button', { name: '下载损坏存储原文' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始展示战' })).toBeDisabled()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{broken')
  })

  it('refreshes the persisted root before importing through a stale controller', async () => {
    const storage = new MemoryStorageAdapter()
    const activeOwner = new SessionController(new GameRepository(storage), { now: () => '2026-08-24T00:00:00.000Z' }, { gameId: () => 'active-owner' })
    const staleImporter = new SessionController(new GameRepository(storage))
    await activeOwner.start(createShowcaseState())
    const completedSource = new SessionController(new GameRepository(new MemoryStorageAdapter()), { now: () => '2026-08-24T00:00:01.000Z' }, { gameId: () => 'completed-source' })
    await completedSource.start(createShowcaseState())
    await completedSource.dispatchAction(completedSource.snapshot()!.legalActions.find((action) => action.type === 'CONCEDE')!)
    const completedText = completedSource.exportCurrentLog()
    if (!completedText) throw new Error('missing completed fixture')

    await staleImporter.importLog({ size: completedText.length, text: async () => completedText })

    expect(staleImporter.getRoot().activeGameLog?.gameId).toBe('active-owner')
    expect(staleImporter.getRoot().completedGameLogs).toHaveLength(1)
  })
})
