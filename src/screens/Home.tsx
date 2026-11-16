// Home (docs/design-system.md §3 "홈"): name-tags and numbers only. At the top the target level as a chip (it opens the
// level picker) and the streak; a white "오늘" card with Ruma (asleep, one eye, both eyes: the day's progress), the
// day's count, time and bar, and the day's two sessions as two buttons — 복습 (reviews due today) and 새 단어 (today's
// new words). Each button's number is what its session will show (srs.ts `StudyMode`); the two add up to the day's
// cards. Below, the target level's words in three rows. The first run asks the level first (LevelPicker).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { go } from '../App'
import { Button, ProgressBar } from '../components/ui'
import { Ruma } from '../components/Ruma'
import { Icon } from '../components/Icon'
import { phase as guidePhase } from '../guide'
import { LevelPicker } from './LevelPicker'
import { COUNTS, LEVELS, type Level } from '../data'
import { breakdowns, buildQueue, cardsLeft, leechIds, minutesFor, MORE_REVIEWS, newWordsLeft, secondsPerAnswer, streak, unlockMoreNew, unlockMoreReviews } from '../srs'
import { update, useStore, type State } from '../store'
import { dayKey, useClock } from '../util'

const f = (n: number) => n.toLocaleString('ko-KR')

/** Ruma's state: asleep before today's study, one eye open once it started, both eyes when the day is done. */
export type Mood = 'sleep' | 'wake' | 'day'

/** The target level as a chip in its colour: it opens the level picker. */
function LevelChip({ level }: { level: Level }) {
  return (
    <a href="#/level" className="level-chip" data-level={level} aria-label={`급수 N${level}, 바꾸기`}>
      N{level}
      <Icon name="down" size={16} strokeWidth={2.8} />
    </a>
  )
}

/** The streak as a white pill with the flame (none before anything was studied). */
function Streak({ s, today }: { s: State; today: Date }) {
  const days = streak(s.log, today)
  const lit = !!s.log[dayKey(today)]?.c
  return (
    <span className={`streak ${lit ? 'lit' : ''}`} role="img" aria-label={lit || !days ? `연속 ${days}일` : `연속 ${days}일, 오늘 하면 ${days + 1}일`}>
      <Icon name="flame" size={18} fill={lit} strokeWidth={2.4} />
      <span className="num">{days}</span>
    </span>
  )
}

/**
 * One of the "오늘" card's buttons: what it starts at the left, how much at the right. The first of the group is the
 * one ink primary; the other is white.
 */
function BigButton({ label, title, count, primary, className, onClick }: { label: string; title: string; count: ReactNode; primary?: boolean; className?: string; onClick: () => void }) {
  return (
    <Button label={label} variant={primary ? 'primary' : 'secondary'} size="lg" width="100%" className={`home-go ${className ?? ''}`} onClick={onClick}>
      <span className="home-go-title">{title}</span>
      <span className="home-go-count num">{count}</span>
    </Button>
  )
}

/** One row of the level's words: a name, "a / b" and a small bar in the level's colour. */
function Figure({ label, value, total, level }: { label: string; value: number; total: number; level: Level }) {
  return (
    <div className="lw-row" role="group" aria-label={`${label} ${f(total)}개 중 ${f(value)}개`}>
      <span className="lw-name grow" aria-hidden="true">
        {label}
      </span>
      <b className="lw-value num" aria-hidden="true">
        {f(value)} / {f(total)}
      </b>
      <span className="lw-bar" data-level={level} aria-hidden="true">
        <i style={{ width: `${total ? Math.min(100, (value / total) * 100) : 0}%` }} />
      </span>
    </div>
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

  // the first run (src/guide.ts): the level is asked first, then the first session
  const first = guidePhase(s)
  // once the level is chosen the picker goes: focus moves to the day's heading, and the next Tab is the first session
  // (not when Home opens: that is the learner's to start)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const askedFor = useRef(first)
  useEffect(() => {
    if (askedFor.current === first) return
    askedFor.current = first
    if (first === 'start') titleRef.current?.focus()
  }, [first])

  if (first === 'level') return <LevelPicker first />

  // the mascot opens one eye once today's study starts, both when today's share is done
  const progress = cleared ? 1 : started ? done / (done + todo) : 0
  const mood: Mood = cleared ? 'day' : started ? 'wake' : 'sleep'
  const total = done + todo
  // a session already begun today is named "이어서 하기" for screen readers
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
  const b = all[target]
  const met = COUNTS[target] - b.new
  const weak = leechIds(s.cards, 40, s.settings.fastTrack).length

  return (
    <>
      <header className="top home-head">
        <LevelChip level={target} />
        <span className="grow" />
        {first !== 'start' && <Streak s={s} today={today} />}
      </header>

      <section className="today" aria-labelledby="today-title">
        <div className="today-top">
          <div className="today-ruma" data-mood={mood}>
            <Ruma progress={progress} mood={mood === 'day' ? 'cheer' : mood === 'wake' ? 'idle' : 'sleep'} size={84} />
          </div>
          <div className="today-figures">
            <div className="today-line">
              <h1 id="today-title" ref={titleRef} tabIndex={-1}>
                오늘
              </h1>
              {waitMin !== null ? (
                <span className="plan-time" role="img" aria-label={`익히는 중인 ${q.waiting}장이 ${waitMin}분 뒤에 돌아와요`}>
                  {waitMin}분 뒤
                </span>
              ) : todo > 0 ? (
                <span className="plan-time" role="img" aria-label={started ? `약 ${minutes}분 남음` : `약 ${minutes}분`}>
                  {minutes}분{started && ' 남음'}
                </span>
              ) : (
                cleared &&
                (todayLog?.ms ?? 0) >= 30_000 && (
                  <span className="plan-time" role="img" aria-label={`${Math.round(todayLog!.ms! / 60_000)}분 걸림`}>
                    {Math.round(todayLog!.ms! / 60_000)}분
                  </span>
                )
              )}
            </div>
            <p className="today-count">
              <b className="num">{f(done)}</b> / {f(total)}장
            </p>
            <ProgressBar label="오늘 학습" value={done} max={Math.max(1, total)} valueText={`오늘 ${f(total)}장 중 ${f(done)}장`} />
          </div>
        </div>

        <div className="home-actions plan" role="region" aria-labelledby="plan-title">
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
                  title="복습"
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
                  count={
                    <span className="c-new">
                      <b>{fresh}</b>개
                    </span>
                  }
                  onClick={() => go('/study/new')}
                />
              )}
              {added !== null ? (
                <p className="plan-lever" role="status">
                  <span aria-hidden="true">복습 +{added}장</span>
                  <span className="sr-only">복습 {added}장 늘렸어요</span>
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
        </div>
      </section>

      <section className="level-words" aria-labelledby="lw-title">
        <div className="section-head">
          <h2 id="lw-title">N{target} 단어</h2>
          <a href={`#/level/${target}`} className="section-link">
            모든 단어
            <Icon name="chevron" size={16} />
          </a>
        </div>
        <div className="lw-card">
          <Figure label="만난 단어" value={met} total={COUNTS[target]} level={target} />
          <Figure label="장기 기억" value={b.mature} total={COUNTS[target]} level={target} />
          <a href="#/words/weak" className="lw-row lw-link" aria-label={`약한 단어 ${f(weak)}개`}>
            <span className="lw-name grow">약한 단어</span>
            <b className="lw-value num">{f(weak)}</b>
            <Icon name="chevron" size={16} />
          </a>
        </div>
      </section>
    </>
  )
}
