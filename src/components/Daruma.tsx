/**
 * Kasane's mascot: a daruma. By tradition you paint one eye when you set a goal and the other
 * when you reach it — here the first eye fills in when today's study starts, the second when it's done.
 */
const INK = '#4a2f2f'

export function Daruma({
  eyes,
  mood = 'idle',
  size = 96,
}: {
  eyes: 0 | 1 | 2
  mood?: 'idle' | 'cheer' | 'sleep'
  size?: number
}) {
  const eye = (cx: number, filled: boolean) => {
    if (mood === 'sleep')
      return <path d={`M${cx - 7} 63q7 6 14 0`} fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    if (!filled) return <circle cx={cx} cy="63" r="9" fill="#fff" stroke="#e8c7ae" strokeWidth="2.5" />
    if (mood === 'cheer')
      // happy squint
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
      <ellipse cx="60" cy="113" rx="32" ry="4.5" fill="#000" opacity=".1" />
      <g className="daruma-body">
        {/* round, slightly squashed body */}
        <path d="M60 10c31 0 49 24 49 53 0 28-20 47-49 47S11 91 11 63c0-29 18-53 49-53Z" fill="#f4646b" />
        <path d="M14 78c7 20 24 32 46 32s39-12 46-32c-11 12-27 18-46 18s-35-6-46-18Z" fill="#dc4850" />
        <ellipse cx="38" cy="27" rx="13" ry="6" fill="#fff" opacity=".35" transform="rotate(-32 38 27)" />
        {/* big face, features set low and wide */}
        <path d="M60 36c23 0 36 11 36 28 0 16-14 26-36 26S24 80 24 64c0-17 13-28 36-28Z" fill="#fff7ea" />
        <path d="M36 50q8-5 14-1M70 49q6-4 14 1" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
        {eye(43, eyes >= 1)}
        {eye(77, eyes >= 2)}
        <ellipse cx="31" cy="74" rx="6.5" ry="4.5" fill="#ff9fb0" opacity=".85" />
        <ellipse cx="89" cy="74" rx="6.5" ry="4.5" fill="#ff9fb0" opacity=".85" />
        {mood === 'cheer' ? (
          <>
            <path d="M53 72q7 11 14 0Z" fill={INK} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
            <path d="M56.500 77q3.500-3 7 0-3.500 3.500-7 0Z" fill="#ff8fa0" />
          </>
        ) : (
          <path d="M54 73q3 3.500 6 0q3 3.500 6 0" fill="none" stroke={INK} strokeWidth="2.600" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {/* gold belly mark */}
        <path d="M47 99q13-6 26 0" fill="none" stroke="#ffd166" strokeWidth="3.500" strokeLinecap="round" />
        <circle cx="60" cy="103.500" r="2.600" fill="#ffd166" />
        <path d="M19 52q-3 9-2 18M101 52q3 9 2 18" fill="none" stroke="#ffd166" strokeWidth="3" strokeLinecap="round" />
      </g>
      {mood === 'cheer' && (
        <g className="daruma-sparks" fill="#ffd166">
          <path d="M10 22l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" />
          <path d="M108 14l1.500 4 4 1.500-4 1.500-1.500 4-1.500-4-4-1.500 4-1.500Z" />
          <path d="M112 44l1.200 3 3 1.200-3 1.200-1.200 3-1.200-3-3-1.200 3-1.200Z" />
        </g>
      )}
    </svg>
  )
}
