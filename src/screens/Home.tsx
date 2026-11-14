// Home, "루마의 하늘" (docs/design-system.md §3 "홈"): the top band is Ruma's sky, whose colour follows Ruma's state
// (asleep → one eye → both eyes, or a day off); the day's plan is a sheet rising over it. What the screen does is the
// same as before the redesign: the queue, the backlog policy, the counts and every button's action are unchanged.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { go, syncThemeColor } from '../App'
import { Announce, Button } from '../components/ui'
import { Ruma } from '../components/Ruma'
import { Icon } from '../components/Icon'
import { askLevelAgain, homeTip, markDone, phase as guidePhase, type Phase, type Tip } from '../guide'
import { LevelAnswers, QUESTION, TIPS, TipLine } from './HomeGuide'
import { UNOFFICIAL_LINE } from '../brand'
import { LEVELS, type Level } from '../data'
import {
  breakdowns,
  buildQueue,
  minutesFor,
  MORE_REVIEWS,
  newWordsLeft,
  secondsPerAnswer,
  streak,
  studyProgress,
  unlockMoreNew,
  unlockMoreReviews,
  weekDays,
} from '../srs'
import { update, useStore, type State } from '../store'
import { dayKey, useClock } from '../util'

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']
/** The week's seals: the day names as a Japanese calendar writes them. */
const DAY_SEALS = ['日', '月', '火', '水', '木', '金', '土']

const levelsLabel = (levels: Level[]) => (levels.length === 1 ? `N${levels[0]}` : `N${levels[0]}~N${levels[levels.length - 1]}`)
const f = (n: number) => n.toLocaleString('ko-KR')

/** Ruma's sky: asleep before today's study (dawn), one eye open (sunrise), both eyes (day), nothing to do (rest). */
export type Sky = 'sleep' | 'wake' | 'day' | 'rest'

/**
 * Ruma's one line for a state. Where a state has two, the line changes once a day (never while the screen is open),
 * so it does not flicker. Voice rules (docs/design-system.md §3 "문구"): plain, first person, no interjections,
 * adverbs, praise or exclamation marks; what the numbers and Ruma's face already say is not said again.
 */
function rumaLine(lines: string[], today: Date) {
  const day = Math.floor(new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() / 86_400_000)
  return lines[day % lines.length]
}

/** The sky Home showed last, so the colour cross-fades when Home comes back in a new state (after studying). */
let lastSky: Sky | null = null

/** Top line, in the sky: the day and the level, the streak at the right; while Ruma asks the level, the app's name. */
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
          <Icon name="flame" size={20} fill={lit} />
          <span className="num">{days}</span>
        </span>
      )}
    </header>
  )
}

/** The week as seven seals (日…土 in mincho): a studied day is stamped in vermilion ink, today is outlined in 藍. */
function WeekSeals({ s, today }: { s: State; today: Date }) {
  const week = weekDays(s.log, today)
  return (
    <div className="seals" role="img" aria-label={`이번 주 ${week.filter((d) => d.done).length}일 공부함`}>
      {week.map((d, i) => (
        <span key={i} lang="ja" className={[d.done ? 'done' : d.future ? 'future' : 'miss', d.today && 'today'].filter(Boolean).join(' ')}>
          {DAY_SEALS[i]}
        </span>
      ))}
    </div>
  )
}

/**
 * Seigaiha along the foot of the sky, like a horizon: one pattern tile filled with a single rect, in the sky's own
 * colours (so it cross-fades with them). No filters; vector, so it stays crisp at any pixel ratio.
 */
