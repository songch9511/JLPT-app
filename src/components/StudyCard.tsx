// The parts of a study card shared by the card to answer (screens/Study.tsx) and an earlier card of the session
// (PastCard.tsx): the word card and the kanji card. docs/design-system.md §3 "학습 카드".
//
// Nothing on a card moves when something opens: every slot (the reading above the headword, the meaning under it, the
// example's translation, the kanji chips; on a kanji card its 훈음, its readings, the words' readings and meanings) is
// always laid out and only becomes visible (`.slot.on`). A closed slot is empty to the eye and to screen readers
// (visibility) and keeps its room. Nothing on the card opens on a tap but the two toggles and the bookmark.
import { useState, type MouseEvent, type ReactNode } from 'react'
import { meaning, wordById, type Level, type Word } from '../data'
import type { Example } from '../examples'
import { alignReading, hunEum, kanjiInfo, kunParts, toHiragana, useKanji, type Kanji } from '../kanji'
import { kanjiParts } from '../sound'
import { ExampleSentence } from './Example'
import { Icon } from './Icon'
import { LevelBadge } from './LevelBadge'
import { IconButton, Meta } from './ui'
import { FalseFriend } from './WordNotes'

const stop = (fn: () => void) => (e: MouseEvent) => {
  e.stopPropagation()
  fn()
}

/** The card's top line: the level in its colour and the card's facts ("복습 · 1번 잊음"), then the bookmark. */
export function CardHead({ level, items, marked, onMark }: { level: Level; items: (string | false | null | undefined)[]; marked: boolean; onMark: () => void }) {
  return (
    <div className="flash-head">
      <span className="flash-status grow">
        <LevelBadge level={level} />
        <Meta className="flash-meta" items={items} />
      </span>
      <IconButton label="북마크" className={marked ? 'marked' : undefined} aria-pressed={marked} icon={<Icon name="mark" fill={marked} />} onClick={stop(onMark)} />
    </div>
  )
}

