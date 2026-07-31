import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const publicRoutes = [
  { path: '/', name: 'home' },
  { path: '/services', name: 'services' },
  { path: '/pricing', name: 'pricing' },
  { path: '/login', name: 'login' },
  { path: '/signup', name: 'signup' },
  { path: '/forgot-password', name: 'forgot-password' },
]

const credentials = {
  homeowner: {
    email: process.env.WURX_E2E_HOMEOWNER_EMAIL || process.env.WURX_E2E_EMAIL || '',
    password: process.env.WURX_E2E_HOMEOWNER_PASSWORD || process.env.WURX_E2E_PASSWORD || '',
  },
  professional: {
    email: process.env.WURX_E2E_PROFESSIONAL_EMAIL || '',
    password: process.env.WURX_E2E_PROFESSIONAL_PASSWORD || '',
  },
}

const visualBaselinesEnabled = process.env.WURX_VISUAL_BASELINES === '1'

function hasCredentials(account) {
  return Boolean(account.email && account.password)
}

function isRepresentativeMobile(testInfo) {
  return testInfo.project.name === 'chrome-390'
}

function dynamicMasks(page) {
  return [
    page.locator('time'),
    page.getByText(/\d+ minutes? to respond|Offer expiring/i),
  ]
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready
  })
  await page.waitForTimeout(300)
}

async function login(page, account) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.getByLabel(/email/i).fill(account.email)
    await page.getByLabel(/password/i).fill(account.password)
    await page.getByRole('button', { name: /log in/i }).click()
    try {
      await page.waitForURL(/\/dashboard/, { timeout: 30_000, waitUntil: 'domcontentloaded' })
      await settle(page)
      return
    } catch (error) {
      if (attempt === 3) throw error
      await page.waitForTimeout(attempt * 1_000)
    }
  }
}

async function capturePage(page, testInfo, name, options = {}) {
  const path = join('artifacts', 'screenshots', testInfo.project.name, `${name}.png`)
  mkdirSync(dirname(path), { recursive: true })
  const mask = options.mask ?? []
  await page.screenshot({ path, fullPage: true, animations: 'disabled', mask, maskColor: '#e8e3d8' })
  if (visualBaselinesEnabled) {
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
      animations: 'disabled',
      mask,
      maskColor: '#e8e3d8',
    })
  }
}

async function captureLocator(locator, testInfo, name, options = {}) {
  await expect(locator).toBeVisible()
  const path = join('artifacts', 'screenshots', testInfo.project.name, `${name}.png`)
  mkdirSync(dirname(path), { recursive: true })
  const mask = options.mask ?? []
  await locator.screenshot({ path, animations: 'disabled', mask, maskColor: '#e8e3d8' })
  if (visualBaselinesEnabled) {
    await expect(locator).toHaveScreenshot(`${name}.png`, {
      animations: 'disabled',
      mask,
      maskColor: '#e8e3d8',
    })
  }
}

async function expectNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  expect(metrics.document, `document overflow: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(metrics.viewport + 1)
  expect(metrics.body, `body overflow: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(metrics.viewport + 1)
}

async function expectPrimaryTouchTargets(page) {
  const selector = [
    'button:visible',
    'a.btn:visible',
    '.nav-toggle:visible',
    '.chip:visible',
    '.service-card:visible',
    '.mobile-nav-item:visible',
  ].join(', ')
  const targets = page.locator(selector)
  const failures = []
  for (let index = 0; index < (await targets.count()); index += 1) {
    const target = targets.nth(index)
    const box = await target.boundingBox()
    if (!box || box.width === 0 || box.height === 0) continue
    if (box.height < 47 || box.width < 47) {
      failures.push({
        text: (await target.textContent())?.trim().slice(0, 80),
        width: Math.round(box.width),
        height: Math.round(box.height),
      })
    }
  }
  expect(failures, `Touch targets below 48px: ${JSON.stringify(failures)}`).toEqual([])
}

