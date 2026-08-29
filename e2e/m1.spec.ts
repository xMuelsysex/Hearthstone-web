import { Buffer } from 'node:buffer'
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'

const STORAGE_KEY = 'hearthstone-web:v1'

function readyRoot() {
  return { schemaVersion: 1, activeGameLog: null, completedGameLogs: [], tutorialCompleted: true }
}

async function initializeReadyStorage(page: Page): Promise<void> {
  await page.addInitScript(({ key, root }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(root))
  }, {
    key: STORAGE_KEY,
    root: readyRoot(),
  })
}

async function startShowcase(page: Page, skipAnimations = true): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: '开始展示战' }).click()
  await page.getByRole('button', { name: /确认换牌/ }).click()
  if (skipAnimations) await page.getByRole('button', { name: '跳过动画' }).click()
  await expect(page.locator('.player-hand')).toBeVisible()
  await expect(page.locator('.hearth-board')).toHaveAttribute('data-animation-state', 'complete')
}

function handCard(page: Page, definitionId: string): Locator {
  return page.locator(`.player-hand .game-card[data-card-definition-id="${definitionId}"]`).first()
}

function draggableHandCard(page: Page, definitionId: string): Locator {
  return page.locator(`.player-hand .drag-source[data-card-definition-id="${definitionId}"]`).first()
}

function boardCard(page: Page, board: 'player' | 'opponent', definitionId?: string): Locator {
  const row = page.locator(board === 'player' ? '.player-board' : '.opponent-board')
  return (definitionId ? row.locator(`.game-card[data-card-definition-id="${definitionId}"]`) : row.locator('.game-card')).first()
}

function draggableBoardCard(page: Page, board: 'player' | 'opponent', definitionId?: string): Locator {
  const row = page.locator(board === 'player' ? '.player-board' : '.opponent-board')
  const selector = definitionId ? `.game-card.drag-source[data-card-definition-id="${definitionId}"]` : '.game-card.drag-source'
  return row.locator(selector).first()
}

function hero(page: Page, label: string): Locator {
  return page.locator(`.hero-strip[aria-label="${label}"] .hero-portrait`)
}

async function clickControlAndWaitForBatch(page: Page, button: Locator): Promise<void> {
  const board = page.locator('.hearth-board')
  await expect(board).toHaveAttribute('data-animation-state', 'complete')
  await expect(page.getByRole('status')).toHaveText('命令已就绪')
  const previousEventKey = await board.getAttribute('data-event-key')
  await button.click()
  await expect.poll(() => board.getAttribute('data-event-key')).not.toBe(previousEventKey)
  await expect(board).toHaveAttribute('data-animation-state', 'complete')
}

async function dragAndWaitForBatch(page: Page, source: Locator, target: Locator): Promise<void> {
  const board = page.locator('.hearth-board')
  await expect(board).toHaveAttribute('data-animation-state', 'complete')
  await expect(page.getByRole('status')).toHaveText('命令已就绪')
  const previousEventKey = await board.getAttribute('data-event-key')
  await source.scrollIntoViewIfNeeded()
  await target.scrollIntoViewIfNeeded()
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  expect(sourceBox, 'drag source should have a layout box').not.toBeNull()
  expect(targetBox, 'drop target should have a layout box').not.toBeNull()
  if (!sourceBox || !targetBox) throw new Error('DRAG_GEOMETRY_MISSING')

  const startX = sourceBox.x + sourceBox.width / 2
  const startY = sourceBox.y + sourceBox.height / 2
  const endX = targetBox.x + targetBox.width / 2
  const endY = targetBox.y + targetBox.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await expect(page.locator('[data-drag-preview]')).toBeVisible()
  const previewBefore = await page.locator('[data-drag-preview]').boundingBox()
  await page.mouse.move(endX, endY, { steps: 8 })
  await expect(target).toHaveClass(/drop-target-active/)
  const previewAfter = await page.locator('[data-drag-preview]').boundingBox()
  expect(previewBefore).not.toBeNull()
  expect(previewAfter).not.toBeNull()
  if (previewBefore && previewAfter) {
    expect(Math.hypot(previewAfter.x - previewBefore.x, previewAfter.y - previewBefore.y)).toBeGreaterThan(8)
    const boardBox = await board.boundingBox()
    expect(boardBox).not.toBeNull()
    if (boardBox) {
      const previewRight = previewAfter.x + (previewAfter.width ?? 0)
      const hasRoomLeftOfPointer = endX - boardBox.x > (previewAfter.width ?? 0) + 16
      if (hasRoomLeftOfPointer) expect(previewRight).toBeLessThanOrEqual(endX + 2)
      else expect(previewAfter.x).toBeLessThanOrEqual(boardBox.x + 18)
    }
  }
  await page.mouse.up()
  await expect(page.locator('[data-drag-preview]')).toHaveCount(0)
  await expect.poll(() => board.getAttribute('data-event-key')).not.toBe(previousEventKey)
  await expect(board).toHaveAttribute('data-animation-state', 'complete')
}

