import { useEffect, useMemo, useState } from 'react'
import { go } from '../App'
import { Button, Card, IconButton, ProgressBar, RowLink, Sheet } from '../components/ui'
import { Ruma } from '../components/Ruma'
import { Icon } from '../components/Icon'
import { BackupNudge } from '../components/Notices'
import { homeTip, markDone, phase as guidePhase, type Phase, type Tip } from '../guide'
import { GuideCard, PlanPending, ReadinessPending, TIPS, TipBubble } from './HomeGuide'
import { UNOFFICIAL_SHORT } from '../brand'
import { LEVELS, levelInfoVersion, type Level } from '../data'
import { paceToGoal, readiness, type Readiness } from '../readiness'
import {
  breakdowns,
  buildQueue,
  leechIds,
  minutesFor,
  MORE_REVIEWS,
  NEW_WHILE_BEHIND,
  newWordsLeft,
  quests,
  reviewQuota,
  secondsPerAnswer,
  spreadReviews,
  streak,
  unlockMoreNew,
  unlockMoreReviews,
  weekDays,
} from '../srs'
import { update, useStore, type State } from '../store'
import { dayKey, daysBetween, formatDay, parseDay, upcomingExams, useClock } from '../util'

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

const levelsLabel = (levels: Level[]) => (levels.length === 1 ? `N${levels[0]}` : `N${levels[0]}~N${levels[levels.length - 1]}`)
const examShort = (key: string) => {
  const d = parseDay(key)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

/** Top line: the target and the exam, and the streak — the only place the streak shows on this screen. */
function HomeHeader({ s, today, first }: { s: State; today: Date; first: Phase }) {
  const { target, examDate } = s.settings
  const dday = daysBetween(today, parseDay(examDate))
  const days = streak(s.log, today)
  const lit = !!s.log[dayKey(today)]?.c
  // the first run: the line fills in as Ruma's questions are answered; no streak before anything was studied
  if (first === 'level' || first === 'exam')
    return (
      <header className="home-head">
        <h1 className="sr-only">오늘</h1>
        <p className="home-ctx">
          <b>{first === 'level' ? 'JLPT 루마' : `N${target}`}</b>
        </p>
      </header>
    )
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
      {first !== 'start' && (
        <span className={`streak ${lit ? 'lit' : ''}`} role="img" aria-label={lit || !days ? `연속 ${days}일` : `연속 ${days}일, 오늘 하면 ${days + 1}일`}>
          <Icon name="flame" size={20} fill={lit} />
          <span className="num">{days}</span>
          {!lit && days > 0 && <small>오늘 하면 {days + 1}일</small>}
        </span>
      )}
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

/**
 * "오늘 하면 시험날 예상 +N단어" (03 §4.3): the plan with today's session against the plan resumed tomorrow. When the
 * difference rounds to nothing it says so instead of showing "+0", and what is still true: put off, the reviews
 * are tomorrow's.
 */
function PlanGain({ gain, reviews }: { gain: number; reviews: boolean }) {
  const n = Math.round(gain)
  if (n >= 1)
    return (
      <p className="plan-gain">
        오늘 하면 시험날 예상 <b className="num">+{n}</b>단어
      </p>
    )
  return <p className="plan-gain muted">오늘 분량은 시험날 예상을 거의 바꾸지 않아요.{reviews && ' 미루면 내일 할 복습이 늘어요.'}</p>
}

/** 03 §7.3: what the number is and what it cannot say. */
function ReadinessSheet({ r, cap, isOpen, onClose }: { r: Readiness; cap: number; isOpen: boolean; onClose: () => void }) {
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
            ‘계획대로면’은 오늘부터 계획을 지킨다고 가정한 값이에요. 시험 전에 돌아오는 복습은 그날그날 하고(밀리면 하루{' '}
            {cap.toLocaleString()}장까지, 오래된 것부터), 아직 안 본 단어는 하루 {r.plannedNew > 0 ? '설정한 개수만큼' : '0개'}
            {r.plannedNew > 0 ? `(밀린 동안은 ${NEW_WHILE_BEHIND}개까지)` : ''} 새로 배운다고 봐요. 복습할 때마다 그때 기억할 확률만큼 맞히고, 못
            맞히면 다시 익힌다고 계산해요.
          </li>
          <li>‘지금 그만두면’은 오늘부터 아무것도 하지 않을 때의 값이에요.</li>
          <li>‘오늘 하면 +N단어’는 오늘 분량을 할 때와, 오늘은 쉬고 내일부터 계획대로 할 때의 차이예요.</li>
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
  const { cap } = reviewQuota(s, today)
  // reviews due beyond today's quota wait for the coming days (03 §5.3); "더 하기" lets some of them in today
  const behind = q.held > 0
  const more = Math.min(MORE_REVIEWS, q.held)
  // the same schedule readiness uses (memoised), so the days stated here are the ones the figure assumes
  const catchUp = behind ? spreadReviews(s, today).catchUp : 0
  const [added, setAdded] = useState<number | null>(null)
  useEffect(() => {
    if (added === null) return
    const t = setTimeout(() => setAdded(null), 4000)
    return () => clearTimeout(t)
  }, [added])
  // recomputed per hour, like readiness itself
  // …and again once level data loads (it decides which reading cards still count, srs.ts isActive)
  const iv = levelInfoVersion()
  const pace = useMemo(() => paceToGoal(s, today), [s, hour, iv])
  const nextExam = upcomingExams(today, 2).find((d) => d > s.settings.examDate)
  const weak = useMemo(() => leechIds(s.cards, 40, s.settings.fastTrack).length, [s.cards, s.settings.fastTrack, iv])
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

  // Ruma's first run (src/guide.ts): the questions, then the first session, at the top; nothing changes for a learner
  // without a guide (everyone from before it)
  const first = guidePhase(s)
  const asking = first === 'level' || first === 'exam'
  // a tip is taken when Home opens and counted as shown at once, so it is never repeated (not even after a reload)
  const [tip, setTip] = useState<Tip | null>(() => homeTip(s, !r.past && r.status !== 'early'))
  useEffect(() => {
    if (tip) markDone(tip)
  }, [tip])

  return (
    <>
      <HomeHeader s={s} today={today} first={first} />

      {first && <GuideCard s={s} phase={first} fresh={q.fresh} minutes={minutes} />}

      {asking ? <ReadinessPending /> : <ReadinessCard r={r} onInfo={() => setInfo(true)} />}

      {first === 'level' ? (
        <PlanPending />
      ) : (
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
              {behind && (
                <p className="plan-note backlog-note">
                  밀린 복습이 {(q.review + q.held).toLocaleString()}장이에요. 오늘은 오래된 것부터 {q.review.toLocaleString()}장만 하고, 나머지는 나눠서 해요.
                  {catchUp > 1 && ` ${catchUp}일이면 따라잡아요.`}
                  {s.settings.dailyNew > NEW_WHILE_BEHIND && ` 그동안 새 단어는 하루 ${NEW_WHILE_BEHIND}개예요.`}
                </p>
              )}
              {!asking && !r.past && !r.examDay && <PlanGain gain={r.todayGain} reviews={q.review + q.learning > 0} />}
              {/* in the first run the one primary is Ruma's "첫 학습 시작" */}
              {!first && <Button label={started ? '이어서 하기' : '오늘의 학습 시작'} variant="primary" size="lg" width="100%" onClick={() => go('/study')} />}
            </>
          ) : behind ? (
            <>
              <p className="plan-done">
                {cleared ? '오늘 몫을 끝냈어요.' : '오늘 몫은 없어요.'} 남은 밀린 복습 {q.held.toLocaleString()}장은 내일부터 나눠서 해요.
              </p>
              <Button
                label={`복습 ${more}장 더 하기`}
                variant="secondary"
                size="lg"
                width="100%"
                onClick={() => {
                  unlockMoreReviews(more)
                  go('/study')
                }}
              />
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
          {asking ? null : added !== null ? (
            <p className="plan-lever" role="status">
              오늘 복습을 {added}장 늘렸어요.
              <Button
                label="되돌리기"
                variant="ghost"
                className="text-action"
                onClick={() => {
                  unlockMoreReviews(-added)
                  setAdded(null)
                }}
              />
            </p>
          ) : behind && todo > 0 ? (
            <p className="plan-lever">
              여유가 있으면 오늘 더 해도 돼요.
              <Button
                label={`${more}장 더 하기`}
                variant="ghost"
                className="text-action"
                endContent={<Icon name="chevron" size={16} />}
                onClick={() => {
                  unlockMoreReviews(more)
                  setAdded(more)
                }}
              />
            </p>
          ) : behind ? null : changed ? (
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
      )}

      {!first && (
        <Card className="week-card" role="region" aria-label="이번 주">
          <div className="week-top">
            <Ruma progress={restDay ? 0 : progress} mood={cleared ? 'cheer' : !started ? 'sleep' : 'idle'} size={72} />
            {tip && tip !== 'reading' ? <TipBubble text={TIPS[tip]} onClose={() => setTip(null)} /> : <p className="bubble">{bubble}</p>}
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
      )}

      <BackupNudge today={today} />

      <nav className="home-links" aria-label="더 보기">
        {weak > 0 && <RowLink href="#/words/weak" label={`약한 단어 ${weak}개`} />}
        <RowLink href="#/stats" label="기록 · 도장 여정 · 복습 예보" />
      </nav>

      {asking && <p className="first-note">{UNOFFICIAL_SHORT}</p>}

      <ReadinessSheet r={r} cap={cap} isOpen={info} onClose={() => setInfo(false)} />
    </>
  )
}
