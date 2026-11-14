import { useEffect, useMemo, useState } from 'react'
import { go } from '../App'
import { Button, Card, ProgressBar, RowLink } from '../components/ui'
import { Ruma } from '../components/Ruma'
import { Icon } from '../components/Icon'
import { BackupNudge } from '../components/Notices'
import { homeTip, markDone, phase as guidePhase, type Phase, type Tip } from '../guide'
import { GuideCard, PlanPending, TIPS, TipBubble } from './HomeGuide'
import { UNOFFICIAL_SHORT } from '../brand'
import { LEVELS, levelInfoVersion, type Level } from '../data'
import {
  breakdowns,
  buildQueue,
  leechIds,
  minutesFor,
  MORE_REVIEWS,
  NEW_WHILE_BEHIND,
  newWordsLeft,
  quests,
  secondsPerAnswer,
  spreadReviews,
  streak,
  studyProgress,
  unlockMoreNew,
  unlockMoreReviews,
  weekDays,
} from '../srs'
import { update, useStore, type State } from '../store'
import { dayKey, useClock } from '../util'

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

const levelsLabel = (levels: Level[]) => (levels.length === 1 ? `N${levels[0]}` : `N${levels[0]}~N${levels[levels.length - 1]}`)

/**
 * Top line: the day and the target level, and the streak — the only place the streak shows on this screen. While Ruma
 * asks the level there is no day to plan yet: the app's name, nothing else.
 */
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
          {!lit && days > 0 && <small>오늘 하면 {days + 1}일</small>}
        </span>
      )}
    </header>
  )
}

/**
 * The words of the studied levels met so far, and how many of them are in long-term memory: the same counts as the
 * 단어장 level rows, summed over the levels studied (`studyProgress`). A plain count, no prediction.
 */
function WordsCard({ s }: { s: State }) {
  const { levels, total, met, mature } = studyProgress(s)
  return (
    <Card className="words-card" role="region" aria-labelledby="words-title">
      <h2 id="words-title" className="card-title">
        {levelsLabel(levels)} 단어
        <span className="muted">
          <b className="num">{met.toLocaleString()}</b> / {total.toLocaleString()} 만남
        </span>
      </h2>
      <ProgressBar label={`${levelsLabel(levels)} 단어 중 만난 단어`} value={met} max={total} valueText={`${total.toLocaleString()}개 중 ${met.toLocaleString()}개 만남`} />
      {/* nothing to say about long-term memory before a word has been kept three weeks */}
      {mature > 0 && (
        <p className="words-sub">
          그중 장기 기억 <b className="num">{mature.toLocaleString()}</b>개
        </p>
      )}
    </Card>
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
  const sec = secondsPerAnswer(s, today)
  const minutes = minutesFor(q, sec)
  // reviews due beyond today's quota wait for the coming days (03 §5.3); "더 하기" lets some of them in today
  const behind = q.held > 0
  const more = Math.min(MORE_REVIEWS, q.held)
  const catchUp = behind ? spreadReviews(s, today).catchUp : 0
  const [added, setAdded] = useState<number | null>(null)
  useEffect(() => {
    if (added === null) return
    const t = setTimeout(() => setAdded(null), 4000)
    return () => clearTimeout(t)
  }, [added])
  // …recomputed once level data loads (it decides which reading cards still count, srs.ts isActive)
  const iv = levelInfoVersion()
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

  // Ruma's first run (src/guide.ts): the question, then the first session, at the top; nothing changes for a learner
  // without a guide (everyone from before it)
  const first = guidePhase(s)
  // a tip is taken when Home opens and counted as shown at once, so it is never repeated (not even after a reload)
  const [tip, setTip] = useState<Tip | null>(() => homeTip(s))
  useEffect(() => {
    if (tip) markDone(tip)
  }, [tip])

  return (
    <>
      <HomeHeader s={s} today={today} first={first} />

      {/* Ruma's card is always first: the first-run conversation, then the day's word and the week */}
      {first ? (
        <GuideCard s={s} phase={first} fresh={q.fresh} minutes={minutes} />
      ) : (
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
          {added !== null ? (
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
          ) : (
            behind &&
            todo > 0 && (
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
            )
          )}
        </Card>
      )}

      {/* until the first session there is nothing met yet: the card would only say 0 */}
      {!first && <WordsCard s={s} />}

      <BackupNudge today={today} />

      <nav className="home-links" aria-label="더 보기">
        {weak > 0 && <RowLink href="#/words/weak" label={`약한 단어 ${weak}개`} />}
        <RowLink href="#/stats" label="기록 · 도장 여정 · 복습 예보" />
      </nav>

      {/* the first run, before anything was studied: what this app is not */}
      {first && <p className="first-note">{UNOFFICIAL_SHORT}</p>}
    </>
  )
}
