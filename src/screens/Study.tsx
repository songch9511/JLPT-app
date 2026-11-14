import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { go } from '../App'
import { requestPersist } from '../backup'
import { Ruma } from '../components/Ruma'
import { Icon } from '../components/Icon'
import { Announce, Badge, Button, IconButton, ProgressBar, Skeleton } from '../components/ui'
import { done as guideDone, markDone } from '../guide'
import { Bridge, FalseFriend, SoundHints, TypeLine } from '../components/WordNotes'
import { isReadingCard, levelOf, meaning, useAllWords, useLevel, useLevels, wordById } from '../data'
import { legacySeed } from '../ids'
import { readingOf, readingQuestion } from '../distractors'
import {
  answer,
  breakdowns,
  buildQueue,
  gradeReading,
  previewIntervals,
  Rating,
  restore,
  snapshot,
  MORE_REVIEWS,
  streak,
  studyLevels,
  unlockMoreNew,
  unlockMoreReviews,
  type Grade,
  type Queue,
  type Snapshot,
} from '../srs'
import { platform } from '../platform'
import { toggleMark, useStore } from '../store'
import { dayKey, speak, useClock } from '../util'

// the iOS app's offer to turn on review reminders, after a finished day (not in the web bundle)
const ReminderOffer = import.meta.env.MODE === 'native' ? lazy(() => import('../platform/ReminderOffer')) : null

/** Answers within this long of the last answer or reveal are ignored, so a double tap can't answer an unseen card. */
const DOUBLE_TAP_MS = 350
/** How long the "26일 뒤" note and the undo chip stay after an answer. */
const NOTE_MS = 900
const UNDO_CHIP_MS = 4000
/** Ruma's words on the first reading card (src/guide.ts). */
const READING_TIP = '읽기 카드예요. 한국어와 뜻이 같은 한자어는 읽는 법만 골라요.'

/** "알아요, 26일 뒤 다시" — the interval read as part of the button's name. */
const answerLabel = (label: string, interval?: string) =>
  interval ? `${label}, ${interval.endsWith('이내') ? interval : `${interval} 뒤`} 다시` : label
const afterText = (interval: string) => (interval.endsWith('이내') ? interval : `${interval} 뒤`)

