import {
  BookOpen,
  Bookmark,
  ChartColumnBig,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleX,
  Flame,
  House,
  ImageIcon,
  Info,
  RotateCcw,
  Search,
  Settings,
  TriangleAlert,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react'

/** Every icon in the app is a Lucide icon (24×24, round caps). */
const ICONS = {
  home: House,
  book: BookOpen,
  chart: ChartColumnBig,
  gear: Settings,
  flame: Flame,
  mark: Bookmark,
  back: ChevronLeft,
  close: X,
  undo: Undo2,
  check: Check,
  chevron: ChevronRight,
  down: ChevronDown,
  search: Search,
  info: Info,
  circle: Circle,
  alert: TriangleAlert,
  again: RotateCcw,
  error: CircleX,
  success: CircleCheck,
  image: ImageIcon,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS

/**
 * One icon, always decorative (`aria-hidden`): the control around it carries the name. `fill` (the tab you are on, a
 * bookmarked word) lays a filled copy of the icon under its outline, so inner lines (the house's door, the book's
 * spine) stay drawn on top of the fill; the fill's colour is `currentColor` unless CSS sets it on `.icon-fill`.
 */
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
  const outline = <Cmp size={size} strokeWidth={strokeWidth} fill="none" aria-hidden="true" />
  if (!fill) return outline
  return (
    <span className="icon-filled" aria-hidden="true">
      <Cmp size={size} fill="currentColor" stroke="none" className="icon-fill" aria-hidden="true" />
      {outline}
    </span>
  )
}
