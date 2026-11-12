import { useEffect, useRef } from 'react'
import { go } from '../App'
import { Daruma } from '../components/Daruma'
import { Icon } from '../components/Icon'
import { COUNTS, KO_READY, LEVELS, type Level } from '../data'
import {
  breakdowns,
  buildQueue,
  forecast,
  levelInfo,
  quests,
  retention,
  streak,
  unlockMoreNew,
  weekDays,
  type Breakdown,
} from '../srs'
import { update, useStore, type State } from '../store'
import { addDays, dayKey, daysBetween, parseDay } from '../util'

const WEEKS = 15
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']
const STEP = 50

export function StageBar({ b, total }: { b: Breakdown; total: number }) {
  return (
    <div className="bar stagebar">
      <i className="mature" style={{ width: `${(b.mature / total) * 100}%` }} />
      <i className="young" style={{ width: `${(b.young / total) * 100}%` }} />
      <i className="learning" style={{ width: `${(b.learning / total) * 100}%` }} />
    </div>
  )
}

/** Top status strip: streak, level and XP — always visible, like a game HUD. */
export function Hud({ s, today }: { s: State; today: Date }) {
  const lv = levelInfo(s.xp)
  const days = streak(s.log, today)
  const lit = !!s.log[dayKey(today)]?.c
  return (
    <div className="hud">
      <span className={`hud-item streak ${lit ? 'lit' : ''}`} title="연속 학습">
        <Icon name="flame" size={20} fill />
        {days}
      </span>
      <span className="hud-level" title={`레벨 ${lv.level} · 다음 레벨까지 ${lv.span - lv.into} XP`}>
        <b>Lv.{lv.level}</b>
        <span className="bar">
          <i style={{ width: `${(lv.into / lv.span) * 100}%` }} />
        </span>
      </span>
      <span className="hud-item xp" title="누적 XP">
        <Icon name="bolt" size={20} fill />
        {s.xp.toLocaleString()}
      </span>
    </div>
  )
}

function Heatmap({ log, today }: { log: State['log']; today: Date }) {
  // columns = weeks (oldest → newest), rows = Sun..Sat; the last column is the current week
  const start = addDays(today, -(today.getDay() + (WEEKS - 1) * 7))
  const cells = []
  for (let i = 0; i < WEEKS * 7; i++) {
    const d = addDays(start, i)
    const future = daysBetween(today, d) > 0
    const c = log[dayKey(d)]?.c ?? 0
    const lvl = future ? -1 : c === 0 ? 0 : c < 30 ? 1 : c < 100 ? 2 : 3
    cells.push(<i key={i} className={`heat h${lvl}`} title={future ? undefined : `${d.getMonth() + 1}/${d.getDate()} · 카드 ${c}장`} />)
  }
  return <div className="heatmap">{cells}</div>
}

function Forecast({ counts, today }: { counts: number[]; today: Date }) {
  const max = Math.max(1, ...counts)
  return (
    <div className="forecast-chart">
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

/** The target level as a trail of stamps: one for every 50 words met. */
function Journey({ level, seen }: { level: Level; seen: number }) {
  const total = COUNTS[level]
  const n = Math.ceil(total / STEP)
  const current = Math.min(n - 1, Math.floor(seen / STEP))
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('.now')
    if (el && ref.current) ref.current.scrollLeft = el.offsetLeft - ref.current.clientWidth / 2 + el.clientWidth / 2
  }, [current])
  return (
    <div className="journey" ref={ref}>
      {Array.from({ length: n }, (_, i) => {
        const goal = Math.min((i + 1) * STEP, total)
        const done = seen >= goal
        const now = !done && i === current
        const part = now ? (seen - i * STEP) / (goal - i * STEP) : 0
        return (
          <div key={i} className={`node ${done ? 'done' : now ? 'now' : 'locked'} ${i % 2 ? 'down' : 'up'}`}>
            <div className="node-disc" style={now ? { ['--p' as string]: `${part * 360}deg` } : undefined}>
              <span>{done ? <Icon name="check" size={22} /> : now ? <Icon name="star" size={22} fill /> : <Icon name="lock" size={16} />}</span>
            </div>
            <small>{goal}</small>
          </div>
        )
      })}
    </div>
  )
}

