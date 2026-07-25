import {
  Sparkles,
  Snowflake,
  Leaf,
  Wrench,
  Trash2,
  Home as HomeIcon,
  CircleDot,
  type LucideIcon,
} from 'lucide-react'

// The `services.icon` column stores a short name (set by whoever adds a
// service row) rather than an emoji or a full component reference. This is
// the single place that maps those names to a real icon, so a bad/missing
// name degrades to a neutral fallback instead of printing raw text like
// "sparkles Home Cleaning" in the UI.
const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  snowflake: Snowflake,
  leaf: Leaf,
  wrench: Wrench,
  trash: Trash2,
  home: HomeIcon,
}

export function ServiceIcon({
  name,
  size = 18,
  className,
}: {
  name?: string | null
  size?: number
  className?: string
}) {
  const Icon = (name && ICONS[name]) || CircleDot
  return <Icon size={size} className={className} aria-hidden="true" />
}