async function completeShowcase(page: Page): Promise<void> {
  const restart = page.getByRole('button', { name: '重新开始展示战' })
  for (let index = 0; index < 32; index += 1) {
    if (await restart.isVisible()) break
    if (await page.locator('.discover-overlay').isVisible()) {
      await dragAndWaitForBatch(page, page.locator('.discover-choices .game-card').first(), page.locator('.discover-slot'))
      continue
    }

    const coverage = await page.locator('.coverage-panel').innerText()
    if (!coverage.includes('✓ 剧毒')) {
      const poisonousOnBoard = draggableBoardCard(page, 'player', 'DRG_066')
      if (await poisonousOnBoard.count()) {
        await dragAndWaitForBatch(page, poisonousOnBoard, boardCard(page, 'opponent'))
      } else if (await draggableHandCard(page, 'DRG_066').count()) {
        await dragAndWaitForBatch(page, draggableHandCard(page, 'DRG_066'), page.locator('.player-board'))
      } else {
        await clickControlAndWaitForBatch(page, page.getByRole('button', { name: '结束回合' }))
      }
      continue
    }
    if (!coverage.includes('✓ 发现') && await draggableHandCard(page, 'BAR_541').count()) {
      await dragAndWaitForBatch(page, draggableHandCard(page, 'BAR_541'), hero(page, '旅店老板'))
      continue
    }
    const availableMana = Number(await page.locator('.player-hand').getAttribute('data-available-mana') ?? '0')
    if (!coverage.includes('✓ 法力渴求') && availableMana >= 8 && await draggableHandCard(page, 'RLK_843').count()) {
      await dragAndWaitForBatch(page, draggableHandCard(page, 'RLK_843'), hero(page, '旅店老板'))
      continue
    }
    if (!coverage.includes('✓ 磁力') && await draggableHandCard(page, 'BOT_563').count()) {
      await dragAndWaitForBatch(page, draggableHandCard(page, 'BOT_563'), boardCard(page, 'player', 'BOT_309'))
      continue
    }
    await clickControlAndWaitForBatch(page, page.getByRole('button', { name: '结束回合' }))
  }
  await expect(restart).toBeVisible()
  await expect(page.getByRole('status')).toContainText('胜利 · CONCEDE')
  await expect(page.locator('.coverage-panel .complete')).toHaveCount(5)
}

async function createSourceLogs(browser: Browser): Promise<{ active: string; completed: string }> {
  const context = await browser.newContext()
  await context.addInitScript(({ key, root }) => localStorage.setItem(key, JSON.stringify(root)), {
    key: STORAGE_KEY,
    root: readyRoot(),
  })
  const source = await context.newPage()
  await startShowcase(source)
  const active = await source.evaluate((key) => JSON.stringify(JSON.parse(localStorage.getItem(key) ?? '{}').activeGameLog), STORAGE_KEY)
  await completeShowcase(source)
  const completed = await source.evaluate((key) => {
    const root = JSON.parse(localStorage.getItem(key) ?? '{}')
    return JSON.stringify(root.completedGameLogs.at(-1))
  }, STORAGE_KEY)
  await context.close()
  return { active, completed }
}

