import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://wurx.vercel.app'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/provider', '/admin', '/auth', '/reset-password'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