async function expectAccessible(page, path) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(results.violations, `${path}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([])
}

for (const route of publicRoutes) {
  test(`${route.name} renders without responsive overflow`, async ({ page }, testInfo) => {
    await page.goto(route.path, { waitUntil: 'domcontentloaded' })
    await settle(page)
    await expect(page.locator('body')).toBeVisible()
    await expectNoHorizontalOverflow(page)

    const width = testInfo.project.use.viewport?.width ?? 1440
    if (width <= 430) await expectPrimaryTouchTargets(page)

    await capturePage(page, testInfo, route.name)
  })
}

test('public routes pass automated WCAG 2.2 AA checks', async ({ page }, testInfo) => {
  test.skip(!isRepresentativeMobile(testInfo), 'Run semantic accessibility scans at the representative Chrome mobile viewport.')

  for (const route of publicRoutes) {
    await page.goto(route.path, { waitUntil: 'domcontentloaded' })
    await settle(page)
    await expectAccessible(page, route.path)
  }
})

test('homeowner release surfaces reflow and capture cleanly', async ({ page }, testInfo) => {
  test.skip(!hasCredentials(credentials.homeowner), 'Authorized homeowner QA credentials are not configured.')
  await login(page, credentials.homeowner)

  for (const route of [
    { path: '/dashboard', name: 'homeowner-dashboard' },
    { path: '/dashboard/book', name: 'homeowner-booking' },
    { path: '/dashboard/profile', name: 'homeowner-account' },
  ]) {
    await page.goto(route.path, { waitUntil: 'domcontentloaded' })
    await settle(page)
    await expectNoHorizontalOverflow(page)
    const width = testInfo.project.use.viewport?.width ?? 1440
    if (width <= 430) await expectPrimaryTouchTargets(page)
    await capturePage(page, testInfo, route.name, { mask: dynamicMasks(page) })
  }

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  await settle(page)
  await captureLocator(page.locator('#activity'), testInfo, 'homeowner-activity', { mask: dynamicMasks(page) })
  await captureLocator(page.locator('#bookings'), testInfo, 'homeowner-bookings', { mask: dynamicMasks(page) })
})

test('professional release surfaces reflow and capture cleanly', async ({ page }, testInfo) => {
  test.skip(!hasCredentials(credentials.professional), 'Authorized professional QA credentials are not configured.')
  await login(page, credentials.professional)

  await page.goto('/provider/dashboard', { waitUntil: 'domcontentloaded' })
  await settle(page)
  await expect(page.getByText(/Professional workspace/i)).toBeVisible()
  await expectNoHorizontalOverflow(page)
  const width = testInfo.project.use.viewport?.width ?? 1440
  if (width <= 430) await expectPrimaryTouchTargets(page)
  await capturePage(page, testInfo, 'professional-dashboard', { mask: dynamicMasks(page) })
  await captureLocator(page.locator('#offers'), testInfo, 'professional-offers', { mask: dynamicMasks(page) })
  await captureLocator(page.locator('#earnings'), testInfo, 'professional-earnings', { mask: dynamicMasks(page) })
  await captureLocator(page.locator('#activity'), testInfo, 'professional-activity', { mask: dynamicMasks(page) })

  await page.goto('/provider/profile', { waitUntil: 'domcontentloaded' })
  await settle(page)
  await expectNoHorizontalOverflow(page)
  await capturePage(page, testInfo, 'professional-profile', { mask: dynamicMasks(page) })
})

test('homeowner and professional mobile navigation are labeled and keyboard reachable', async ({ page }, testInfo) => {
  test.skip(!isRepresentativeMobile(testInfo), 'Run navigation semantics at the representative Chrome mobile viewport.')
  test.skip(!hasCredentials(credentials.homeowner) || !hasCredentials(credentials.professional), 'Both authorized QA accounts are required.')

  await login(page, credentials.homeowner)
  const customerNav = page.getByRole('navigation', { name: /customer navigation/i })
  await expect(customerNav).toBeVisible()
  await expect(customerNav.getByRole('link')).toHaveCount(5)
  for (const label of ['Home', 'Services', 'Book', 'Bookings', 'Account']) {
    await expect(customerNav.getByText(label, { exact: true })).toBeVisible()
  }
  await customerNav.getByRole('link').first().focus()
  await expect(customerNav.getByRole('link').first()).toBeFocused()

  await page.context().clearCookies()
  await login(page, credentials.professional)
  await page.goto('/provider/dashboard')
  await settle(page)
  const professionalNav = page.getByRole('navigation', { name: /professional navigation/i })
  await expect(professionalNav).toBeVisible()
  await expect(professionalNav.getByRole('link')).toHaveCount(5)
  for (const label of ['Jobs', 'Earnings', 'Activity', 'Profile', 'Customer']) {
    await expect(professionalNav.getByText(label, { exact: true })).toBeVisible()
  }
  await professionalNav.getByRole('link').first().focus()
  await expect(professionalNav.getByRole('link').first()).toBeFocused()
})

test('authenticated routes pass automated WCAG 2.2 AA checks', async ({ page }, testInfo) => {
  test.skip(!isRepresentativeMobile(testInfo), 'Run authenticated accessibility scans at the representative Chrome mobile viewport.')
  test.skip(!hasCredentials(credentials.homeowner) || !hasCredentials(credentials.professional), 'Both authorized QA accounts are required.')

  await login(page, credentials.homeowner)
  for (const path of ['/dashboard', '/dashboard/book', '/dashboard/profile']) {
    await page.goto(path, { waitUntil: 'domcontentloaded' })
    await settle(page)
    await expectAccessible(page, path)
  }

  await page.context().clearCookies()
  await login(page, credentials.professional)
  for (const path of ['/provider/dashboard', '/provider/profile']) {
    await page.goto(path, { waitUntil: 'domcontentloaded' })
    await settle(page)
    await expectAccessible(page, path)
  }
})

test('service search has an understandable empty state', async ({ page }, testInfo) => {
  test.skip(!isRepresentativeMobile(testInfo), 'Run the interactive empty state at the representative Chrome mobile viewport.')
  test.skip(!hasCredentials(credentials.homeowner), 'Authorized homeowner QA credentials are not configured.')

  await login(page, credentials.homeowner)
  await page.goto('/dashboard/book')
  await settle(page)
  await page.getByRole('searchbox', { name: /search services/i }).fill('zzzz-no-service')
  await expect(page.getByText(/No match for/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /show all services/i })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await capturePage(page, testInfo, 'homeowner-booking-empty')
})

test('loading empty error and long-content states remain usable', async ({ page }, testInfo) => {
  test.skip(!isRepresentativeMobile(testInfo), 'Run resilient-state coverage at the representative Chrome mobile viewport.')

  for (const state of ['loading', 'empty', 'long-content', 'error']) {
    await page.goto(`/qa/ui-states?state=${state}`, { waitUntil: 'domcontentloaded' })
    await settle(page)
    await expectNoHorizontalOverflow(page)
    await expect(page.locator('main')).toBeVisible()
    await capturePage(page, testInfo, `state-${state}`)
  }
})

test('large-text reflow preserves homeowner functionality', async ({ page }, testInfo) => {
  test.skip(!isRepresentativeMobile(testInfo), 'Run 200% text coverage at the representative Chrome mobile viewport.')
  test.skip(!hasCredentials(credentials.homeowner), 'Authorized homeowner QA credentials are not configured.')

  await login(page, credentials.homeowner)
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  await settle(page)
  await expectNoHorizontalOverflow(page)
  await expect(page.getByRole('link', { name: /book a service/i })).toBeVisible()
  await capturePage(page, testInfo, 'homeowner-large-text', { mask: dynamicMasks(page) })
})

test('reduced motion disables non-essential running animations', async ({ page }, testInfo) => {
  test.skip(!isRepresentativeMobile(testInfo), 'Run reduced-motion behavior at the representative Chrome mobile viewport.')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/services', { waitUntil: 'domcontentloaded' })
  await settle(page)
  const runningAnimations = await page.evaluate(() =>
    document.getAnimations().filter((animation) => animation.playState === 'running').length,
  )
  expect(runningAnimations).toBe(0)
  await capturePage(page, testInfo, 'services-reduced-motion')
})