test('first launch tutorial completes all five real-card steps and persists completion', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '法力渴求' })).toBeVisible()
  await page.getByRole('button', { name: '跳过动画' }).click()
  await expect(page.locator('.player-hand .game-card[data-card-definition-id="RLK_843"][data-tutorial-role="source"]')).toHaveCount(1)
  await expect(page.locator('.hero-strip[aria-label="旅店老板"] .hero-portrait[data-tutorial-role="target"]')).toHaveCount(1)

  await dragAndWaitForBatch(page, handCard(page, 'RLK_843'), hero(page, '旅店老板'))
  await expect(page.getByRole('button', { name: '下一步' })).toBeVisible()
  await page.getByRole('button', { name: '重置本步' }).click()
  await expect(page.getByRole('button', { name: '下一步' })).toHaveCount(0)
  await dragAndWaitForBatch(page, handCard(page, 'RLK_843'), hero(page, '旅店老板'))
  await page.getByRole('button', { name: '下一步' }).click()

  await expect(page.getByRole('heading', { name: '剧毒' })).toBeVisible()
  await expect(page.locator('.player-board .game-card[data-card-definition-id="DRG_066"][data-tutorial-role="source"]')).toHaveCount(1)
  await expect(page.locator('.opponent-board .game-card[data-card-definition-id="CS2_119"][data-tutorial-role="target"]')).toHaveCount(1)
  await dragAndWaitForBatch(page, boardCard(page, 'player', 'DRG_066'), boardCard(page, 'opponent', 'CS2_119'))
  await page.getByRole('button', { name: '下一步' }).click()

  await expect(page.getByRole('heading', { name: '扰魔' })).toBeVisible()
  await expect(page.locator('.player-hand .game-card[data-card-definition-id="BT_233"][data-tutorial-role="source"]')).toHaveCount(1)
  await expect(page.locator('.opponent-board .game-card[data-card-definition-id="DRG_066"][data-tutorial-role="excluded"]')).toHaveCount(1)
  await expect(page.locator('[data-card-definition-id="BOT_309"][data-tutorial-highlight]')).toHaveCount(0)
  await dragAndWaitForBatch(page, handCard(page, 'BT_233'), boardCard(page, 'opponent', 'BOT_309'))
  await page.getByRole('button', { name: '下一步' }).click()

  await expect(page.getByRole('heading', { name: '发现' })).toBeVisible()
  await expect(page.locator('.player-hand .game-card[data-card-definition-id="BAR_541"][data-tutorial-role="source"]')).toHaveCount(1)
  await expect(page.locator('.hero-strip[aria-label="旅店老板"] .hero-portrait[data-tutorial-role="target"]')).toHaveCount(1)
  await dragAndWaitForBatch(page, handCard(page, 'BAR_541'), hero(page, '旅店老板'))
  await expect(page.locator('.discover-overlay')).toBeVisible()
  await expect(page.locator('.discover-choices .game-card[data-tutorial-role="choice"]')).toHaveCount(3)
  await expect(page.locator('.discover-slot[data-tutorial-role="target"]')).toHaveAttribute('data-tutorial-highlight', 'true')
  await dragAndWaitForBatch(page, page.locator('.discover-choices .game-card').first(), page.locator('.discover-slot'))
  await page.getByRole('button', { name: '下一步' }).click()

  await expect(page.getByRole('heading', { name: '磁力' })).toBeVisible()
  await expect(page.locator('.player-hand .game-card[data-card-definition-id="BOT_563"][data-tutorial-role="source"]')).toHaveCount(1)
  await expect(page.locator('.player-board .game-card[data-card-definition-id="BOT_309"][data-tutorial-role="target"]')).toHaveCount(1)
  await dragAndWaitForBatch(page, handCard(page, 'BOT_563'), boardCard(page, 'player', 'BOT_309'))
  await page.getByRole('button', { name: '完成教程' }).click()

  await expect(page.getByRole('heading', { name: '炉石传说：旅店展示战' })).toBeVisible()
  await expect(page.getByRole('button', { name: '重新教程' })).toBeVisible()
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').tutorialCompleted, STORAGE_KEY)).toBe(true)
})

