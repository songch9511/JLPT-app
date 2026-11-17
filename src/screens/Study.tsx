import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { go } from '../App'
import { requestPersist } from '../backup'
import { PastBar, PastCard } from '../components/PastCard'
import { useSwipe } from '../components/useSwipe'
import { Session, type Entry } from '../session'
import { Icon } from '../components/Icon'
import { Announce, Button, IconButton, ProgressBar, Skeleton } from '../components/ui'
import { CardHead, KanjiFace, MeaningFace, useKanjiOf } from '../components/StudyCard'
import { DoneScreen, type DoneKind } from './Done'
import { LEVELS, levelOf, useLevel, useLevels, wordById, type Level } from '../data'
import { useExample } from '../examples'
import { isKanjiId, kanjiLevel } from '../kanji'
import { breakdowns, buildQueue, cardsLeft, dayLeft, formatInterval, wordLapses, isRelearning, previewIntervals, Rating, studyLevels, type Grade, type Queue, type StudyMode } from '../srs'
import { platform } from '../platform'
import { chaptersDone, currentChapter } from '../progress'
import { getState, toggleMark, useStore, type DayLog } from '../store'
import { dayKey, useClock } from '../util'

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
export function GradeButton({ label, interval, primary = false, isDisabled, className, onClick }: { label: string; interval?: string; primary?: boolean; isDisabled?: boolean; className?: string; onClick: () => void }) {
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

/** The cards a session has already answered today, as far as the day's log tells them apart (the "12" of "12 / 107"). */
export const doneInMode = (log: DayLog | undefined, mode: StudyMode) =>
  !log ? 0 : mode === 'review' ? log.r : mode === 'new' ? log.n : mode === 'kanji' ? (log.kn ?? 0) + (log.kr ?? 0) : log.c

/** The levels a kanji's words come from (to show them on its card). */
const levelsOfWords = (ids: string[]) => LEVELS.filter((l) => ids.some((id) => levelOf(id) === l))

/**
 * One study session. `mode` is which of the day's cards it shows (srs.ts `StudyMode`): Home's 복습, 새 단어 and 한자
 * open `review`, `new` and `kanji`; `all` is the whole day in one queue (the plain `#/study` route).
 */
export function Study({ mode = 'all' }: { mode?: StudyMode }) {
  const s = useStore((x) => x)
  /** the card's two toggles, each on its own: 의미 and 히라가나. Kept for this card only. */
  const [open, setOpen] = useState({ meaning: false, kana: false })
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
  // The queue needs the studied levels' data: their introduction order.
  const levels = useLevels(studyLevels(s.settings))
  // what this session finished: the target level's chapters and new words when it opened
  const [start] = useState(() => {
    const t = s.settings.target
    return { level: t, chapters: chaptersDone(s, t), chapter: currentChapter(s, t), fresh: breakdowns(s)[t].new }
  })

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
  const kanjiCard = !!id && isKanjiId(id)
  const { words, error: levelError } = useLevel(id && !kanjiCard ? (levelOf(id) ?? null) : null, retry)
  const word = words && id && !kanjiCard ? wordById(id) : null
  const kanji = useKanjiOf(kanjiCard ? id : null)
  // a kanji card lists the words that contain it: their levels' data
  useLevels(kanji ? levelsOfWords(kanji.words) : [])
  const example = useExample(kanjiCard ? null : id)
  const error = levelError ?? levels.error
  const ready = kanjiCard ? !!kanji : !!word
  const intervals = useMemo(() => (id ? previewIntervals(s, id, now) : null), [s, id, now])
  const cardKey = `${id}:${answered}`
  const activeMs = useActiveTime(cardKey, view !== null)

  useEffect(() => {
    setOpen({ meaning: false, kana: false })
  }, [cardKey])

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

  const todayLog = s.log[dayKey(now)]
  // the day as a whole: a session can end while another one still has cards
  const day = useMemo(() => (mode === 'all' ? q : buildQueue(s, now)), [mode, q, s, now])
  const rest = useMemo(() => dayLeft(s, now), [s, now])
  const finished = !rest.next && rest.waiting === 0 && (todayLog?.c ?? 0) > 0
  // the first finished day is when there is something worth protecting from storage eviction
  useEffect(() => {
    if (finished) requestPersist()
    // the day was finished in this session (not merely reopened afterwards): a success tap in the app
    if (finished && answered > 0) platform.haptic('done')
  }, [finished])

  /** Both toggles on (Space/Enter). */
  const openAll = useCallback(() => setOpen({ meaning: true, kana: true }), [])
  const allOpen = open.meaning && (open.kana || (!kanjiCard && !word?.r))

  /** A grade. Nothing needs to be opened first: a known word is passed quickly. */
  const submit = useCallback(
    (grade: Grade) => {
      if (!q.next || Date.now() < lockUntil.current) return
      lockUntil.current = Date.now() + DOUBLE_TAP_MS
      undo.current = { entry: session.answer({ id: q.next.id, kind: q.next.kind, grade, at: Date.now(), ms: activeMs() }), card: q.next }
      setRedo(null)
      platform.haptic('answer')
      const interval = intervals?.[grade]
      setNote(interval ? { key: Date.now(), text: afterText(interval) } : null)
      setUndoChip(Date.now())
      setLast(q.next.id)
      setAnswered((n) => n + 1)
    },
    [q.next, intervals, activeMs, session],
  )

  /**
   * "모르겠어요": before everything is open it opens everything (the three grades stay); once everything is open it is
   * the grade.
   */
  const onAgain = useCallback(() => {
    if (!allOpen) {
      lockUntil.current = Date.now() + DOUBLE_TAP_MS
      openAll()
    } else submit(Rating.Again)
  }, [allOpen, openAll, submit])

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
  // button for the next card; the browser then counts it as keyboard-focused from the first key pressed, so it is
  // told apart here. A Tab hands focus to the keyboard.
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

  // Keys: Space/Enter opens both toggles; 1 "모르겠어요", 2 "알아요", 3 (↑ too) "쉬워요", whether anything is open or
  // not. ←/→ move between the session's cards. Registered before paint, so a key pressed as soon as a card shows is
  // never handled by the previous card's handler.
  useLayoutEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault()
        if (!e.repeat) void (e.key === 'ArrowLeft' ? goPrev() : goNext())
        return
      }
      // an earlier card: 1–3 are its grade buttons, left to right
      if (view !== null) {
        const past = session.entries[view]
        const n = Number(e.key)
        if (past && !e.repeat && !e.altKey && !e.ctrlKey && !e.metaKey && n >= 1 && n <= 3) regrade(([Rating.Again, Rating.Good, Rating.Easy] as Grade[])[n - 1])
        return
      }
      if (!ready || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return
      const k = e.key
      if ((k === ' ' || k === 'Enter') && e.target instanceof HTMLElement && e.target.closest('button, a')) {
        // a control the user moved to with the keyboard gets its own Enter/Space (unless it is switched off, like the
        // undo button right after an undo: then the key is the card's)
        const control = e.target.closest('button, a')!
        if (control !== pointerFocus.current && e.target.matches(':focus-visible') && control.getAttribute('aria-disabled') !== 'true') return
        // otherwise the key is the card's shortcut, and the focused button must not be pressed by it as well: the
        // browser presses it on Space's keyup whatever the keydown did
        e.target.blur()
      }
      if (k === ' ' || k === 'Enter') {
        e.preventDefault()
        openAll()
      } else if (k === '1') onAgain()
      else if (k === '2') submit(Rating.Good)
      else if (k === '3' || k === 'ArrowUp') {
        e.preventDefault()
        submit(Rating.Easy)
      }
    }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }, [ready, submit, onAgain, openAll, view, goPrev, goNext, regrade, session])

  const swipe = useSwipe({ canPrev, canNext, onPrev: goPrev, onNext: goNext })

  /** An earlier card at `slot` (0 on screen, ±1 beside it while a swipe is under way). */
  const pastSlot = (i: number, slot: number) => {
    const e = session.entries[i]
    if (!e || (slot !== 0 && !swipe.peek)) return null
    const w = isKanjiId(e.id) ? null : wordById(e.id)
    return (
      <div key={`${e.id}@${e.at}`} className="card-slot" style={{ '--slot': slot } as CSSProperties} inert={slot !== 0} aria-hidden={slot !== 0 || undefined}>
        <PastCard entry={e} index={i} total={total} word={w} marked={s.marks.includes(e.id)} lapses={wordLapses(s, e.id)} onMark={() => toggleMark(e.id)} />
      </div>
    )
  }

  if (levels.ready && !q.next) {
    const target = s.settings.target
    // this session has nothing left / the whole day has nothing left
    const cleared = q.waiting === 0
    const dayCleared = cleared && !rest.next && rest.waiting === 0
    const inMin = q.nextDue === null ? 0 : Math.max(1, Math.ceil((q.nextDue - now.getTime()) / 60_000))
    // what finished in this session: the target level, a chapter of it
    const levelFinished = start.level === target && start.fresh > 0 && breakdowns(s)[target].new === 0
    const chapterFinished = start.level === target && chaptersDone(s, target) > start.chapters
    const kind: DoneKind = !cleared ? 'waiting' : levelFinished ? 'level' : chapterFinished ? 'chapter' : dayCleared ? 'day' : 'session'
    return (
      <DoneScreen kind={kind} mode={mode} q={q} day={day} chapter={start.chapter} waitMin={inMin} onFinishNow={() => setFinishNow(true)}>
        {ReminderOffer && platform.native && dayCleared && (
          <Suspense fallback={null}>
            <ReminderOffer />
          </Suspense>
        )}
      </DoneScreen>
    )
  }

  const left = cardsLeft(q)
  const next = q.next
  const done = doneInMode(todayLog, mode)
  const marked = id ? s.marks.includes(id) : false
  // the kind of card, as the session it belongs to: a word introduced today (still learning it) is new, a review
  // answered "모르겠어요" (relearning) a review
  const reviewing = !!next && (next.kind === 'review' || (next.kind === 'learning' && isRelearning(s.cards[next.id])))
  const kindLabel = reviewing ? '복습' : kanjiCard ? '새 한자' : '새 단어'
  const lapses = id ? wordLapses(s, id) : 0
  const level: Level | undefined = kanjiCard ? kanji?.level : word?.level

  return (
    <main className="study">
      <h1 className="sr-only">{mode === 'kanji' ? '한자 학습' : '학습'}</h1>
      <header className="study-top">
        <IconButton label="나가기, 진행 상황은 저장돼요" icon={<Icon name="close" />} onClick={() => go('/')} />
        <ProgressBar className="study-bar grow" label="학습 진행" value={done} max={Math.max(1, done + left)} valueText={`${done + left}장 중 ${done}장, ${left}장 남음`} />
        <span className="left-count num-plain" aria-hidden="true" data-left={left}>
          {done} / {done + left}
        </span>
      </header>
      <p className="after-note" aria-live="polite">
        {note && (
          <span key={note.key}>
            {note.text} 다시 나와요
          </span>
        )}
      </p>

      {/* previous / next card and undo without swiping: for the keyboard and screen readers, shown when focused */}
      <div className="study-nav" role="group" aria-label="카드 넘기기">
        <IconButton label="이전 카드" icon={<Icon name="back" />} isDisabled={!canPrev} onClick={goPrev} />
        <IconButton label="이후 카드" icon={<Icon name="chevron" />} isDisabled={!canNext} onClick={goNext} />
        <IconButton label="방금 답 되돌리기" icon={<Icon name="undo" />} isDisabled={!canUndo} onClick={onUndo} />
      </div>
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
            {ready && next && level !== undefined && (
              <section className={`flash ${kanjiCard ? 'kanji-card' : ''}`} key={cardKey} aria-label={kanjiCard ? '한자 카드' : '단어 카드'}>
                <CardHead
                  level={level}
                  items={[kindLabel, lapses > 0 && `${lapses}번 잊음`]}
                  marked={marked}
                  onMark={() => toggleMark(next.id)}
                />
                {kanji && kanjiCard ? <KanjiFace key={kanji.k} kanji={kanji} kana={open.kana} meaningOpen={open.meaning} /> : word && <MeaningFace word={word} example={example} kana={open.kana} meaningOpen={open.meaning} />}
                {/* the two toggles, each on its own */}
                <div className="flash-toggles" role="group" aria-label="카드 열기">
                  <Button label="의미" className="toggle" aria-pressed={open.meaning} onClick={() => setOpen((o) => ({ ...o, meaning: !o.meaning }))} />
                  <Button label="히라가나" className="toggle" aria-pressed={open.kana} isDisabled={!kanjiCard && !word?.r} onClick={() => setOpen((o) => ({ ...o, kana: !o.kana }))} />
                </div>
              </section>
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
      ) : (
        <footer className="answer-bar three" role="group" aria-label="얼마나 기억했나요">
          <GradeButton label="모르겠어요" interval={intervals?.[Rating.Again]} onClick={onAgain} isDisabled={!ready} />
          <GradeButton primary label="알아요" interval={intervals?.[Rating.Good]} onClick={() => submit(Rating.Good)} isDisabled={!ready} />
          <GradeButton label="쉬워요" interval={intervals?.[Rating.Easy]} onClick={() => submit(Rating.Easy)} isDisabled={!ready} />
        </footer>
      )}
    </main>
  )
}

/** The kanji level for a card id, or the word's level. */
export const cardLevel = (id: string): Level | undefined => (isKanjiId(id) ? kanjiLevel(id) : levelOf(id))
