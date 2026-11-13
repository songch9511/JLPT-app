import { useId } from 'react'

/**
 * 루마 (Ruma), the mascot: a round red daruma with gold stripes, a white face and a small, soft doodle face.
 * As with a real daruma, its eyes get painted in: asleep before the day's study starts
 * (`mood="sleep"`), one eye painted once it starts, and the other eye growing with today's
 * progress until both are painted when the day's cards are done. `progress` runs from 0 to 1.
 */
const INK = '#2a2022'
const GOLD = '#f0c24f'
const BODY = 'M60 9c30 0 49 24 49 54 0 28-20 47-49 47S11 91 11 63C11 33 30 9 60 9Z'
const FACE = 'M60 34c16 0 28 3 34 10 6 8 6 22 0 30-6 7-18 10-34 10s-28-3-34-10c-6-8-6-22 0-30 6-7 18-10 34-10Z'
const EYE_Y = 64
const EYE_R = 6

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
      <path d={`M${cx - 5.5} ${EYE_Y}q5.5 4.5 11 0`} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
    ) : (
      <>
        <circle cx={cx} cy={EYE_Y} r={EYE_R} fill="#fff" stroke={INK} strokeWidth="2" />
        <g className="ruma-pupil" style={{ transform: `scale(${painted})` }}>
          <g className="ruma-blink">
            <circle cx={cx} cy={EYE_Y} r={EYE_R - 0.4} fill={INK} />
            {painted >= 1 && (
              <>
                <circle cx={cx - 1.8} cy={EYE_Y - 2} r="1.9" fill="#fff" />
                <circle cx={cx + 2} cy={EYE_Y + 2.2} r=".9" fill="#fff" />
              </>
            )}
          </g>
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
          <stop offset="0" stopColor="#fffdf8" />
          <stop offset="1" stopColor="#f3e7d6" />
        </linearGradient>
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
        <path d={FACE} fill={`url(#${id}v)`} stroke={GOLD} strokeWidth="1.8" />
        {/* blush, hatched like a pencil doodle */}
        <ellipse cx="30" cy="72.5" rx="7" ry="4.2" fill="#f7a9b4" />
        <ellipse cx="90" cy="72.5" rx="7" ry="4.2" fill="#f7a9b4" />
        <path d="M27 74.500l1.6-4M30 74.500l1.6-4M33 74.500l1.6-4M87 74.500l1.6-4M90 74.500l1.6-4M93 74.500l1.6-4" fill="none" stroke="#e8798b" strokeWidth="1.1" strokeLinecap="round" />
        {/* small brows and mouth */}
        <g className="ruma-marks" fill="none" stroke={INK} strokeLinecap="round" strokeLinejoin="round">
          <path d="M36 52q5-3.5 10-2.5" strokeWidth="2.4" />
          <path d="M84 52q-5-3.5-10-2.5" strokeWidth="2.4" />
          {mood === 'cheer' ? (
            <path d="M55 69q5 8 10 0Z" fill="#e8798b" strokeWidth="2.2" />
          ) : mood === 'sleep' ? (
            <circle cx="60" cy="71" r="1.6" fill={INK} stroke="none" />
          ) : (
            <path d="M55 69q2.5 3.6 5 0q2.5 3.6 5 0" strokeWidth="2.2" />
          )}
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
