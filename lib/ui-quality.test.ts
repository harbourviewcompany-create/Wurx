import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(path, 'utf8')
}

describe('Wurx August 2026 UI quality contracts', () => {
  it('loads the unified customer and professional design layers', () => {
    const layout = source('app/layout.tsx')
    expect(layout).toContain("import './wurx-ui.css'")
    expect(layout).toContain("import './wurx-provider.css'")
    expect(layout).toContain('viewportFit:')
    expect(layout).toContain('Skip to main content')
    expect(layout).toContain('id="main-content"')
  })

  it('provides five labeled mobile destinations for each signed-in mode', () => {
    const navigation = source('components/MobileBottomNav.tsx')
    const customerBlock = navigation.slice(navigation.indexOf('const customerItems'), navigation.indexOf('const providerItems'))
    const providerBlock = navigation.slice(navigation.indexOf('const providerItems'), navigation.indexOf('export function'))

    expect(customerBlock.match(/label:/g)).toHaveLength(5)
    expect(providerBlock.match(/label:/g)).toHaveLength(5)
    expect(customerBlock).toContain("label: 'Bookings'")
    expect(customerBlock).toContain("label: 'Account'")
    expect(providerBlock).toContain("label: 'Earnings'")
  })

  it('keeps exact available and reserved plan time visible', () => {
    const dashboard = source('app/dashboard/page.tsx')
    const booking = source('app/dashboard/book/page.tsx')

    expect(dashboard).toContain("select('available_minutes, held_minutes')")
    expect(dashboard).toContain('Available to book')
    expect(dashboard).toContain('reserved for upcoming bookings')
    expect(booking).toContain('available now')
    expect(booking).toContain('already reserved')
  })

  it('protects 320px reflow, safe areas, visible focus, and reduced motion', () => {
    const css = source('app/wurx-ui.css')
    expect(css).toContain('min-width: 320px')
    expect(css).toContain('overflow-x: clip')
    expect(css).toContain('env(safe-area-inset-bottom)')
    expect(css).toContain(':focus-visible')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('min-height: 48px')
  })

  it('includes loading, root-error, empty, and interactive error coverage', () => {
    expect(existsSync('app/dashboard/loading.tsx')).toBe(true)
    expect(existsSync('app/dashboard/book/loading.tsx')).toBe(true)
    expect(existsSync('app/global-error.tsx')).toBe(true)
    expect(source('components/ServiceBrowser.tsx')).toContain('No match for')
    expect(source('components/ServiceBrowser.tsx')).toContain('form-error')
    expect(source('app/services/page.tsx')).toContain('Services are being prepared')
    expect(source('app/pricing/page.tsx')).toContain('Plans are being prepared')
  })

  it('keeps homeowner and professional workspaces structurally separate', () => {
    expect(source('app/dashboard/page.tsx')).toContain('dashboard-shell')
    expect(source('app/provider/dashboard/page.tsx')).toContain('provider-shell')
    expect(source('app/provider/dashboard/page.tsx')).toContain('Professional workspace')
    expect(source('components/PayoutsCard.tsx')).toContain('id="earnings"')
    expect(source('components/NotificationsPanel.tsx')).toContain('id="activity"')
  })

  it('requires authenticated release evidence on the exact PR head', () => {
    const workflow = source('.github/workflows/ui-qa.yml')
    const playwright = source('tests/e2e/wurx-visual.pw.mjs')

    expect(workflow).toContain("WURX_REQUIRE_AUTH_QA: '1'")
    expect(workflow).toContain('Verify authenticated QA credentials are configured')
    expect(workflow).toContain('github.event.pull_request.head.sha')
    expect(workflow).toContain("WURX_VISUAL_BASELINES: '0'")
    expect(workflow).toContain("WURX_VISUAL_BASELINES_APPROVED: '0'")
    expect(playwright).toContain("process.env.WURX_REQUIRE_AUTH_QA === '1'")
    expect(playwright).toContain('Authenticated UI QA is required')
    expect(playwright).toContain('Visual baseline comparison cannot be enabled')
  })
})
