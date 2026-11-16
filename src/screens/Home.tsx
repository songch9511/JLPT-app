// Home (docs/design-system.md §3 "홈"): Ruma in a tinted circle with one line, the day's progress, and in the thumb zone
// the day's two sessions as two big buttons — 복습하기 (reviews due today) and 새 단어 (today's new words). Each button's
// number is what its session will show (srs.ts `StudyMode`); the two always add up to the day's cards.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { go } from '../App'
import { Announce, Button, ProgressBar } from '../components/ui'
import { Ruma } from '../components/Ruma'
import { Icon } from '../components/Icon'
import { askLevelAgain, homeTip, markDone, phase as guidePhase, type Phase, type Tip } from '../guide'
import { LevelAnswers, QUESTION, TIPS, TipLine } from './HomeGuide'
import { UNOFFICIAL_LINE } from '../brand'
import { LEVELS } from '../data'
import { breakdowns, buildQueue, cardsLeft, minutesFor, MORE_REVIEWS, newWordsLeft, secondsPerAnswer, streak, unlockMoreNew, unlockMoreReviews } from '../srs'
import { update, useStore, type State } from '../store'
import { dayKey, useClock } from '../util'

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

const f = (n: number) => n.toLocaleString('ko-KR')

/** Ruma's state, which tints its circle: asleep before today's study, one eye open, both eyes, nothing to do. */
export type Mood = 'sleep' | 'wake' | 'day' | 'rest'

/**
 * Ruma's one line for a state. Where a state has two, the line changes once a day (never while the screen is open),
 * so it does not flicker. Voice rules (docs/design-system.md §3 "문구"): plain, first person, no interjections,
 * adverbs, praise or exclamation marks; what the numbers and Ruma's face already say is not said again.
 */
function rumaLine(lines: string[], today: Date) {
  const day = Math.floor(new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() / 86_400_000)
  return lines[day % lines.length]
}

/** Top line: the day and the level, the streak at the right; while Ruma asks the level, the app's name. */
function HomeHeader({ s, today, first }: { s: State; today: Date; first: Phase }) {
  if (first === 'level')
    return (
      <header className="top home-head">
        <h1>JLPT 루마</h1>
      </header>
    )
  const days = streak(s.log, today)
  const lit = !!s.log[dayKey(today)]?.c
  return (
    <header className="top home-head">
      <div className="grow">
        <h1>오늘</h1>
        <p className="subtitle">
          {today.getMonth() + 1}월 {today.getDate()}일 {DAY_NAMES[today.getDay()]}요일 · <b>N{s.settings.target}</b>
        </p>
      </div>
      {/* no streak before anything was studied */}
      {first !== 'start' && (
        <span className={`streak ${lit ? 'lit' : ''}`} role="img" aria-label={lit || !days ? `연속 ${days}일` : `연속 ${days}일, 오늘 하면 ${days + 1}일`}>
          <Icon name="flame" size={18} fill={lit} strokeWidth={2.4} />
          <span className="num">{days}</span>
        </span>
      )}
    </header>
  )
}

/**
 * One of Home's big buttons: what it starts at the left (with an optional line under it), how much at the right. The
 * first of the group is the one ink primary (76px); the other is white (64px).
 */
function BigButton({ label, title, sub, count, primary, className, onClick }: { label: string; title: string; sub?: ReactNode; count: ReactNode; primary?: boolean; className?: string; onClick: () => void }) {
  return (
    <Button label={label} variant={primary ? 'primary' : 'secondary'} size="lg" width="100%" className={`home-go ${className ?? ''}`} onClick={onClick}>
      <span className="home-go-text">
        <span className="home-go-title">{title}</span>
        {sub && <span className="home-go-sub">{sub}</span>}
      </span>
      <span className="home-go-count num">{count}</span>
    </Button>
  )
}

