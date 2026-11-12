import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { go } from '../App'
import { Icon } from '../components/Icon'
import { AiExplain } from '../components/WordSheet'
import { levelOf, meaning, useLevel } from '../data'
import { answer, breakdowns, buildQueue, previewIntervals, Rating, restore, snapshot, unlockMoreNew, type Grade, type Snapshot } from '../srs'
import { toggleMark, useStore } from '../store'
import { speak } from '../util'

const KIND_LABEL = { new: '새 단어', learning: '외우는 중', review: '복습' } as const

export function Study() {
  const s = useStore((x) => x)
  const [revealed, setRevealed] = useState(false)
  const [missed, setMissed] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [answered, setAnswered] = useState(0)
  const [last, setLast] = useState<string | undefined>()
  const undo = useRef<Snapshot | null>(null)

  // Recomputed after every answer; `now` is taken then so waiting cards become due as time passes.
  const { q, now } = useMemo(() => {
    const now = new Date()
    return { q: buildQueue(s, now, last), now }
  }, [s, last])
  const id = q.next?.id
  const { words, error } = useLevel(id ? levelOf(id) : null)
  const word = words && id ? words[Number(id.split('-')[1])] : null
  const intervals = useMemo(() => (id ? previewIntervals(s, id, now) : null), [s, id, now])
  const cardKey = `${id}:${answered}`

  useEffect(() => {
    setRevealed(false)
    setMissed(false)
    setShowAi(false)
  }, [cardKey])

  useEffect(() => {
    if (s.settings.autoSpeak && word) speak(word.r || word.w)
  }, [s.settings.autoSpeak, word])

  const submit = useCallback(
    (grade: Grade) => {
      if (!id) return
      undo.current = snapshot()
      answer(id, grade)
      setLast(id)
      setAnswered((n) => n + 1)
    },
    [id],
  )

  const onAgain = useCallback(() => {
    // Forgetting a word should always end with seeing the answer first.
    if (!revealed) {
      setRevealed(true)
      setMissed(true)
    } else submit(Rating.Again)
  }, [revealed, submit])

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!word) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (missed) submit(Rating.Again)
        else setRevealed((r) => !r)
      } else if (e.key === 'ArrowRight' && !missed) submit(Rating.Good)
      else if (e.key === 'ArrowUp' && !missed) submit(Rating.Easy)
      else if (e.key === 'ArrowLeft') onAgain()
    }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }, [word, missed, submit, onAgain])

  if (!q.next) {
    const moreNew = breakdowns(s)[s.settings.target].new > 0
    return (
      <div className="study done-screen">
        <div className="done-art" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <h1>오늘 분량 끝!</h1>
        <p className="muted">
          {answered > 0 && <>이번에 카드 {answered}장을 넘겼어요. </>}
          {q.waiting > 0
            ? `외우는 중인 ${q.waiting}개는 조금 뒤에 다시 나와요.`
            : '기억이 흐려질 때쯤 알아서 다시 가져올게요.'}
        </p>
        <div className="done-actions">
          <button className="btn primary big" onClick={() => go('/')}>
            홈으로
          </button>
          {moreNew && (
            <button className="btn ghost big" onClick={() => unlockMoreNew(10)}>
              새 단어 10개 더 하기
            </button>
          )}
        </div>
      </div>
    )
  }

  const left = q.learning + q.review + q.fresh
  const marked = word ? s.marks.includes(word.id) : false

  return (
    <div className="study">
      <header className="study-top">
        <button className="icon-btn" onClick={() => go('/')} aria-label="나가기 (진행 상황은 저장돼요)">
          <Icon name="close" />
        </button>
        <div className="study-title">
          <b>오늘의 학습</b>
          <div className="counts">
            <span className="c-review">복습 {q.review}</span>
            <span className="c-learning">외우는 중 {q.learning}</span>
            <span className="c-new">새 단어 {q.fresh}</span>
          </div>
        </div>
        <button
          className="icon-btn"
          disabled={!undo.current}
          onClick={() => {
            if (!undo.current) return
            restore(undo.current)
            undo.current = null
            setLast(undefined)
            setAnswered((n) => Math.max(0, n - 1))
          }}
          aria-label="방금 선택 되돌리기"
        >
          <Icon name="undo" />
        </button>
      </header>
      <div className="bar thin">
        <i style={{ width: `${(answered / (answered + left)) * 100}%` }} />
      </div>

      <div className="card-area">
        {error && <p className="error">{error}</p>}
        {word && (
          <div className={`flash ${revealed ? 'open' : ''}`} key={cardKey} onClick={() => !revealed && setRevealed(true)}>
            <div className="flash-head">
              <span className={`chip k-${q.next.kind}`}>{KIND_LABEL[q.next.kind]}</span>
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
                <p className="flash-hint">떠올려 본 뒤 탭해서 확인</p>
              )}
            </div>
          </div>
        )}
      </div>

      <footer className={`answer-bar ${missed ? '' : 'three'}`}>
        {missed ? (
          <button className="btn again big wide" onClick={() => submit(Rating.Again)}>
            확인했어요 · 다음
          </button>
        ) : (
          <>
            <button className="btn again big" onClick={onAgain} disabled={!word}>
              모르겠어요
              <small>{intervals?.[Rating.Again]}</small>
            </button>
            <button className="btn know big" onClick={() => submit(Rating.Good)} disabled={!word}>
              알아요
              <small>{intervals?.[Rating.Good]}</small>
            </button>
            <button className="btn easy big" onClick={() => submit(Rating.Easy)} disabled={!word}>
              쉬워요
              <small>{intervals?.[Rating.Easy]}</small>
            </button>
          </>
        )}
      </footer>
    </div>
  )
}
