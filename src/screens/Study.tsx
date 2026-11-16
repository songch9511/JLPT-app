import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { go } from '../App'
import { requestPersist } from '../backup'
import { Ruma } from '../components/Ruma'
import { PastBar, PastCard } from '../components/PastCard'
import { useSwipe } from '../components/useSwipe'
import { Session, type Entry } from '../session'
import { Icon } from '../components/Icon'
import { Announce, Button, IconButton, ProgressBar, Result, Skeleton } from '../components/ui'
import { ReadingChoice } from '../components/Choices'
import { Bridge, SoundHints } from '../components/WordNotes'
import { CardHead, CardScroll, Headword, MeaningFace, Slot } from '../components/StudyCard'
import { ExampleSentence } from '../components/Example'
import { isReadingCard, levelOf, meaning, useAllWords, useLevel, useLevels, wordById } from '../data'
import { useExample } from '../examples'
import { legacySeed } from '../ids'
import { readingOf, readingQuestion } from '../distractors'
import {
  breakdowns,
  buildQueue,
  cardsLeft,
  gradeReading,
  formatInterval,
  wordLapses,
  isRelearning,
  previewIntervals,
  Rating,
  MORE_REVIEWS,
  streak,
  studyLevels,
  unlockMoreNew,
  unlockMoreReviews,
  type Grade,
  type Queue,
  type StudyMode,
} from '../srs'
import { platform } from '../platform'
import { getState, toggleMark, useStore } from '../store'
import { dayKey, speak, useClock } from '../util'

// the iOS app's offer to turn on review reminders, after a finished day (not in the web bundle)
const ReminderOffer = import.meta.env.MODE === 'native' ? lazy(() => import('../platform/ReminderOffer')) : null

/** Answers within this long of the last answer or reveal are ignored, so a double tap can't answer an unseen card. */
const DOUBLE_TAP_MS = 350
/** How long the "26일 뒤" note and the undo chip stay after an answer. */
const NOTE_MS = 900
const UNDO_CHIP_MS = 4000

/** "알아요, 26일 뒤 다시" — the interval read as part of the button's name. */
const answerLabel = (label: string, interval?: string) =>
  interval ? `${label}, ${interval.endsWith('이내') ? interval : `${interval} 뒤`} 다시` : label
const afterText = (interval: string) => (interval.endsWith('이내') ? interval : `${interval} 뒤`)

/**
 * One answer button of the bar under the card, always the same height, so the thumb never moves: its name, and under
 * it inside the button the interval it sets ("4일 뒤"), read as part of its name ("알아요, 4일 뒤 다시"). Only the one
 * primary is filled.
 */
function Grade({
  label,
  interval,
  primary = false,
  isDisabled,
  className,
  onClick,
}: {
  label: string
  interval?: string
  primary?: boolean
  isDisabled?: boolean
  className?: string
  onClick: () => void
}) {
  return (
    <Button label={answerLabel(label, interval)} variant={primary ? 'primary' : 'secondary'} size="lg" className={`grade ${className ?? ''}`} isDisabled={isDisabled} onClick={onClick}>
      <span className="grade-label">{label}</span>
      {interval && (
        <span className="grade-after" aria-hidden="true">
          {afterText(interval)}
        </span>
      )}
    </Button>
  )
}

