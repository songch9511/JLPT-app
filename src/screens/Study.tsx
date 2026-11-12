import { useCallback, useEffect, useRef, useState } from 'react'
import { go } from '../App'
import { Icon } from '../components/Icon'
import { AiExplain } from '../components/WordSheet'
import { meaning, stageCount, useLevel, type Level } from '../data'
import { answer, getState, restoreSession, startStage, toggleMark, useStore, type Session, type State } from '../store'
import { speak } from '../util'

interface Finished {
  level: Level
  stage: number
  total: number
  pass: number
  roundDone: boolean
}

type Snapshot = { session: Session; stats: State['stats']; log: State['log'] }

export function Study() {
  const session = useStore((s) => s.session)
  const autoSpeak = useStore((s) => s.settings.autoSpeak)
  const marks = useStore((s) => s.marks)
  const [finished, setFinished] = useState<Finished | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [missed, setMissed] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [showAi, setShowAi] = useState(false)
  const undo = useRef<Snapshot | null>(null)
  const { words, error } = useLevel(session?.level ?? finished?.level ?? null)

  const idx = session?.queue[0]
  const word = words && idx != null ? words[idx] : null
  const cardKey = session ? `${session.pass}:${session.queue.length}:${idx}` : ''

  useEffect(() => {
    setRevealed(false)
    setMissed(false)
    setShowAi(false)
  }, [cardKey])

  useEffect(() => {
    if (autoSpeak && word) speak(word.r || word.w)
  }, [autoSpeak, word])

  useEffect(() => {
    if (!session && !finished) go('/')
  }, [session, finished])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 2200)
    return () => clearTimeout(t)
  }, [notice])

  const submit = useCallback(
    (known: boolean) => {
      const s = getState()
      if (!s.session) return
      const before = s.session
      undo.current = { session: before, stats: s.stats, log: s.log }
      const roundBefore = s.levels[before.level].round
      const result = answer(known)
      if (result === 'pass') {
        const next = getState().session!
        setNotice(`${before.pass}바퀴 끝! 다시 볼 단어 ${next.queue.length}개`)
      } else if (result === 'done') {
        undo.current = null
        setFinished({
          level: before.level,
          stage: before.stage,
          total: before.total,
          pass: before.pass,
          roundDone: getState().levels[before.level].round > roundBefore,
        })
      }
    },
    [],
  )

  const onAgain = useCallback(() => {
    // Not knowing a word should always end with seeing the answer first.
    if (!revealed) {
      setRevealed(true)
      setMissed(true)
    } else submit(false)
  }, [revealed, submit])

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (finished || !word || (e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (missed) submit(false)
        else setRevealed((r) => !r)
      } else if (e.key === 'ArrowRight' && !missed) submit(true)
      else if (e.key === 'ArrowLeft') onAgain()
    }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }, [finished, word, missed, submit, onAgain])

  if (finished) {
    const last = finished.stage + 1 >= stageCount(finished.level)
    return (
      <div className="study done-screen">
        <div className="done-art" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <h1>{finished.roundDone ? `N${finished.level} 1회독 완료!` : `${finished.stage + 1}장, 한 겹 쌓았어요`}</h1>
        <p className="muted">
          {finished.total}개 단어를 {finished.pass}바퀴 만에 모두 “알아요”로 만들었어요.
          {finished.roundDone && <><br />이제 1장부터 다음 회독이 시작돼요. 이번엔 훨씬 빨라요.</>}
        </p>
        <div className="done-actions">
          <button
            className="btn primary big"
            onClick={() => {
              const lv = getState().levels[finished.level]
              startStage(finished.level, finished.roundDone || last ? lv.done : finished.stage + 1)
              setFinished(null)
            }}
          >
            다음 장 계속하기
          </button>
          <button className="btn ghost big" onClick={() => go('/')}>
            오늘은 여기까지
          </button>
        </div>
      </div>
    )
  }

  if (!session) return null

  const left = session.queue.length + session.again.length
  const isNew = idx != null && Math.floor(idx / 50) === session.stage
  const marked = word ? marks.includes(word.id) : false

  return (
    <div className="study">
      <header className="study-top">
        <button className="icon-btn" onClick={() => go('/')} aria-label="나가기 (진행 상황은 저장돼요)">
          <Icon name="close" />
        </button>
        <div className="study-title">
          <b>
            N{session.level} · {session.stage + 1}장
          </b>
          <span>
            {session.pass}바퀴째 · 남은 {session.queue.length}장
            {session.again.length > 0 && ` · 다시 볼 단어 ${session.again.length}`}
          </span>
        </div>
        <button
          className="icon-btn"
          disabled={!undo.current}
          onClick={() => {
            if (undo.current) restoreSession(undo.current)
            undo.current = null
          }}
          aria-label="방금 선택 되돌리기"
        >
          <Icon name="undo" />
        </button>
      </header>
      <div className="bar thin">
        <i style={{ width: `${((session.total - left) / session.total) * 100}%` }} />
      </div>

      {notice && <div className="toast">{notice}</div>}

      <div className="card-area">
        {error && <p className="error">{error}</p>}
        {word && (
          <div className={`flash ${revealed ? 'open' : ''}`} key={cardKey} onClick={() => !revealed && setRevealed(true)}>
            <div className="flash-head">
              <span className={`chip ${isNew ? 'accent' : ''}`}>{isNew ? '새 단어' : '복습'}</span>
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
              >
                <Icon name="mark" fill={marked} />
              </button>
            </div>
            <div className="flash-body">
              <p lang="ja" className={`flash-word ${word.w.length > 6 ? 'long' : ''}`}>
                {word.w}
              </p>
              {revealed ? (
                <div className="flash-answer">
                  {word.r && (
                    <p lang="ja" className="flash-reading">
                      {word.r}
                    </p>
                  )}
                  <p className="flash-meaning">{meaning(word)}</p>
                  {showAi ? (
                    <AiExplain word={word} />
                  ) : (
                    <button className="link" onClick={() => setShowAi(true)}>
                      <Icon name="spark" size={16} /> AI 설명 보기
                    </button>
                  )}
                </div>
              ) : (
                <p className="flash-hint">탭해서 뜻 확인</p>
              )}
            </div>
          </div>
        )}
      </div>

      <footer className="answer-bar">
        {missed ? (
          <button className="btn again big wide" onClick={() => submit(false)}>
            확인했어요 · 다음
          </button>
        ) : (
          <>
            <button className="btn again big" onClick={onAgain} disabled={!word}>
              다시 볼게요
            </button>
            <button className="btn know big" onClick={() => submit(true)} disabled={!word}>
              알아요
            </button>
          </>
        )}
      </footer>
    </div>
  )
}
