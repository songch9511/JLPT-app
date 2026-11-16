// Home (docs/design-system.md §3 "홈"): name-tags and numbers only. At the top the target level as a badge (a label:
// the level is changed in 설정), today's date and the streak; a white "오늘" card with Ruma (asleep, one eye, both eyes:
// the day's progress), the day's count, time and bar, and the day's three sessions as three buttons — 복습 (word
// reviews due today), 새 단어 (today's new words) and 한자 (the kanji cards). Each button's number is what its session
// will show (srs.ts `StudyMode`); they add up to the day's cards. Below, the current chapter of the target level, then
// one line with the level's words and kanji met. The first run asks the level first (LevelCarousel), then shows the
// three short intro pages (Intro).
import { useEffect, useRef } from 'react'
import { go } from '../App'
import { Button, ProgressBar } from '../components/ui'
import { Ruma } from '../components/Ruma'
import { Icon } from '../components/Icon'
import { LevelBadge } from '../components/LevelBadge'
import { CountButton } from './Done'
import { phase as guidePhase } from '../guide'
import { LevelCarousel } from './LevelCarousel'
import { Intro } from './Intro'
import { chapterIds, COUNTS, useLevel, wordById, type Level } from '../data'
import { KANJI_COUNTS } from '../kanji'
import { breakdowns, buildQueue, cardsLeft, kanjiBreakdowns, minutesFor, MORE_REVIEWS, newWordsLeft, reviewsDue, secondsPerAnswer, streak, unlockMoreNew, unlockMoreReviews } from '../srs'
import { chapterMet, chapterSize, currentChapter } from '../progress'
import { useStore, type State } from '../store'
import { dayKey, daysBetween, parseDay, useClock } from '../util'

const f = (n: number) => n.toLocaleString('ko-KR')
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
/** After this many days away, Home says how long it has been instead of "오늘". */
const AWAY_DAYS = 3

/** Ruma's state: asleep before today's study, one eye open once it started, both eyes when the day is done. */
export type Mood = 'sleep' | 'wake' | 'day'

/** The streak as a white pill with the flame (grey while it is at 0). */
function Streak({ s, today }: { s: State; today: Date }) {
  const days = streak(s.log, today)
  const lit = !!s.log[dayKey(today)]?.c
  return (
    <span className={`streak ${days > 0 ? 'on' : ''}`} role="img" aria-label={lit || !days ? `연속 ${days}일` : `연속 ${days}일, 오늘 하면 ${days + 1}일`}>
      <Icon name="flame" size={18} strokeWidth={2.4} />
      <span className="num">{days}</span>
    </span>
  )
}

/** Days since the last day anything was studied before today (0 when today or yesterday, or never). */
function daysAway(s: State, today: Date): number {
  const key = dayKey(today)
  let last: string | null = null
  for (const k in s.log) if (k < key && (s.log[k]?.c ?? 0) > 0 && (!last || k > last)) last = k
  return last ? daysBetween(parseDay(last), today) : 0
}

/** The target level's current chapter: its number, the words met, a bar and its next words. */
function ChapterCard({ s, level }: { s: State; level: Level }) {
  // the chapter's words come in the level's order once its data has loaded (until then, id order)
  const { words } = useLevel(level)
  const n = currentChapter(s, level)
  const met = chapterMet(s, level, n)
  const size = chapterSize(level, n)
  const ids = chapterIds(level, n)
  // its next words to meet (or its first ones when all are met)
  const next = ids.filter((id) => !s.cards[id])
  const show = (next.length ? next : ids).slice(0, 4)
  return (
    <a href={`#/level/${level}/${n}`} className="chapter-card" aria-label={`N${level} 챕터 ${n}, ${size}단어 중 ${met} 만남`}>
      <span className="chapter-line">
        <span className="chapter-name">챕터 {n}</span>
        <span className="chapter-count">
          <b className="num">{met}</b> / {size}
        </span>
      </span>
      <span className="bar ink" aria-hidden="true">
        <i style={{ width: `${size ? (met / size) * 100 : 0}%` }} />
      </span>
      {words && (
        <span className="chapter-words" aria-hidden="true">
          {show.map((id) => (
            <span key={id} lang="ja" className="word-chip">
              {wordById(id)?.w.split(/[;；]/)[0]}
            </span>
          ))}
          {ids.length > show.length && <span className="more">…</span>}
        </span>
      )}
    </a>
  )
}

