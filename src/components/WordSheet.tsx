// A word's or a kanji's details in a bottom sheet (docs/design-system.md §3 "단어 정보", "한자 정보"). A kanji in a word
// opens that kanji's sheet in its place, and a word in a kanji's list that word's.
import { useEffect, useRef, useState } from 'react'
import { meaning, TYPE_LABEL, useLevels, wordById, LEVELS, levelOf, type Word } from '../data'
import { hunEum, kunText, useKanji, type Kanji } from '../kanji'
import { formatInterval, STAGE_LABEL, wordStage } from '../srs'
import { toggleMark, useStore, type State } from '../store'
import { parseDay, speak } from '../util'
import { Icon } from './Icon'
import { IconButton, Meta, Sheet } from './ui'
import { FalseFriend } from './WordNotes'
import { ExampleSentence } from './Example'
import { LevelBadge } from './LevelBadge'
import { useExample } from '../examples'
import { wordKanji } from './StudyCard'

export type Detail = { word: Word } | { kanji: Kanji }

/** "익히는 중 · 다음 복습 4일 뒤" for a word or a kanji. */
function status(s: Pick<State, 'cards'>, id: string): (string | false)[] {
  const card = s.cards[id]
  return [STAGE_LABEL[wordStage(s, id)], !!card && `다음 복습 ${card.due <= Date.now() ? '지금' : formatInterval(card.due - Date.now()) + ' 뒤'}`]
}

/** 본 횟수 · 잊은 횟수 · 처음 본 날, at the foot of a sheet (nothing for what was never studied). */
function Counts({ id }: { id: string }) {
  const card = useStore((s) => s.cards[id])
  const first = useStore((s) => s.first?.[id])
  if (!card) return null
  const d = first ? parseDay(first) : null
  return (
    <p className="sheet-counts">
      <span>본 횟수 {card.reps}</span>
      <span>잊은 횟수 {card.lapses}</span>
      {d && (
        <span>
          처음 본 날 {d.getMonth() + 1}월 {d.getDate()}일
        </span>
      )}
    </p>
  )
}

/**
 * The sheet. Pass `item={null}` to close: the sheet stays mounted for its exit motion and returns focus to the row
 * that opened it. Escape, the scrim, a downward swipe and the close button all close it.
 */
export function DetailSheet({ item, onClose }: { item: Detail | null; onClose: () => void }) {
  // what the sheet shows: the item it was opened with, or what was opened from inside it
  const [inner, setInner] = useState<Detail | null>(null)
  useEffect(() => setInner(null), [item])
  const shown = inner ?? item
  // the last thing shown, so the sheet keeps its content while it slides away
  const last = useRef<Detail | null>(null)
  if (shown) last.current = shown
  const d = last.current
  const label = !d ? '정보' : 'word' in d ? `${d.word.w} 단어 정보` : `${d.kanji.k} 한자 정보`
  return (
    <Sheet isOpen={!!item} onClose={onClose} label={label}>
      {d && ('word' in d ? <WordDetails key={d.word.id} word={d.word} onClose={onClose} onKanji={(kanji) => setInner({ kanji })} /> : <KanjiDetails key={d.kanji.id} kanji={d.kanji} onClose={onClose} onWord={(word) => setInner({ word })} />)}
    </Sheet>
  )
}

/** The word sheet alone (the 단어장 lists). */
export function WordSheet({ word, onClose }: { word: Word | null; onClose: () => void }) {
  return <DetailSheet item={word ? { word } : null} onClose={onClose} />
}

const SAME_TYPE: Partial<Record<Word['k'], string>> = { S: '한자어 · 같은 뜻', F: '한자어 · 다른 뜻' }

