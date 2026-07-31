'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  House,
  ListChecks,
  Search,
  UserRound,
  Wrench,
} from 'lucide-react'

const customerItems = [
  { href: '/dashboard', label: 'Home', icon: House },
  { href: '/services', label: 'Services', icon: Search },
  { href: '/dashboard/book', label: 'Book', icon: Wrench, primary: true },
  { href: '/dashboard#bookings', label: 'Bookings', icon: CalendarDays },
  { href: '/dashboard/profile', label: 'Account', icon: UserRound },
]

const providerItems = [
  { href: '/provider/dashboard', label: 'Jobs', icon: BriefcaseBusiness },
  { href: '/provider/dashboard#earnings', label: 'Earnings', icon: CircleDollarSign },
  { href: '/provider/dashboard#activity', label: 'Activity', icon: Bell },
  { href: '/provider/profile', label: 'Profile', icon: ListChecks },
  { href: '/dashboard', label: 'Customer', icon: House },
]

export function MobileBottomNav({ isProvider }: { isProvider: boolean }) {
  const pathname = usePathname()
  const providerMode = isProvider && pathname.startsWith('/provider')
  const items = providerMode ? providerItems : customerItems

  return (
    <nav
      className="mobile-bottom-nav"
      aria-label={providerMode ? 'Professional navigation' : 'Customer navigation'}
    >
      <div className="mobile-bottom-nav-inner">
        {items.map(({ href, label, icon: Icon, primary }) => {
          const route = href.split('#')[0]
          const active =
            route === '/dashboard'
              ? pathname === '/dashboard'
              : route === '/provider/dashboard'
                ? pathname === '/provider/dashboard'
                : pathname === route || pathname.startsWith(`${route}/`)

          return (
            <Link
              key={`${href}-${label}`}
              href={href}
              className={`mobile-nav-item${active ? ' is-active' : ''}${primary ? ' is-primary' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className="mobile-nav-icon" aria-hidden="true">
                <Icon size={primary ? 22 : 20} strokeWidth={2.2} />
              </span>
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
