import { useId } from 'react'

/**
 * 루마 (Ruma), the mascot: a drop-shaped daruma with a curled tip and a gold spark on its belly.
 * It starts the day uncoloured and fills with red, like liquid rising, as today's study gets done.
 * `fill` is today's progress from 0 to 1. Before the day's study starts it is asleep (`mood="sleep"`).
 */
const INK = '#3a2c28'
const GOLD = '#f0c24f'
const BODY =
  'M79 4C80 14 67 16 50 21 27 28 11 45 11 66c0 26 21 44 49 44s49-18 49-44c0-17-8-31-21-40-8-5-10-12-9-22Z'
const FACE = 'M60 43c6-6 19-7 28 0 10 8 11 22 5 33-6 10-19 14-33 14s-27-4-33-14c-6-11-5-25 5-33 9-7 22-6 28 0Z'
const TOP = 4
const BOTTOM = 110

export function Ruma({
  fill,
  mood = 'idle',
  size = 96,
}: {
  fill: number
  mood?: 'idle' | 'cheer' | 'sleep'
  size?: number
}) {
  const id = useId()
  const f = Math.min(1, Math.max(0, fill))
  // a full body pushes the surface above the tip, an empty one below the base, so no wave line shows
  const level = f >= 1 ? TOP - 8 : f <= 0 ? BOTTOM + 8 : BOTTOM - f * (BOTTOM - TOP)

  const eye = (cx: number) => {
    if (mood === 'sleep')
      return <path d={`M${cx - 7} 65q7 6 14 0`} fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />
    if (mood === 'cheer')
      return <path d={`M${cx - 8} 68q8-12 16 0`} fill="none" stroke={INK} strokeWidth="4.2" strokeLinecap="round" />
    return (
      <>
        <ellipse cx={cx} cy="65" rx="8.5" ry="10" fill={INK} />
        <circle cx={cx - 2.6} cy="61" r="3.3" fill="#fff" />
        <circle cx={cx + 3} cy="69.5" r="1.5" fill="#fff" opacity=".9" />
      </>
    )
  }

  const brows =
    mood === 'sleep' ? 'M35 55q7 2 13 0M72 55q6 2 13 0' : mood === 'cheer' ? 'M34 50q7-6 14-3M72 47q7-3 14 3' : 'M35 51q6-5 13-2M72 49q7-3 13 2'

  return (
    <svg className={`ruma ${mood}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <clipPath id={`${id}b`}>
          <path d={BODY} />
        </clipPath>
      </defs>
      <ellipse cx="60" cy="113" rx="32" ry="4.5" fill="#000" opacity=".1" />
      <g className="ruma-body">
        <path d={BODY} className="ruma-empty" />
        <g clipPath={`url(#${id}b)`}>
          <g className="ruma-liquid" style={{ transform: `translateY(${level}px)` }}>
            {/* two wave layers drifting sideways; everything below them is solid colour */}
            <path className="wave back" d="M-60 0q15-7 30 0t30 0 30 0 30 0 30 0 30 0 30 0 30 0V130H-60Z" fill="#f08e76" />
            <path className="wave" d="M-60 3q15 7 30 0t30 0 30 0 30 0 30 0 30 0 30 0 30 0V130H-60Z" fill="#e2573f" />
            <g style={{ transform: `translateY(${-level}px)` }}>
              <path d="M6 74c7 24 27 38 54 38s47-14 54-38c-12 14-31 21-54 21S18 88 6 74Z" fill="#bf412d" style={{ clipPath: `inset(${Math.max(0, level + 6 - 74)}px 0 0 0)` }} />
            </g>
          </g>
        </g>
        <path d={BODY} className="ruma-outline" />
        <path d="M27 44c4-9 11-15 20-18" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".4" />
        <path d={FACE} fill="#fff7ea" />
        <path d={brows} fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
        {eye(44)}
        {eye(76)}
        <ellipse cx="32" cy="76" rx="6" ry="4" fill="#f4a59a" opacity=".85" />
        <ellipse cx="88" cy="76" rx="6" ry="4" fill="#f4a59a" opacity=".85" />
        {mood === 'cheer' ? (
          <>
            <path d="M53 73q7 12 14 0Z" fill={INK} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
            <path d="M56.5 78.5q3.5-3 7 0-3.5 3.5-7 0Z" fill="#f0907f" />
          </>
        ) : mood === 'sleep' ? (
          <ellipse cx="60" cy="76" rx="2.6" ry="3" fill={INK} />
        ) : (
          <path d="M54 75q3 3.5 6 0q3 3.5 6 0" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {/* belly spark */}
        <path d="M60 93.5q1.2 5.3 6.5 6.5-5.3 1.2-6.5 6.5-1.2-5.3-6.5-6.5 5.3-1.2 6.5-6.5Z" fill={GOLD} stroke={GOLD} strokeWidth="1.5" strokeLinejoin="round" />
      </g>
      {mood === 'sleep' && (
        <g className="ruma-zzz" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M99 32h8l-8 9h8" />
          <path d="M109 18h6l-6 7h6" />
          <path d="M116 7h4.5l-4.5 5h4.5" />
        </g>
      )}
      {mood === 'cheer' && (
        <g className="ruma-sparks" fill={GOLD}>
          <path d="M10 22l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" />
          <path d="M106 12l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5Z" />
          <path d="M113 42l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2Z" />
        </g>
      )}
    </svg>
  )
}
