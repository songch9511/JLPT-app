/**
 * Kasane's mascot: a daruma. By tradition you paint one eye when you set a goal and the other
 * when you reach it — here the first eye fills in when today's study starts, the second when it's done.
 */
export function Daruma({
  eyes,
  mood = 'idle',
  size = 96,
}: {
  eyes: 0 | 1 | 2
  mood?: 'idle' | 'cheer' | 'sleep'
  size?: number
}) {
  const eye = (cx: number, filled: boolean) =>
    mood === 'sleep' ? (
      <path d={`M${cx - 7} 52q7 6 14 0`} fill="none" stroke="#2b2118" strokeWidth="3" strokeLinecap="round" />
    ) : (
      <>
        <circle cx={cx} cy="51" r="9" fill="#fff" stroke="#2b2118" strokeWidth="2.5" />
        {filled && <circle cx={cx} cy="52" r="5" fill="#2b2118" />}
        {filled && <circle cx={cx + 2} cy="50" r="1.6" fill="#fff" />}
      </>
    )
  return (
    <svg className={`daruma ${mood}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <ellipse cx="60" cy="112" rx="34" ry="5" fill="#000" opacity=".12" />
      <g className="daruma-body">
        <path d="M60 8c30 0 46 22 46 52 0 30-18 50-46 50S14 90 14 60C14 30 30 8 60 8Z" fill="#e5484d" />
        <path d="M22 84c8 16 21 26 38 26s30-10 38-26c-10 9-23 13-38 13s-28-4-38-13Z" fill="#b8323a" />
        <path d="M60 26c21 0 33 12 33 29S81 80 60 80 27 72 27 55s12-29 33-29Z" fill="#fff3df" />
        <path d="M36 40q10-9 20-2M64 38q10-7 20 2" fill="none" stroke="#2b2118" strokeWidth="4.5" strokeLinecap="round" />
        {eye(44, eyes >= 1)}
        {eye(76, eyes >= 2)}
        <circle cx="33" cy="63" r="5" fill="#ff9aa2" opacity=".7" />
        <circle cx="87" cy="63" r="5" fill="#ff9aa2" opacity=".7" />
        {mood === 'cheer' ? (
          <path d="M52 64q8 10 16 0Z" fill="#2b2118" />
        ) : (
          <path d="M53 66q7 5 14 0" fill="none" stroke="#2b2118" strokeWidth="3" strokeLinecap="round" />
        )}
        <path d="M48 90q12-7 24 0M52 98q8-4 16 0" fill="none" stroke="#ffcf5c" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M26 30q-6 12-6 26M94 30q6 12 6 26" fill="none" stroke="#ffcf5c" strokeWidth="3" strokeLinecap="round" opacity=".9" />
      </g>
    </svg>
  )
}
