'use client'

import { RouteErrorPanel } from '@/components/RouteErrorPanel'

export default function UiStatesError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteErrorPanel error={error} reset={reset} context="service workspace" />
}
