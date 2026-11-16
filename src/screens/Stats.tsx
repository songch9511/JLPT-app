import { type CSSProperties } from 'react'
import { forecast, retention, studyProgress } from '../srs'
import { useStore, type State } from '../store'
import { addDays, dayKey, daysBetween, useClock } from '../util'
import { Group } from '../components/ui'

const WEEKS = 15
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

/** About how many em wide a summary number is in the bold rounded face: digits ~0.62, separators ~0.3, Hangul 1. */
export const textEms = (t: string) => [...t].reduce((n, ch) => n + (/[0-9]/.test(ch) ? 0.62 : /[,.]/.test(ch) ? 0.3 : /[%–]/.test(ch) ? 0.85 : 1), 0)

/**
 * A summary figure on one line in a third of the screen (320–430px): it keeps the 24px size where it fits and gets
 * smaller only as far as it must, never below 16px (styles.css `.stat b`: the column's width ÷ the text's width in
 * em). XP from a million on is written in 만 (1,234,567 → 123만) so it fits at 16px too; the full number is its name.
 */
function StatNumber({ text, label }: { text: string; label?: string }) {
  return (
    <b className="num" style={{ '--ems': textEms(text).toFixed(2) } as CSSProperties} aria-label={label}>
      {text}
    </b>
  )
}
export const formatXp = (xp: number) => (xp >= 1_000_000 ? `${Math.floor(xp / 10_000).toLocaleString()}만` : xp.toLocaleString())

/**
 * The last WEEKS weeks as columns (Monday on top), the month names over the weeks they start in, today outlined. Four
 * shades of ink: nothing, a little, more, a lot.
 */
function Heatmap({ log, today }: { log: State['log']; today: Date }) {
  const monday = (today.getDay() + 6) % 7
  const start = addDays(today, -(monday + (WEEKS - 1) * 7))
  const cells = []
  const months: { col: number; m: number }[] = []
  let days = 0
  for (let w = 0; w < WEEKS; w++) {
    const first = addDays(start, w * 7)
    // a month's name goes over the first week holding its 1st (and the first column)
    const m = addDays(first, 6).getMonth()
    if (w === 0 ? true : months[months.length - 1].m !== m) months.push({ col: w + 1, m })
    for (let d = 0; d < 7; d++) {
      const day = addDays(first, d)
      const future = daysBetween(today, day) > 0
      const c = log[dayKey(day)]?.c ?? 0
      if (c && !future) days++
      const lvl = future ? -1 : c === 0 ? 0 : c < 30 ? 1 : c < 100 ? 2 : 3
      const isToday = daysBetween(today, day) === 0
      cells.push(
        <i
          key={`${w}-${d}`}
          className={`heat h${lvl} ${isToday ? 'is-today' : ''}`}
          style={{ gridColumn: w + 1, gridRow: d + 2 }}
          title={future ? undefined : `${day.getMonth() + 1}/${day.getDate()} · 카드 ${c}장`}
        />,
      )
    }
  }
  // a name too close to the next one (a month starting in the last week shown) is left to its neighbour
  const labels = months.filter((x, i) => (months[i + 1]?.col ?? WEEKS + 1) - x.col >= 2)
  return (
    <div className="heatmap" role="img" aria-label={`최근 ${WEEKS}주 중 ${days}일 공부함`}>
      {labels.map((x, i) => (
        <span key={x.col} className="heat-month" style={{ gridColumn: `${x.col} / ${labels[i + 1]?.col ?? WEEKS + 1}` }} aria-hidden="true">
          {x.m + 1}월
        </span>
      ))}
      {cells}
    </div>
  )
}

function Forecast({ counts, today }: { counts: number[]; today: Date }) {
  const max = Math.max(1, ...counts)
  return (
    <div className="forecast-chart" role="img" aria-label={`앞으로 7일 복습: ${counts.join(', ')}장`}>
      {counts.map((n, i) => (
        <div key={i} className={i === 0 ? 'is-today' : ''}>
          <span>{n || ''}</span>
          <i style={{ height: `${Math.max(n ? 8 : 3, (n / max) * 100)}%` }} />
          <small>{i === 0 ? '오늘' : DAY_NAMES[addDays(today, i).getDay()]}</small>
        </div>
      ))}
    </div>
  )
}

/** "단어 2,460 / 3,526" over an ink bar. */
function Meter({ label, value, total, range }: { label: string; value: number; total: number; range: string }) {
  return (
    <div className="meter">
      <p className="summary-line" aria-hidden="true">
        <span className="meter-name">{label}</span>
        <span>
          <b className="num">{value.toLocaleString()}</b> / {total.toLocaleString()}
        </span>
      </p>
      <span className="bar ink" role="img" aria-label={`${range} ${label} ${total.toLocaleString()} 중 ${value.toLocaleString()}`}>
        <i style={{ width: `${total ? (value / total) * 100 : 0}%` }} />
      </span>
    </div>
  )
}

export function Stats() {
  const s = useStore((x) => x)
  useClock()
  const today = new Date()
  // the same counts as the 단어장 level rows
  const { levels, total, met, kanjiTotal, kanjiMet } = studyProgress(s)
  const range = levels.length === 1 ? `N${levels[0]}` : `N${levels[0]}~N${levels[levels.length - 1]}`

  const kept = retention(s, today)
  let ms7 = 0
  for (let i = 0; i < 7; i++) ms7 += s.log[dayKey(addDays(today, -i))]?.ms ?? 0

  return (
    <>
      <header className="top">
        <h1>기록</h1>
      </header>

      <dl className="stat-grid" aria-label="요약">
        <div className="stat">
          <dt className="stat-note">
            <span className="stat-label">기억 유지율</span>
            <span className="stat-period">최근 30일</span>
          </dt>
          <dd>
            <StatNumber text={kept == null ? '–' : `${Math.round(kept * 100)}%`} />
          </dd>
        </div>
        <div className="stat">
          <dt className="stat-note">
            <span className="stat-label">학습 시간</span>
            <span className="stat-period">최근 7일</span>
          </dt>
          <dd>
            <StatNumber text={`${Math.round(ms7 / 60_000).toLocaleString()}분`} />
          </dd>
        </div>
        <div className="stat">
          <dt className="stat-note">
            <span className="stat-label">XP</span>
            <span className="stat-period">누적</span>
          </dt>
          <dd>
            <StatNumber text={formatXp(s.xp)} label={s.xp >= 1_000_000 ? s.xp.toLocaleString() : undefined} />
          </dd>
        </div>
      </dl>

      <section className="card-section" aria-labelledby="met-title">
        <h2 id="met-title" className="group-title">
          만난 것 · {range}
        </h2>
        <Meter label="단어" value={met} total={total} range={range} />
        <Meter label="한자" value={kanjiMet} total={kanjiTotal} range={range} />
      </section>

      <Group title="7일 복습 예보" id="forecast-title">
        <Forecast counts={forecast(s, today)} today={today} />
      </Group>

      <Group title="학습 기록" id="heat-title">
        <Heatmap log={s.log} today={today} />
      </Group>
    </>
  )
}
