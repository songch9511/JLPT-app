import { useEffect, useMemo, useState } from 'react'
import { go } from '../App'
import { Button, Card, IconButton, ProgressBar, Sheet } from '../components/ui'
import { Ruma } from '../components/Ruma'
import { Icon } from '../components/Icon'
import { BackupNudge } from '../components/Notices'
import { LEVELS, type Level } from '../data'
import { paceToGoal, readiness, type Readiness } from '../readiness'
import {
  breakdowns,
  buildQueue,
  leechIds,
  minutesFor,
  newWordsLeft,
  quests,
  secondsPerAnswer,
  streak,
  unlockMoreNew,
  weekDays,
} from '../srs'
import { update, useStore, type State } from '../store'
import { dayKey, daysBetween, formatDay, parseDay, upcomingExams, useClock } from '../util'

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']
/** A backlog worth its own message: more reviews due than a 20-minute day can hold at the measured pace. */
const BACKLOG_MINUTES = 20

const levelsLabel = (levels: Level[]) => (levels.length === 1 ? `N${levels[0]}` : `N${levels[0]}~N${levels[levels.length - 1]}`)
const examShort = (key: string) => {
  const d = parseDay(key)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

/** Top line: the target and the exam, and the streak — the only place the streak shows on this screen. */
function HomeHeader({ s, today }: { s: State; today: Date }) {
  const { target, examDate } = s.settings
  const dday = daysBetween(today, parseDay(examDate))
  const days = streak(s.log, today)
  const lit = !!s.log[dayKey(today)]?.c
  return (
    <header className="home-head">
      <h1 className="sr-only">오늘</h1>
      <p className="home-ctx">
        <b>N{target}</b>
        {dday >= 0 ? (
          <>
            {' · '}
            {examShort(examDate)} 시험 · <span className={dday <= 14 ? 'soon' : ''}>{dday > 0 ? `D-${dday}` : 'D-DAY'}</span>
          </>
        ) : (
          <>
            {' · '}
            <a className="dday" href="#/settings">
              시험일 지남 · 바꾸기
            </a>
          </>
        )}
      </p>
      <span className={`streak ${lit ? 'lit' : ''}`} role="img" aria-label={lit || !days ? `연속 ${days}일` : `연속 ${days}일, 오늘 하면 ${days + 1}일`}>
        <Icon name="flame" size={20} fill={lit} />
        <span className="num">{days}</span>
        {!lit && days > 0 && <small>오늘 하면 {days + 1}일</small>}
      </span>
    </header>
  )
}

const STATUS: Record<Readiness['status'], { label: string; cls: string }> = {
  ontrack: { label: '순항 중이에요', cls: 'ok' },
  tight: { label: '빠듯해요', cls: 'tight' },
  risk: { label: '목표보다 모자라요', cls: 'risk' },
  early: { label: '아직 판단하기 일러요', cls: 'early' },
}

/** The headline (03 §7.1): words of the list expected to be recalled on the exam morning. */
function ReadinessCard({ r, onInfo }: { r: Readiness; onInfo: () => void }) {
  const list = `${levelsLabel(r.levels)} 목록`
  if (r.past)
    return (
      <Card className="readiness" role="region" aria-labelledby="ready-title">
        <h2 id="ready-title" className="card-title">
          시험날 기억할 단어
        </h2>
        <p>시험일이 지났어요. 다음 시험일을 골라 주세요.</p>
        <Button label="시험일 고르기" variant="ghost" className="text-action" href="#/settings" endContent={<Icon name="chevron" size={16} />} />
      </Card>
    )
  const plan = Math.round(r.plan)
  const stop = Math.round(r.stop)
  const st = STATUS[r.status]
  return (
    <Card className="readiness" role="region" aria-labelledby="ready-title">
      <h2 id="ready-title" className="card-title">
        시험날 기억할 단어 <span className="muted">(예상)</span>
      </h2>
      <p className="ready-figure">
        <b className="num">{plan.toLocaleString()}</b>
        <span className="muted"> / {r.total.toLocaleString()}</span>
      </p>
      <ProgressBar
        className="ready-bar"
        label="계획대로 했을 때 시험날 기억할 단어"
        value={plan}
        max={r.total}
        valueText={`${r.total}개 중 ${plan}개, 목표 ${r.goalWords}개`}
        mark={r.goalWords}
      />
      <p className="ready-goal muted small">
        목표 {r.goalWords.toLocaleString()} ({Math.round(r.goal * 100)}%)
      </p>
      <p className="ready-split">
        지금 그만두면 <b className="num">{stop.toLocaleString()}</b> · 계획대로면 <b className="num">{plan.toLocaleString()}</b>
      </p>
      <p className="ready-status">
        <span className={`status ${st.cls}`}>{r.examDay ? '오늘은 시험날!' : st.label}</span>
        {r.calibrated && <span className="muted small">실제 기억률이 예측보다 낮아 보정했어요</span>}
      </p>
      <button className="ready-info" onClick={onInfo} aria-haspopup="dialog">
        <Icon name="info" size={16} />
        <span>{list} 기준 추정 · 문법·독해·청해 제외 · 합격 확률이 아니에요</span>
      </button>
    </Card>
  )
}

/** 03 §7.3: what the number is and what it cannot say. */
function ReadinessSheet({ r, isOpen, onClose }: { r: Readiness; isOpen: boolean; onClose: () => void }) {
  return (
    <Sheet isOpen={isOpen} onClose={onClose} label="이 숫자는 무엇인가요?">
      <div className="sheet info-sheet">
        <div className="sheet-head">
          <h2 id="ready-help" className="grow">
            이 숫자는 무엇인가요?
          </h2>
          <IconButton label="닫기" icon={<Icon name="close" />} onClick={onClose} />
        </div>
        <ul className="help-list">
          <li>
            지금까지의 복습 기록으로 계산한, 시험날 아침에 떠올릴 확률을 {levelsLabel(r.levels)} 목록 {r.total.toLocaleString()}개 단어마다 더한
            값이에요.
          </li>
          <li>
            ‘계획대로면’은 오늘부터 계획을 지킨다고 가정한 값이에요. 시험 전에 돌아오는 복습을 한 번 더 하고, 아직 안 본 단어를 하루{' '}
            {r.plannedNew > 0 ? '설정한 개수만큼' : '0개'} 새로 배운다고 봐요.
          </li>
          <li>‘지금 그만두면’은 오늘부터 아무것도 하지 않을 때의 값이에요.</li>
          <li>합격 확률이 아니에요. 어휘는 언어지식 과목의 일부예요. 문법·독해·청해는 따로 준비해야 해요.</li>
          <li>단어 목록은 공식 목록이 아니에요(JLPT는 공식 어휘 목록을 공개하지 않아요).</li>
          <li>스스로 채점하는 카드가 많을수록 실제보다 높게 나올 수 있어요.</li>
          <li>목표 {Math.round(r.goal * 100)}%는 합격선에서 나온 숫자가 아니라 앱이 정한 기준이에요. 설정에서 바꿀 수 있어요.</li>
        </ul>
      </div>
    </Sheet>
  )
}

export function Home() {
  const s = useStore((x) => x)
  useClock()
  const today = new Date()
  const hour = Math.floor(today.getTime() / 3_600_000)
  const [info, setInfo] = useState(false)
  const [changed, setChanged] = useState<{ from: number; to: number } | null>(null)
  useEffect(() => {
    if (!changed) return
    const t = setTimeout(() => setChanged(null), 4000)
    return () => clearTimeout(t)
  }, [changed])

  const { target } = s.settings
  const q = buildQueue(s, today)
  const r = readiness(s, today)
  const all = breakdowns(s)
  const todayLog = s.log[dayKey(today)]
  const todo = q.learning + q.review + q.fresh
  const started = !!todayLog?.c
  const cleared = started && todo === 0
  const unseen = newWordsLeft(s)
  const levelDone = unseen === 0
  const nextLevel = levelDone ? LEVELS.find((l) => l < target && all[l].new > 0) : undefined
  const sec = secondsPerAnswer(s, today)
  const minutes = minutesFor(q, sec)
  // only worth a word when the reviews clearly exceed a 20-minute day (half as much again)
  const dayCap = Math.floor((BACKLOG_MINUTES * 60) / sec)
  const backlog = q.review > 1.5 * dayCap ? dayCap : 0
  // recomputed per hour, like readiness itself
  const pace = useMemo(() => paceToGoal(s, today), [s, hour])
  const nextExam = upcomingExams(today, 2).find((d) => d > s.settings.examDate)
  const weak = useMemo(() => leechIds(s.cards, 40, s.settings.fastTrack).length, [s.cards, s.settings.fastTrack])
  const quest = quests(s, today)[0]
  const week = weekDays(s.log, today)

  // share of today's cards already answered: the mascot opens one eye once started, both when done
  const progress = cleared ? 1 : started ? (todayLog?.c ?? 0) / ((todayLog?.c ?? 0) + todo) : 0
  const pct = Math.round(progress * 100)
  // a day with nothing to do: the mascot sleeps rather than looking full without any study
  const restDay = todo === 0 && !started
  const bubble =
    todo === 0 && levelDone
      ? nextLevel
        ? `N${target} 단어를 모두 만났어요. 다음은 N${nextLevel}!`
        : cleared
          ? '두 눈 번쩍! 오늘 분량 끝.'
          : '오늘은 쉬는 날이에요.'
      : cleared
        ? '두 눈 번쩍! 오늘 분량 끝.'
        : started
          ? `${pct}% 왔어요. ${todo}장만 더 하면 남은 눈도 떠요!`
          : todo > 0
            ? `쿨쿨… 오늘은 ${todo}장! 시작하면 한쪽 눈을 떠요.`
            : '오늘은 복습이 없어요. 새 단어를 해 볼까요?'

  const setPace = (to: number) => {
    setChanged({ from: s.settings.dailyNew, to })
    update((d) => void (d.settings.dailyNew = to))
  }

  return (
    <>
      <HomeHeader s={s} today={today} />

      <ReadinessCard r={r} onInfo={() => setInfo(true)} />

      <Card className="plan" role="region" aria-labelledby="plan-title">
        <h2 id="plan-title" className="card-title">
          오늘의 계획
          {todo > 0 && <span className="muted">약 {minutes}분</span>}
        </h2>
        {todo > 0 ? (
          <>
            <p className="plan-counts">
              <span className="c-review">
                복습 <b className="num">{q.review}</b>
              </span>
              {q.learning > 0 && (
                <span className="c-learning">
                  익히는 중 <b className="num">{q.learning}</b>
                </span>
              )}
              <span className="c-new">
                새 단어 <b className="num">{q.fresh}</b>
                {q.freshReading > 0 && <small className="muted"> (읽기만 {q.freshReading})</small>}
              </span>
            </p>
            {backlog > 0 && (
              <p className="plan-note">
                밀린 복습 {q.review.toLocaleString()}장 — 오늘 다 못 해도 괜찮아요. 약 {backlog}장({BACKLOG_MINUTES}분)만 해도 오래된 것부터
                정리돼요.
              </p>
            )}
            {!r.past && !r.examDay && r.todayGain >= 0.5 && (
              <p className="plan-gain">
                오늘 하면 시험날 예상 <b className="num">+{Math.round(r.todayGain)}</b>단어
              </p>
            )}
            <Button label={started ? '이어서 하기' : '오늘의 학습 시작'} variant="primary" size="lg" width="100%" onClick={() => go('/study')} />
          </>
        ) : unseen > 0 ? (
          <>
            <p className="plan-done">{cleared ? '오늘 분량을 끝냈어요.' : '오늘 할 복습이 없어요.'}</p>
            <Button
              label="새 단어 10개 더 하기"
              variant={cleared ? 'secondary' : 'primary'}
              size="lg"
              width="100%"
              onClick={() => {
                unlockMoreNew(10)
                go('/study')
              }}
            />
          </>
        ) : nextLevel ? (
          <>
            <p className="plan-done">{cleared ? '오늘 분량을 끝냈어요.' : '오늘 할 복습이 없어요.'} 다음 급수의 새 단어를 시작할 수 있어요.</p>
            <Button
              label={`N${nextLevel} 시작하기`}
              variant="primary"
              size="lg"
              width="100%"
              onClick={() => {
                update((d) => void (d.settings.target = nextLevel))
                go('/study')
              }}
            />
          </>
        ) : (
          <p className="plan-done">{cleared ? '오늘 분량을 끝냈어요.' : '오늘은 할 카드가 없어요.'}</p>
        )}
        {changed ? (
          <p className="plan-lever" role="status">
            하루 새 단어 {changed.to}개로 바꿨어요.
            <Button
              label="되돌리기"
              variant="ghost"
              className="text-action"
              onClick={() => {
                update((d) => void (d.settings.dailyNew = changed.from))
                setChanged(null)
              }}
            />
          </p>
        ) : typeof pace === 'number' ? (
          <p className="plan-lever">
            하루 새 단어 {pace}개면 목표에 닿아요.
            <Button label="바꾸기" variant="ghost" className="text-action" endContent={<Icon name="chevron" size={16} />} onClick={() => setPace(pace)} />
          </p>
        ) : (
          pace === 'none' && (
            <p className="plan-lever muted">
              {s.settings.goal > 0.7 ? `목표를 ${Math.round((s.settings.goal - 0.1) * 100)}%로 낮추거나 ` : ''}
              {nextExam ? `다음 시험(${formatDay(nextExam)})으로 미루는 ` : '목표를 다시 정하는 '}것도 방법이에요.{' '}
              <a href="#/settings" className="link inline-btn">
                목표 바꾸기
              </a>
            </p>
          )
        )}
      </Card>

      <Card className="week-card" role="region" aria-label="이번 주">
        <div className="week-top">
          <Ruma progress={restDay ? 0 : progress} mood={cleared ? 'cheer' : !started ? 'sleep' : 'idle'} size={72} />
          <p className="bubble">{bubble}</p>
        </div>
        <div className="week-row">
          <ol className="week" aria-label={`이번 주 ${week.filter((d) => d.done).length}일 공부함`}>
            {week.map((d, i) => (
              <li key={i} className={`${d.done ? 'done' : ''} ${d.today ? 'today' : ''} ${d.future ? 'future' : ''}`} aria-hidden="true">
                <span>{DAY_NAMES[i]}</span>
                <i />
              </li>
            ))}
          </ol>
          <span className={`quest-mini ${quest.done ? 'done' : ''}`}>
            <Icon name={quest.done ? 'check' : 'circle'} size={16} />
            {quest.title}
          </span>
        </div>
      </Card>

      <BackupNudge today={today} />

      <nav className="home-links" aria-label="더 보기">
        {weak > 0 && (
          <a href="#/words/weak" className="row-link">
            <span className="grow">약한 단어 {weak}개</span>
            <Icon name="chevron" size={18} />
          </a>
        )}
        <a href="#/stats" className="row-link">
          <span className="grow">기록 · 도장 여정 · 복습 예보</span>
          <Icon name="chevron" size={18} />
        </a>
      </nav>

      <ReadinessSheet r={r} isOpen={info} onClose={() => setInfo(false)} />
    </>
  )
}