test('showcase completes five keywords, exports a completed log, summarizes it, and restarts', async ({ page }) => {
  await initializeReadyStorage(page)
  await startShowcase(page)
  await completeShowcase(page)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出日志' }).click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).toBeTruthy()
  const exported = JSON.parse(await download.createReadStream().then(async (stream) => {
    if (!stream) throw new Error('missing download stream')
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    return Buffer.concat(chunks).toString('utf8')
  }))
  expect(exported).toMatchObject({ status: 'completed', result: 'PLAYER_WIN', endReason: 'CONCEDE' })
  expect(exported.totalEventCount).toBeGreaterThan(0)

  await page.getByRole('button', { name: '主菜单' }).click()
  await expect(page.getByRole('heading', { name: '最近完成对局' })).toBeVisible()
  await expect(page.locator('.log-summary')).toContainText('胜利')

  await page.getByRole('button', { name: '开始展示战' }).click()
  await expect(page.locator('.action-panel')).toContainText('确认换牌')
  await expect(page.locator('.drag-hint')).toHaveCount(0)
  await page.getByRole('button', { name: /确认换牌/ }).click()
  await expect(page.locator('.action-panel')).toHaveText('结束回合')
  await expect(page.locator('.action-panel .danger')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '执行推荐动作' })).toHaveCount(0)
  await expect(page.locator('.coverage-panel .complete')).toHaveCount(0)
})

test('Escape opens an empty settings shell and keeps surrender out of the action panel', async ({ page }) => {
  await initializeReadyStorage(page)
  await startShowcase(page)

  await expect(page.locator('.action-panel')).toHaveText('结束回合')
  await expect(page.locator('.action-panel')).not.toContainText('认输')
  await expect(page.locator('.drag-hint')).toHaveCount(0)

  await page.keyboard.press('Escape')
  const settings = page.getByRole('dialog', { name: '设置' })
  await expect(settings).toBeVisible()
  await expect(settings).toHaveAttribute('open', '')
  await expect(settings).toContainText('设置页面暂时保留空壳')
  await expect(settings.getByRole('button', { name: '认输' })).toBeVisible()

  await settings.getByRole('button', { name: '关闭' }).click()
  await expect(page.locator('.settings-overlay')).toHaveCount(0)
})

test('card runtime gems follow authoritative values after a magnetic merge', async ({ page }) => {
  await initializeReadyStorage(page)
  await startShowcase(page)

  let merged = false
  for (let index = 0; index < 40; index += 1) {
    const source = draggableHandCard(page, 'BOT_563')
    const target = boardCard(page, 'player', 'BOT_309')
    const availableMana = Number(await page.locator('.player-hand').getAttribute('data-available-mana') ?? '0')
    if (await source.count() > 0 && await target.count() > 0 && availableMana >= 5) {
      await expect(target).toHaveAttribute('data-card-attack-current', '1')
      await expect(target).toHaveAttribute('data-card-value-current', '5')
      await dragAndWaitForBatch(page, source, target)
      await expect(target).toHaveAttribute('data-card-attack-current', '7')
      await expect(target).toHaveAttribute('data-card-value-current', '10')
      await expect(target.locator('.card-attack')).toHaveText('7')
      await expect(target.locator('.card-health')).toHaveText('10')
      merged = true
      break
    }
    await clickControlAndWaitForBatch(page, page.getByRole('button', { name: '结束回合' }))
  }
  expect(merged, 'BOT_563 should become playable before the showcase ends').toBe(true)
})