export function Home() {
  const s = useStore((x) => x)
  const today = new Date()
  const { target, examDate, dailyNew } = s.settings
  const q = buildQueue(s, today)
  const all = breakdowns(s)
  const b = all[target]
  const total = COUNTS[target]
  const seen = total - b.new
  const dday = daysBetween(today, parseDay(examDate))
  const todayLog = s.log[dayKey(today)]
  const kept = retention(s, today)
  const todo = q.learning + q.review + q.fresh
  const started = !!todayLog?.c
  const cleared = started && todo === 0
  const needPerDay = dday > 0 ? Math.ceil(b.new / dday) : null
  const qs = quests(s, today)
  const week = weekDays(s.log, today)

  let pace: string
  if (b.new === 0) pace = `N${target} 단어를 모두 만났어요. 이제 복습으로 굳히기!`
  else if (needPerDay == null) pace = '시험일이 지났어요. 설정에서 다음 시험일을 골라 주세요.'
  else pace = `시험 전에 전부 만나려면 하루 새 단어 ${needPerDay}개`

  const bubble = cleared
    ? '두 눈 다 그렸다! 오늘 목표 달성이에요.'
    : started
      ? `한쪽 눈은 그렸어요. ${todo}장만 더 하면 완성!`
      : todo > 0
        ? `오늘은 ${todo}장! 시작하면 한쪽 눈을 그려 줄게요.`
        : '오늘은 돌아온 복습이 없어요. 새 단어를 더 해 볼까요?'

  return (
    <>
      <Hud s={s} today={today} />

      <section className="hero">
        <div className="hero-top">
          <Daruma eyes={cleared ? 2 : started ? 1 : 0} mood={cleared ? 'cheer' : 'idle'} size={104} />
          <p className="bubble">{bubble}</p>
        </div>
        {todo > 0 ? (
          <>
            <div className="hero-counts">
              <div className="c-review">
                <b>{q.review}</b>
                <span>복습</span>
              </div>
              <div className="c-learning">
                <b>{q.learning}</b>
                <span>외우는 중</span>
              </div>
              <div className="c-new">
                <b>{q.fresh}</b>
                <span>새 단어</span>
              </div>
            </div>
            <button className="btn primary big" onClick={() => go('/study')}>
              {started ? '이어서 하기' : '오늘의 학습 시작'}
            </button>
          </>
        ) : (
          b.new > 0 && (
            <button
              className="btn primary big"
              onClick={() => {
                unlockMoreNew(10)
                go('/study')
              }}
            >
              새 단어 10개 더 하기
            </button>
          )
        )}
      </section>

      <section className="card week-card">
        <div className="week">
          {week.map((d, i) => (
            <div key={i} className={`${d.done ? 'done' : ''} ${d.today ? 'today' : ''} ${d.future ? 'future' : ''}`}>
              <span>{DAY_NAMES[i]}</span>
              <i>{d.done && <Icon name="flame" size={18} fill />}</i>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="card-title">
          오늘의 퀘스트
          <span className="muted">
            {qs.filter((x) => x.done).length} / {qs.length}
          </span>
        </h3>
        <div className="quests">
          {qs.map((x) => (
            <div key={x.title} className={`quest ${x.done ? 'done' : ''}`}>
              <span className="quest-icon">{x.done ? <Icon name="check" size={20} /> : <Icon name="star" size={20} fill />}</span>
              <div className="quest-body">
                <p>{x.title}</p>
                <div className="bar">
                  <i style={{ width: `${(x.have / x.need) * 100}%` }} />
                  <span>
                    {x.have} / {x.need}
                  </span>
                </div>
              </div>
              <span className="quest-xp">+{x.xp} XP</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="card-title">
          N{target} 여정
          <span className={`dday ${dday <= 30 && dday > 0 ? 'soon' : ''}`}>{dday > 0 ? `D-${dday}` : dday === 0 ? 'D-DAY' : '시험 종료'}</span>
        </h3>
        <Journey level={target} seen={seen} />
        <p className="num">
          {seen.toLocaleString()} <span>/ {total.toLocaleString()} 단어를 만났어요</span>
        </p>
        <p className="muted small">{pace}</p>
        {needPerDay != null && b.new > 0 && needPerDay !== dailyNew && (
          <button className="link inline" onClick={() => update((d) => void (d.settings.dailyNew = Math.min(100, needPerDay)))}>
            지금 하루 {dailyNew}개 → {Math.min(100, needPerDay)}개로 맞추기
          </button>
        )}
      </section>

      <section className="stats">
        <div className="card stat s-mature">
          <span className="stat-label">장기 기억</span>
          <b>
            {b.mature}
            <small>개</small>
          </b>
        </div>
        <div className="card stat s-keep">
          <span className="stat-label">기억 유지율</span>
          <b>
            {kept == null ? '–' : Math.round(kept * 100)}
            <small>{kept == null ? '' : '%'}</small>
          </b>
        </div>
        <div className="card stat s-xp">
          <span className="stat-label">오늘 XP</span>
          <b>
            {todayLog?.xp ?? 0}
            <small>XP</small>
          </b>
        </div>
      </section>

      <section className="card">
        <h3 className="card-title">다가오는 복습</h3>
        <Forecast counts={forecast(s, today)} today={today} />
        <p className="muted small">기억이 흐려질 때쯤 다시 나와요. 기억할수록 간격이 길어져요.</p>
      </section>

      <section className="card">
        <h3 className="card-title">학습 기록</h3>
        <Heatmap log={s.log} today={today} />
        <p className="muted small">최근 {WEEKS}주 · 진할수록 카드를 많이 넘긴 날</p>
      </section>

      <section>
        <h3 className="section-title">급수별 기억 상태</h3>
        <div className="legend">
          <span className="mature">장기 기억</span>
          <span className="young">익히는 중</span>
          <span className="learning">외우는 중</span>
        </div>
        <div className="levels">
          {LEVELS.map((l: Level) => (
            <a key={l} href={`#/level/${l}`} className={`card level-row ${l === target ? 'target' : ''}`}>
              <div className="level-name">
                <b>N{l}</b>
                {l === target && <span className="chip accent">목표</span>}
                {!KO_READY[l] && <span className="chip">뜻: 영어</span>}
              </div>
              <StageBar b={all[l]} total={COUNTS[l]} />
              <span className="level-count">
                {COUNTS[l] - all[l].new} / {COUNTS[l]}
              </span>
              <Icon name="chevron" size={18} />
            </a>
          ))}
        </div>
      </section>
    </>
  )
}
