import { useId } from 'react'

/**
 * 루마 (Ruma), the mascot: a round porcelain daruma with a dark glass visor
 * with glowing eyes and a gold spark on its belly. It starts the day white and fills with red,
 * like liquid rising, as today's study gets done. `fill` is today's progress from 0 to 1.
 * Before the day's study starts it is asleep (`mood="sleep"`).
 */
const GLOW = '#ffe3a3'
const GOLD = '#f0c24f'
const BODY = 'M60 9c30 0 49 24 49 54 0 28-20 47-49 47S11 91 11 63C11 33 30 9 60 9Z'
const VISOR = 'M60 41c14 0 26 2 32 9 6 8 6 22 0 30-6 7-18 9-32 9s-26-2-32-9c-6-8-6-22 0-30 6-7 18-9 32-9Z'
const TOP = 9
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
  // a full body pushes the surface above the head, an empty one below the base, so no wave line shows
  const level = f >= 1 ? TOP - 8 : f <= 0 ? BOTTOM + 8 : BOTTOM - f * (BOTTOM - TOP)

  const eye = (cx: number) => {
    if (mood === 'sleep') return <path d={`M${cx - 7} 65q7 5 14 0`} fill="none" strokeWidth="3.6" strokeLinecap="round" />
    if (mood === 'cheer') return <path d={`M${cx - 8} 70q8-13 16 0`} fill="none" strokeWidth="5" strokeLinecap="round" />
    return <rect x={cx - 6} y="55.5" width="12" height="18" rx="6" stroke="none" />
  }
  const eyes = (
    <>
      {eye(45)}
      {eye(75)}
    </>
  )

  return (
    <svg className={`ruma ${mood}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <clipPath id={`${id}b`}>
          <path d={BODY} />
        </clipPath>
        <radialGradient id={`${id}s`} cx="38%" cy="30%" r="80%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".6" stopColor="#f3eee5" />
          <stop offset="1" stopColor="#d6cebf" />
        </radialGradient>
        <radialGradient id={`${id}h`} cx="34%" cy="24%" r="62%">
          <stop offset="0" stopColor="#fff" stopOpacity=".5" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}d`} x1="0" y1="0" x2="0" y2="1">
          <stop offset=".55" stopColor="#3a0d05" stopOpacity="0" />
          <stop offset="1" stopColor="#3a0d05" stopOpacity=".32" />
        </linearGradient>
        <linearGradient id={`${id}v`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#34292b" />
          <stop offset="1" stopColor="#120e10" />
        </linearGradient>
        <filter id={`${id}g`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
        <filter id={`${id}f`} x="-30%" y="-100%" width="160%" height="300%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>
      <ellipse cx="60" cy="113" rx="30" ry="4" fill="#000" opacity=".22" filter={`url(#${id}f)`} />
      <g className="ruma-body">
        <path d={BODY} fill={`url(#${id}s)`} />
        <g clipPath={`url(#${id}b)`}>
          <g className="ruma-liquid" style={{ transform: `translateY(${level}px)` }}>
            {/* two wave layers drifting sideways; everything below them is solid colour */}
            <path className="wave back" d="M-60 0q15-7 30 0t30 0 30 0 30 0 30 0 30 0 30 0 30 0V130H-60Z" fill="#f29079" />
            <path className="wave" d="M-60 3q15 7 30 0t30 0 30 0 30 0 30 0 30 0 30 0 30 0V130H-60Z" fill="#e4553c" />
          </g>
          {/* lighting over shell and liquid alike */}
          <rect width="120" height="120" fill={`url(#${id}d)`} />
          <rect width="120" height="120" fill={`url(#${id}h)`} />
        </g>
        <path d={BODY} className="ruma-outline" />
        <path d={VISOR} fill={`url(#${id}v)`} />
        <path d={VISOR} fill="none" stroke="#000" strokeOpacity=".28" strokeWidth="1.5" />
        <path d="M33 53c5-5 15-7 27-7" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity=".2" />
        <g className="ruma-eyes" fill={GLOW} stroke={GLOW}>
          <g filter={`url(#${id}g)`} opacity=".75">
            {eyes}
          </g>
          {eyes}
        </g>
        <path d="M19 50q-3 9-2 19M101 50q3 9 2 19" fill="none" stroke={GOLD} strokeWidth="3" strokeLinecap="round" />
        {/* belly spark */}
        <path d="M60 93q1.3 5.7 7 7-5.7 1.3-7 7-1.3-5.7-7-7 5.7-1.3 7-7Z" fill={GOLD} stroke={GOLD} strokeWidth="1.5" strokeLinejoin="round" />
      </g>
      {mood === 'sleep' && (
        <g className="ruma-zzz" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M92 26h8l-8 9h8" />
          <path d="M103 12h6l-6 7h6" />
          <path d="M111 2h4.5l-4.5 5h4.5" />
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