export function Home() {
  const s = useStore((x) => x)
  useClock()
  const today = new Date()

  const { target } = s.settings
  // the day as a whole, and its three sessions: the numbers on the buttons are the sessions' own queues
  const q = buildQueue(s, today)
  const qr = buildQueue(s, today, undefined, { mode: 'review' })
  const qn = buildQueue(s, today, undefined, { mode: 'new' })
  const qk = buildQueue(s, today, undefined, { mode: 'kanji' })
  const reviews = cardsLeft(qr)
  const fresh = cardsLeft(qn)
  const kanji = cardsLeft(qk)
  const todayLog = s.log[dayKey(today)]
  const done = todayLog?.c ?? 0
  const todo = reviews + fresh + kanji
  const started = done > 0
  const cleared = started && todo === 0
  const unseen = newWordsLeft(s)
  const minutes = minutesFor({ review: q.review + qk.review, learning: q.learning + qk.learning, fresh: q.fresh + qk.fresh }, secondsPerAnswer(s, today))
  // reviews due beyond today's quota wait for the coming days (03 §5.3): "412장 중 100장"
  const behind = q.held > 0
  const due = reviewsDue(s, today)
  const more = Math.min(MORE_REVIEWS, q.held)
  const away = started ? 0 : daysAway(s, today)
  // learning cards that come back later today, with nothing to answer right now (Study shows the wait)
  const firstDue = Math.min(q.nextDue ?? Infinity, qk.nextDue ?? Infinity)
  const waiting = q.waiting + qk.waiting
  const waitMin = !q.next && !qk.next && waiting > 0 && firstDue < Infinity ? Math.max(1, Math.ceil((firstDue - today.getTime()) / 60_000)) : null

  // the first run (src/guide.ts): the level is asked first, then the intro, then the first session
  const first = guidePhase(s)
  // once the first run ends focus moves to the day's heading, and the next Tab is the first session
  const titleRef = useRef<HTMLHeadingElement>(null)
  const askedFor = useRef(first)
  useEffect(() => {
    if (askedFor.current === first) return
    askedFor.current = first
    if (first === 'start') titleRef.current?.focus()
  }, [first])

  if (first === 'level') return <LevelCarousel />
  if (first === 'intro') return <Intro />

  // the mascot opens one eye once today's study starts, both when today's share is done
  const progress = cleared ? 1 : started ? done / (done + todo) : 0
  const mood: Mood = cleared ? 'day' : started ? 'wake' : 'sleep'
  const total = done + todo
  const words = breakdowns(s)[target]
  const kanjiB = kanjiBreakdowns(s)[target]
  const dateText = `${today.getMonth() + 1}월 ${today.getDate()}일 ${WEEKDAYS[today.getDay()]}요일`

  return (
    <>
      <header className="top home-head">
        <LevelBadge level={target} className="title" label={`준비하는 급수 N${target}`} />
        <span className="home-date grow">{dateText}</span>
        <Streak s={s} today={today} />
      </header>

      <section className="today" aria-labelledby="today-title">
        <div className="today-top">
          <div className="today-ruma" data-mood={mood}>
            <Ruma progress={progress} mood={mood === 'day' ? 'cheer' : mood === 'wake' ? 'idle' : 'sleep'} size={84} />
          </div>
          <div className="today-figures">
            <div className="today-line">
              <h1 id="today-title" ref={titleRef} tabIndex={-1}>
                {away >= AWAY_DAYS ? `${away}일 만이에요` : '오늘'}
              </h1>
              {waitMin !== null ? (
                <span className="plan-time" role="img" aria-label={`익히는 중인 ${waiting}장이 ${waitMin}분 뒤에 돌아와요`}>
                  {waitMin}분 뒤
                </span>
              ) : todo > 0 ? (
                <span className="plan-time" role="img" aria-label={started ? `약 ${minutes}분 남음` : `약 ${minutes}분`}>
                  {minutes}분
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
              <b className="num">{f(done)}</b> / {f(total)}
            </p>
            <ProgressBar label="오늘 학습" value={done} max={Math.max(1, total)} valueText={`오늘 ${f(total)}장 중 ${f(done)}장`} />
          </div>
        </div>

        <div className="home-actions plan" role="region" aria-labelledby="plan-title">
          <h2 id="plan-title" className="sr-only">
            오늘의 계획
          </h2>
          {todo > 0 || waitMin !== null ? (
            <>
              {/* a session with nothing in it today has no button; the first one shown is the one primary */}
              {reviews > 0 && (
                <Button
                  label={behind ? `복습 시작, 쌓인 ${f(due)}장 중 ${f(reviews)}장` : (todayLog?.r ?? 0) > 0 ? `복습 이어서 하기, ${f(reviews)}장 남음` : `복습 시작, ${f(reviews)}장`}
                  variant="primary"
                  size="lg"
                  width="100%"
                  className="home-go go-review"
                  onClick={() => go('/study/review')}
                >
                  <span className="home-go-title">복습</span>
                  <span className="home-go-count num">
                    {behind && <small className="of">{f(due)}장 중</small>}
                    {f(reviews)}장
                  </span>
                </Button>
              )}
              {fresh > 0 && (
                <CountButton
                  primary={reviews === 0}
                  className="go-new"
                  title="새 단어"
                  count={`${fresh}개`}
                  label={
                    (first === 'start' ? `첫 학습 시작, 새 단어 ${fresh}개` : (todayLog?.n ?? 0) > 0 ? `새 단어 이어서 하기, ${fresh}개 남음` : `새 단어 시작, ${fresh}개`) +
                    (qn.learning > 0 ? `, 익히는 중 ${qn.learning}개 포함` : '')
                  }
                  onClick={() => go('/study/new')}
                />
              )}
              {kanji > 0 && (
                <CountButton
                  primary={reviews === 0 && fresh === 0}
                  className="go-kanji"
                  title="한자"
                  count={`${kanji}자`}
                  label={`한자 시작, ${kanji}자, 복습 ${qk.review + qk.learning} 새 한자 ${qk.fresh}`}
                  onClick={() => go('/study/kanji')}
                />
              )}
            </>
          ) : (
            <>
              {cleared && (
                <p className="home-done">
                  <Icon name="check" size={20} strokeWidth={2.8} />
                  오늘 끝
                </p>
              )}
              {behind ? (
                <CountButton
                  primary={!cleared}
                  title="밀린 복습 더"
                  count={`${more}장`}
                  label={`밀린 복습 ${more}장 더 하기`}
                  onClick={() => {
                    unlockMoreReviews(more)
                    go('/study/review')
                  }}
                />
              ) : (
                unseen > 0 && (
                  // after a finished day more is an offer (white); on a day with nothing planned it is the one thing to do
                  <CountButton
                    primary={!cleared}
                    title="새 단어 더"
                    count="10개"
                    label="새 단어 더 하기, 10개"
                    onClick={() => {
                      unlockMoreNew(10)
                      go('/study/new')
                    }}
                  />
                )
              )}
            </>
          )}
        </div>
      </section>

      <section className="home-chapter" aria-labelledby="chapter-title">
        <div className="section-head">
          <h2 id="chapter-title">지금 챕터</h2>
          <a href={`#/level/${target}`} className="section-link">
            모든 챕터
            <Icon name="chevron" size={16} />
          </a>
        </div>
        <ChapterCard s={s} level={target} />
      </section>
      <p className="home-foot">
        <span>
          N{target} 단어 <b className="num-plain">{f(COUNTS[target] - words.new)}</b> / {f(COUNTS[target])}
        </span>
        <span aria-hidden="true">·</span>
        <span>
          한자 <b className="num-plain">{f(KANJI_COUNTS[target] - kanjiB.new)}</b> / {f(KANJI_COUNTS[target])}
        </span>
      </p>
    </>
  )
}

