import { useRef } from 'react'
import { meaning, readingId, type Word } from '../data'
import { formatInterval, STAGE_LABEL, wordCards, wordLapses, wordStage } from '../srs'
import { toggleMark, useStore } from '../store'
import { speak } from '../util'
import { Icon } from './Icon'
import { Badge, IconButton, Sheet } from './ui'
import { FalseFriend, SoundHints, TypeLine } from './WordNotes'

/**
 * A word's details in a bottom sheet. Pass `word={null}` to close: the sheet stays mounted for its exit motion and
 * returns focus to the row that opened it. Escape, the scrim, a downward swipe and the close button all close it.
 */
export function WordSheet({ word, onClose }: { word: Word | null; onClose: () => void }) {
  // the last word shown, so the sheet keeps its content while it slides away
  const last = useRef<Word | null>(null)
  if (word) last.current = word
  const w = last.current
  return (
    <Sheet isOpen={!!word} onClose={onClose} label={w ? `${w.w} 단어 정보` : '단어 정보'}>
      {w && <WordDetails word={w} onClose={onClose} />}
    </Sheet>
  )
}

function WordDetails({ word, onClose }: { word: Word; onClose: () => void }) {
  const marked = useStore((s) => s.marks.includes(word.id))
  const cards = useStore((s) => s.cards)
  const fastTrack = useStore((s) => s.settings.fastTrack)
  const st = { cards, settings: { fastTrack } }
  const stage = wordStage(st, word.id)
  // the card that comes back first speaks for the word; a reading card is named as such
  const next = wordCards(st, word.id).sort((a, b) => a.card.due - b.card.due)[0]
  const lapses = wordLapses(st, word.id)

  return (
    <div className="sheet">
      <div className="sheet-head">
        <Badge label={`N${word.level}`} />
        <span className="grow" />
        <IconButton label="닫기" icon={<Icon name="close" />} onClick={onClose} />
      </div>
      <div className="sheet-title">
        <p lang="ja" className="sheet-word">
          {word.w}
        </p>
        <span className="grow" />
        <IconButton label="발음 듣기" icon={<Icon name="speaker" />} onClick={() => speak(word.r || word.w)} />
        <IconButton
          label="북마크"
         
          className={marked ? 'marked' : undefined}
          aria-pressed={marked}
          icon={<Icon name="mark" fill={marked} />}
          onClick={() => toggleMark(word.id)}
        />
      </div>
      {word.r && (
        <p lang="ja" className="sheet-reading">
          {word.r}
        </p>
      )}
      <p className="sheet-meaning">{meaning(word)}</p>
      {word.ko && <p className="hint">{word.en}</p>}
      <p className="sheet-status">
        {STAGE_LABEL[stage]}
        {next && ` · ${next.id === readingId(word.id) ? '읽기 ' : ''}다음 복습 ${next.card.due <= Date.now() ? '지금' : formatInterval(next.card.due - Date.now()) + ' 뒤'}`}
        {lapses > 0 && ` · ${lapses}번 잊음`}
      </p>
      <div className="sheet-notes">
        <FalseFriend word={word} />
        <TypeLine word={word} />
        <SoundHints word={word} />
      </div>
    </div>
  )
}