/** The headword, in the textbook hand: plain text (a tap on it does nothing). */
export function Headword({ word }: { word: Word }) {
  return (
    <p lang="ja" className={`flash-word ${word.w.length > 6 ? 'long' : word.w.length > 3 ? 'mid' : ''}`}>
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

const isHan = (c: string) => /\p{Script=Han}/u.test(c) && c !== '々'

/**
 * A word's kanji, one chip each: the kanji, its Korean 음 (with 의미) and its Japanese reading in this word (with
 * 히라가나). The Korean reading is the word's own where its kanji pair one to one with its Korean reading (sound.ts
 * kanjiParts), else the kanji's 음; the Japanese one is the word's reading cut per kanji, left out when it cannot be
 * cut safely.
 */
export function wordKanji(word: Pick<Word, 'w' | 'r' | 'sk' | 'rt' | 'a'>, info: (k: string) => Kanji | null): { kanji: string; ko: string; ja: string }[] {
  const form = word.w.split(/[;；]/)[0].trim()
  const chars = [...form].filter(isHan)
  if (!chars.length) return []
  const parts = kanjiParts(word)
  if (parts.length === chars.length) return parts
  const cut = word.r ? alignReading(form.replace(/[～〜~]/g, ''), word.r.split(/[;；]/)[0].trim(), info) : null
  const forms = [...form.replace(/[～〜~]/g, '')]
  const jaOf = new Map<number, string>()
  if (cut) forms.forEach((c, i) => isHan(c) && jaOf.set(i, cut[i]))
  const out: { kanji: string; ko: string; ja: string }[] = []
  forms.forEach((c, i) => {
    if (isHan(c)) out.push({ kanji: c, ko: info(c)?.eum ?? '', ja: jaOf.get(i) ?? '' })
  })
  return out
}

/** The kanji chips of a word card: the row keeps its room and is empty while both toggles are closed. */
export function KanjiRow({ word, ko, ja }: { word: Word; ko: boolean; ja: boolean }) {
  const all = useKanji()
  const parts = all ? wordKanji(word, (k) => all.get(k) ?? null) : []
  if (!parts.length) return null
  return (
    <div className={`slot kanji-row ${ko || ja ? 'on' : ''}`} role="group" aria-label="한자">
      {parts.map((p, i) => (
        <span key={i} className="kanji-chip">
          <span lang="ja" className="kanji-char">
            {p.kanji}
          </span>
          <span className="kanji-readings">
            {p.ko && (
              <span className={`slot kanji-ko ${ko ? 'on' : ''}`} lang="ko">
                {p.ko}
              </span>
            )}
            {p.ja && (
              <span className={`slot kanji-ja ${ja ? 'on' : ''}`} lang="ja">
                {p.ja}
              </span>
            )}
          </span>
        </span>
      ))}
    </div>
  )
}

/**
 * A word card's centre: the reading's slot above the headword, the meaning's slot under it (with the false-friend
 * warning, the one word-type note a card shows), the example and its translation's line, then the kanji chips.
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

/** A kun'yomi with its okurigana lighter: "へ<る>". */
export function Kun({ kun }: { kun: string }) {
  const [stem, oku] = kunParts(kun)
  return (
    <>
      {stem}
      {oku && <span className="okurigana">{oku}</span>}
    </>
  )
}

/** The readings of a kanji, at most this many of each kind. */
const MAX_READINGS = 4

/** 음독 · 훈독 as two labelled lines (a line without readings is left out). */
export function KanjiReadings({ kanji, hiragana = true }: { kanji: Kanji; hiragana?: boolean }) {
  const on = kanji.on.slice(0, MAX_READINGS)
  const kun = kanji.kun.slice(0, MAX_READINGS)
  return (
    <div className="kanji-yomi">
      {on.length > 0 && (
        <p>
          <span className="yomi-label">음독</span>
          <span lang="ja">{on.map((r) => (hiragana ? toHiragana(r) : r)).join(' · ')}</span>
        </p>
      )}
      {kun.length > 0 && (
        <p>
          <span className="yomi-label">훈독</span>
          <span lang="ja">
            {kun.map((r, i) => (
              <span key={i}>
                {i > 0 && ' · '}
                <Kun kun={r} />
              </span>
            ))}
          </span>
        </p>
      )}
    </div>
  )
}

/** Words of a kanji shown per page on its card. */
const PAGE = 3

/**
 * A kanji card's centre: the kanji, its 훈음 (의미), its on and kun readings (히라가나), then the words that contain
 * it, three at a time: each word with its level, its reading (히라가나) and its meaning (의미).
 */
export function KanjiFace({ kanji, kana, meaningOpen }: { kanji: Kanji; kana: boolean; meaningOpen: boolean }) {
  const [page, setPage] = useState(0)
  const words = kanji.words.map((id) => wordById(id)).filter((w): w is Word => !!w)
  const pages = Math.max(1, Math.ceil(words.length / PAGE))
  const at = Math.min(page, pages - 1)
  return (
    <CardScroll>
      <div className="flash-body kanji-body">
        <p lang="ja" className="flash-kanji">
          {kanji.k}
        </p>
        <Slot on={meaningOpen} className="flash-meaning-slot">
          <p className="flash-meaning">{hunEum(kanji) || ' '}</p>
        </Slot>
        <Slot on={kana} className="kanji-yomi-slot">
          <KanjiReadings kanji={kanji} />
        </Slot>
        {words.length > 0 && (
          <div className="kanji-words" role="group" aria-label={`이 한자가 든 단어 ${words.length}개`}>
            <div className="kanji-words-head">
              <span>단어 {words.length}</span>
              {pages > 1 && (
                <span className="pager">
                  <IconButton label="이전 단어" className="pager-btn" icon={<Icon name="back" size={16} />} isDisabled={at === 0} onClick={stop(() => setPage(at - 1))} />
                  <span className="num-plain">
                    {at + 1} / {pages}
                  </span>
                  <IconButton label="다음 단어" className="pager-btn" icon={<Icon name="chevron" size={16} />} isDisabled={at >= pages - 1} onClick={stop(() => setPage(at + 1))} />
                </span>
              )}
            </div>
            {words.slice(at * PAGE, at * PAGE + PAGE).map((w) => (
              <div key={w.id} className="kanji-word">
                <LevelBadge level={w.level} className="sm" />
                <span lang="ja" className="kw-word">
                  {w.w}
                </span>
                <span lang="ja" className={`slot kw-reading ${kana ? 'on' : ''}`}>
                  {w.r}
                </span>
                <span className={`slot kw-meaning ${meaningOpen ? 'on' : ''}`}>{meaning(w)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </CardScroll>
  )
}

/** The kanji of a card id once the kanji file has loaded (null before). */
export function useKanjiOf(id: string | null | undefined): Kanji | null {
  const all = useKanji(!!id)
  return id && all ? (kanjiInfo(id) ?? null) : null
}

/**
 * The card's middle, between its head and its toggles: it scrolls by itself when the card is taller than its room
 * (320px, the largest text sizes), so the head, the toggles and the answer bar stay where they are. Its content is
 * centred while it fits and starts at the top when it does not (auto margins: never cut off above).
 */
export function CardScroll({ children }: { children: ReactNode }) {
  // focusable, so the keyboard can scroll it when it is taller than its room
  return (
    <div className="flash-scroll" tabIndex={0}>
      {children}
    </div>
  )
}
