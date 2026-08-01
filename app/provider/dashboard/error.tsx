'use client'

import { RouteErrorPanel } from '@/components/RouteErrorPanel'

export default function ProviderDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteErrorPanel error={error} reset={reset} context="professional workspace" />
}
