// The parts of a study card shared by the card to answer (screens/Study.tsx) and an earlier card of the session
// (PastCard.tsx). docs/design-system.md §3 "학습 카드".
//
// Nothing on a card moves when something opens: the reading above the headword, the meaning under it, the example's
// translation and the kanji row are always laid out, and only become visible (`.slot.on`). A closed slot is empty to
// the eye and to screen readers (visibility) and keeps its room, so the headword and the example stay where they are.
// Nothing on the card opens on a tap but the two toggles, the speaker and the bookmark.
import type { MouseEvent, ReactNode } from 'react'
import type { Level, Word } from '../data'
import { meaning } from '../data'
import type { Example } from '../examples'
import { kanjiParts } from '../sound'
import { ExampleSentence } from './Example'
import { Icon } from './Icon'
import { LevelBadge } from './LevelBadge'
import { IconButton, Meta } from './ui'
import { FalseFriend } from './WordNotes'
import { speak } from '../util'

const stop = (fn: () => void) => (e: MouseEvent) => {
  e.stopPropagation()
  fn()
}

/** The card's top line: the level in its colour and the card's facts ("복습 · 1번 잊음"), then sound and bookmark. */
export function CardHead({ level, items, word, speakable = true, marked, onMark }: { level: Level; items: (string | false | null | undefined)[]; word: Word; speakable?: boolean; marked: boolean; onMark: () => void }) {
  return (
    <div className="flash-head">
      <span className="flash-status grow">
        <LevelBadge level={level} />
        <Meta className="flash-meta" items={items} />
      </span>
      {speakable && <IconButton label="발음 듣기" icon={<Icon name="speaker" />} onClick={stop(() => speak(word.r || word.w))} />}
      <IconButton label="북마크" className={marked ? 'marked' : undefined} aria-pressed={marked} icon={<Icon name="mark" fill={marked} />} onClick={stop(onMark)} />
    </div>
  )
}

/** The headword, in the textbook hand: plain text (a tap on it does nothing). */
export function Headword({ word }: { word: Word }) {
  return (
    <p lang="ja" className={`flash-word ${word.w.length > 6 ? 'long' : ''}`}>
      {word.w}
    </p>
  )
}

/** A slot whose room is kept while it is closed. */
export function Slot({ on, className, lang, children }: { on: boolean; className: string; lang?: string; children: ReactNode }) {
  return (
    <div className={`slot ${className} ${on ? 'on' : ''}`} lang={lang}>
      {children}
    </div>
  )
}

/**
 * One chip per kanji (only for words whose kanji pair one to one with their Korean and Japanese readings,
 * sound.ts kanjiParts): the kanji, its Korean reading with 의미, its Japanese reading with 히라가나. The row keeps its
 * room and is empty while both are closed.
 */
export function KanjiRow({ word, ko, ja }: { word: Word; ko: boolean; ja: boolean }) {
  const parts = kanjiParts(word)
  if (!parts.length) return null
  return (
    <div className={`slot kanji-row ${ko || ja ? 'on' : ''}`} role="group" aria-label="한자">
      {parts.map((p, i) => (
        <span key={i} className="kanji-chip">
          <span lang="ja" className="kanji-char">
            {p.kanji}
          </span>
          <span className="kanji-readings">
            <span className={`slot kanji-ko ${ko ? 'on' : ''}`} lang="ko">
              {p.ko}
            </span>
            <span className={`slot kanji-ja ${ja ? 'on' : ''}`} lang="ja">
              {p.ja}
            </span>
          </span>
        </span>
      ))}
    </div>
  )
}

/**
 * A meaning card's centre: the reading's slot above the headword, the meaning's slot under it (with the false-friend
 * warning, the one word-type note a card shows), the example and its translation's line, then the kanji row.
 * `kana`: the reading, the headword's own furigana in the example, the kanji's Japanese readings; `meaningOpen`: the
 * meaning, the example's translation, the kanji's Korean readings. Spacing separates them; no lines inside the card.
 */
export function MeaningFace({ word, example, kana, meaningOpen }: { word: Word; example: Example | null; kana: boolean; meaningOpen: boolean }) {
  return (
    <CardScroll>
      <div className="flash-body">
      <Slot on={kana} className="flash-reading" lang="ja">
        {word.r || ' '}
      </Slot>
      <Headword word={word} />
      <Slot on={meaningOpen} className="flash-meaning-slot">
        <p className="flash-meaning">{meaning(word)}</p>
        <FalseFriend word={word} />
      </Slot>
      {example && (
        <div className="flash-example">
          <ExampleSentence example={example} headword={word.w} headwordReading={kana} translation={meaningOpen} />
        </div>
      )}
      <KanjiRow word={word} ko={meaningOpen} ja={kana} />
      </div>
    </CardScroll>
  )
}

/**
 * The card's middle, between its head and its toggles: it scrolls by itself when the card is taller than its room
 * (320px, the largest text sizes), so the head, the toggles and the answer bar stay where they are. Its content is
 * centred while it fits and starts at the top when it does not (auto margins: never cut off above).
 */
export function CardScroll({ children }: { children: ReactNode }) {
  return <div className="flash-scroll">{children}</div>
}
