import { useEffect } from 'react'
import { meaning, readingId, type Word } from '../data'
import { formatInterval, STAGE_LABEL, wordCards, wordLapses, wordStage } from '../srs'
import { toggleMark, useStore } from '../store'
import { speak } from '../util'
import { Icon } from './Icon'
import { FalseFriend, SoundHints, TypeLine } from './WordNotes'

export function WordSheet({ word, onClose }: { word: Word; onClose: () => void }) {
  const marked = useStore((s) => s.marks.includes(word.id))
  const cards = useStore((s) => s.cards)
  const fastTrack = useStore((s) => s.settings.fastTrack)
  const st = { cards, settings: { fastTrack } }
  const stage = wordStage(st, word.id)
  // the card that comes back first speaks for the word; a reading card is named as such
  const next = wordCards(st, word.id).sort((a, b) => a.card.due - b.card.due)[0]
  const lapses = wordLapses(st, word.id)

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
          <span className="muted small">
            {STAGE_LABEL[stage]}
            {next && ` · ${next.id === readingId(word.id) ? '읽기 ' : ''}다음 복습 ${next.card.due <= Date.now() ? '지금' : formatInterval(next.card.due - Date.now()) + ' 뒤'}`}
            {lapses > 0 && ` · ${lapses}번 잊음`}
          </span>
          <span className="grow" />
          <button className="icon-btn" onClick={() => speak(word.r || word.w)} aria-label="발음 듣기">
            <Icon name="speaker" />
          </button>
          <button className={`icon-btn ${marked ? 'marked' : ''}`} onClick={() => toggleMark(word.id)} aria-label="북마크" aria-pressed={marked}>
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
        <div className="sheet-notes">
          <FalseFriend word={word} />
          <TypeLine word={word} />
          <SoundHints word={word} />
        </div>
      </div>
    </div>
  )
}
