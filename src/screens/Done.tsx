// The end of a study session (docs/design-system.md §3 "오늘 끝"): Ruma, one line, three figures, the buttons at the
// thumb. `day` the day's cards are all done; `session` this session is done while another still has cards; `waiting`
// learning cards come back later today; `chapter` the session finished a chapter of the target level (the 済 seal);
// `level` it met the last new word of the target level.
import type { ReactNode } from 'react'
import { go } from '../App'
import { Ruma } from '../components/Ruma'
import { Button } from '../components/ui'
import { chapterCount, COUNTS, type Level } from '../data'
import { KANJI_COUNTS } from '../kanji'
import { breakdowns, cardsLeft, buildQueue, MORE_REVIEWS, streak, unlockMoreNew, unlockMoreReviews, type Queue, type StudyMode } from '../srs'
import { chaptersDone } from '../progress'
import { update, useStore, type State } from '../store'
import { dayKey, daysBetween, parseDay } from '../util'

export type DoneKind = 'day' | 'session' | 'waiting' | 'chapter' | 'level'

const f = (n: number) => n.toLocaleString('ko-KR')

/** The 済 seal of a finished chapter or level. */
export function Seal({ className }: { className?: string }) {
  return (
    <span className={`seal ${className ?? ''}`} lang="ja" aria-hidden="true">
      済
    </span>
  )
}

/** A big button with what it starts at the left and how much at the right (Home's language). */
export function CountButton({ title, count, label, primary, className, onClick }: { title: string; count: string; label: string; primary?: boolean; className?: string; onClick: () => void }) {
  return (
    <Button label={label} variant={primary ? 'primary' : 'secondary'} size="lg" width="100%" className={`home-go ${className ?? ''}`} onClick={onClick}>
      <span className="home-go-title">{title}</span>
      <span className="home-go-count num">{count}</span>
    </Button>
  )
}

/** Days since the first day anything was studied (the level's "걸린 날"). */
const daysStudied = (s: State, now: Date) => {
  const first = Object.keys(s.log)
    .filter((k) => (s.log[k]?.c ?? 0) > 0)
    .sort()[0]
  return first ? daysBetween(parseDay(first), now) + 1 : 1
}

/** The next session of the day after this one, in Home's order (복습, 단어, 한자), with its button. */
function nextSession(s: State, now: Date, mode: StudyMode) {
  for (const m of ['review', 'new', 'kanji'] as const) {
    if (m === mode) continue
    const n = cardsLeft(buildQueue(s, now, undefined, { mode: m }))
    if (n > 0)
      return m === 'review'
        ? { title: '복습', count: `${f(n)}장`, label: `복습 시작, ${f(n)}장`, path: '/study/review' }
        : m === 'new'
          ? { title: '단어', count: `${f(n)}개`, label: `단어 시작, ${f(n)}개`, path: '/study/new' }
          : { title: '한자', count: `${f(n)}자`, label: `한자 시작, ${f(n)}자`, path: '/study/kanji' }
  }
  return null
}

export function DoneScreen({ kind, mode, q, day, chapter, waitMin, onFinishNow, children }: { kind: DoneKind; mode: StudyMode; q: Queue; day: Queue; chapter: number; waitMin: number; onFinishNow: () => void; children?: ReactNode }) {
  const s = useStore((x) => x)
  const now = new Date()
  const log = s.log[dayKey(now)]
  const target = s.settings.target
  const all = breakdowns(s)
  const moreNew = all[target].new > 0
  const more = Math.min(MORE_REVIEWS, day.held)
  const next = kind === 'waiting' ? null : nextSession(s, now, mode)
  const harder = (target - 1) as Level
  const title =
    kind === 'waiting'
      ? `익히는 중 ${q.waiting}장`
      : kind === 'level'
        ? `N${target} 끝`
        : kind === 'chapter'
          ? `챕터 ${chapter} 끝`
          : kind === 'day'
            ? '오늘 끝'
            : mode === 'review'
              ? '복습 끝'
              : mode === 'kanji'
                ? '한자 끝'
                : '새 단어 끝'
  const figures: [string, string][] =
    kind === 'level'
      ? [
          [f(COUNTS[target]), '단어'],
          [f(KANJI_COUNTS[target]), '한자'],
          [`${f(daysStudied(s, now))}일`, '걸린 날'],
        ]
      : [
          kind === 'chapter' ? [`${chaptersDone(s, target)} / ${chapterCount(target)}`, `N${target} 챕터`] : [`${f(log?.c ?? 0)}장`, '본 카드'],
          [`${streak(s.log, now)}일`, '연속'],
          [f(log?.xp ?? 0), '오늘 XP'],
        ]
  const cheer = kind === 'day' || kind === 'chapter' || kind === 'level'

  /** What is left to offer once the session is done: the next session, more reviews while some wait, more new words. */
  const offer =
    next && kind !== 'day' ? (
      <CountButton title={next.title} count={next.count} label={next.label} onClick={() => go(next.path)} />
    ) : day.held > 0 ? (
      <CountButton
        title="밀린 복습 더"
        count={`${more}장`}
        label={`밀린 복습 ${more}장 더 하기`}
        onClick={() => {
          unlockMoreReviews(more)
          go('/study/review')
        }}
      />
    ) : (
      moreNew && (
        <CountButton
          title="단어 더"
          count="10개"
          label="단어 더 하기, 10개"
          onClick={() => {
            unlockMoreNew(10)
            go('/study/new')
          }}
        />
      )
    )

  return (
    <main className="study done-screen">
      <section className="done-body" aria-labelledby="done-title">
        <div className="done-mascot">
          <Ruma progress={cheer ? 1 : 0.5} mood={cheer ? 'cheer' : 'idle'} size={124} />
        </div>
        {(kind === 'chapter' || kind === 'level') && <Seal />}
        <h1 id="done-title">{title}</h1>
        {kind === 'waiting' && (
          <p className="done-time" role="img" aria-label={`${waitMin}분 뒤에 돌아와요`}>
            {waitMin}분 뒤
          </p>
        )}
        <dl className="done-figures">
          {figures.map(([value, name]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>
                <b className="num">{value}</b>
              </dd>
            </div>
          ))}
        </dl>
        {children}
      </section>
      <div className="done-actions">
        {kind === 'waiting' ? (
          <>
            <Button label={`${q.waiting}장 지금 하기`} variant="primary" size="lg" width="100%" onClick={onFinishNow} />
            <Button label="홈으로" size="lg" width="100%" onClick={() => go('/')} />
          </>
        ) : kind === 'level' ? (
          <>
            {target > 1 && (
              <Button
                label={`N${harder} 시작하기`}
                variant="primary"
                size="lg"
                width="100%"
                onClick={() => {
                  update((d) => void (d.settings.target = harder))
                  go('/')
                }}
              />
            )}
            <Button label={`N${target} 복습 계속`} variant={target > 1 ? 'secondary' : 'primary'} size="lg" width="100%" onClick={() => go('/')} />
          </>
        ) : kind === 'session' && next ? (
          <>
            <CountButton primary title={next.title} count={next.count} label={next.label} onClick={() => go(next.path)} />
            <Button label="홈으로" size="lg" width="100%" onClick={() => go('/')} />
          </>
        ) : (
          <>
            <Button label="홈으로" variant="primary" size="lg" width="100%" onClick={() => go('/')} />
            {offer}
          </>
        )}
      </div>
    </main>
  )
}
