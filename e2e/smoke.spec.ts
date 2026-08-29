import { expect, test } from '@playwright/test'

const STORAGE_KEY = 'hearthstone-web:v1'

test('M1 shell renders the main menu after tutorial completion', async ({ page }) => {
  await page.addInitScript(({ key }) => {
    localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, activeGameLog: null, completedGameLogs: [], tutorialCompleted: true }))
  }, { key: STORAGE_KEY })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '炉石传说：旅店展示战' })).toBeVisible()
})
