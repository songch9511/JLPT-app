import { useId } from 'react'

/**
 * 루마 (Ruma), the mascot: a round red daruma with gold stripes, a dark glass face and glowing eyes.
 * As with a real daruma, its eyes get painted in: asleep before the day's study starts
 * (`mood="sleep"`), one eye painted once it starts, and the other eye growing with today's
 * progress until both are painted when the day's cards are done. `progress` runs from 0 to 1.
 */
const GLOW = '#ffe3a3'
const GOLD = '#f0c24f'
const BODY = 'M60 9c30 0 49 24 49 54 0 28-20 47-49 47S11 91 11 63C11 33 30 9 60 9Z'
const VISOR = 'M60 34c16 0 28 3 34 10 6 8 6 22 0 30-6 7-18 10-34 10s-28-3-34-10c-6-8-6-22 0-30 6-7 18-10 34-10Z'
const EYE_Y = 61
const EYE_R = 9.5

export function Ruma({
  progress,
  mood = 'idle',
  size = 96,
}: {
  progress: number
  mood?: 'idle' | 'cheer' | 'sleep'
  size?: number
}) {
  const id = useId()
  const p = Math.min(1, Math.max(0, progress))
  // The eye on the viewer's right is painted first, as tradition has it; the other fills in with progress.
  const first = p > 0 ? 1 : 0
  const second = p >= 1 ? 1 : p > 0 ? 0.3 + p * 0.5 : 0

  const eye = (cx: number, painted: number) =>
    mood === 'sleep' ? (
      <path d={`M${cx - 7} ${EYE_Y + 1}q7 5 14 0`} fill="none" stroke={GLOW} strokeWidth="3.4" strokeLinecap="round" opacity=".6" />
    ) : (
      <>
        <circle cx={cx} cy={EYE_Y} r={EYE_R} fill="#0b0809" stroke={GOLD} strokeWidth="1.8" />
        <g className="ruma-pupil" style={{ transform: `scale(${painted})` }}>
          <circle cx={cx} cy={EYE_Y} r={EYE_R - 2.6} fill={GLOW} filter={`url(#${id}g)`} opacity=".8" />
          <circle className="ruma-blink" cx={cx} cy={EYE_Y} r={EYE_R - 2.6} fill={GLOW} />
        </g>
      </>
    )

  return (
    <svg className={`ruma ${mood}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <clipPath id={`${id}b`}>
          <path d={BODY} />
        </clipPath>
        <radialGradient id={`${id}h`} cx="34%" cy="20%" r="62%">
          <stop offset="0" stopColor="#fff" stopOpacity=".45" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}d`} x1="0" y1="0" x2="0" y2="1">
          <stop offset=".55" stopColor="#3a0d05" stopOpacity="0" />
          <stop offset="1" stopColor="#3a0d05" stopOpacity=".34" />
        </linearGradient>
        <linearGradient id={`${id}v`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#34292b" />
          <stop offset="1" stopColor="#120e10" />
        </linearGradient>
        <filter id={`${id}g`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <filter id={`${id}f`} x="-30%" y="-100%" width="160%" height="300%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>
      <ellipse cx="60" cy="113" rx="30" ry="4" fill="#000" opacity=".22" filter={`url(#${id}f)`} />
      <g className="ruma-body">
        <g clipPath={`url(#${id}b)`}>
          <rect width="120" height="120" fill="#e0442f" />
          {/* gold stripes fanning up each side of the belly */}
          <g fill="none" stroke={GOLD} strokeLinecap="round">
            <path d="M14 80q3 14 13 24M106 80q-3 14-13 24" strokeWidth="5.5" />
            <path d="M25 87q3 11 11 19M95 87q-3 11-11 19" strokeWidth="5" />
            <path d="M37 91q2 8 7 14M83 91q-2 8-7 14" strokeWidth="4.5" />
          </g>
          {/* belly mark */}
          <path d="M60 89.500q1.6 7 8.5 8.5-6.9 1.6-8.5 8.5-1.6-6.9-8.5-8.5 6.9-1.5 8.5-8.500Z" fill={GOLD} stroke={GOLD} strokeWidth="1.5" strokeLinejoin="round" />
          {/* band around the crown */}
          <path d="M22 30q38-17 76 0" fill="none" stroke="#fff" strokeOpacity=".16" strokeWidth="4" strokeLinecap="round" />
          <rect width="120" height="120" fill={`url(#${id}d)`} />
          <rect width="120" height="120" fill={`url(#${id}h)`} />
        </g>
        <path d={BODY} className="ruma-outline" />
        <path d={VISOR} fill={`url(#${id}v)`} stroke={GOLD} strokeWidth="1.8" />
        <path d="M30 46c6-5 16-7 30-7" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".16" />
        {/* brows and moustache, the crane and the turtle of a daruma's face */}
        <g className="ruma-marks" fill="none" stroke={GOLD} strokeLinecap="round" strokeLinejoin="round">
          <path d="M57 44q-10-5-23 3" strokeWidth="3.2" />
          <path d="M63 44q10-5 23 3" strokeWidth="3.2" />
          <path d="M58 76q-9 5-22-1" strokeWidth="2.6" />
          <path d="M62 76q9 5 22-1" strokeWidth="2.6" />
        </g>
        {eye(45, second)}
        {eye(75, first)}
      </g>
      {mood === 'sleep' && (
        <g className="ruma-zzz" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M92 26h8l-8 9h8" />
          <path d="M103 12h6l-6 7h6" />
          <path d="M111 2h4.500l-4.5 5h4.5" />
        </g>
      )}
      {mood === 'cheer' && (
        <g className="ruma-sparks" fill={GOLD}>
          <path d="M10 22l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" />
          <path d="M106 12l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.500Z" />
          <path d="M113 42l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.200Z" />
        </g>
      )}
    </svg>
  )
}
