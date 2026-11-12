import { useEffect, useState } from 'react'
import { AiError, cachedExplain, explainWord, hasKey, type Explain } from '../ai'
import { meaning, type Word } from '../data'
import { toggleMark, useStore } from '../store'
import { speak } from '../util'
import { Icon } from './Icon'

export function AiExplain({ word }: { word: Word }) {
  const [data, setData] = useState<Explain | null>(() => cachedExplain(word.id))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(cachedExplain(word.id))
    setError(null)
    setBusy(false)
  }, [word.id])

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      setData(await explainWord(word))
    } catch (e) {
      setError(e instanceof AiError ? e.message : '알 수 없는 오류가 발생했어요.')
    } finally {
      setBusy(false)
    }
  }

  if (data)
    return (
      <div className="ai">
        {data.examples.map((ex, i) => (
          <div className="example" key={i}>
            <button className="icon-btn sm" onClick={() => speak(ex.ja)} aria-label="예문 듣기">
              <Icon name="speaker" size={18} />
            </button>
            <div>
              <p lang="ja" className="ja">
                {ex.ja}
              </p>
              <p lang="ja" className="kana">
                {ex.kana}
              </p>
              <p>{ex.ko}</p>
            </div>
          </div>
        ))}
        <dl>
          <dt>한자 풀이</dt>
          <dd>{data.kanji}</dd>
          <dt>암기 팁</dt>
          <dd>{data.tip}</dd>
          {data.related.length > 0 && (
            <>
              <dt>같이 외우기</dt>
              <dd>
                {data.related.map((r, i) => (
                  <span className="related" key={i}>
                    <b lang="ja">{r.word}</b> <span lang="ja">{r.kana}</span> · {r.ko}
                  </span>
                ))}
              </dd>
            </>
          )}
        </dl>
      </div>
    )

  return (
    <div className="ai">
      <button className="btn ghost" onClick={run} disabled={busy}>
        <Icon name="spark" size={18} />
        {busy ? 'AI가 설명을 쓰는 중…' : 'AI 예문 · 한자 풀이 · 암기 팁'}
      </button>
      {error && (
        <p className="error">
          {error} {!hasKey() && <a href="#/settings">설정으로</a>}
        </p>
      )}
    </div>
  )
}

export function WordSheet({ word, onClose }: { word: Word; onClose: () => void }) {
  const marked = useStore((s) => s.marks.includes(word.id))
  const stat = useStore((s) => s.stats[word.id])

  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }, [onClose])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <span className="chip">N{word.level}</span>
          {stat && (
            <span className="muted small">
              알아요 {stat[0]} · 다시 {stat[1]}
            </span>
          )}
          <span className="grow" />
          <button className="icon-btn" onClick={() => speak(word.r || word.w)} aria-label="발음 듣기">
            <Icon name="speaker" />
          </button>
          <button className={`icon-btn ${marked ? 'marked' : ''}`} onClick={() => toggleMark(word.id)} aria-label="북마크">
            <Icon name="mark" fill={marked} />
          </button>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <Icon name="close" />
          </button>
        </div>
        <p lang="ja" className="sheet-word">
          {word.w}
        </p>
        {word.r && (
          <p lang="ja" className="sheet-reading">
            {word.r}
          </p>
        )}
        <p className="sheet-meaning">{meaning(word)}</p>
        {word.ko && <p className="muted small">{word.en}</p>}
        <AiExplain word={word} />
      </div>
    </div>
  )
}
