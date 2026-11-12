import {
  Bookmark,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  House,
  Lock,
  Search,
  Settings,
  Sparkles,
  Star,
  Undo2,
  Volume2,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'

const ICONS = {
  home: House,
  book: BookOpen,
  gear: Settings,
  back: ChevronLeft,
  close: X,
  speaker: Volume2,
  mark: Bookmark,
  undo: Undo2,
  spark: Sparkles,
  check: Check,
  chevron: ChevronRight,
  search: Search,
  lock: Lock,
  flame: Flame,
  bolt: Zap,
  star: Star,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS

export function Icon({
  name,
  size = 22,
  fill = false,
  strokeWidth = 2,
}: {
  name: IconName
  size?: number
  fill?: boolean
  strokeWidth?: number
}) {
  const Cmp = ICONS[name]
  return <Cmp size={size} strokeWidth={strokeWidth} fill={fill ? 'currentColor' : 'none'} aria-hidden="true" />
}
