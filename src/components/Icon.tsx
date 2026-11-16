import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleX,
  Info,
  RotateCcw,
  Search,
  TriangleAlert,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react'

/** The design's own drawings (24×24, round caps), drawn like Lucide's: `fill` fills their closed shapes. */
const DRAWN = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />,
  book: (
    <>
      <path d="M5 4h13a1 1 0 0 1 1 1v15H7a2 2 0 0 1-2-2z" />
      <path d="M5 18a2 2 0 0 1 2-2h12" fill="none" />
    </>
  ),
  chart: (
    <>
      <rect x="3" y="10" width="4" height="10" rx="1" />
      <rect x="10" y="4" width="4" height="16" rx="1" />
      <rect x="17" y="13" width="4" height="7" rx="1" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" fill="none" />
    </>
  ),
  flame: <path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" />,
  mark: <path d="M7 4h10v16l-5-4-5 4z" />,
  speaker: (
    <>
      <path d="M4 10v4h3l5 4V6L7 10z" />
      <path d="M16 9a4 4 0 0 1 0 6" fill="none" />
    </>
  ),
} as const

const ICONS = {
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
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS | keyof typeof DRAWN

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
  if (name in DRAWN)
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="icon">
        {DRAWN[name as keyof typeof DRAWN]}
      </svg>
    )
  const Cmp = ICONS[name as keyof typeof ICONS]
  return <Cmp size={size} strokeWidth={strokeWidth} fill={fill ? 'currentColor' : 'none'} aria-hidden="true" />
}