function Waves() {
  const id = useId()
  return (
    <svg className="waves" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={`${id}w`} width="40" height="20" patternUnits="userSpaceOnUse">
          {[
            [0, 0],
            [40, 0],
            [20, 10],
            [0, 20],
            [40, 20],
          ].map(([x, y]) => (
            <g key={`${x},${y}`}>
              <circle cx={x} cy={y} r="19.5" className="wave-fill" />
              <circle cx={x} cy={y} r="19.5" className="wave-line" />
              <circle cx={x} cy={y} r="14.5" className="wave-line" />
              <circle cx={x} cy={y} r="9.5" className="wave-line" />
              <circle cx={x} cy={y} r="4.5" className="wave-line" />
            </g>
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id}w)`} />
    </svg>
  )
}

/** The words of the studied levels met so far (the 단어장 level rows, summed): a link to 기록. */
function WordsLink({ s }: { s: State }) {
  const { levels, total, met } = studyProgress(s)
  const b = breakdowns(s)
  return (
    <a className="home-words" href="#/stats" aria-label={`${levelsLabel(levels)} 단어 ${f(total)}개 중 ${f(met)}개 만남, 기록 보기`}>
      <span className={`level-seals ${levels.length > 3 ? 'many' : ''}`} aria-hidden="true">
        {levels.map((l) => (
          <span key={l} className={b[l].new === 0 ? 'full' : ''}>
            N{l}
          </span>
        ))}
      </span>
      <span className="home-words-text" aria-hidden="true">
        <span className="home-words-title">만난 단어</span>
        <span>
          <b className="num">{f(met)}</b>
          <span className="muted"> / {f(total)}</span>
        </span>
      </span>
      <Icon name="chevron" size={18} />
      <span className="home-words-bar" aria-hidden="true">
        <i style={{ width: `${total > 0 ? Math.min(100, (met / total) * 100) : 0}%` }} />
      </span>
    </a>
  )
}

/** A quiet text action under the primary ("50장 더 ›"): the accent ink, no box. */
function Quiet({ label, text, onClick, alone }: { label: string; text: string; onClick: () => void; alone?: boolean }) {
  return (
    <Button label={label} variant="ghost" className={`text-action home-quiet ${alone ? 'alone' : ''}`} endContent={<Icon name="chevron" size={16} />} onClick={onClick}>
      {text}
    </Button>
  )
}

export function Home() {
  const s = useStore((x) => x)
  useClock()
  const today = new Date()

  const { target } = s.settings
  const q = buildQueue(s, today)
  const all = breakdowns(s)
  const todayLog = s.log[dayKey(today)]
  const todo = q.learning + q.review + q.fresh
  const started = !!todayLog?.c
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
  const progress = cleared ? 1 : started ? (todayLog?.c ?? 0) / ((todayLog?.c ?? 0) + todo) : 0
  const sky: Sky = first === 'level' ? 'rest' : cleared ? 'day' : started ? 'wake' : todo > 0 || first ? 'sleep' : 'rest'
  const mood = sky === 'day' ? 'cheer' : sky === 'wake' ? 'idle' : 'sleep'
  const line =
    first === 'level'
      ? '반가워요, 루마예요'
      : first === 'start'
        ? '깨워 줄래요?'
        : todo === 0 && nextLevel
          ? `다음은 N${nextLevel}예요`
          : rumaLine(
              sky === 'day'
                ? ['두 눈 다 떴어요', '내일 봐요']
                : sky === 'wake'
                  ? ['한쪽 눈 떴어요']
                  : behind
                    ? ['보고 싶었어요', '같이 치워요']
                    : sky === 'sleep'
                      ? ['깨워 줄래요?', '자고 있어요']
                      : ['오늘은 쉬어요'],
              today,
            )
  const showTip = !first && tip === 'srs'

  // the sky's colour: the band cross-fades from the sky Home showed last; <html data-sky> paints the ground behind the
  // page (overscroll) and the browser's status bar colour (theme-color) in the same colour, before the first paint
  const [shown, setShown] = useState<Sky>(() => lastSky ?? sky)
  useEffect(() => {
    lastSky = sky
    if (shown === sky) return
    const r = requestAnimationFrame(() => setShown(sky))
    return () => cancelAnimationFrame(r)
  }, [sky, shown])
  useLayoutEffect(() => {
    document.documentElement.dataset.sky = sky
    syncThemeColor()
  }, [sky])
  useLayoutEffect(
    () => () => {
      delete document.documentElement.dataset.sky
      syncThemeColor()
    },
    [],
  )

  // one polite announcement when Ruma's state changes while Home is open (not when it opens)
  const said = useRef(sky)
  const [announce, setAnnounce] = useState('')
  useEffect(() => {
    if (said.current === sky) return
    said.current = sky
    setAnnounce(`루마: ${line}`)
  }, [sky, line])

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
  const counts = (
    <span className="home-counts">
      {q.learning > 0 && (
        <span className="c-learning">
          익히는 중 <b className="num">{q.learning}</b>
        </span>
      )}
      {/* a count that is 0 is left out (the first session has no reviews; a waiting day no new words) */}
      {q.review > 0 && (
        <span className="c-review">
          복습 <b className="num">{f(q.review)}</b>
        </span>
      )}
      {q.fresh > 0 && (
        <span className="c-new">
          새 단어 <b className="num">{q.fresh}</b>
        </span>
      )}
    </span>
  )
  const backlogTag = behind && (
    <span className="backlog-tag" role="img" aria-label={`밀린 복습 ${f(q.held)}장`}>
      밀린 <b className="num">{f(q.held)}</b>
    </span>
  )

  return (
    <>
      <div className="home-sky" data-sky={shown}>
        <Waves />
        <HomeHeader s={s} today={today} first={first} />
        <div className="sky-ruma">
          <Ruma progress={sky === 'rest' ? 0 : progress} mood={mood} size={136} />
        </div>
        {showTip ? (
          <TipLine text={TIPS.srs} onClose={() => setTip(null)} />
        ) : (
          <p className="ruma-line" ref={lineRef} tabIndex={first ? -1 : undefined}>
            {line}
            {first === 'level' && (
              <b className="ruma-ask" id={qid}>
                {QUESTION}
              </b>
            )}
          </p>
        )}
        {!first && <WeekSeals s={s} today={today} />}
        {announce && <Announce text={announce} />}
      </div>

      {first === 'level' ? (
        <section className="home-sheet ask" aria-labelledby={qid}>
          <LevelAnswers labelledBy={qid} />
          <p className="first-note">{UNOFFICIAL_LINE}</p>
        </section>
      ) : (
        <section className="home-sheet plan" role="region" aria-labelledby="plan-title">
          <h2 id="plan-title" className="sr-only">
            오늘의 계획
          </h2>
          {todo > 0 ? (
            <>
              <div className="plan-figure">
                <p className="big">
                  <b className="num">{f(todo)}</b>
                  <span className="unit">{started ? '장 남음' : '장'}</span>
                </p>
                <p className="plan-side">
                  {waitMin !== null ? (
                    <span className="plan-time" role="img" aria-label={`익히는 중인 ${q.waiting}장이 ${waitMin}분 뒤에 돌아와요`}>
                      <b className="num">{waitMin}</b>분 뒤
                    </span>
                  ) : (
                    <span className="plan-time" role="img" aria-label={`약 ${minutes}분`}>
                      <b className="num">{minutes}</b>분
                    </span>
                  )}
                  <span className="plan-counts">
                    {counts}
                    {backlogTag}
                  </span>
                </p>
              </div>
              {first === 'start' ? (
                <Button label={`첫 학습 시작, 새 단어 ${q.fresh}개`} variant="primary" size="lg" width="100%" className="home-go" onClick={() => go('/study')}>
                  시작하기
                </Button>
              ) : (
                <Button
                  label={started ? `이어서 하기, ${f(todo)}장 남음` : `오늘의 학습 시작, ${f(todo)}장`}
                  variant="primary"
                  size="lg"
                  width="100%"
                  className="home-go"
                  onClick={() => go('/study')}
                >
                  {started ? '계속하기' : '시작하기'}
                </Button>
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
                  <Quiet
                    label={`밀린 복습 ${more}장 더 하기`}
                    text={`${more}장 더`}
                    onClick={() => {
                      unlockMoreReviews(more)
                      setAdded(more)
                    }}
                  />
                )
              )}
            </>
          ) : (
            <>
              <div className="plan-figure">
                <div>
                  {cleared && <p className="plan-eyebrow">오늘 끝</p>}
                  <p className="big">
                    <b className="num">{f(cleared ? (todayLog?.c ?? 0) : 0)}</b>
                    <span className="unit">장</span>
                  </p>
                </div>
                <p className="plan-side">
                  {cleared && (todayLog?.ms ?? 0) >= 30_000 && (
                    <span className="plan-time" role="img" aria-label={`${Math.round(todayLog!.ms! / 60_000)}분 걸림`}>
                      <b className="num">{Math.round(todayLog!.ms! / 60_000)}</b>분
                    </span>
                  )}
                  <span className="plan-counts">
                    {cleared && (todayLog?.n ?? 0) > 0 && (
                      <span className="home-counts">
                        <span>
                          새 단어 <b className="num">{todayLog!.n}</b>
                        </span>
                      </span>
                    )}
                    {backlogTag}
                  </span>
                </p>
              </div>
              {behind ? (
                <Quiet
                  label={`밀린 복습 ${more}장 더 하기`}
                  text={`${more}장 더`}
                  alone
                  onClick={() => {
                    unlockMoreReviews(more)
                    go('/study')
                  }}
                />
              ) : unseen > 0 ? (
                cleared ? (
                  <Quiet
                    label="새 단어 10개 더 하기"
                    text="새 단어 10개 더"
                    alone
                    onClick={() => {
                      unlockMoreNew(10)
                      go('/study')
                    }}
                  />
                ) : (
                  <Button
                    label="새 단어 10개 더 하기"
                    variant="primary"
                    size="lg"
                    width="100%"
                    className="home-go"
                    onClick={() => {
                      unlockMoreNew(10)
                      go('/study')
                    }}
                  >
                    새 단어 10개 더
                  </Button>
                )
              ) : (
                nextLevel && (
                  <Button
                    label={`다음 급수 N${nextLevel} 시작하기`}
                    variant="primary"
                    size="lg"
                    width="100%"
                    className="home-go"
                    onClick={() => {
                      update((d) => void (d.settings.target = nextLevel))
                      go('/study')
                    }}
                  >
                    N{nextLevel} 시작하기
                  </Button>
                )
              )}
            </>
          )}

          {/* until the first session there is nothing met yet: the line would only say 0 */}
          {first ? <p className="first-note">{UNOFFICIAL_LINE}</p> : <WordsLink s={s} />}
        </section>
      )}
    </>
  )
}
