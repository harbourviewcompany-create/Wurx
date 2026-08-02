const baseUrl = (process.env.PRODUCTION_BASE_URL || 'https://wurx.vercel.app').replace(/\/$/, '')
const timeoutMs = 15_000

const publicPaths = ['/', '/pricing', '/login', '/signup']
const protectedPaths = ['/dashboard', '/provider/dashboard', '/admin']

async function request(path) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(`${baseUrl}${path}`, {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'user-agent': 'WurxProductionSmoke/1.0',
        accept: 'text/html,application/xhtml+xml',
      },
    })
  } finally {
    clearTimeout(timer)
  }
}

const failures = []

for (const path of publicPaths) {
  try {
    const response = await request(path)
    if (response.status < 200 || response.status >= 400) {
      failures.push(`${path}: expected 2xx/3xx, received ${response.status}`)
      continue
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
      failures.push(`${path}: expected HTML response, received ${contentType || 'no content-type'}`)
      continue
    }

    console.log(`PASS public ${path} -> ${response.status}`)
  } catch (error) {
    failures.push(`${path}: request failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

for (const path of protectedPaths) {
  try {
    const response = await request(path)
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      failures.push(`${path}: expected authentication redirect, received ${response.status}`)
      continue
    }

    const location = response.headers.get('location')
    if (!location) {
      failures.push(`${path}: redirect response did not include a Location header`)
      continue
    }

    const redirectUrl = new URL(location, baseUrl)
    if (redirectUrl.pathname !== '/login') {
      failures.push(`${path}: expected redirect to /login, received ${redirectUrl.pathname}`)
      continue
    }

    if (redirectUrl.searchParams.get('redirect') !== path) {
      failures.push(
        `${path}: expected redirect query to preserve ${path}, received ${redirectUrl.searchParams.get('redirect')}`,
      )
      continue
    }

    console.log(`PASS protected ${path} -> ${response.status} ${redirectUrl.pathname}${redirectUrl.search}`)
  } catch (error) {
    failures.push(`${path}: request failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (failures.length > 0) {
  console.error('\nProduction HTTP smoke failures:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`\nProduction HTTP smoke passed for ${baseUrl}`)
