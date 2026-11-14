import { useEffect, useState } from 'react'
// with the extension: the dev tools in scripts/ run this module directly under node --experimental-strip-types
import { COUNTS as ID_COUNTS, idsOfLevel, levelOfId } from './ids.ts'

export type Level = 5 | 4 | 3 | 2 | 1
export const LEVELS: Level[] = [5, 4, 3, 2, 1]

/** Word counts per level (from the generated id table, written by the same build as public/data). */
export const COUNTS: Record<Level, number> = ID_COUNTS

/**
 * Word type relative to Korean (docs/plan/08 §3, data/tags/LABELLING.md): S same hanja word and meaning,
 * F false friend, J Japanese Sino word, N native (kun), M mixed, L loanword, K kana word; '' unlabelled.
 */
export type WordType = 'S' | 'F' | 'J' | 'N' | 'M' | 'L' | 'K' | ''
export const WORD_TYPES = ['S', 'F', 'J', 'N', 'M', 'L', 'K'] as const
export const TYPE_LABEL: Record<Exclude<WordType, ''>, string> = {
  S: '한자어 · 뜻이 같아요',
  F: '한자어 · 뜻이 달라요',
  J: '일본 한자어',
  N: '고유어',
  M: '섞인 말',
  L: '외래어',
  K: '가나 말',
}

export interface Word {
  /** stable word id (`w0k3`, src/ids.ts); never derived from the word's position */
  id: string
  level: Level
  /** row position in the level's data file; means nothing beyond that file (never an identity) */
  idx: number
  w: string
  /** reading; empty when the word is already kana */
  r: string
  ko: string
  en: string
  /** introduction order within the level, 0 first (frequency order; falls back to idx) */
  o: number
  /** frequency, round(Zipf × 10); 0 when unknown */
  f: number
  k: WordType
  /** Korean hanja reading (産業 → 산업) for S/F/J, sometimes N/M; '' otherwise */
  sk: string
  /** for k=F: how the meaning differs from the Korean word */
  ff: string
  /** reading type: on / kun / mix / irr ('' for kana words) */
  rt: string
  /** for on-read Sino words: the reading cut per kanji ("さん|ぎょう"), '' when not known for sure */
  a: string
  /** for reading-card words: other readings the dictionary gives the written form, space-separated ('' if none) */
  x?: string
}

export const meaning = (w: Word) => w.ko || w.en
/** The level of a word or card id; undefined for an id this version does not know (store.ts keeps those apart). */
export const levelOf = (id: string): Level | undefined => levelOfId(id)

/**
 * Card ids (03 §3 C): the meaning card keeps the word id (`w0k3`); the reading card of the cognate fast-track is
 * `w0k3:r`. Each is its own FSRS card.
 */
export const READING = ':r'
export const readingId = (word: string) => word + READING
export const isReadingCard = (id: string) => id.endsWith(READING)
export const wordOfCard = (id: string) => {
  const i = id.indexOf(':')
  return i < 0 ? id : id.slice(0, i)
}

/** What the scheduler needs from a loaded level, kept here so queue building stays synchronous. */
export interface LevelInfo {
  /** word ids in introduction order */
  order: string[]
  /** ids of words tagged S (fast-track: reading card instead of meaning card) */
  fast: Set<string>
}
const infos = new Map<Level, LevelInfo>()
let infoVersion = 0
/** Introduction order and fast-track words of a level, once its data has loaded (null before). */
export const levelInfo = (l: Level): LevelInfo | null => infos.get(l) ?? null
/** Changes whenever a level's data is registered: results that depend on `levelInfo` are memoised on it. */
export const levelInfoVersion = () => infoVersion

export function setLevelInfo(l: Level, words: Pick<Word, 'id' | 'idx' | 'o' | 'k'>[]) {
  const order = words
    .slice()
    .sort((a, b) => a.o - b.o || a.idx - b.idx)
    .map((w) => w.id)
  infos.set(l, { order, fast: new Set(words.filter((w) => w.k === 'S').map((w) => w.id)) })
  infoVersion++
}

/**
 * Whether the loaded data says this word no longer takes a reading card: its level has loaded and the word is not
 * tagged S (any more — tags are corrected, docs/plan/12). A reading card learned while it was S then rests like
 * one with the fast-track off: kept, not shown, not counted, and the word is introduced with its meaning card.
 * False until the level's data has loaded (nothing is known yet, so the card is left as it is).
 */
export const readingRetired = (word: string): boolean => {
  const l = levelOf(word)
  const info = l === undefined ? null : levelInfo(l)
  return !!info && !info.fast.has(word)
}