/**
 * One answer button of the bar under the card: 60px high on both steps, so the thumb never moves. The interval it sets
 * is shown under the label and read as part of its name ("알아요, 26일 뒤 다시"). Only the one primary is filled.
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
    <Button
      label={answerLabel(label, interval)}
      variant={primary ? 'primary' : 'secondary'}
      size="lg"
      className={`grade ${className ?? ''}`}
      isDisabled={isDisabled}
      onClick={onClick}
    >
      <span className="grade-label">{label}</span>
      {interval && <small>{interval}</small>}
    </Button>
  )
}

/** Browsers (iOS above all) only allow speech after the user has interacted with the page. */
const mayPlayAudio = () => (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? true

/**
 * Time the current card has been on screen while the page was visible: what DayLog.ms records (03 §5.1).
 * Restarted for every card; a hidden page (another app, a locked phone) does not count.
 */
function useActiveTime(cardKey: string) {
  const t = useRef({ acc: 0, since: null as number | null })
  useEffect(() => {
    t.current = { acc: 0, since: document.hidden ? null : Date.now() }
  }, [cardKey])
  useEffect(() => {
    const on = () => {
      const c = t.current
      if (document.hidden && c.since !== null) t.current = { acc: c.acc + Date.now() - c.since, since: null }
      else if (!document.hidden && c.since === null) t.current = { acc: c.acc, since: Date.now() }
    }
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return () => t.current.acc + (t.current.since === null ? 0 : Date.now() - t.current.since)
}

export function Study() {
  const s = useStore((x) => x)
  const [revealed, setRevealed] = useState(false)
  const [missed, setMissed] = useState(false)
  const [answered, setAnswered] = useState(0)
  const [last, setLast] = useState<string | undefined>()
  /** "26일 뒤" after an answer: when the card answered comes back */
  const [note, setNote] = useState<{ key: number; text: string } | null>(null)
  const [undoChip, setUndoChip] = useState(0)
  const undo = useRef<{ snap: Snapshot; card: NonNullable<Queue['next']> } | null>(null)
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
    const q = buildQueue(s, now, last, { finishNow })
    return { q: redo ? { ...q, next: redo } : q, now }
  }, [s, last, redo, tick, wake, finishNow, levels.ready])
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
  const error = levelError ?? levels.error
  const reps = id ? (s.cards[id]?.reps ?? 0) : 0
  const question = useMemo(() => (reading && word && all ? readingQuestion(word, all, `${legacySeed(id!)}|${reps}`) : null), [reading, word, all, id, reps])
  // a word without enough good wrong choices (readingQuestion → null) is asked like a meaning card: recall, then reveal
  const quiz = reading && !!question
  const ready = !!word && (!reading || !!all)
  const intervals = useMemo(() => (id ? previewIntervals(s, id, now) : null), [s, id, now])
  const cardKey = `${id}:${answered}`
  const activeMs = useActiveTime(cardKey)

  // Ruma's tip on the first reading card of a learner who started with the first-run guide (src/guide.ts): shown with
  // that card only, counted as shown at once so it never comes back
  const [readingTip, setReadingTip] = useState<string | null>(null)
  const tipDue = quiz && !!word && !!s.guide && s.onboarded && !guideDone(s, 'reading')
  useEffect(() => {
    if (!tipDue) return
    setReadingTip(cardKey)
    markDone('reading')
  }, [tipDue, cardKey])

  useEffect(() => {
    setRevealed(false)
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
  const finished = !q.next && q.waiting === 0 && todayCount > 0
  // the first finished day is when there is something worth protecting from storage eviction
  useEffect(() => {
    if (finished) requestPersist()
    // the day was finished in this session (not merely reopened afterwards): a success tap in the app
    if (finished && answered > 0) platform.haptic('done')
  }, [finished])

  /** `fromButton`: the grade buttons appear where "정답 보기" was, so a double tap on it must not answer. */
  const reveal = useCallback(
    (fromButton = false) => {
      if (revealed) return
      if (fromButton) lockUntil.current = Date.now() + DOUBLE_TAP_MS
      setRevealed(true)
    },
    [revealed],
  )

  const submit = useCallback(
    (grade: Grade) => {
      if (!q.next || !revealed || Date.now() < lockUntil.current) return
      lockUntil.current = Date.now() + DOUBLE_TAP_MS
      undo.current = { snap: snapshot(), card: q.next }
      setRedo(null)
      answer(q.next.id, grade, new Date(), activeMs())
      platform.haptic('answer')
      const interval = intervals?.[grade]
      setNote(interval ? { key: Date.now(), text: afterText(interval) } : null)
      setUndoChip(Date.now())
      setLast(q.next.id)
      setAnswered((n) => n + 1)
    },
    [q.next, revealed, intervals, activeMs],
  )

  const autoSpeak = s.settings.autoSpeak
  /** On the front: show the answer and mark the card forgotten. On the back: grade it "모르겠어요". */
  const onAgain = useCallback(() => {
    if (!revealed) {
      lockUntil.current = Date.now() + DOUBLE_TAP_MS
      setRevealed(true)
      setMissed(true)
      // hear the reading once — inside the tap or key press, so the browser allows it
      if (autoSpeak && word) speak(word.r || word.w)
    } else submit(Rating.Again)
  }, [revealed, submit, autoSpeak, word])

  /** Reading card: a choice (or -1, "모르겠어요") grades it at once; the answer and meaning are then shown. */
  const choose = useCallback(
    (i: number) => {
      if (!question || picked !== null || Date.now() < lockUntil.current) return
      lockUntil.current = Date.now() + DOUBLE_TAP_MS
      setPicked(i)
      setRevealed(true)
      setMissed(i !== question.answer)
      if (autoSpeak && word) speak(word.r || word.w)
    },
    [question, picked, autoSpeak, word],
  )

  const onUndo = () => {
    if (!undo.current) return
    restore(undo.current.snap)
    setRedo(undo.current.card)
    undo.current = null
    setLast(undefined)
    setAnswered((n) => Math.max(0, n - 1))
    setNote(null)
    setUndoChip(0)
  }

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

  // Keys follow the two steps: Space/Enter shows the answer; 1/2/3 (or ←/→/↑) grade once it is shown.
  // 1 / ← on the front is "모르겠어요", the only other choice there. Registered before paint, so a key pressed
  // as soon as a card shows is never handled by the previous card's handler.
  useLayoutEffect(() => {
    const on = (e: KeyboardEvent) => {
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
      // reading card: 1–4 pick a choice, 0 or ← is "모르겠어요"; once answered Space/Enter goes on
      if (quiz) {
        if (picked === null && /^[1-4]$/.test(k) && Number(k) <= (question?.choices.length ?? 0)) choose(Number(k) - 1)
        else if (picked === null && (k === '0' || k === 'ArrowLeft')) choose(-1)
        else if (picked !== null && (k === ' ' || k === 'Enter')) {
          e.preventDefault()
          if (question) submit(gradeReading(picked, question.answer))
        }
        return
      }
      if (k === ' ' || k === 'Enter') {
        e.preventDefault()
        if (!revealed) reveal()
        else if (missed) submit(Rating.Again)
      } else if (k === '1' || k === 'ArrowLeft') onAgain()
      else if (revealed && !missed && (k === '2' || k === 'ArrowRight')) submit(Rating.Good)
      else if (revealed && !missed && (k === '3' || k === 'ArrowUp')) submit(Rating.Easy)
    }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }, [ready, word, quiz, question, picked, choose, revealed, missed, submit, onAgain, reveal])

  if (levels.ready && !q.next) {
    const moreNew = breakdowns(s)[s.settings.target].new > 0
    const log = s.log[dayKey(now)]
    const cleared = q.waiting === 0
    const inMin = q.nextDue === null ? 0 : Math.max(1, Math.ceil((q.nextDue - now.getTime()) / 60_000))
    return (
      <main className="study done-screen">
        <div className="done-mascot">
          <Ruma progress={cleared ? 1 : (log?.c ?? 0) / ((log?.c ?? 0) + q.waiting)} mood={cleared ? 'cheer' : 'idle'} size={132} />
          {cleared && (
            <span className="seal" aria-hidden="true" lang="ja">
              済
            </span>
          )}
        </div>
        <h1>{cleared ? '오늘 목표 달성!' : '잠깐 쉬어 가요'}</h1>
        <p className="done-text">
          {cleared
            ? q.held > 0
              ? `루마가 두 눈을 다 떴어요. 남은 밀린 복습 ${q.held}장은 내일부터 나눠서 해요.`
              : '루마가 두 눈을 다 떴어요. 기억이 흐려질 때쯤 다시 가져올게요.'
            : `${inMin}분 뒤에 익히는 중인 ${q.waiting}장이 돌아와요.`}
        </p>
        <dl className="result-tiles">
          <div className="t-cards">
            <dt>본 카드</dt>
            <dd>
              <b>{log?.c ?? 0}장</b>
            </dd>
          </div>
          <div className="t-streak">
            <dt>연속 학습</dt>
            <dd>
              <b>
                <Icon name="flame" size={18} />
                {streak(s.log, now)}일
              </b>
            </dd>
          </div>
          <div className="t-xp">
            <dt>오늘 XP</dt>
            <dd>
              <b>{log?.xp ?? 0}</b>
            </dd>
          </div>
        </dl>
        <div className="done-actions">
          {!cleared && <Button label={`남은 ${q.waiting}장 지금 마무리`} variant="primary" size="lg" width="100%" onClick={() => setFinishNow(true)} />}
          <Button label="홈으로" variant={cleared ? 'primary' : 'secondary'} size="lg" width="100%" onClick={() => go('/')} />
          {/* while reviews are held for later days, more reviews rather than more new words (03 §5.1, §5.3) */}
          {cleared && q.held > 0 ? (
            <Button
              label={`복습 ${Math.min(MORE_REVIEWS, q.held)}장 더 하기`}
              size="lg"
              width="100%"
              onClick={() => unlockMoreReviews(Math.min(MORE_REVIEWS, q.held))}
            />
          ) : (
            cleared && moreNew && <Button label="새 단어 10개 더 하기" size="lg" width="100%" onClick={() => unlockMoreNew(10)} />
          )}
        </div>
        {ReminderOffer && platform.native && cleared && (
          <Suspense fallback={null}>
            <ReminderOffer />
          </Suspense>
        )}
      </main>
    )
  }

  const left = q.learning + q.review + q.fresh
  const next = q.next
  // measured against the whole day, like the home screen, so resuming does not start from zero
  const dayTotal = Math.max(1, todayCount + left)
  const marked = word ? s.marks.includes(word.id) : false
  const lower = !!next && levelOf(next.id) !== s.settings.target

  return (
    <main className="study">
      <h1 className="sr-only">학습</h1>
      <header className="study-top">
        <IconButton label="나가기 (진행 상황은 저장돼요)" icon={<Icon name="close" />} onClick={() => go('/')} />
        <ProgressBar className="study-bar grow" label="오늘 학습" value={todayCount} max={dayTotal} valueText={`오늘 ${todayCount}장 봤어요, 남은 ${left}장`} />
        <span className="left-count" aria-hidden="true">
          남은 {left}장
        </span>
        <IconButton label="방금 선택 되돌리기" icon={<Icon name="undo" />} isDisabled={!undo.current} onClick={onUndo} />
      </header>
      <p className="after-note" aria-live="polite">
        {note && (
          <span key={note.key}>
            {note.text} 다시 나와요
          </span>
        )}
      </p>

      {readingTip === cardKey && (
        <div className="study-tip">
          <Ruma progress={dayTotal > 0 ? todayCount / dayTotal : 0} size={40} />
          <div className="bubble">
            <p>{READING_TIP}</p>
            <IconButton label="루마의 안내 닫기" icon={<Icon name="close" size={18} />} onClick={() => setReadingTip(null)} />
          </div>
          <Announce text={`루마: ${READING_TIP}`} />
        </div>
      )}

      <div className="card-area">
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
          <div
            className={`flash ${revealed ? 'open' : ''} ${missed ? 'missed' : ''} ${reading ? 'reading-card' : ''}`}
            key={cardKey}
            onClick={() => !quiz && reveal()}
          >
            <div className="flash-head">
              {missed ? (
                <span role="status">
                  <Badge variant="red" label={`다시 나와요 · ${intervals?.[Rating.Again]}`} />
                </span>
              ) : (
                next.kind === 'new' && <Badge variant="blue" label="새 단어" />
              )}
              {reading && <Badge label="읽기" />}
              {lower && <Badge label={`N${levelOf(next.id)}`} />}
              <span className="grow" />
              {(!reading || revealed) && (
                <IconButton
                  label="발음 듣기"
                  icon={<Icon name="speaker" />}
                  onClick={(e) => {
                    e.stopPropagation()
                    speak(word.r || word.w)
                  }}
                />
              )}
              <IconButton
                label="북마크"
                className={marked ? 'marked' : undefined}
                aria-pressed={marked}
                icon={<Icon name="mark" fill={marked} />}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleMark(word.id)
                }}
              />
            </div>
            <div className="flash-body">
              <p lang="ja" className={`flash-word ${word.w.length > 6 ? 'long' : ''}`}>
                {word.w}
              </p>
              {reading && question ? (
                <>
                  <p className="reading-prompt" id="reading-prompt">
                    {picked === null ? '어떻게 읽을까요?' : picked === question.answer ? '맞았어요' : picked < 0 ? '정답을 확인하세요' : '정답은 초록색이에요'}
                  </p>
                  <div className="choices" role="group" aria-labelledby="reading-prompt">
                    {question.choices.map((c, i) => {
                      const state = picked === null ? '' : i === question.answer ? 'right' : i === picked ? 'wrong' : 'dim'
                      return (
                        <button
                          key={c}
                          lang="ja"
                          className={`choice ${state}`}
                          disabled={picked !== null}
                          aria-label={state === 'right' ? `${c}, 정답` : state === 'wrong' ? `${c}, 고른 답, 오답` : c}
                          onClick={(e) => {
                            e.stopPropagation()
                            choose(i)
                          }}
                        >
                          {state === 'right' && (
                            <span className="choice-mark">
                              <Icon name="check" size={18} />
                            </span>
                          )}
                          {state === 'wrong' && (
                            <span className="choice-mark">
                              <Icon name="close" size={18} />
                            </span>
                          )}
                          {c}
                        </button>
                      )
                    })}
                  </div>
                  <div className="flash-answer-slot" aria-live="polite">
                    {picked !== null && (
                      <div className="flash-answer">
                        {word.sk && <Bridge word={word} reading={readingOf(word)} />}
                        <p className="flash-meaning">{meaning(word)}</p>
                        <SoundHints word={word} />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flash-answer-slot" aria-live="polite">
                  {revealed ? (
                    <div className="flash-answer">
                      {word.r && (
                        <p lang="ja" className="flash-reading">
                          {word.r}
                        </p>
                      )}
                      <p className="flash-meaning">{meaning(word)}</p>
                      <FalseFriend word={word} />
                      <TypeLine word={word} />
                    </div>
                  ) : (
                    <p className="flash-hint">떠올려 본 뒤 정답을 확인하세요</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {undoChip > 0 && undo.current && (
        <div className="undo-chip-row">
          <Button label="되돌리기" variant="ghost" className="undo-chip" icon={<Icon name="undo" size={16} />} onClick={onUndo} />
        </div>
      )}
      {quiz ? (
        <footer className="answer-bar">
          {picked === null ? (
            <Grade className="wide" label="모르겠어요" onClick={() => choose(-1)} isDisabled={!ready} />
          ) : missed ? (
            <Grade
              className="wide"
              primary
              label="확인했어요 · 다음"
              interval={intervals?.[Rating.Again]}
              onClick={() => submit(gradeReading(picked, question?.answer ?? 0))}
            />
          ) : (
            <Grade className="wide" primary label="다음" interval={intervals?.[Rating.Good]} onClick={() => submit(gradeReading(picked, question?.answer ?? -2))} />
          )}
        </footer>
      ) : (
        <footer className={`answer-bar ${!revealed ? 'front' : missed ? '' : 'three'}`}>
          {!revealed ? (
            <>
              <Grade label="모르겠어요" onClick={onAgain} isDisabled={!ready} />
              <Grade primary label="정답 보기" onClick={() => reveal(true)} isDisabled={!ready} />
            </>
          ) : missed ? (
            <Grade className="wide" primary label="확인했어요 · 다음" onClick={() => submit(Rating.Again)} />
          ) : (
            <>
              <Grade label="모르겠어요" interval={intervals?.[Rating.Again]} onClick={onAgain} />
              <Grade primary label="알아요" interval={intervals?.[Rating.Good]} onClick={() => submit(Rating.Good)} />
              <Grade label="쉬워요" interval={intervals?.[Rating.Easy]} onClick={() => submit(Rating.Easy)} />
            </>
          )}
        </footer>
      )}
    </main>
  )
}
