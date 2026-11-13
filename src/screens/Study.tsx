import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { go } from '../App'
import { requestPersist } from '../backup'
import { Ruma } from '../components/Ruma'
import { Icon } from '../components/Icon'
import { levelOf, meaning, useLevel } from '../data'
import {
  answer,
  breakdowns,
  buildQueue,
  previewIntervals,
  Rating,
  restore,
  snapshot,
  streak,
  unlockMoreNew,
  type Grade,
  type Queue,
  type Snapshot,
} from '../srs'
import { toggleMark, useStore } from '../store'
import { dayKey, speak, useClock } from '../util'

/** Answers within this long of the last answer or reveal are ignored, so a double tap can't answer an unseen card. */
const DOUBLE_TAP_MS = 350
/** How long the "26일 뒤" note and the undo chip stay after an answer. */
const NOTE_MS = 900
const UNDO_CHIP_MS = 4000

/** "알아요, 26일 뒤 다시" — the interval read as part of the button's name. */
const answerLabel = (label: string, interval?: string) =>
  interval ? `${label}, ${interval.endsWith('이내') ? interval : `${interval} 뒤`} 다시` : label
const afterText = (interval: string) => (interval.endsWith('이내') ? interval : `${interval} 뒤`)

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

  // Recomputed after every answer; `now` is taken then so waiting cards become due as time passes.
  const { q, now } = useMemo(() => {
    const now = new Date()
    const q = buildQueue(s, now, last, { finishNow })
    return { q: redo ? { ...q, next: redo } : q, now }
  }, [s, last, redo, tick, wake, finishNow])
  useEffect(() => setIdle(!q.next), [q.next])
  // …and wake up exactly when the first waiting card is due, not only on the next minute tick
  useEffect(() => {
    if (q.next || q.nextDue === null) return
    const id = setTimeout(() => setWake((n) => n + 1), Math.min(2 ** 31 - 1, Math.max(0, q.nextDue - Date.now()) + 50))
    return () => clearTimeout(id)
  }, [q.next, q.nextDue])

  const id = q.next?.id
  const { words, error } = useLevel(id ? levelOf(id) : null, retry)
  const word = words && id ? words[Number(id.split('-')[1])] : null
  const intervals = useMemo(() => (id ? previewIntervals(s, id, now) : null), [s, id, now])
  const cardKey = `${id}:${answered}`
  const activeMs = useActiveTime(cardKey)

  useEffect(() => {
    setRevealed(false)
    setMissed(false)
  }, [cardKey])

  useEffect(() => {
    if (s.settings.autoSpeak && word && mayPlayAudio()) speak(word.r || word.w)
  }, [s.settings.autoSpeak, word])

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

  // Keys follow the two steps: Space/Enter shows the answer; 1/2/3 (or ←/→/↑) grade once it is shown.
  // 1 / ← on the front is "모르겠어요", the only other choice there.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!word || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return
      // a control the user moved to with the keyboard gets its own Enter/Space
      if ((e.key === ' ' || e.key === 'Enter') && e.target instanceof Element && e.target.matches(':focus-visible')) return
      const k = e.key
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
  }, [word, revealed, missed, submit, onAgain, reveal])

  if (!q.next) {
    const moreNew = breakdowns(s)[s.settings.target].new > 0
    const log = s.log[dayKey(now)]
    const cleared = q.waiting === 0
    const inMin = q.nextDue === null ? 0 : Math.max(1, Math.ceil((q.nextDue - now.getTime()) / 60_000))
    return (
      <div className="study done-screen">
        <div className="done-mascot">
          <Ruma progress={cleared ? 1 : (log?.c ?? 0) / ((log?.c ?? 0) + q.waiting)} mood={cleared ? 'cheer' : 'idle'} size={132} />
          {cleared && (
            <span className="seal" aria-hidden="true" lang="ja">
              済
            </span>
          )}
        </div>
        <h1>{cleared ? '오늘 목표 달성!' : '잠깐 쉬어 가요'}</h1>
        <p className="muted">
          {cleared
            ? '루마가 두 눈을 다 떴어요. 기억이 흐려질 때쯤 다시 가져올게요.'
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
          {!cleared && (
            <button className="btn primary big" onClick={() => setFinishNow(true)}>
              남은 {q.waiting}장 지금 마무리
            </button>
          )}
          <button className={`btn ${cleared ? 'primary' : 'ghost'} big`} onClick={() => go('/')}>
            홈으로
          </button>
          {cleared && moreNew && (
            <button className="btn ghost big" onClick={() => unlockMoreNew(10)}>
              새 단어 10개 더 하기
            </button>
          )}
        </div>
      </div>
    )
  }

  const left = q.learning + q.review + q.fresh
  // measured against the whole day, like the home screen, so resuming does not start from zero
  const dayTotal = Math.max(1, todayCount + left)
  const marked = word ? s.marks.includes(word.id) : false
  const lower = levelOf(q.next.id) !== s.settings.target

  return (
    <div className="study">
      <header className="study-top">
        <button className="icon-btn" onClick={() => go('/')} aria-label="나가기 (진행 상황은 저장돼요)">
          <Icon name="close" />
        </button>
        <div
          className="bar study-bar grow"
          role="progressbar"
          aria-label="오늘 학습"
          aria-valuemin={0}
          aria-valuemax={dayTotal}
          aria-valuenow={todayCount}
          aria-valuetext={`오늘 ${todayCount}장 봤어요, 남은 ${left}장`}
        >
          <i style={{ width: `${(todayCount / dayTotal) * 100}%` }} />
        </div>
        <span className="left-count" aria-hidden="true">
          남은 {left}장
        </span>
        <button className="icon-btn" disabled={!undo.current} onClick={onUndo} aria-label="방금 선택 되돌리기">
          <Icon name="undo" />
        </button>
      </header>
      <p className="after-note" aria-live="polite">
        {note && (
          <span key={note.key}>
            {note.text} 다시 나와요
          </span>
        )}
      </p>

      <div className="card-area">
        {error && (
          <div className="load-error" role="alert">
            <p>{error}</p>
            <button className="btn ghost" onClick={() => setRetry((n) => n + 1)}>
              다시 시도
            </button>
          </div>
        )}
        {!word && !error && (
          <div className="skeleton" aria-busy="true" aria-label="단어를 불러오는 중">
            <i className="sk-word" />
            <i className="sk-meaning" />
          </div>
        )}
        {word && (
          <div className={`flash ${revealed ? 'open' : ''} ${missed ? 'missed' : ''}`} key={cardKey} onClick={() => reveal()}>
            <div className="flash-head">
              {missed ? (
                <span className="chip k-again" role="status">
                  다시 나와요 · {intervals?.[Rating.Again]}
                </span>
              ) : (
                q.next.kind === 'new' && <span className="chip k-new">새 단어</span>
              )}
              {lower && <span className="chip">N{levelOf(q.next.id)}</span>}
              <span className="grow" />
              <button
                className="icon-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  speak(word.r || word.w)
                }}
                aria-label="발음 듣기"
              >
                <Icon name="speaker" />
              </button>
              <button
                className={`icon-btn ${marked ? 'marked' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleMark(word.id)
                }}
                aria-label="북마크"
                aria-pressed={marked}
              >
                <Icon name="mark" fill={marked} />
              </button>
            </div>
            <div className="flash-body">
              <p lang="ja" className={`flash-word ${word.w.length > 6 ? 'long' : ''}`}>
                {word.w}
              </p>
              <div className="flash-answer-slot" aria-live="polite">
                {revealed ? (
                  <div className="flash-answer">
                    {word.r && (
                      <p lang="ja" className="flash-reading">
                        {word.r}
                      </p>
                    )}
                    <p className="flash-meaning">{meaning(word)}</p>
                  </div>
                ) : (
                  <p className="flash-hint">떠올려 본 뒤 정답을 확인하세요</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {undoChip > 0 && undo.current && (
        <div className="undo-chip-row">
          <button className="undo-chip" onClick={onUndo}>
            <Icon name="undo" size={16} /> 되돌리기
          </button>
        </div>
      )}
      <footer className={`answer-bar ${!revealed ? 'front' : missed ? '' : 'three'}`}>
        {!revealed ? (
          <>
            <button className="btn ghost big" onClick={onAgain} disabled={!word}>
              모르겠어요
            </button>
            <button className="btn primary big" onClick={() => reveal(true)} disabled={!word}>
              정답 보기
            </button>
          </>
        ) : missed ? (
          <button className="btn primary big wide" onClick={() => submit(Rating.Again)}>
            확인했어요 · 다음
          </button>
        ) : (
          <>
            <button className="btn ghost big" onClick={onAgain} aria-label={answerLabel('모르겠어요', intervals?.[Rating.Again])}>
              모르겠어요
              <small>{intervals?.[Rating.Again]}</small>
            </button>
            <button className="btn primary big" onClick={() => submit(Rating.Good)} aria-label={answerLabel('알아요', intervals?.[Rating.Good])}>
              알아요
              <small>{intervals?.[Rating.Good]}</small>
            </button>
            <button className="btn ghost big" onClick={() => submit(Rating.Easy)} aria-label={answerLabel('쉬워요', intervals?.[Rating.Easy])}>
              쉬워요
              <small>{intervals?.[Rating.Easy]}</small>
            </button>
          </>
        )}
      </footer>
    </div>
  )
}

