import type { Level } from '../data'

/**
 * A level's name on its own colour (docs/design-system.md §2 "급수 색"): N5 green, N4 yellow, N3 pink, N2 violet,
 * N1 sky, the same wherever a level is named. The name is always written: the colour never carries it alone.
 */
export function LevelBadge({ level, className }: { level: Level; className?: string }) {
  return (
    <span className={`level-badge ${className ?? ''}`} data-level={level}>
      N{level}
    </span>
  )
}
