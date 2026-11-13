import {
  Bookmark,
  BookOpen,
  ChartColumn,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Flame,
  House,
  Info,
  Search,
  Settings,
  TriangleAlert,
  Undo2,
  Volume2,
  X,
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
  check: Check,
  chevron: ChevronRight,
  search: Search,
  flame: Flame,
  info: Info,
  circle: Circle,
  chart: ChartColumn,
  alert: TriangleAlert,
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
