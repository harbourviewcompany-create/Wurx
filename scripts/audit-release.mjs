import { spawnSync } from 'node:child_process'

const allowedDevAdvisory = 'https://github.com/advisories/GHSA-7mvr-c777-76hp'
const allowedDevPackages = new Set(['playwright', '@playwright/test'])

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  return { ...result, stdout: result.stdout || '', stderr: result.stderr || '' }
}

function parseVersion(version) {
  return version
    .replace(/^[^0-9]*/, '')
    .split(/[.-]/)
    .slice(0, 3)
    .map((value) => Number.parseInt(value, 10) || 0)
}

function atLeast(version, minimum) {
  const left = parseVersion(version)
  const right = parseVersion(minimum)
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return true
    if (left[index] < right[index]) return false
  }
  return true
}

function advisoryUrls(vulnerability) {
  return (vulnerability.via ?? []).flatMap((entry) =>
    typeof entry === 'string' ? [] : entry.url ? [entry.url] : [],
  )
}

const audit = run('npm', ['audit', '--json', '--omit=dev'])
let report
try {
  report = JSON.parse(audit.stdout)
} catch {
  console.error(audit.stdout || audit.stderr)
  throw new Error('npm audit did not return valid JSON')
}

const blockers = []
const documentedDevOnly = []
for (const [name, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
  if (!['high', 'critical'].includes(vulnerability.severity)) continue
  const urls = advisoryUrls(vulnerability)
  const isDocumentedPlaywrightDevAdvisory =
    allowedDevPackages.has(name) && urls.length > 0 && urls.every((url) => url === allowedDevAdvisory)

  if (isDocumentedPlaywrightDevAdvisory) {
    documentedDevOnly.push(name)
    continue
  }
  blockers.push({ name, severity: vulnerability.severity, urls, nodes: vulnerability.nodes })
}

const dependencyTree = run('npm', ['ls', 'postcss', 'sharp', '--all', '--json'])
if (!dependencyTree.stdout) {
  console.error(dependencyTree.stderr)
  throw new Error('Unable to inspect the resolved PostCSS and sharp graph')
}
const tree = JSON.parse(dependencyTree.stdout)
const resolved = { postcss: new Set(), sharp: new Set() }

function walk(node) {
  for (const [name, dependency] of Object.entries(node.dependencies ?? {})) {
    if (name === 'postcss' || name === 'sharp') resolved[name].add(dependency.version)
    walk(dependency)
  }
}
walk(tree)

const unsafeResolvedVersions = [
  ...[...resolved.postcss].filter((version) => !atLeast(version, '8.5.18')).map((version) => ({ name: 'postcss', version })),
  ...[...resolved.sharp].filter((version) => !atLeast(version, '0.35.0')).map((version) => ({ name: 'sharp', version })),
]

if (unsafeResolvedVersions.length > 0) {
  blockers.push({ name: 'resolved dependency floor', versions: unsafeResolvedVersions })
}

if (blockers.length > 0) {
  console.error('Release-blocking dependency findings:')
  console.error(JSON.stringify(blockers, null, 2))
  process.exit(1)
}

console.log(`Resolved PostCSS versions: ${[...resolved.postcss].sort().join(', ') || 'not installed'}`)
console.log(`Resolved sharp versions: ${[...resolved.sharp].sort().join(', ') || 'not installed'}`)
if (documentedDevOnly.length > 0) {
  console.log(
    `Documented QA-tool advisory excluded from the production gate: ${documentedDevOnly.join(', ')}. Browser QA installs Playwright 1.55.1 or newer before downloading browsers.`,
  )
}
console.log('Production dependency audit passed.')