/** A row of public/data/words-n{l}.json (scripts/build-data.mjs): the stable id, then the word's columns. */
export type Row = [string, string, string, string, string, number?, number?, string?, string?, string?, string?, string?, string?]
const TYPES = new Set<string>(WORD_TYPES)

/** One data row as a Word. Rows without the extra columns get file order and no type. */
export function parseRow(l: Level, row: Row, idx: number): Word {
  const [id, w, r, ko, en, o, f, k = '', sk = '', ff = '', rt = '', a = '', x = ''] = row
  return {
    id,
    level: l,
    idx,
    w,
    r,
    ko,
    en,
    o: typeof o === 'number' ? o : idx,
    f: typeof f === 'number' ? f : 0,
    k: (TYPES.has(k) ? k : '') as WordType,
    sk,
    ff,
    rt,
    a,
    x,
  }
}

const cache = new Map<Level, Promise<Word[]>>()
const index = new Map<string, Word>()
/** A loaded word by its word id (or a card id of it); null until its level's data has loaded. */
export const wordById = (id: string): Word | null => index.get(wordOfCard(id)) ?? null

/** Ids of a level in the data's order before its data has loaded (issue order = the positional order of old). */
export const fallbackOrder = (l: Level) => idsOfLevel(l)

export function loadLevel(l: Level): Promise<Word[]> {
  let p = cache.get(l)
  if (!p) {
    // words-n{l}.json carries the stable ids; data/n{l}.json is the frozen positional file kept for tabs still
    // running the version before stable ids (docs/plan/08 §7.6) and is never read by this version
    p = fetch(`${import.meta.env.BASE_URL}data/words-n${l}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`단어 데이터를 불러오지 못했어요 (N${l})`)
        return r.json() as Promise<Row[]>
      })
      .then((rows) => {
        // a row whose id this version does not place in this level (data from another deploy) is left out
        const words = rows.map((row, idx) => parseRow(l, row, idx)).filter((w) => levelOfId(w.id) === l)
        words.forEach((w, i) => (w.idx = i))
        // a file whose `o` is not a permutation (a partial or old file) falls back to idx order
        const os = new Set(words.map((w) => w.o))
        if (os.size !== words.length || words.some((w) => w.o < 0 || w.o >= words.length)) words.forEach((w) => (w.o = w.idx))
        setLevelInfo(l, words)
        for (const w of words) index.set(w.id, w)
        return words
      })
    p.catch(() => cache.delete(l))
    cache.set(l, p)
  }
  return p
}

/** All the given levels loaded (so the queue knows their order and fast-track words), or an error. */
export function useLevels(ls: Level[]): { ready: boolean; error: string | null; retry: () => void } {
  const key = ls.join(',')
  const [res, setRes] = useState<{ key: string; ready: boolean; error: string | null }>({ key, ready: false, error: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    Promise.all(key.split(',').filter(Boolean).map((l) => loadLevel(Number(l) as Level))).then(
      () => live && setRes({ key, ready: true, error: null }),
      (e: Error) => live && setRes({ key, ready: false, error: e.message }),
    )
    return () => {
      live = false
    }
  }, [key, attempt])
  const cur = res.key === key ? res : { ready: false, error: null }
  return {
    ready: cur.ready,
    error: cur.error,
    // loading again: the error goes while it does (a failed level is not cached, so it is fetched again)
    retry: () => {
      setRes({ key, ready: false, error: null })
      setAttempt((n) => n + 1)
    },
  }
}

/** `attempt` changes to load again after a failure. */
export function useLevel(l: Level | null, attempt = 0): { words: Word[] | null; error: string | null } {
  const [res, setRes] = useState<{ l: Level | null; words: Word[] | null; error: string | null }>({
    l,
    words: null,
    error: null,
  })
  useEffect(() => {
    if (l == null) return
    let live = true
    loadLevel(l).then(
      (words) => live && setRes({ l, words, error: null }),
      (e: Error) => live && setRes({ l, words: null, error: e.message }),
    )
    return () => {
      live = false
    }
  }, [l, attempt])
  return res.l === l ? res : { words: null, error: null }
}

/** Every level's words; `enabled` false waits (nothing is fetched or parsed until needed). */
export function useAllWords(enabled = true): Word[] | null {
  const [words, setWords] = useState<Word[] | null>(null)
  useEffect(() => {
    if (!enabled) return
    let live = true
    Promise.all(LEVELS.map(loadLevel)).then((all) => live && setWords(all.flat()), () => {})
    return () => {
      live = false
    }
  }, [enabled])
  return enabled ? words : null
}

export async function wordsById(ids: string[]): Promise<Word[]> {
  const out: Word[] = []
  for (const id of ids) {
    const l = levelOf(id)
    if (l === undefined) continue
    await loadLevel(l)
    const w = wordById(id)
    if (w) out.push(w)
  }
  return out
}
