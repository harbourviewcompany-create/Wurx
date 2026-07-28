import {
  Sparkles,
  Snowflake,
  Leaf,
  Wrench,
  Trash2,
  Home as HomeIcon,
  Fan,
  Droplet,
  Droplets,
  Zap,
  Bug,
  Hammer,
  KeyRound,
  Sofa,
  WashingMachine,
  SprayCan,
  PaintRoller,
  TreePine,
  Wind,
  Brush,
  Wifi,
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
  fan: Fan,
  droplet: Droplet,
  droplets: Droplets,
  zap: Zap,
  bug: Bug,
  hammer: Hammer,
  key: KeyRound,
  sofa: Sofa,
  'washing-machine': WashingMachine,
  'spray-can': SprayCan,
  'paint-roller': PaintRoller,
  'tree-pine': TreePine,
  wind: Wind,
  brush: Brush,
  wifi: Wifi,
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
