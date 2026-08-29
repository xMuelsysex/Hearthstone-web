import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: '.artifacts/playwright-report', open: 'never' }],
  ],
  outputDir: '.artifacts/test-results',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'm0-chromium',
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'm1-chromium',
      testMatch: /m1\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'm3-chromium',
      testMatch: /m3\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'm4-chromium',
      testMatch: /m4\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'full-chromium',
      testMatch: /.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm exec vite preview --outDir .artifacts/dist --host 127.0.0.1 --port 4174',
    port: 4174,
    reuseExistingServer: false,
  },
})
