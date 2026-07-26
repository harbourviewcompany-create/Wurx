import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/env'

/** Public, indexable routes. Signed-in routes are excluded by robots.ts too. */
const ROUTES: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly' }[] =
  [
    { path: '/', priority: 1, changeFrequency: 'weekly' },
    { path: '/pricing', priority: 0.9, changeFrequency: 'weekly' },
    { path: '/services', priority: 0.9, changeFrequency: 'weekly' },
    { path: '/become-a-pro', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/signup', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/login', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/terms', priority: 0.2, changeFrequency: 'yearly' },
    { path: '/privacy', priority: 0.2, changeFrequency: 'yearly' },
  ]

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }))
}
