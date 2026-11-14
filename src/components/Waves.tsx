import { useId } from 'react'

/**
 * Seigaiha along the foot of Ruma's sky, like a horizon: one pattern tile filled with a single rect, in the sky's own
 * colours (so it cross-fades with them). No filters; vector, so it stays crisp at any pixel ratio. Home's sky and the
 * study screen's "오늘 끝" draw it (docs/design-system.md §3 "홈").
 */
export function Waves() {
  const id = useId()
  return (
    <svg className="waves" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={`${id}w`} width="40" height="20" patternUnits="userSpaceOnUse">
          {[
            [0, 0],
            [40, 0],
            [20, 10],
            [0, 20],
            [40, 20],
          ].map(([x, y]) => (
            <g key={`${x},${y}`}>
              <circle cx={x} cy={y} r="19.5" className="wave-fill" />
              <circle cx={x} cy={y} r="19.5" className="wave-line" />
              <circle cx={x} cy={y} r="14.5" className="wave-line" />
              <circle cx={x} cy={y} r="9.5" className="wave-line" />
              <circle cx={x} cy={y} r="4.5" className="wave-line" />
            </g>
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id}w)`} />
    </svg>
  )
}
