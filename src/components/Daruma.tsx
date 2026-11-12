import { useId } from 'react'

/**
 * Kasane's mascot: a daruma that starts the day uncoloured and fills with red, like liquid rising,
 * as today's study gets done. `fill` is today's progress from 0 to 1.
 */
const INK = '#3a2c28'
const BODY = 'M60 10c31 0 49 24 49 53 0 28-20 47-49 47S11 91 11 63c0-29 18-53 49-53Z'
const TOP = 10
const BOTTOM = 110

export function Daruma({
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
  // a full body pushes the surface above the head so no wave line shows
  const level = f >= 1 ? TOP - 8 : BOTTOM - f * (BOTTOM - TOP)

  const eye = (cx: number) => {
    if (mood === 'sleep')
      return <path d={`M${cx - 7} 63q7 6 14 0`} fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    if (mood === 'cheer')
      return <path d={`M${cx - 8} 66q8-11 16 0`} fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
    return (
      <>
        <circle cx={cx} cy="63" r="9.5" fill={INK} />
        <circle cx={cx - 3} cy="59.5" r="3.4" fill="#fff" />
        <circle cx={cx + 3.5} cy="66.5" r="1.6" fill="#fff" opacity=".9" />
      </>
    )
  }

  return (
    <svg className={`daruma ${mood}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <clipPath id={`${id}b`}>
          <path d={BODY} />
        </clipPath>
      </defs>
      <ellipse cx="60" cy="113" rx="32" ry="4.5" fill="#000" opacity=".1" />
      <g className="daruma-body">
        <path d={BODY} className="daruma-empty" />
        <g clipPath={`url(#${id}b)`}>
          <g className="daruma-liquid" style={{ transform: `translateY(${level}px)` }}>
            {/* two wave layers drifting sideways; everything below them is solid colour */}
            <path className="wave back" d="M-60 0q15-7 30 0t30 0 30 0 30 0 30 0 30 0 30 0 30 0V130H-60Z" fill="#ec8a74" />
            <path className="wave" d="M-60 3q15 7 30 0t30 0 30 0 30 0 30 0 30 0 30 0 30 0V130H-60Z" fill="#dd5a44" />
            <g style={{ transform: `translateY(${-level}px)` }}>
              <path d="M14 78c7 20 24 32 46 32s39-12 46-32c-11 12-27 18-46 18s-35-6-46-18Z" fill="#bd4330" className="daruma-shade" style={{ clipPath: `inset(${Math.max(0, level + 6 - 78)}px 0 0 0)` }} />
            </g>
          </g>
        </g>
        <path d={BODY} className="daruma-outline" />
        <ellipse cx="38" cy="27" rx="13" ry="6" fill="#fff" opacity=".4" transform="rotate(-32 38 27)" />
        <path d="M60 36c23 0 36 11 36 28 0 16-14 26-36 26S24 80 24 64c0-17 13-28 36-28Z" fill="#fff7ea" className="daruma-face" />
        <path d="M36 50q8-5 14-1M70 49q6-4 14 1" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
        {eye(43)}
        {eye(77)}
        <ellipse cx="31" cy="74" rx="6.5" ry="4.5" fill="#f4a59a" opacity=".85" />
        <ellipse cx="89" cy="74" rx="6.5" ry="4.5" fill="#f4a59a" opacity=".85" />
        {mood === 'cheer' ? (
          <>
            <path d="M53 72q7 11 14 0Z" fill={INK} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
            <path d="M56.5 77q3.5-3 7 0-3.5 3.5-7 0Z" fill="#f0907f" />
          </>
        ) : (
          <path d="M54 73q3 3.5 6 0q3 3.5 6 0" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        )}
        <path d="M47 99q13-6 26 0" fill="none" stroke="#e6c15a" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="60" cy="103.5" r="2.6" fill="#e6c15a" />
        <path d="M19 52q-3 9-2 18M101 52q3 9 2 18" fill="none" stroke="#e6c15a" strokeWidth="3" strokeLinecap="round" />
      </g>
      {mood === 'cheer' && (
        <g className="daruma-sparks" fill="#e6c15a">
          <path d="M10 22l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" />
          <path d="M108 14l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5Z" />
          <path d="M112 44l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2Z" />
        </g>
      )}
    </svg>
  )
}
