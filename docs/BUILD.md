# Wurx — Build notes

How we build and what to optimize. Validation for PRs is **GitHub Actions CI**, not Vercel previews.

## Commands

```bash
npm ci
npm run typecheck
npm test
npm run build
```

CI runs the same sequence on every PR to `main` (see `.github/workflows/ci.yml`).

## Next.js / Turbopack

- **Next.js 16** uses **Turbopack** for production builds by default.
- `next.config.js` enables `experimental.turbopackFileSystemCacheForBuild` so local warm rebuilds reuse compiler artifacts under `.next`.
- `lucide-react` is already tree-shaken by Next’s default `optimizePackageImports` list — no extra config needed.
- Fonts use `next/font` (see `app/layout.tsx`).

## Static vs dynamic

| Surface | Preference |
|---------|------------|
| Marketing (`/`, services, legal) | Static or `revalidate` |
| Auth-gated app (`/dashboard`, `/admin`, `/provider`) | `force-dynamic` or equivalent |

Avoid marking public pages `force-dynamic` unless personalization requires it.

## Deploy

- **Production:** Vercel deploys from `main` only (see `vercel.json` `git.deploymentEnabled` once that change is merged).
- **PRs:** rely on CI (`tsc` + vitest + `next build`). Ignore branch preview noise until previews are disabled.
- **Node:** `22.x` in CI; set the same on the Vercel project.

## When the app grows

```bash
npx next experimental-analyze
```

Use that before adding large client libraries (charts, maps, design systems).
