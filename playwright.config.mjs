import { defineConfig } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000'
const externalServer = Boolean(process.env.PLAYWRIGHT_BASE_URL)

const chromeViewports = [
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

const webkitViewports = [
  ['390', 390, 920],
  ['820', 820, 1080],
  ['1440', 1440, 1000],
]

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.pw.mjs',
  outputDir: 'artifacts/playwright-results',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
  timeout: 75_000,
  expect: {
    timeout: 12_000,
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixelRatio: 0.005,
    },
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
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
  projects: [
    ...chromeViewports.map(([name, width, height]) => ({
      name: `chrome-${name}`,
      use: {
        browserName: 'chromium',
        channel: 'chrome',
        viewport: { width, height },
        deviceScaleFactor: 1,
        isMobile: width <= 430,
        hasTouch: width <= 430,
      },
    })),
    ...webkitViewports.map(([name, width, height]) => ({
      name: `webkit-${name}`,
      use: {
        browserName: 'webkit',
        viewport: { width, height },
        deviceScaleFactor: 1,
        isMobile: width <= 430,
        hasTouch: width <= 430,
      },
    })),
  ],
  webServer: externalServer
    ? undefined
    : {
        command: process.env.PLAYWRIGHT_SERVER_COMMAND || 'npm run dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
})
