import type { MetadataRoute } from 'next'

/**
 * Installable-app manifest. Homeowners who book repeatedly add Wurx to their
 * home screen; `standalone` + the brand background make that launch look like
 * an app rather than a browser tab.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Wurx — Subscription home services',
    short_name: 'Wurx',
    description:
      'Book cleaning, snow removal, lawn care and handyman help with the minutes in your monthly plan.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0d12',
    theme_color: '#0b0d12',
    categories: ['lifestyle', 'productivity', 'utilities'],
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
    shortcuts: [
      { name: 'Book a service', url: '/dashboard/book' },
      { name: 'Your dashboard', url: '/dashboard' },
    ],
  }
}