function WordDetails({ word, onClose, onKanji }: { word: Word; onClose: () => void; onKanji: (k: Kanji) => void }) {
  const marked = useStore((s) => s.marks.includes(word.id))
  const cards = useStore((s) => s.cards)
  const example = useExample(word.id)
  const all = useKanji()
  const parts = all ? wordKanji(word, (k) => all.get(k) ?? null) : []
  const type = word.k ? (SAME_TYPE[word.k] ?? TYPE_LABEL[word.k]) : ''

  return (
    <div className="sheet">
      <div className="sheet-head">
        <LevelBadge level={word.level} />
        <Meta className="sheet-status grow" items={status({ cards }, word.id)} />
        <IconButton label="닫기" icon={<Icon name="close" />} onClick={onClose} />
      </div>
      {/* the reading over the headword, as a textbook prints it; the two round buttons at the right */}
      <div className="sheet-title">
        <div className="sheet-headword grow">
          {word.r && (
            <p lang="ja" className="sheet-reading">
              {word.r}
            </p>
          )}
          <p lang="ja" className="sheet-word">
            {word.w}
          </p>
        </div>
        <IconButton label="발음 듣기" className="round" icon={<Icon name="speaker" />} onClick={() => speak(word.r || word.w)} />
        <IconButton label="북마크" className={marked ? 'round marked' : 'round'} aria-pressed={marked} icon={<Icon name="mark" fill={marked} />} onClick={() => toggleMark(word.id)} />
      </div>
      <p className="sheet-meaning">{meaning(word)}</p>
      {type && <p className="type-line">{type}</p>}
      <FalseFriend word={word} />
      {parts.length > 0 && (
        <>
          <h2 className="sheet-section">한자</h2>
          <div className="sheet-kanji">
            {parts.map((p, i) => {
              const k = all?.get(p.kanji)
              const body = (
                <>
                  <span lang="ja" className="sk-char">
                    {p.kanji}
                  </span>
                  <span className="sk-readings">
                    <b>{p.ko}</b>
                    {p.ja && <span lang="ja">{p.ja}</span>}
                  </span>
                </>
              )
              return k ? (
                <button key={i} type="button" className="sk-chip" aria-label={`${p.kanji} ${hunEum(k)} 한자 정보`} onClick={() => onKanji(k)}>
                  {body}
                </button>
              ) : (
                <span key={i} className="sk-chip">
                  {body}
                </span>
              )
            })}
          </div>
        </>
      )}
      {example && (
        <>
          <h2 className="sheet-section">예문</h2>
          <div className="sheet-example">
            <ExampleSentence example={example} headword={word.w} headwordReading translation />
          </div>
        </>
      )}
      <Counts id={word.id} />
    </div>
  )
}

function KanjiDetails({ kanji, onClose, onWord }: { kanji: Kanji; onClose: () => void; onWord: (w: Word) => void }) {
  const marked = useStore((s) => s.marks.includes(kanji.id))
  const cards = useStore((s) => s.cards)
  // the words that contain it, from every level they come from
  useLevels(LEVELS.filter((l) => kanji.words.some((id) => levelOf(id) === l)))
  const words = kanji.words.map((id) => wordById(id)).filter((w): w is Word => !!w)
  return (
    <div className="sheet">
      <div className="sheet-head">
        <LevelBadge level={kanji.level} />
        <Meta className="sheet-status grow" items={status({ cards }, kanji.id)} />
        <IconButton label="닫기" icon={<Icon name="close" />} onClick={onClose} />
      </div>
      <div className="sheet-title kanji-title">
        <p lang="ja" className="sheet-kanji-char">
          {kanji.k}
        </p>
        <p className="sheet-hun grow">{hunEum(kanji)}</p>
        <IconButton label="북마크" className={marked ? 'round marked' : 'round'} aria-pressed={marked} icon={<Icon name="mark" fill={marked} />} onClick={() => toggleMark(kanji.id)} />
      </div>
      <div className="sheet-yomi">
        {kanji.on.length > 0 && (
          <p>
            <span>음독</span>
            <span lang="ja">{kanji.on.join(' · ')}</span>
          </p>
        )}
        {kanji.kun.length > 0 && (
          <p>
            <span>훈독</span>
            <span lang="ja">{kanji.kun.slice(0, 6).map(kunText).join(' · ')}</span>
          </p>
        )}
      </div>
      {words.length > 0 && (
        <>
          <h2 className="sheet-section">이 한자가 든 단어</h2>
          <div className="sheet-words">
            {words.slice(0, 12).map((w) => (
              <button key={w.id} type="button" className="sheet-word-row" onClick={() => onWord(w)}>
                <span className="word-main">
                  <b lang="ja">{w.w}</b>
                  {w.r && <span lang="ja">{w.r}</span>}
                </span>
                <span className="word-meaning grow">{meaning(w)}</span>
                <Icon name="chevron" size={18} />
              </button>
            ))}
          </div>
        </>
      )}
      <Counts id={kanji.id} />
    </div>
  )
}
