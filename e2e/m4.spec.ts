import { expect, test } from '@playwright/test'

const STORAGE_KEY = 'hearthstone-web:v1'

test('M4 Chromium gate boots from the V2 storage compatibility envelope', async ({ page }) => {
  await page.addInitScript(({ key }) => {
    localStorage.setItem(key, JSON.stringify({
      schemaVersion: 2,
      rootVersion: 'm2-root-v1',
      revision: 4,
      activeGameLog: null,
      completedGameLogs: [],
      tutorialCompleted: true,
      wallet: { gold: 500 },
      collection: { ownedCount: {}, everOwnedCount: {} },
      packState: { openedPacks: 0, packsSinceLegendary: 0, packsSinceEpic: 0, firstSetLegendarySeen: false },
      packTransactions: [],
      rewardLedger: {},
      finalizedGames: {},
      migration: {
        sourceSchemaVersion: 1,
        migratedAt: '2026-08-24T00:00:00.000Z',
        sourceRaw: null,
        rewardPolicy: 'V1_MIGRATION_ZERO',
      },
    }))
  }, { key: STORAGE_KEY })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '炉石传说：旅店展示战' })).toBeVisible()
  await expect(page.getByRole('button', { name: '开始展示战' })).toBeEnabled()
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').schemaVersion, STORAGE_KEY)).toBe(2)
})
