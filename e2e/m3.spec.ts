import { expect, test, type Page } from '@playwright/test'

const STORAGE_KEY = 'hearthstone-web:v1'

function readyRoot() {
  return { schemaVersion: 1, activeGameLog: null, completedGameLogs: [], tutorialCompleted: true }
}

async function dragCardToTarget(page: Page, sourceSelector: string, targetSelector: string): Promise<void> {
  const board = page.locator('.hearth-board')
  const previousEventKey = await board.getAttribute('data-event-key')
  const source = page.locator(sourceSelector).first()
  const target = page.locator(targetSelector).first()
  await source.scrollIntoViewIfNeeded()
  await target.scrollIntoViewIfNeeded()
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  expect(sourceBox).not.toBeNull()
  expect(targetBox).not.toBeNull()
  if (!sourceBox || !targetBox) throw new Error('M3_DRAG_GEOMETRY_MISSING')
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator('[data-drag-preview]')).toHaveCount(0)
  await expect.poll(() => board.getAttribute('data-event-key')).not.toBe(previousEventKey)
  await expect(board).toHaveAttribute('data-animation-state', 'complete')
  await expect(page.getByRole('status')).toHaveText('命令已就绪')
}

test('M3 Chromium gate keeps Discover in a true focus-contained dialog', async ({ page }) => {
  await page.addInitScript(({ key, root }) => localStorage.setItem(key, JSON.stringify(root)), {
    key: STORAGE_KEY,
    root: readyRoot(),
  })
  await page.goto('/')
  await page.getByRole('button', { name: '开始展示战' }).click()
  await page.getByRole('button', { name: /确认换牌/ }).click()
  await page.getByRole('button', { name: '跳过动画' }).click()
  await expect(page.locator('.hearth-board')).toHaveAttribute('data-animation-state', 'complete')
  await expect(page.getByRole('status')).toHaveText('命令已就绪')

  for (let turn = 0; turn < 32; turn += 1) {
    const discover = page.getByRole('dialog', { name: '发现选项' })
    if (await discover.isVisible()) {
      await expect(discover).toHaveAttribute('aria-modal', 'true')
      await expect(discover).toHaveAttribute('open', '')
      const dialogState = await discover.evaluate((element) => {
        const dialog = element as HTMLDialogElement
        return { open: dialog.open, modal: dialog.matches(':modal') }
      })
      expect(dialogState).toEqual({ open: true, modal: true })
      const choice = discover.locator('.discover-choices .game-card').first()
      await expect(choice).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(discover).toContainText('发现选项')
      await page.keyboard.press('Escape')
      await expect(discover).toBeVisible()
      await expect(discover).toHaveAttribute('open', '')
      const afterEscape = await discover.evaluate((element) => {
        const dialog = element as HTMLDialogElement
        return { open: dialog.open, modal: dialog.matches(':modal'), activeInside: dialog.contains(document.activeElement) }
      })
      expect(afterEscape).toEqual({ open: true, modal: true, activeInside: true })

      await choice.hover()
      await expect(discover.locator('[data-inspection-overlay]')).toHaveCount(1)
      await expect(discover.locator('.inspection-card')).toHaveAttribute('aria-label', /公开预览/)
      await expect(discover.locator('.inspection-layer')).toHaveCSS('pointer-events', 'none')
      await choice.focus()
      await expect(choice).toBeFocused()

      const cleanupSequence = page.evaluate(() => new Promise<string[]>((resolve) => {
        const sequence: string[] = []
        const observer = new MutationObserver(() => {
          if (!document.querySelector('[data-inspection-overlay]') && !sequence.includes('inspection-cleared')) sequence.push('inspection-cleared')
          if (!document.querySelector('.discover-overlay')) {
            sequence.push('dialog-unmounted')
            observer.disconnect()
            resolve(sequence)
          }
        })
        observer.observe(document.body, { childList: true, subtree: true })
      }))
      await dragCardToTarget(page, '.discover-choices .game-card', '.discover-slot')
      const sequence = await cleanupSequence
      expect(sequence.indexOf('inspection-cleared')).toBeGreaterThanOrEqual(0)
      expect(sequence.indexOf('dialog-unmounted')).toBeGreaterThan(sequence.indexOf('inspection-cleared'))
      await expect(page.locator('.discover-overlay')).toHaveCount(0)
      await expect(page.locator('[data-inspection-overlay]')).toHaveCount(0)
      await expect(page.locator('[data-drag-preview]')).toHaveCount(0)
      return
    }
    if (await page.locator('.player-hand .drag-source[data-card-definition-id="BAR_541"]').count()) {
      await dragCardToTarget(page, '.player-hand .drag-source[data-card-definition-id="BAR_541"]', '.hero-strip[aria-label="旅店老板"] .hero-portrait')
      continue
    }
    const eventKey = await page.locator('.hearth-board').getAttribute('data-event-key')
    await page.getByRole('button', { name: '结束回合' }).click()
    await expect.poll(() => page.locator('.hearth-board').getAttribute('data-event-key')).not.toBe(eventKey)
    await expect(page.locator('.hearth-board')).toHaveAttribute('data-animation-state', 'complete')
    await expect(page.getByRole('status')).toHaveText('命令已就绪')
  }
  throw new Error('M3_DISCOVER_DIALOG_NOT_REACHED')
})
