import { useEffect, type CSSProperties } from 'react'
import { readiness } from '../readiness'
import { forecast, retention } from '../srs'
import { update, useStore, type State } from '../store'
import { addDays, dayKey, daysBetween, useClock } from '../util'
import { Card } from '../components/ui'

const WEEKS = 15
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']
/** One stamp for every 50 words expected to be recalled on the exam (03 §6). */
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

/** Vermilion 済 seals, one per 50 expected words; a seal once stamped stays even if the figure drops. */
function Stamps({ best, now, total }: { best: number; now: number; total: number }) {
  const n = Math.ceil(total / STAMP_STEP)
  const earned = Math.floor(best / STAMP_STEP)
  return (
    <ol className="stamps" aria-label={`도장 ${n}개 중 ${earned}개`}>
      {Array.from({ length: n }, (_, i) => {
        const goal = Math.min((i + 1) * STAMP_STEP, total)
        const done = i < earned
        return (
          <li key={i} className={done ? 'done' : now >= i * STAMP_STEP && !done ? 'now' : ''} aria-hidden="true">
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
  const r = readiness(s, today)
  const stop = Math.round(r.stop)
  const best = Math.max(s.bestE ?? 0, stop)
  // remember the best figure so stamps are never taken away
  useEffect(() => {
    if (stop > (s.bestE ?? 0)) update((d) => void (d.bestE = stop))
  }, [stop, s.bestE])

  const kept = retention(s, today)
  let r30 = 0
  let e30 = 0
  let ms7 = 0
  for (let i = 0; i < 30; i++) {
    const log = s.log[dayKey(addDays(today, -i))]
    if (log?.e !== undefined) {
      r30 += log.r
      e30 += log.e
    }
    if (i < 7) ms7 += log?.ms ?? 0
  }
  const predicted = r30 >= 10 ? e30 / r30 : null

  return (
    <>
      <header className="top">
        <h1>기록</h1>
      </header>

      <Card role="region" aria-labelledby="stamps-title">
        <h2 id="stamps-title" className="card-title">
          도장 여정
          <span className="muted">예상 기억 {STAMP_STEP}단어마다</span>
        </h2>
        <Stamps best={best} now={stop} total={r.total} />
        <p className="hint">
          지금 그만둬도 시험날 {stop.toLocaleString()}개를 기억할 것으로 예상해요. 한 번 찍은 도장은 지워지지 않아요.
        </p>
      </Card>

      <section className="stat-grid" aria-label="요약">
        <Card className="stat" padding={3}>
          <span className="stat-label">기억 유지율</span>
          <StatNumber text={kept == null ? '–' : `${Math.round(kept * 100)}%`} />
          <small className="muted">{predicted == null ? '최근 30일' : `예측 ${Math.round(predicted * 100)}%${r.calibrated ? ' · 보정함' : ''}`}</small>
        </Card>
        <Card className="stat" padding={3}>
          <span className="stat-label">최근 7일 학습</span>
          <StatNumber text={`${Math.round(ms7 / 60_000).toLocaleString()}분`} />
          <small className="muted">카드를 보는 동안만 셈</small>
        </Card>
        <Card className="stat" padding={3}>
          <span className="stat-label">누적 XP</span>
          <StatNumber text={formatXp(s.xp)} label={s.xp >= 1_000_000 ? s.xp.toLocaleString() : undefined} />
          <small className="muted">카드당 10</small>
        </Card>
      </section>

      <Card role="region" aria-labelledby="forecast-title">
        <h2 id="forecast-title" className="card-title">
          7일 복습 예보
        </h2>
        <Forecast counts={forecast(s, today)} today={today} />
        <p className="hint">기억이 흐려질 때쯤 다시 나와요. 기억할수록 간격이 길어져요.</p>
      </Card>

      <Card role="region" aria-labelledby="heat-title">
        <h2 id="heat-title" className="card-title">
          학습 기록
        </h2>
        <Heatmap log={s.log} today={today} />
        <p className="hint">최근 {WEEKS}주 · 진할수록 카드를 많이 본 날</p>
      </Card>
    </>
  )
}
