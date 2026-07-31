import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const publicRoutes = [
  { path: '/services', name: 'services' },
  { path: '/pricing', name: 'pricing' },
  { path: '/login', name: 'login' },
]

async function settle(page) {
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready
  })
  await page.waitForTimeout(250)
}

async function capture(page, testInfo, name) {
  const path = join('artifacts', 'screenshots', testInfo.project.name, `${name}.png`)
  mkdirSync(dirname(path), { recursive: true })
  await page.screenshot({ path, fullPage: true, animations: 'disabled' })
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

for (const route of publicRoutes) {
  test(`${route.name} renders without responsive overflow`, async ({ page }, testInfo) => {
    await page.goto(route.path, { waitUntil: 'domcontentloaded' })
    await settle(page)

    await expect(page.locator('body')).toBeVisible()
    await expectNoHorizontalOverflow(page)

    const width = testInfo.project.use.viewport?.width ?? 1440
    if (width <= 430) await expectPrimaryTouchTargets(page)

    await capture(page, testInfo, route.name)
  })
}

test('public routes pass automated WCAG AA checks', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'viewport-390', 'Run semantic accessibility scan at the representative mobile viewport.')

  for (const route of publicRoutes) {
    await page.goto(route.path, { waitUntil: 'domcontentloaded' })
    await settle(page)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(results.violations, `${route.path}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([])
  }
})

test('mobile navigation is labeled and keyboard reachable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'viewport-390', 'Run navigation semantics at the representative mobile viewport.')
  test.skip(!process.env.WURX_E2E_EMAIL || !process.env.WURX_E2E_PASSWORD, 'Authenticated QA credentials are not configured.')

  await page.goto('/login')
  await page.getByLabel(/email/i).fill(process.env.WURX_E2E_EMAIL)
  await page.getByLabel(/password/i).fill(process.env.WURX_E2E_PASSWORD)
  await page.getByRole('button', { name: /log in/i }).click()
  await page.waitForURL(/\/dashboard/)
  await settle(page)

  const nav = page.getByRole('navigation', { name: /customer navigation/i })
  await expect(nav).toBeVisible()
  await expect(nav.getByRole('link')).toHaveCount(5)
  await expect(nav.getByText('Home', { exact: true })).toBeVisible()
  await expect(nav.getByText('Services', { exact: true })).toBeVisible()
  await expect(nav.getByText('Book', { exact: true })).toBeVisible()
  await expect(nav.getByText('Bookings', { exact: true })).toBeVisible()
  await expect(nav.getByText('Account', { exact: true })).toBeVisible()
})

test('authenticated homeowner surfaces capture cleanly', async ({ page }, testInfo) => {
  test.skip(!process.env.WURX_E2E_EMAIL || !process.env.WURX_E2E_PASSWORD, 'Authenticated QA credentials are not configured.')

  await page.goto('/login')
  await page.getByLabel(/email/i).fill(process.env.WURX_E2E_EMAIL)
  await page.getByLabel(/password/i).fill(process.env.WURX_E2E_PASSWORD)
  await page.getByRole('button', { name: /log in/i }).click()
  await page.waitForURL(/\/dashboard/)

  for (const route of [
    { path: '/dashboard', name: 'dashboard-homeowner' },
    { path: '/dashboard/book', name: 'dashboard-book' },
    { path: '/dashboard/profile', name: 'dashboard-account' },
  ]) {
    await page.goto(route.path, { waitUntil: 'domcontentloaded' })
    await settle(page)
    await expectNoHorizontalOverflow(page)
    await capture(page, testInfo, route.name)
  }
})

test('service search has an understandable empty state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'viewport-390', 'Run interactive empty-state test at the representative mobile viewport.')
  test.skip(!process.env.WURX_E2E_EMAIL || !process.env.WURX_E2E_PASSWORD, 'Authenticated QA credentials are not configured.')

  await page.goto('/login')
  await page.getByLabel(/email/i).fill(process.env.WURX_E2E_EMAIL)
  await page.getByLabel(/password/i).fill(process.env.WURX_E2E_PASSWORD)
  await page.getByRole('button', { name: /log in/i }).click()
  await page.waitForURL(/\/dashboard/)
  await page.goto('/dashboard/book')
  await settle(page)

  await page.getByRole('searchbox', { name: /search services/i }).fill('zzzz-no-service')
  await expect(page.getByText(/No match for/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /show all services/i })).toBeVisible()
  await capture(page, testInfo, 'dashboard-book-empty')
})

test('professional workspace captures when the account is eligible', async ({ page }, testInfo) => {
  test.skip(!process.env.WURX_E2E_EMAIL || !process.env.WURX_E2E_PASSWORD, 'Authenticated QA credentials are not configured.')

  await page.goto('/login')
  await page.getByLabel(/email/i).fill(process.env.WURX_E2E_EMAIL)
  await page.getByLabel(/password/i).fill(process.env.WURX_E2E_PASSWORD)
  await page.getByRole('button', { name: /log in/i }).click()
  await page.waitForURL(/\/dashboard/)
  await page.goto('/provider/dashboard', { waitUntil: 'domcontentloaded' })
  await settle(page)

  test.skip(!page.url().includes('/provider/dashboard'), 'The configured QA account is not a professional account.')
  await expect(page.getByText(/Professional workspace/i)).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await capture(page, testInfo, 'dashboard-professional')
})