test('refresh restores the active log and preserves the latest domain batch marker', async ({ page }) => {
  await initializeReadyStorage(page)
  await startShowcase(page)
  await clickControlAndWaitForBatch(page, page.getByRole('button', { name: '结束回合' }))
  await dragAndWaitForBatch(page, draggableHandCard(page, 'DRG_066'), page.locator('.player-board'))
  const eventKey = await page.locator('.hearth-board').getAttribute('data-event-key')

  await page.reload()
  await expect(page.getByRole('button', { name: '继续对局' })).toBeVisible()
  await page.getByRole('button', { name: '继续对局' }).click()
  await expect(page.locator('.hearth-board')).toHaveAttribute('data-event-key', eventKey ?? '')
  await expect(page.locator('.event-feed')).not.toContainText('等待第一条领域事件')
})

test('multi-tab start and active-log import reject conflicts while completed import preserves the active game', async ({ browser, page }) => {
  const sourceLogs = await createSourceLogs(browser)
  await initializeReadyStorage(page)
  const secondPage = await page.context().newPage()
  await page.goto('/')
  await secondPage.goto('/')

  await page.getByRole('button', { name: '开始展示战' }).click()
  const activeGameId = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').activeGameLog.gameId, STORAGE_KEY)
  await secondPage.getByRole('button', { name: '开始展示战' }).click()
  await expect(secondPage.getByRole('status')).toContainText('ACTIVE_GAME_CONFLICT')
  await expect.poll(() => secondPage.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').activeGameLog.gameId, STORAGE_KEY)).toBe(activeGameId)

  const input = secondPage.getByLabel('选择日志 JSON 文件')
  await input.setInputFiles({ name: 'active.json', mimeType: 'application/json', buffer: Buffer.from(sourceLogs.active) })
  await expect(secondPage.getByRole('status')).toContainText('导入失败：ACTIVE_GAME_CONFLICT')

  await input.setInputFiles({ name: 'completed.json', mimeType: 'application/json', buffer: Buffer.from(sourceLogs.completed) })
  await expect(secondPage.locator('.action-panel')).toContainText('确认换牌')
  await expect(secondPage.locator('.drag-hint')).toHaveCount(0)
  await expect(secondPage.getByRole('button', { name: /确认换牌/ })).toBeVisible()
  await expect(secondPage.getByRole('button', { name: '执行推荐动作' })).toHaveCount(0)
  await expect.poll(() => secondPage.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').activeGameLog.gameId, STORAGE_KEY)).toBe(activeGameId)
  await expect.poll(() => secondPage.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').completedGameLogs.length, STORAGE_KEY)).toBe(1)
})

test('blocked official assets render explicit fallbacks and the 720p layout has no horizontal overflow', async ({ page }) => {
  await initializeReadyStorage(page)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.route(/\/assets\/(?:board|card-back|cards|heroes|hero-powers)\//, (route) => route.abort())
  await page.goto('/?debug')
  await page.getByRole('button', { name: '开始展示战' }).click()

  await expect(page.locator('.board-art')).toHaveCount(0)
  await expect(page.locator('.hearth-board')).toHaveCSS('background-image', /gradient/)
  await expect(page.locator('.hero-portrait').first()).toBeVisible()
  await expect(page.locator('.hero-health-badge').first()).toHaveText('30')
  await expect(page.locator('.hero-player .hero-power-slot')).toHaveAttribute('data-card-cost-current', '2')
  await expect(page.locator('.hero-player .hero-power-cost')).toHaveText('2')
  await expect(page.getByRole('img', { name: /卡图素材加载失败/ }).first()).toBeVisible()
  await expect(page.locator('.debug-panel')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  for (const selector of ['.hearth-board', '.player-hand', '.action-panel', '.coverage-panel']) {
    const box = await page.locator(selector).boundingBox()
    expect(box, `${selector} should have a layout box`).not.toBeNull()
    expect((box?.y ?? 0) + (box?.height ?? 0), `${selector} should fit inside 720p`).toBeLessThanOrEqual(720)
  }
})

test('public inspection stays on public entities and inspection-only keyboard input is inert', async ({ page }) => {
  await initializeReadyStorage(page)
  await startShowcase(page)

  const publicCard = page.locator('.player-hand .game-card[data-card-definition-id="RLK_843"]').first()
  await expect(publicCard).toBeVisible()
  await publicCard.hover()
  await expect(page.locator('[data-inspection-overlay]')).toHaveCount(1)
  await expect(publicCard).toHaveAttribute('aria-describedby', 'card-keyword-tooltip')
  await expect(page.getByRole('tooltip')).toContainText('法力渴求')
  await expect(page.locator('.inspection-layer')).toHaveCSS('pointer-events', 'none')

  const hiddenCard = page.locator('.opponent-hand-card').first()
  await expect(hiddenCard).toHaveAttribute('data-hidden-card', 'true')
  for (const attribute of ['data-card-definition-id', 'data-inspection-key', 'tabindex', 'aria-describedby']) {
    await expect(hiddenCard).not.toHaveAttribute(attribute)
  }
  await expect(hiddenCard).not.toContainText(/法力渴求|剧毒|扰魔|发现|磁力/)

  const opponentHero = page.locator('.opponent-lane .hero-portrait')
  const previousEventKey = await page.locator('.hearth-board').getAttribute('data-event-key')
  await opponentHero.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Space')
  await expect(page.locator('.hearth-board')).toHaveAttribute('data-event-key', previousEventKey ?? '')
  await expect(page.locator('[data-inspection-overlay]')).toHaveCount(1)
})

test('desktop geometry fills both viewport sizes and keeps one scene control with compact mobile power', async ({ page }) => {
  await initializeReadyStorage(page)
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport)
    if (viewport.width !== 1280) await page.evaluate(() => localStorage.clear())
    await startShowcase(page)
    const metrics = await page.evaluate(() => {
      const read = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector)
        if (!element) return null
        const box = element.getBoundingClientRect()
        return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom }
      }
      return {
        viewport: { width: innerWidth, height: innerHeight },
        scroll: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
        shell: read('.game-shell'),
        board: read('.hearth-board'),
        opponentHero: read('.opponent-lane .hero-portrait'),
        playerHero: read('.player-lane .hero-portrait'),
        opponentHand: read('.opponent-hand'),
        playerHand: read('.player-hand'),
        action: read('.action-panel .secondary'),
        rail: read('.game-status'),
        deckPanel: read('.deck-panel'),
        opponentDeck: read('[data-deck-owner="opponent"]'),
        selfDeck: read('[data-deck-owner="self"]'),
        opponentPower: read('.hero-opponent .hero-power-slot'),
        playerPower: read('.hero-player .hero-power-slot'),
        playerMana: read('.hero-player .mana-crystal'),
        opponentMana: read('.hero-opponent .mana-crystal'),
      }
    })
    expect(metrics.shell?.width).toBe(viewport.width)
    expect(metrics.shell?.height).toBe(viewport.height)
    expect(metrics.scroll.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(metrics.scroll.height).toBeLessThanOrEqual(viewport.height + 1)
    expect(metrics.board?.bottom).toBeLessThanOrEqual(viewport.height + 1)
    expect(metrics.opponentHero?.y).toBeLessThan(metrics.playerHero?.y ?? 0)
    expect(metrics.opponentHand?.y).toBeGreaterThan(metrics.opponentHero?.bottom ?? 0)
    expect(metrics.playerHand?.y).toBeGreaterThan(metrics.playerHero?.bottom ?? 0)
    expect(Math.abs((metrics.opponentHero?.x ?? 0) + (metrics.opponentHero?.width ?? 0) / 2 - ((metrics.playerHero?.x ?? 0) + (metrics.playerHero?.width ?? 0) / 2))).toBeLessThan(4)
    expect(metrics.opponentPower?.x).toBeGreaterThan((metrics.opponentHero?.right ?? 0) - 1)
    expect(metrics.playerPower?.x).toBeGreaterThan((metrics.playerHero?.right ?? 0) - 1)
    expect(metrics.opponentMana?.width).toBeGreaterThan(0)
    expect(metrics.playerMana?.width).toBeGreaterThan(0)
    await expect(page.locator('.hero-player .mana-crystal')).toHaveAttribute('data-mana-current', /\d+/)
    await expect(page.locator('.hero-player .mana-crystal')).toHaveAttribute('data-mana-max', /\d+/)
    expect(metrics.action?.x).toBeGreaterThan(metrics.board?.x ?? 0)
    expect(metrics.action?.right).toBeLessThanOrEqual(viewport.width + 1)
    expect(metrics.rail?.x).toBeGreaterThanOrEqual(0)
    expect(metrics.rail?.right).toBeLessThanOrEqual(viewport.width + 1)
    expect(metrics.rail?.bottom).toBeLessThanOrEqual(viewport.height + 1)
    expect(metrics.deckPanel?.right).toBeLessThanOrEqual(viewport.width + 1)
    expect(metrics.opponentDeck?.width).toBeGreaterThan(0)
    expect(metrics.selfDeck?.width).toBeGreaterThan(0)
  }
})

test('deck trackers reveal public hand and deck counts on hover', async ({ page }) => {
  await initializeReadyStorage(page)
  await startShowcase(page)
  const selfDeck = page.locator('[data-deck-owner="self"]')
  await selfDeck.hover()
  await expect(selfDeck.locator('.deck-tooltip')).toBeVisible()
  await expect(selfDeck.locator('.deck-tooltip')).toHaveText(/手牌 \d+ · 牌库 \d+/)
  await expect(page.locator('[data-deck-owner="opponent"]')).toHaveAttribute('data-deck-state', 'has-cards')
})

async function observeSettleTransition(page: Page, previousEventKey: string | null, requireRunning: boolean): Promise<{ eventKey: string; running: boolean; complete: boolean }> {
  return page.evaluate(({ previousEventKey, requireRunning }) => new Promise((resolve) => {
    const board = document.querySelector<HTMLElement>('.hearth-board')
    const marker = document.querySelector<HTMLElement>('[data-settle-animation-marker]')
    if (!board || !marker) throw new Error('M1_SETTLE_MARKER_MISSING')
    let changedKey = ''
    let running = false
    const observer = new MutationObserver(() => {
      const currentKey = board.getAttribute('data-event-key') ?? ''
      if (currentKey !== previousEventKey) changedKey = currentKey
      if (changedKey && marker.getAttribute('data-animation-state') === 'running') running = true
      const complete = changedKey !== '' && marker.getAttribute('data-event-key') === changedKey && marker.getAttribute('data-animation-state') === 'complete'
      if (complete && (!requireRunning || running)) {
        observer.disconnect()
        resolve({ eventKey: changedKey, running, complete })
      }
    })
    observer.observe(board, { attributes: true, subtree: true, attributeFilter: ['data-event-key', 'data-animation-state'] })
  }), { previousEventKey, requireRunning })
}

test('settle marker exposes running to complete in standard motion and completes under reduced motion', async ({ page }) => {
  await initializeReadyStorage(page)
  await startShowcase(page, false)
  const standardPreviousKey = await page.locator('.hearth-board').getAttribute('data-event-key')
  const standardTransition = observeSettleTransition(page, standardPreviousKey, true)
  await page.getByRole('button', { name: '结束回合' }).click()
  await expect(page.getByRole('status')).toHaveText('命令已就绪')
  await expect(await standardTransition).toMatchObject({ running: true, complete: true })
  await expect(page.locator('[data-settle-animation-marker]')).toHaveCount(1)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => localStorage.clear())
  await startShowcase(page, false)
  const reducedPreviousKey = await page.locator('.hearth-board').getAttribute('data-event-key')
  const reducedTransition = observeSettleTransition(page, reducedPreviousKey, false)
  await page.getByRole('button', { name: '结束回合' }).click()
  await expect(page.getByRole('status')).toHaveText('命令已就绪')
  await expect(await reducedTransition).toMatchObject({ complete: true })
  await expect(page.locator('[data-settle-animation-marker]')).toHaveCount(1)
})
