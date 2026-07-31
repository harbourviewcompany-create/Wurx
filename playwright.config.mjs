import { defineConfig } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000'
const externalServer = Boolean(process.env.PLAYWRIGHT_BASE_URL)

const viewports = [
  ['320', 320, 820],
  ['360', 360, 860],
  ['375', 375, 900],
  ['390', 390, 920],
  ['430', 430, 940],
  ['768', 768, 1024],
  ['820', 820, 1080],
  ['1280', 1280, 900],
  ['1440', 1440, 1000],
]

export default defineConfig({
  testDir: './tests/ui',
  outputDir: 'artifacts/playwright-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 3 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'artifacts/playwright-report', open: 'never' }],
  ],
  use: {
    baseURL,
    locale: 'en-CA',
    timezoneId: 'America/Toronto',
    reducedMotion: 'reduce',
    colorScheme: 'light',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: viewports.map(([name, width, height]) => ({
    name: `viewport-${name}`,
    use: {
      viewport: { width, height },
      deviceScaleFactor: 1,
      isMobile: width <= 430,
      hasTouch: width <= 430,
    },
  })),
  webServer: externalServer
    ? undefined
    : {
        command: process.env.PLAYWRIGHT_SERVER_COMMAND || 'npm run dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
})