export function Home() {
  const s = useStore((x) => x)
  useClock()
  const today = new Date()

  const { target } = s.settings
  // the day as a whole, and its two sessions: the numbers on the buttons are the sessions' own queues
  const q = buildQueue(s, today)
  const qr = buildQueue(s, today, undefined, { mode: 'review' })
  const qn = buildQueue(s, today, undefined, { mode: 'new' })
  const reviews = cardsLeft(qr)
  const fresh = cardsLeft(qn)
  const all = breakdowns(s)
  const todayLog = s.log[dayKey(today)]
  const done = todayLog?.c ?? 0
  const todo = reviews + fresh
  const started = done > 0
  const cleared = started && todo === 0
  const unseen = newWordsLeft(s)
  const levelDone = unseen === 0
  const nextLevel = levelDone ? LEVELS.find((l) => l < target && all[l].new > 0) : undefined
  const minutes = minutesFor(q, secondsPerAnswer(s, today))
  // reviews due beyond today's quota wait for the coming days (03 §5.3); "더" lets some of them in today
  const behind = q.held > 0
  const more = Math.min(MORE_REVIEWS, q.held)
  // learning cards that come back later today, with nothing to answer right now (Study shows the wait)
  const waitMin = !q.next && q.waiting > 0 && q.nextDue !== null ? Math.max(1, Math.ceil((q.nextDue - today.getTime()) / 60_000)) : null
  const [added, setAdded] = useState<number | null>(null)
  useEffect(() => {
    if (added === null) return
    const t = setTimeout(() => setAdded(null), 4000)
    return () => clearTimeout(t)
  }, [added])

  // Ruma's first run (src/guide.ts): the level question, then the first session
  const first = guidePhase(s)
  // a tip is taken when Home opens and counted as shown at once, so it is never repeated (not even after a reload)
  const [tip, setTip] = useState<Tip | null>(() => homeTip(s))
  useEffect(() => {
    if (tip) markDone(tip)
  }, [tip])

  // the mascot opens one eye once today's study starts, both when today's share is done; a day with nothing to do
  // sleeps rather than looking done without any study
  const progress = cleared ? 1 : started ? done / (done + todo) : 0
  const mood: Mood = first === 'level' ? 'rest' : cleared ? 'day' : started ? 'wake' : todo > 0 || first ? 'sleep' : 'rest'
  const line =
    first === 'level'
      ? '반가워요, 루마예요'
      : first === 'start'
        ? '깨워 줄래요?'
        : todo === 0 && nextLevel
          ? `다음은 N${nextLevel}예요`
          : rumaLine(
              mood === 'day'
                ? ['두 눈 다 떴어요', '내일 봐요']
                : mood === 'wake'
                  ? ['한쪽 눈 떴어요']
                  : behind
                    ? ['보고 싶었어요', '같이 치워요']
                    : mood === 'sleep'
                      ? ['깨워 줄래요?', '자고 있어요']
                      : ['오늘은 쉬어요'],
              today,
            )
  const showTip = !first && tip === 'srs'

  // one polite announcement when Ruma's state changes while Home is open (not when it opens)
  const said = useRef(mood)
  const [announce, setAnnounce] = useState('')
  useEffect(() => {
    if (said.current === mood) return
    said.current = mood
    setAnnounce(`루마: ${line}`)
  }, [mood, line])

  // the level answer replaces the buttons that had focus: focus goes to Ruma's line, which now holds what comes next
  // (not when Home opens: that is the learner's to start)
  const lineRef = useRef<HTMLParagraphElement>(null)
  const askedFor = useRef(first)
  useEffect(() => {
    if (askedFor.current === first) return
    askedFor.current = first
    if (first) lineRef.current?.focus()
  }, [first])

  const qid = useId()
  const total = done + todo
  // 복습하기 once a review was answered today reads "계속"; 새 단어 once a new word was met
  const reviewing = (todayLog?.r ?? 0) > 0
  const learningNew = (todayLog?.n ?? 0) > 0
  const backlogTag = behind && (
    <span className="backlog-tag" role="img" aria-label={`밀린 복습 ${f(q.held)}장`}>
      밀린 <b className="num">{f(q.held)}</b>
    </span>
  )
  const moreNew = () => {
    unlockMoreNew(10)
    go('/study/new')
  }

  return (
    <>
      <HomeHeader s={s} today={today} first={first} />

      <div className="home-center">
        <div className="home-ruma" data-mood={mood}>
          <Ruma progress={mood === 'rest' ? 0 : progress} mood={mood === 'day' ? 'cheer' : mood === 'wake' ? 'idle' : 'sleep'} size={172} />
        </div>
        {showTip ? (
          <TipLine text={TIPS.srs} onClose={() => setTip(null)} />
        ) : (
          <p className="ruma-line" ref={lineRef} tabIndex={first ? -1 : undefined}>
            {first === 'level' ? (
              <>
                <span className="ruma-hello">{line}</span>
                <b className="ruma-ask" id={qid}>
                  {QUESTION}
                </b>
              </>
            ) : (
              line
            )}
          </p>
        )}
        {first !== 'level' && (
          <div className="home-progress">
            <p className="home-progress-text">
              <span>
                오늘 <b className="num">{f(done)}</b> / {f(total)}장
              </span>
              {waitMin !== null ? (
                <span className="plan-time" role="img" aria-label={`익히는 중인 ${q.waiting}장이 ${waitMin}분 뒤에 돌아와요`}>
                  {waitMin}분 뒤
                </span>
              ) : todo > 0 ? (
                <span className="plan-time" role="img" aria-label={started ? `약 ${minutes}분 남음` : `약 ${minutes}분`}>
                  약 {minutes}분{started && ' 남음'}
                </span>
              ) : (
                cleared &&
                (todayLog?.ms ?? 0) >= 30_000 && (
                  <span className="plan-time" role="img" aria-label={`${Math.round(todayLog!.ms! / 60_000)}분 걸림`}>
                    {Math.round(todayLog!.ms! / 60_000)}분
                  </span>
                )
              )}
            </p>
            <ProgressBar label="오늘 학습" value={done} max={Math.max(1, total)} valueText={`오늘 ${f(total)}장 중 ${f(done)}장`} />
          </div>
        )}
        {announce && <Announce text={announce} />}
      </div>

      {first === 'level' ? (
        <section className="home-actions ask" aria-labelledby={qid}>
          <LevelAnswers labelledBy={qid} />
          <p className="level-scale" aria-hidden="true">
            <span>쉬움</span>
            <span>어려움</span>
          </p>
          <p className="first-note">{UNOFFICIAL_LINE}</p>
        </section>
      ) : (
        <section className="home-actions plan" role="region" aria-labelledby="plan-title">
          <h2 id="plan-title" className="sr-only">
            오늘의 계획
          </h2>
          {todo > 0 ? (
            <>
              {/* a session with nothing in it today has no button; the first of the two is the one primary */}
              {reviews > 0 && (
                <BigButton
                  primary
                  className="go-review"
                  label={reviewing ? `복습 이어서 하기, ${f(reviews)}장 남음` : `복습 시작, ${f(reviews)}장`}
                  title={reviewing ? '복습 계속하기' : '복습하기'}
                  sub={reviewing ? `${f(todayLog!.r)}장 끝냄` : '오늘 돌아온 단어'}
                  count={
                    <span className="c-review">
                      <b>{f(reviews)}</b>장
                    </span>
                  }
                  onClick={() => go('/study/review')}
                />
              )}
              {fresh > 0 && (
                <BigButton
                  primary={reviews === 0}
                  className="go-new"
                  label={
                    (first === 'start' ? `첫 학습 시작, 새 단어 ${fresh}개` : learningNew ? `새 단어 이어서 하기, ${fresh}개 남음` : `새 단어 시작, ${fresh}개`) +
                    (qn.learning > 0 ? `, 익히는 중 ${qn.learning}개 포함` : '')
                  }
                  title="새 단어"
                  sub={qn.learning > 0 ? <span className="c-learning">익히는 중 {qn.learning}개 포함</span> : undefined}
                  count={
                    <span className="c-new">
                      <b>{fresh}</b>개
                    </span>
                  }
                  onClick={() => go('/study/new')}
                />
              )}
              {first === 'start' ? (
                <Button label="급수 다시 고르기" variant="ghost" className="text-action home-quiet" onClick={askLevelAgain} />
              ) : added !== null ? (
                <p className="plan-lever" role="status">
                  복습 {added}장 늘렸어요
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
              ) : (
                behind && (
                  <p className="plan-lever">
                    {backlogTag}
                    <Button
                      label={`밀린 복습 ${more}장 더 하기`}
                      variant="ghost"
                      className="text-action"
                      endContent={<Icon name="chevron" size={16} />}
                      onClick={() => {
                        unlockMoreReviews(more)
                        setAdded(more)
                      }}
                    >
                      {more}장 더
                    </Button>
                  </p>
                )
              )}
            </>
          ) : (
            <>
              {cleared && (
                <p className="home-done">
                  <Icon name="check" size={18} strokeWidth={2.6} />
                  <span>
                    <span className="plan-eyebrow">오늘 끝</span>
                    {(todayLog?.n ?? 0) > 0 && (
                      <>
                        {' · '}새 단어 <b className="num">{todayLog!.n}</b>
                      </>
                    )}
                  </span>
                  {backlogTag}
                </p>
              )}
              {behind ? (
                // the same button as the study screen's done screen: short on screen, the whole action as its name
                <Button
                  label={`밀린 복습 ${more}장 더 하기`}
                  size="lg"
                  width="100%"
                  className="home-go more"
                  onClick={() => {
                    unlockMoreReviews(more)
                    go('/study/review')
                  }}
                >
                  {more}장 더
                </Button>
              ) : unseen > 0 ? (
                // after a finished day more is an offer (white); on a day with nothing planned it is the one thing to do
                <BigButton primary={!cleared} label="새 단어 10개 더 하기" title="새 단어 더" count="10개" onClick={moreNew} />
              ) : (
                nextLevel && (
                  <BigButton
                    primary
                    label={`다음 급수 N${nextLevel} 시작하기`}
                    title={`N${nextLevel} 시작하기`}
                    count=""
                    onClick={() => {
                      update((d) => void (d.settings.target = nextLevel))
                      go('/study/new')
                    }}
                  />
                )
              )}
            </>
          )}
          {first && <p className="first-note">{UNOFFICIAL_LINE}</p>}
        </section>
      )}
    </>
  )
}
