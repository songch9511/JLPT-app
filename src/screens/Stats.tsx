import { type CSSProperties } from 'react'
import { forecast, retention, studyProgress } from '../srs'
import { useStore, type State } from '../store'
import { addDays, dayKey, daysBetween, useClock } from '../util'
import { Card } from '../components/ui'

const WEEKS = 15
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']
/** One stamp for every 50 words met in the levels studied (03 §6). */
export const STAMP_STEP = 50

/** About how many em wide a summary number is in the bold rounded face: digits ~0.62, separators ~0.3, Hangul 1. */
export const textEms = (t: string) => [...t].reduce((n, ch) => n + (/[0-9]/.test(ch) ? 0.62 : /[,.]/.test(ch) ? 0.3 : /[%–]/.test(ch) ? 0.85 : 1), 0)

/**
 * A summary number on one line in a third of the screen (320–430px): it keeps the 24px size where it fits and gets
 * smaller only as far as it must, never below 16px (styles.css `.stat b`: the tile's width ÷ the text's width in
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

function Heatmap({ log, today }: { log: State['log']; today: Date }) {
  // columns = weeks (oldest → newest), rows = Sun..Sat; the last column is the current week
  const start = addDays(today, -(today.getDay() + (WEEKS - 1) * 7))
  const cells = []
  let days = 0
  for (let i = 0; i < WEEKS * 7; i++) {
    const d = addDays(start, i)
    const future = daysBetween(today, d) > 0
    const c = log[dayKey(d)]?.c ?? 0
    if (c && !future) days++
    const lvl = future ? -1 : c === 0 ? 0 : c < 30 ? 1 : c < 100 ? 2 : 3
    cells.push(<i key={i} className={`heat h${lvl}`} title={future ? undefined : `${d.getMonth() + 1}/${d.getDate()} · 카드 ${c}장`} />)
  }
  return (
    <div className="heatmap" role="img" aria-label={`최근 ${WEEKS}주 중 ${days}일 공부함`}>
      {cells}
    </div>
  )
}

function Forecast({ counts, today }: { counts: number[]; today: Date }) {
  const max = Math.max(1, ...counts)
  return (
    <div className="forecast-chart" role="img" aria-label={`앞으로 7일 복습: ${counts.join(', ')}장`}>
      {counts.map((n, i) => (
        <div key={i} className={i === 0 ? 'today' : ''}>
          <span>{n || ''}</span>
          <i style={{ height: `${Math.max(n ? 8 : 3, (n / max) * 100)}%` }} />
          <small>{i === 0 ? '오늘' : DAY_NAMES[addDays(today, i).getDay()]}</small>
        </div>
      ))}
    </div>
  )
}

/** Vermilion 済 seals, one per 50 words met; the next one is outlined. */
function Stamps({ met, total }: { met: number; total: number }) {
  const n = Math.ceil(total / STAMP_STEP)
  // the last seal is earned with the list's last word, however few words that leg has
  const earned = met >= total ? n : Math.floor(met / STAMP_STEP)
  return (
    <ol className="stamps" aria-label={`도장 ${n}개 중 ${earned}개`}>
      {Array.from({ length: n }, (_, i) => {
        const goal = Math.min((i + 1) * STAMP_STEP, total)
        const done = i < earned
        return (
          <li key={i} className={done ? 'done' : i === earned ? 'now' : ''} aria-hidden="true">
            <span lang="ja">{done ? '済' : ''}</span>
            <small>{goal}</small>
          </li>
        )
      })}
    </ol>
  )
}

export function Stats() {
  const s = useStore((x) => x)
  useClock()
  const today = new Date()
  // the same counts as Home's word card and the 단어장 level rows
  const { levels, total, met } = studyProgress(s)
  const range = levels.length === 1 ? `N${levels[0]}` : `N${levels[0]}~N${levels[levels.length - 1]}`

  const kept = retention(s, today)
  let ms7 = 0
  for (let i = 0; i < 7; i++) ms7 += s.log[dayKey(addDays(today, -i))]?.ms ?? 0

  return (
    <>
      <header className="top">
        <h1>기록</h1>
      </header>

      <Card role="region" aria-labelledby="stamps-title">
        <h2 id="stamps-title" className="card-title">
          도장 여정
          <span className="muted">만난 단어 {STAMP_STEP}개마다</span>
        </h2>
        <Stamps met={met} total={total} />
        {/* the same short label as Home's word row; read as a sentence */}
        <p className="hint">
          <span aria-hidden="true">
            {range} 만난 단어 <b className="num">{met.toLocaleString()}</b> / {total.toLocaleString()}
          </span>
          <span className="sr-only">
            {range} 단어 {total.toLocaleString()}개 중 {met.toLocaleString()}개 만남
          </span>
        </p>
      </Card>

      <section className="stat-grid" aria-label="요약">
        <Card className="stat" padding={3}>
          <span className="stat-label">기억 유지율</span>
          <StatNumber text={kept == null ? '–' : `${Math.round(kept * 100)}%`} />
          <small className="muted">최근 30일</small>
        </Card>
        <Card className="stat" padding={3}>
          <span className="stat-label">학습 시간</span>
          <StatNumber text={`${Math.round(ms7 / 60_000).toLocaleString()}분`} />
          <small className="muted">최근 7일</small>
        </Card>
        <Card className="stat" padding={3}>
          <span className="stat-label">XP</span>
          <StatNumber text={formatXp(s.xp)} label={s.xp >= 1_000_000 ? s.xp.toLocaleString() : undefined} />
          <small className="muted">누적</small>
        </Card>
      </section>

      <Card role="region" aria-labelledby="forecast-title">
        <h2 id="forecast-title" className="card-title">
          7일 복습 예보
        </h2>
        <Forecast counts={forecast(s, today)} today={today} />
      </Card>

      <Card role="region" aria-labelledby="heat-title">
        <h2 id="heat-title" className="card-title">
          학습 기록
        </h2>
        <Heatmap log={s.log} today={today} />
        <p className="hint">최근 {WEEKS}주 · 진할수록 많이 본 날</p>
      </Card>
    </>
  )
}
