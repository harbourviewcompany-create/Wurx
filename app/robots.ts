import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/env'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Signed-in surfaces have nothing crawlable and shouldn't appear in
        // search results even if a URL leaks into a sitemap or referrer.
        disallow: ['/dashboard', '/dashboard/', '/provider/', '/admin/', '/auth/', '/reset-password'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
