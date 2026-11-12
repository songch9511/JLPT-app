import { go } from '../App'
import { Icon } from '../components/Icon'
import { COUNTS, KO_READY, LEVELS, type Level } from '../data'
import { breakdowns, buildQueue, forecast, retention, streak, unlockMoreNew, type Breakdown } from '../srs'
import { update, useStore, type State } from '../store'
import { addDays, dayKey, daysBetween, parseDay } from '../util'

const WEEKS = 15
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

function Ring({ value, size = 92, children }: { value: number; size?: number; children: React.ReactNode }) {
  const r = (size - 10) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="ring-fill"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-label">{children}</div>
    </div>
  )
}

export function StageBar({ b, total }: { b: Breakdown; total: number }) {
  return (
    <div className="bar stagebar">
      <i className="mature" style={{ width: `${(b.mature / total) * 100}%` }} />
      <i className="young" style={{ width: `${(b.young / total) * 100}%` }} />
      <i className="learning" style={{ width: `${(b.learning / total) * 100}%` }} />
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
          <i style={{ height: `${Math.max(n ? 6 : 2, (n / max) * 100)}%` }} />
          <small>{i === 0 ? '오늘' : DAY_NAMES[addDays(today, i).getDay()]}</small>
        </div>
      ))}
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
  const days = streak(s.log, today)
  const kept = retention(s, today)
  const todo = q.learning + q.review + q.fresh
  const needPerDay = dday > 0 ? Math.ceil(b.new / dday) : null

  let pace: string
  if (b.new === 0) pace = `N${target} 단어를 모두 만났어요. 이제 복습으로 굳히기만 남았어요.`
  else if (needPerDay == null) pace = '시험일이 지났어요. 설정에서 다음 시험일을 골라 주세요.'
  else pace = `시험 전에 전부 만나려면 하루 새 단어 ${needPerDay}개가 필요해요.`

  return (
    <>
      <header className="top">
        <div>
          <p className="eyebrow">카사네 · 重ね</p>
          <h1>오늘도 한 겹 더</h1>
        </div>
        <div className={`dday ${dday <= 30 && dday > 0 ? 'soon' : ''}`}>
          <b>{dday > 0 ? `D-${dday}` : dday === 0 ? 'D-DAY' : '시험 종료'}</b>
          <span>JLPT N{target}</span>
        </div>
      </header>

      <section className="hero card">
        {todo > 0 ? (
          <>
            <p className="eyebrow">오늘의 학습</p>
            <h2>
              {todo}
              <small>장</small>
            </h2>
            <div className="counts">
              <span className="c-review">복습 {q.review}</span>
              <span className="c-learning">외우는 중 {q.learning}</span>
              <span className="c-new">새 단어 {q.fresh}</span>
            </div>
            <button className="btn primary big" onClick={() => go('/study')}>
              {todayLog?.c ? '이어서 하기' : '시작하기'}
            </button>
          </>
        ) : (
          <>
            <p className="eyebrow">오늘의 학습</p>
            <h2 className="done-title">오늘 분량 끝!</h2>
            <p className="muted">복습할 단어가 생기면 여기에 다시 나타나요. 내일 또 만나요.</p>
            {b.new > 0 && (
              <button
                className="btn ghost big"
                onClick={() => {
                  unlockMoreNew(10)
                  go('/study')
                }}
              >
                새 단어 10개 더 하기
              </button>
            )}
          </>
        )}
      </section>

      <section className="card goal">
        <Ring value={seen / total}>
          <b>{Math.round((seen / total) * 100)}%</b>
          <span>만난 단어</span>
        </Ring>
        <div className="goal-body">
          <h3>
            N{target} 목표 <a href="#/settings">변경</a>
          </h3>
          <p className="num">
            {seen.toLocaleString()} <span>/ {total.toLocaleString()} 단어</span>
          </p>
          <p className="muted">{pace}</p>
          {needPerDay != null && b.new > 0 && needPerDay !== dailyNew && (
            <button className="link inline" onClick={() => update((d) => void (d.settings.dailyNew = Math.min(100, needPerDay)))}>
              지금 하루 {dailyNew}개 → {Math.min(100, needPerDay)}개로 맞추기
            </button>
          )}
          {needPerDay != null && b.new > 0 && needPerDay === dailyNew && <p className="forecast ok">지금 설정이면 시험 전에 끝나요.</p>}
        </div>
      </section>

      <section className="stats">
        <div className="card stat">
          <span className="stat-label">
            <Icon name="flame" size={16} /> 연속 학습
          </span>
          <b>
            {days}
            <small>일</small>
          </b>
        </div>
        <div className="card stat">
          <span className="stat-label">장기 기억</span>
          <b>
            {b.mature}
            <small>개</small>
          </b>
        </div>
        <div className="card stat">
          <span className="stat-label">기억 유지율</span>
          <b>
            {kept == null ? '–' : Math.round(kept * 100)}
            <small>{kept == null ? '' : '%'}</small>
          </b>
        </div>
      </section>

      <section className="card">
        <h3>다가오는 복습</h3>
        <Forecast counts={forecast(s, today)} today={today} />
        <p className="muted small">기억이 흐려질 때쯤 다시 나와요. 기억할수록 간격이 길어져요.</p>
      </section>

      <section className="card">
        <h3>학습 기록</h3>
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
