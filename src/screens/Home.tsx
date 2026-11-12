import { go } from '../App'
import { Icon } from '../components/Icon'
import { COUNTS, KO_READY, LEVELS, stageCount, type Level } from '../data'
import { learnedCount, startStage, streak, useStore, type State } from '../store'
import { addDays, dayKey, daysBetween, parseDay } from '../util'

const WEEKS = 15

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

function paceText(s: State, today: Date) {
  const { target, examDate } = s.settings
  const lv = s.levels[target]
  const dday = daysBetween(today, parseDay(examDate))
  const left = stageCount(target) - lv.done
  // average over the days since the first active day in the last week, so a fresh start isn't judged as slow
  let recent = 0
  let span = 0
  for (let i = 0; i < 7; i++) {
    const n = s.log[dayKey(addDays(today, -i))]?.s ?? 0
    recent += n
    if (n) span = i + 1
  }
  const perDay = span ? recent / span : 0

  let need: string
  if (dday <= 0) need = '시험일이 지났어요. 설정에서 다음 시험일을 골라 주세요.'
  else if (left / dday <= 1) {
    const every = Math.floor(dday / left)
    need = every <= 1 ? '하루 1장이면 시험 전에 이번 회독을 끝내요.' : `${every}일에 1장이면 시험 전에 이번 회독을 끝내요.`
  } else need = `시험 전에 끝내려면 하루 ${(left / dday).toFixed(1)}장이 필요해요.`

  let forecast: string | null = null
  let onTrack: boolean | null = null
  if (perDay > 0 && dday > 0) {
    const days = Math.ceil(left / perDay)
    const end = addDays(today, days)
    onTrack = days <= dday
    forecast = `지금 페이스로는 ${end.getMonth() + 1}월 ${end.getDate()}일 완료 예상`
  }
  return { dday, left, need, forecast, onTrack, goalToday: dday > 0 ? Math.max(1, Math.ceil(left / dday)) : 1 }
}

function Heatmap({ log, today }: { log: State['log']; today: Date }) {
  // columns = weeks (oldest → newest), rows = Sun..Sat; the last column is the current week
  const start = addDays(today, -(today.getDay() + (WEEKS - 1) * 7))
  const cells = []
  for (let i = 0; i < WEEKS * 7; i++) {
    const d = addDays(start, i)
    const future = daysBetween(today, d) > 0
    const c = log[dayKey(d)]?.c ?? 0
    const lvl = future ? -1 : c === 0 ? 0 : c < 50 ? 1 : c < 150 ? 2 : 3
    cells.push(
      <i
        key={i}
        className={`heat h${lvl}`}
        title={future ? undefined : `${d.getMonth() + 1}/${d.getDate()} · 카드 ${c}장`}
      />,
    )
  }
  return <div className="heatmap">{cells}</div>
}

export function Home() {
  const s = useStore((x) => x)
  const today = new Date()
  const { target } = s.settings
  const lv = s.levels[target]
  const pace = paceText(s, today)
  const todayLog = s.log[dayKey(today)] ?? { c: 0, k: 0, s: 0 }
  const days = streak(s.log, today)
  const learned = learnedCount(s, target)
  const session = s.session

  const startNext = () => {
    startStage(target, lv.done)
    go('/study')
  }

  return (
    <>
      <header className="top">
        <div>
          <p className="eyebrow">카사네 · 重ね</p>
          <h1>오늘도 한 겹 더</h1>
        </div>
        <div className={`dday ${pace.dday <= 30 && pace.dday > 0 ? 'soon' : ''}`}>
          <b>{pace.dday > 0 ? `D-${pace.dday}` : pace.dday === 0 ? 'D-DAY' : '시험 종료'}</b>
          <span>JLPT N{target}</span>
        </div>
      </header>

      <section className="hero card">
        {session ? (
          <>
            <p className="eyebrow">하던 회독이 남아 있어요</p>
            <h2>
              N{session.level} · {session.stage + 1}장
            </h2>
            <p className="muted">
              {session.pass}바퀴째 · 남은 카드 {session.queue.length + session.again.length}장
            </p>
            <button className="btn primary big" onClick={() => go('/study')}>
              이어서 하기
            </button>
          </>
        ) : (
          <>
            <p className="eyebrow">
              오늘의 회독 · {lv.round}회독째
            </p>
            <h2>
              N{target} · {lv.done + 1}장
            </h2>
            <p className="muted">
              새 단어 {Math.min(50, COUNTS[target] - lv.done * 50)}개
              {lv.done > 0 && ' + 지난 장 복습 50개'}
            </p>
            <button className="btn primary big" onClick={startNext}>
              시작하기
            </button>
          </>
        )}
      </section>

      <section className="card goal">
        <Ring value={learned / COUNTS[target]}>
          <b>{Math.round((learned / COUNTS[target]) * 100)}%</b>
          <span>{lv.round}회독</span>
        </Ring>
        <div className="goal-body">
          <h3>
            N{target} 목표 <a href="#/settings">변경</a>
          </h3>
          <p className="num">
            {learned.toLocaleString()} <span>/ {COUNTS[target].toLocaleString()} 단어</span>
          </p>
          <p className="muted">{pace.need}</p>
          {pace.forecast && (
            <p className={`forecast ${pace.onTrack ? 'ok' : 'late'}`}>
              {pace.forecast} · {pace.onTrack ? '순항 중' : '조금 더 속도를'}
            </p>
          )}
          {lv.round > 1 && <p className="forecast ok">{lv.round - 1}회독 완료! 회독할수록 빨라져요.</p>}
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
          <span className="stat-label">오늘 넘긴 카드</span>
          <b>
            {todayLog.c}
            <small>장</small>
          </b>
        </div>
        <div className="card stat">
          <span className="stat-label">오늘 끝낸 장</span>
          <b>
            {todayLog.s}
            <small>/ {pace.goalToday}장</small>
          </b>
        </div>
      </section>

      <section className="card">
        <h3>학습 기록</h3>
        <Heatmap log={s.log} today={today} />
        <p className="muted small">최근 {WEEKS}주 · 진할수록 카드를 많이 넘긴 날</p>
      </section>

      <section>
        <h3 className="section-title">급수별 진행</h3>
        <div className="levels">
          {LEVELS.map((l: Level) => {
            const done = learnedCount(s, l)
            const r = s.levels[l].round
            return (
              <a key={l} href={`#/level/${l}`} className={`card level-row ${l === target ? 'target' : ''}`}>
                <div className="level-name">
                  <b>N{l}</b>
                  {l === target && <span className="chip accent">목표</span>}
                  {r > 1 && <span className="chip">{r - 1}회독 완료</span>}
                  {!KO_READY[l] && <span className="chip">뜻: 영어</span>}
                </div>
                <div className="bar">
                  <i style={{ width: `${(done / COUNTS[l]) * 100}%` }} />
                </div>
                <span className="level-count">
                  {done} / {COUNTS[l]}
                </span>
                <Icon name="chevron" size={18} />
              </a>
            )
          })}
        </div>
      </section>
    </>
  )
}