/** Browsers (iOS above all) only allow speech after the user has interacted with the page. */
const mayPlayAudio = () => (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? true

/**
 * Time the current card has been on screen while the page was visible: what DayLog.ms records (03 §5.1).
 * Restarted for every card; a hidden page (another app, a locked phone) does not count.
 */
function useActiveTime(cardKey: string, paused = false) {
  const t = useRef({ acc: 0, since: null as number | null })
  // looking at an earlier card of the session is not time on this one
  const off = useRef(paused)
  off.current = paused
  useEffect(() => {
    t.current = { acc: 0, since: document.hidden || off.current ? null : Date.now() }
  }, [cardKey])
  useEffect(() => {
    const c = t.current
    if (paused && c.since !== null) t.current = { acc: c.acc + Date.now() - c.since, since: null }
    else if (!paused && c.since === null && !document.hidden) t.current = { acc: c.acc, since: Date.now() }
  }, [paused])
  useEffect(() => {
    const on = () => {
      const c = t.current
      if (document.hidden && c.since !== null) t.current = { acc: c.acc + Date.now() - c.since, since: null }
      else if (!document.hidden && c.since === null && !off.current) t.current = { acc: c.acc, since: Date.now() }
    }
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return () => t.current.acc + (t.current.since === null ? 0 : Date.now() - t.current.since)
}

/**
 * One study session. `mode` is which of the day's cards it shows (srs.ts `StudyMode`): Home's 복습 and 새 단어 open
 * `review` and `new`; `all` is the whole day in one queue (the plain `#/study` route).
 */
export function Study({ mode = 'all' }: { mode?: StudyMode }) {
  const s = useStore((x) => x)
  /** the card's two toggles, each on its own: 의미 (the meaning, the example's translation), 히라가나 (the reading, the
   * headword's furigana in the example). Kept for this card only. */
  const [open, setOpen] = useState({ meaning: false, kana: false })
  const [missed, setMissed] = useState(false)
  const [answered, setAnswered] = useState(0)
  const [last, setLast] = useState<string | undefined>()
  /** "26일 뒤" after an answer: when the card answered comes back */
  const [note, setNote] = useState<{ key: number; text: string } | null>(null)
  const [undoChip, setUndoChip] = useState(0)
  const undo = useRef<{ entry: Entry; card: NonNullable<Queue['next']> } | null>(null)
  /** this opening of the study screen's answers, to swipe back to (src/session.ts); gone when the screen is left */
  const [session] = useState(() => new Session())
  /** the earlier card on screen (its index in the session), or null: the card to answer */
  const [view, setView] = useState<number | null>(null)
  /** what a screen reader is told after moving between cards */
  const [navSaid, setNavSaid] = useState('')
  /** after an undo, the card that was undone is shown again whatever the queue would pick now */
  const [redo, setRedo] = useState<Queue['next']>(null)
  /** answers are ignored until this time, so a double tap can't answer a card that was never seen */
  const lockUntil = useRef(0)
  /** the learner chose to finish the learning cards that would otherwise come back later today */
  const [finishNow, setFinishNow] = useState(false)
  const [idle, setIdle] = useState(false)
  const [retry, setRetry] = useState(0)
  // While nothing is due yet, re-check as time passes so waiting cards come back on their own.
  const tick = useClock(idle)
  const [wake, setWake] = useState(0)
  /** reading card: the choice made (index), -1 for "모르겠어요", null before answering */
  const [picked, setPicked] = useState<number | null>(null)
  // The queue needs the studied levels' data: their introduction order and which words take a reading card.
  const levels = useLevels(studyLevels(s.settings))

  // Recomputed after every answer; `now` is taken then so waiting cards become due as time passes.
  const { q, now } = useMemo(() => {
    const now = new Date()
    const q = buildQueue(s, now, last, { finishNow, mode })
    return { q: redo ? { ...q, next: redo } : q, now }
  }, [s, last, redo, tick, wake, finishNow, levels.ready, mode])
  useEffect(() => setIdle(!q.next), [q.next])
  // …and wake up exactly when the first waiting card is due, not only on the next minute tick
  useEffect(() => {
    if (q.next || q.nextDue === null) return
    const id = setTimeout(() => setWake((n) => n + 1), Math.min(2 ** 31 - 1, Math.max(0, q.nextDue - Date.now()) + 50))
    return () => clearTimeout(id)
  }, [q.next, q.nextDue])

  const id = levels.ready ? q.next?.id : undefined
  const reading = !!id && isReadingCard(id)
  const { words, error: levelError } = useLevel(id ? (levelOf(id) ?? null) : null, retry)
  // reading questions draw wrong choices from the data and must know every entry of the same written word
  const all = useAllWords(reading)
  const word = words && id ? wordById(id) : null
  const example = useExample(id)
  const error = levelError ?? levels.error
  const reps = id ? (s.cards[id]?.reps ?? 0) : 0
  const question = useMemo(() => (reading && word && all ? readingQuestion(word, all, `${legacySeed(id!)}|${reps}`) : null), [reading, word, all, id, reps])
  // a word without enough good wrong choices (readingQuestion → null) is asked like a meaning card: recall, then reveal
  const quiz = reading && !!question
  const ready = !!word && (!reading || !!all)
  const intervals = useMemo(() => (id ? previewIntervals(s, id, now) : null), [s, id, now])
  const cardKey = `${id}:${answered}`
  const activeMs = useActiveTime(cardKey, view !== null)

  useEffect(() => {
    setOpen({ meaning: false, kana: false })
    setMissed(false)
    setPicked(null)
  }, [cardKey])

  // a reading card speaks only once answered: hearing it first would give the answer away
  useEffect(() => {
    if (s.settings.autoSpeak && word && !reading && mayPlayAudio()) speak(word.r || word.w)
  }, [s.settings.autoSpeak, word, reading])

  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), NOTE_MS)
    return () => clearTimeout(t)
  }, [note])
  useEffect(() => {
    if (!undoChip) return
    const t = setTimeout(() => setUndoChip(0), UNDO_CHIP_MS)
    return () => clearTimeout(t)
  }, [undoChip])

  const todayCount = s.log[dayKey(now)]?.c ?? 0
  // the day as a whole: a session can end while the other one still has cards
  const day = useMemo(() => (mode === 'all' ? q : buildQueue(s, now)), [mode, q, s, now])
  const finished = !day.next && day.waiting === 0 && todayCount > 0
  // the first finished day is when there is something worth protecting from storage eviction
  useEffect(() => {
    if (finished) requestPersist()
    // the day was finished in this session (not merely reopened afterwards): a success tap in the app
    if (finished && answered > 0) platform.haptic('done')
  }, [finished])

  /** Both toggles on (Space/Enter). */
  const openAll = useCallback(() => setOpen({ meaning: true, kana: true }), [])

  /** A grade. 알아요 and 쉬워요 need nothing opened first: a known word is passed quickly. A reading card is graded
   * by its choice. */
  const submit = useCallback(
    (grade: Grade) => {
      if (!q.next || Date.now() < lockUntil.current) return
      if (quiz && picked === null) return
      lockUntil.current = Date.now() + DOUBLE_TAP_MS
      const record = quiz && question && picked !== null ? { choices: question.choices, answer: question.answer, picked } : undefined
      undo.current = { entry: session.answer({ id: q.next.id, kind: q.next.kind, grade, at: Date.now(), ms: activeMs(), quiz: record }), card: q.next }
      setRedo(null)
      platform.haptic('answer')
      const interval = intervals?.[grade]
      setNote(interval ? { key: Date.now(), text: afterText(interval) } : null)
      setUndoChip(Date.now())
      setLast(q.next.id)
      setAnswered((n) => n + 1)
    },
    [q.next, intervals, activeMs, quiz, question, picked, session],
  )

  const autoSpeak = s.settings.autoSpeak
  /** "모르겠어요": everything opens and the result line shows; the next press ("다음") grades it. */
  const onAgain = useCallback(() => {
    if (!missed) {
      // "다음" takes its place: a double tap must not grade at once
      lockUntil.current = Date.now() + DOUBLE_TAP_MS
      openAll()
      setMissed(true)
      // hear the reading once — inside the tap or key press, so the browser allows it
      if (autoSpeak && word) speak(word.r || word.w)
    } else submit(Rating.Again)
  }, [missed, openAll, submit, autoSpeak, word])

  /** Reading card: a choice (or -1, "모르겠어요") grades it at once; the answer and meaning are then shown. */
  const choose = useCallback(
    (i: number) => {
      if (!question || picked !== null || Date.now() < lockUntil.current) return
      lockUntil.current = Date.now() + DOUBLE_TAP_MS
      setPicked(i)
      setMissed(i !== question.answer)
      if (autoSpeak && word) speak(word.r || word.w)
    },
    [question, picked, autoSpeak, word],
  )

  // undo takes back the last answer while the card to answer is on screen; on an earlier card its grade buttons do
  const canUndo = !!undo.current && view === null && session.last() === undo.current.entry
  const onUndo = () => {
    if (!undo.current || !canUndo) return
    if (!session.undoLast()) {
      // the saved cards changed elsewhere (another tab): nothing here to take back any more
      undo.current = null
      session.clear()
      setUndoChip(0)
      return
    }
    setRedo(undo.current.card)
    undo.current = null
    setLast(undefined)
    setAnswered((n) => Math.max(0, n - 1))
    setNote(null)
    setUndoChip(0)
  }

  // ── the session's earlier cards (docs/design-system.md "카드 넘기기"): back one card at a time, forward only as far
  // as the card to answer. Looking changes nothing; another grade on an earlier card replaces that answer.
  const total = session.length
  const at = view ?? total
  const canPrev = at > 0 && levels.ready
  const canNext = view !== null
  const goTo = (v: number | null) => {
    if (v === view) return
    // the card to answer stays the one shown, whatever the earlier cards' grades become
    if (view === null && q.next) setRedo(q.next)
    setView(v)
    setNote(null)
    setNavSaid(v === null ? '지금 카드' : `이전 카드 ${v + 1} / ${total}`)
    platform.haptic('turn')
  }
  const goPrev = () => canPrev && goTo(at - 1)
  const goNext = () => view !== null && goTo(view + 1 < total ? view + 1 : null)
  const regrade = (g: Grade) => {
    const e = view === null ? undefined : session.entries[view]
    // (no double-tap lock: a second tap on the grade just given changes nothing)
    if (!e || e.grade === g) return
    const lastBefore = session.last()
    const res = session.regrade(view!, g)
    if (!res) {
      // the saved cards changed elsewhere (another tab): this history no longer describes them
      session.clear()
      undo.current = null
      setView(null)
      return
    }
    platform.haptic('answer')
    // undo still takes back the last answer if it is still there (given again, so a new record of it)
    if (undo.current) undo.current = lastBefore && res.dropped.includes(lastBefore) ? null : { ...undo.current, entry: session.last()! }
    // the card to answer stays, unless it is this same card back for another step, which the new grade changed
    if (redo?.id === e.id) setRedo(null)
    const due = getState().cards[e.id]?.due
    setNote(due === undefined ? null : { key: Date.now(), text: afterText(formatInterval(Math.max(0, due - Date.now()))) })
  }
  useEffect(() => {
    if (!q.next) setView(null)
  }, [q.next])

  // The control the learner last pressed with a finger or the mouse. It keeps focus, and React reuses the same
  // button for the next card (the first answer button becomes the next card's "모르겠어요"); the browser then counts
  // it as keyboard-focused from the first key pressed, so it is told apart here. A Tab hands focus to the keyboard.
  const pointerFocus = useRef<Element | null>(null)
  useEffect(() => {
    const down = (e: PointerEvent) => (pointerFocus.current = e.target instanceof Element ? e.target.closest('button, a') : null)
    const tab = (e: KeyboardEvent) => e.key === 'Tab' && (pointerFocus.current = null)
    addEventListener('pointerdown', down, true)
    addEventListener('keydown', tab, true)
    return () => {
      removeEventListener('pointerdown', down, true)
      removeEventListener('keydown', tab, true)
    }
  }, [])

  // Keys: Space/Enter opens both toggles (after "모르겠어요" it is "다음"); 1 "모르겠어요", 2 "알아요", 3 (↑ too) "쉬워요",
  // whether anything is open or not. ←/→ move between the session's cards (they graded before swiping existed).
  // Registered before paint, so a key pressed as soon as a card shows is never
  // handled by the previous card's handler.
  useLayoutEffect(() => {
    const on = (e: KeyboardEvent) => {
      // ← / → go through the session's cards, with the same limits as a swipe
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault()
        if (!e.repeat) void (e.key === 'ArrowLeft' ? goPrev() : goNext())
        return
      }
      // an earlier card: 1–3 (a reading card 1–2) are its grade buttons, left to right
      if (view !== null) {
        const past = session.entries[view]
        const n = Number(e.key)
        if (past && !e.repeat && !e.altKey && !e.ctrlKey && !e.metaKey && n >= 1 && n <= (past.quiz ? 2 : 3)) regrade(([Rating.Again, Rating.Good, Rating.Easy] as Grade[])[n - 1])
        return
      }
      if (!ready || !word || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return
      const k = e.key
      if ((k === ' ' || k === 'Enter') && e.target instanceof HTMLElement && e.target.closest('button, a')) {
        // a control the user moved to with the keyboard gets its own Enter/Space (unless it is switched off, like the
        // undo button right after an undo: then the key is the card's)
        const control = e.target.closest('button, a')!
        if (control !== pointerFocus.current && e.target.matches(':focus-visible') && control.getAttribute('aria-disabled') !== 'true') return
        // otherwise the key is the card's shortcut, and the focused button must not be pressed by it as well: the
        // browser presses it on Space's keyup whatever the keydown did, which graded the next card "모르겠어요" unseen
        e.target.blur()
      }
      // reading card: 1–4 pick a choice, 0 is "모르겠어요"; once answered Space/Enter goes on
      if (quiz) {
        if (picked === null && /^[1-4]$/.test(k) && Number(k) <= (question?.choices.length ?? 0)) choose(Number(k) - 1)
        else if (picked === null && k === '0') choose(-1)
        else if (picked !== null && (k === ' ' || k === 'Enter')) {
          e.preventDefault()
          if (question) submit(gradeReading(picked, question.answer))
        }
        return
      }
      if (k === ' ' || k === 'Enter') {
        e.preventDefault()
        if (missed) submit(Rating.Again)
        else openAll()
      } else if (k === '1') onAgain()
      else if (!missed && k === '2') submit(Rating.Good)
      else if (!missed && (k === '3' || k === 'ArrowUp')) {
        e.preventDefault()
        submit(Rating.Easy)
      }
    }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }, [ready, word, quiz, question, picked, choose, missed, submit, onAgain, openAll, view, goPrev, goNext, regrade, session])

  const swipe = useSwipe({ canPrev, canNext, onPrev: goPrev, onNext: goNext })

  /** An earlier card at `slot` (0 on screen, ±1 beside it while a swipe is under way). */
  const pastSlot = (i: number, slot: number) => {
    const e = session.entries[i]
    if (!e || (slot !== 0 && !swipe.peek)) return null
    const w = wordById(e.id)
    return (
      <div key={`${e.id}@${e.at}`} className="card-slot" style={{ '--slot': slot } as CSSProperties} inert={slot !== 0} aria-hidden={slot !== 0 || undefined}>
        <PastCard entry={e} index={i} total={total} word={w} marked={!!w && s.marks.includes(w.id)} lapses={w ? wordLapses(s, w.id) : 0} onMark={() => w && toggleMark(w.id)} />
      </div>
    )
  }

  if (levels.ready && !q.next) {
    const moreNew = breakdowns(s)[s.settings.target].new > 0
    const log = s.log[dayKey(now)]
    // this session has nothing left / the whole day has nothing left
    const cleared = q.waiting === 0
    const dayCleared = cleared && !day.next && day.waiting === 0
    const inMin = q.nextDue === null ? 0 : Math.max(1, Math.ceil((q.nextDue - now.getTime()) / 60_000))
    // what the other session still holds, when this one is done first
    const rest = cleared && !dayCleared ? cardsLeft(day) : 0
    const more = Math.min(MORE_REVIEWS, q.held)
    return (
      <main className="study done-screen">
        {/* Home's language: Ruma in its tinted circle (both eyes when the day is done, one eye while cards remain),
            the day's figures as three tiles, the buttons at the thumb */}
        <section className="done-body" aria-labelledby="done-title">
          <div className="done-mascot" data-mood={dayCleared ? 'day' : 'wake'}>
            <Ruma progress={dayCleared ? 1 : (log?.c ?? 0) / Math.max(1, (log?.c ?? 0) + cardsLeft(day))} mood={dayCleared ? 'cheer' : 'idle'} size={160} />
          </div>
          {/* names and numbers only: what is done, or what waits and when; the backlog left as its tag */}
          <h1 id="done-title">{dayCleared ? '오늘 끝' : !cleared ? `익히는 중 ${q.waiting}장` : mode === 'review' ? '복습 끝' : '새 단어 끝'}</h1>
          {!cleared ? (
            <p className="done-time" role="img" aria-label={`${inMin}분 뒤에 돌아와요`}>
              {inMin}분 뒤
            </p>
          ) : (
            dayCleared &&
            q.held > 0 && (
              <span className="backlog-tag" role="img" aria-label={`밀린 복습 ${q.held.toLocaleString()}장`}>
                밀린 <b className="num">{q.held.toLocaleString()}</b>
              </span>
            )
          )}
          {/* the day in three figures (labels as before: 본 카드 · 연속 학습 · 오늘 XP) */}
          <dl className="done-figures">
            <div className="t-cards">
              <dt>본 카드</dt>
              <dd>
                <b className="num">{log?.c ?? 0}장</b>
              </dd>
            </div>
            <div className="t-streak">
              <dt>연속 학습</dt>
              <dd>
                <b className="num">{streak(s.log, now)}일</b>
              </dd>
            </div>
            <div className="t-xp">
              <dt>오늘 XP</dt>
              <dd>
                <b className="num">{(log?.xp ?? 0).toLocaleString()}</b>
              </dd>
            </div>
          </dl>
          {ReminderOffer && platform.native && dayCleared && (
            <Suspense fallback={null}>
              <ReminderOffer />
            </Suspense>
          )}
        </section>
        <div className="done-actions">
          {!cleared && <Button label={`${q.waiting}장 지금 하기`} variant="primary" size="lg" width="100%" onClick={() => setFinishNow(true)} />}
          {/* this session is done, the other one still has cards: it is the next thing to do */}
          {rest > 0 &&
            (mode === 'review' ? (
              <Button label={`새 단어 시작, ${rest}개`} variant="primary" size="lg" width="100%" onClick={() => go('/study/new')}>
                새 단어 {rest}개
              </Button>
            ) : (
              <Button label={`복습 시작, ${rest.toLocaleString()}장`} variant="primary" size="lg" width="100%" onClick={() => go('/study/review')}>
                복습 {rest.toLocaleString()}장
              </Button>
            ))}
          <Button label="홈으로" variant={cleared && rest === 0 ? 'primary' : 'secondary'} size="lg" width="100%" onClick={() => go('/')} />
          {/* while reviews are held for later days, more reviews rather than more new words (03 §5.1, §5.3). What is
              let in belongs to one session: this one goes on, or the other one opens */}
          {dayCleared && q.held > 0 ? (
            // the same labels as Home's: short on screen, the whole action as the name
            <Button
              label={`밀린 복습 ${more}장 더 하기`}
              size="lg"
              width="100%"
              onClick={() => {
                unlockMoreReviews(more)
                if (mode === 'new') go('/study/review')
              }}
            >
              {more}장 더
            </Button>
          ) : (
            dayCleared &&
            moreNew && (
              <Button
                label="새 단어 10개 더 하기"
                size="lg"
                width="100%"
                onClick={() => {
                  unlockMoreNew(10)
                  if (mode === 'review') go('/study/new')
                }}
              >
                새 단어 10개 더
              </Button>
            )
          )}
        </div>
      </main>
    )
  }

  const left = cardsLeft(q)
  const next = q.next
  // measured against the day's answers so far, like the home screen, so resuming does not start from zero; the
  // session's own cards are what is left
  const dayTotal = Math.max(1, todayCount + left)
  const marked = word ? s.marks.includes(word.id) : false
  // the kind of card, as the session it belongs to: a word introduced today (still learning it) is a new word, a
  // review answered "모르겠어요" (relearning) a review
  const kind = next && (next.kind === 'review' || (next.kind === 'learning' && isRelearning(s.cards[next.id])) ? '복습' : '새 단어')
  const settled = picked !== null
  const lapses = word ? wordLapses(s, word.id) : 0

  return (
    <main className="study">
      <h1 className="sr-only">학습</h1>
      <header className="study-top">
        <IconButton label="나가기, 진행 상황은 저장돼요" icon={<Icon name="close" />} onClick={() => go('/')} />
        <ProgressBar className="study-bar grow" label="오늘 학습" value={todayCount} max={dayTotal} valueText={`오늘 ${todayCount}장 봄, ${left}장 남음`} />
        <span className="left-count" aria-hidden="true">
          {left}장 남음
        </span>
        <IconButton label="방금 답 되돌리기" icon={<Icon name="undo" />} isDisabled={!canUndo} onClick={onUndo} />
      </header>
      <p className="after-note" aria-live="polite">
        {note && (
          <span key={note.key}>
            {note.text} 다시 나와요
          </span>
        )}
      </p>

      {/* previous / next card without swiping: for the keyboard and screen readers, shown when focused */}
      {total > 0 && (
        <div className="study-nav" role="group" aria-label="카드 넘기기">
          <IconButton label="이전 카드" icon={<Icon name="back" />} isDisabled={!canPrev} onClick={goPrev} />
          <IconButton label="이후 카드" icon={<Icon name="chevron" />} isDisabled={!canNext} onClick={goNext} />
        </div>
      )}
      <Announce text={navSaid} />

      <div className="card-area">
        <div className="card-stage" ref={swipe.ref}>
          {pastSlot(at - 1, -1)}
          {view !== null && pastSlot(view, 0)}
          {view !== null && pastSlot(view + 1, 1)}
          {/* the card to answer: kept in place (and its state with it) while earlier cards are looked at */}
          <div
            className="card-slot"
            style={{ '--slot': total - at } as CSSProperties}
            data-away={view !== null && !(swipe.peek && view + 1 === total) ? '' : undefined}
            inert={view !== null}
            aria-hidden={view !== null || undefined}
          >
            {error && (
              <div className="load-error" role="alert">
                <p>{error}</p>
                <Button
                  label="다시 시도"
                  onClick={() => {
                    // whichever failed: the studied levels (the queue's order) or the card's own level
                    levels.retry()
                    setRetry((n) => n + 1)
                  }}
                />
              </div>
            )}
            {!ready && !error && (
              <div className="skeleton" aria-busy="true" aria-label="단어를 불러오는 중">
                <Skeleton width={120} height={48} />
                <Skeleton width={160} height={20} />
              </div>
            )}
            {ready && word && next && (
              <div className={`flash ${missed ? 'missed' : ''} ${reading ? 'reading-card' : ''}`} key={cardKey}>
                {/* the level in its colour and the kind of card; a reading card speaks only once answered (hearing it
                    first would give the answer away) */}
                <CardHead
                  level={word.level}
                  items={[kind, reading && '읽기', lapses > 0 && `${lapses}번 잊음`]}
                  word={word}
                  speakable={!quiz || settled}
                  marked={marked}
                  onMark={() => toggleMark(word.id)}
                />
                {quiz && question ? (
                  <CardScroll>
                    <div className="flash-body">
                      <Headword word={word} />
                      {/* the question's line, then the result in its place: one line, a mark and the colour on the text */}
                      <p className="reading-prompt" id="reading-prompt" aria-live="polite">
                        {picked === null ? (
                          '어떻게 읽을까요?'
                        ) : picked === question.answer ? (
                          <Result tone="right">맞았어요</Result>
                        ) : picked < 0 ? (
                          <Result tone="again">이렇게 읽어요</Result>
                        ) : (
                          <Result tone="wrong">틀렸어요</Result>
                        )}
                      </p>
                      <div className="choices" role="group" aria-labelledby="reading-prompt">
                        {question.choices.map((c, i) => {
                          const state = picked === null ? '' : i === question.answer ? 'right' : i === picked ? 'wrong' : 'dim'
                          return (
                            <ReadingChoice
                              key={c}
                              text={c}
                              state={state}
                              disabled={settled}
                              onClick={(e) => {
                                e.stopPropagation()
                                choose(i)
                              }}
                            />
                          )
                        })}
                      </div>
                      {/* the answer's room is kept until it is answered, so the choices do not move */}
                      <Slot on={settled} className="flash-answer">
                        {word.sk && <Bridge word={word} reading={readingOf(word)} />}
                        <p className="flash-meaning">{meaning(word)}</p>
                        <SoundHints word={word} />
                      </Slot>
                      {example && (
                        <div className="flash-example">
                          <ExampleSentence example={example} headword={word.w} headwordReading={settled} translation={settled} />
                        </div>
                      )}
                    </div>
                  </CardScroll>
                ) : (
                  <>
                    <MeaningFace word={word} example={example} kana={open.kana} meaningOpen={open.meaning} />
                    {/* the two toggles, each on its own; after "모르겠어요" the result line in the same place (both are
                        always laid out in one cell, so the card keeps its height) */}
                    <div className="flash-foot">
                      <div className={`flash-toggles ${missed ? 'gone' : ''}`} role="group" aria-label="카드 열기" inert={missed}>
                        <Button
                          label="의미"
                          className="toggle"
                          aria-pressed={open.meaning}
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpen((o) => ({ ...o, meaning: !o.meaning }))
                          }}
                        />
                        <Button
                          label="히라가나"
                          className="toggle"
                          aria-pressed={open.kana}
                          isDisabled={!word.r}
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpen((o) => ({ ...o, kana: !o.kana }))
                          }}
                        />
                      </div>
                      <p className="flash-result" role="status">
                        {missed && <Result tone="again">{intervals ? `${afterText(intervals[Rating.Again])} 다시 나와요` : '다시 나와요'}</Result>}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {undoChip > 0 && canUndo && (
        <div className="undo-chip-row">
          <Button label="되돌리기" variant="ghost" className="undo-chip" icon={<Icon name="undo" size={16} />} onClick={onUndo} />
        </div>
      )}
      {view !== null && session.entries[view] ? (
        <PastBar key={view} entry={session.entries[view]} onGrade={regrade} />
      ) : quiz ? (
        <footer className="answer-bar">
          {picked === null ? (
            <Grade className="wide" label="모르겠어요" onClick={() => choose(-1)} isDisabled={!ready} />
          ) : (
            <Grade
              className="wide"
              primary
              label="다음"
              interval={intervals?.[missed ? Rating.Again : Rating.Good]}
              onClick={() => question && submit(gradeReading(picked, question.answer))}
            />
          )}
        </footer>
      ) : (
        <footer className={`answer-bar ${missed ? '' : 'three'}`}>
          {missed ? (
            <Grade className="wide" primary label="다음" onClick={() => submit(Rating.Again)} />
          ) : (
            <>
              <Grade label="모르겠어요" interval={intervals?.[Rating.Again]} onClick={onAgain} isDisabled={!ready} />
              <Grade primary label="알아요" interval={intervals?.[Rating.Good]} onClick={() => submit(Rating.Good)} isDisabled={!ready} />
              <Grade label="쉬워요" interval={intervals?.[Rating.Easy]} onClick={() => submit(Rating.Easy)} isDisabled={!ready} />
            </>
          )}
        </footer>
      )}
    </main>
  )
}
