import { useEffect, useState } from 'react'

export type Level = 5 | 4 | 3 | 2 | 1
export const LEVELS: Level[] = [5, 4, 3, 2, 1]

/** Word counts per level (kept in sync with public/data by scripts/build-data.mjs output). */
export const COUNTS: Record<Level, number> = { 5: 718, 4: 668, 3: 2140, 2: 1905, 1: 2699 }

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
  id: string
  level: Level
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
}

export const meaning = (w: Word) => w.ko || w.en
export const wordId = (l: Level, idx: number) => `${l}-${idx}`
export const levelOf = (id: string) => Number(id[0]) as Level

/**
 * Card ids (03 §3 C): the meaning card keeps the word id `<level>-<idx>`; the reading card of the cognate
 * fast-track is `<level>-<idx>:r`. Each is its own FSRS card.
 */
export const READING = ':r'
export const readingId = (word: string) => word + READING
export const isReadingCard = (id: string) => id.endsWith(READING)
export const wordOfCard = (id: string) => {
  const i = id.indexOf(':')
  return i < 0 ? id : id.slice(0, i)
}
export const idxOf = (id: string) => Number(wordOfCard(id).split('-')[1])

/** What the scheduler needs from a loaded level, kept here so queue building stays synchronous. */
export interface LevelInfo {
  /** idx in introduction order */
  order: number[]
  /** idx of words tagged S (fast-track: reading card instead of meaning card) */
  fast: Set<number>
}
const infos = new Map<Level, LevelInfo>()
/** Introduction order and fast-track words of a level, once its data has loaded (null before). */
export const levelInfo = (l: Level): LevelInfo | null => infos.get(l) ?? null

export function setLevelInfo(l: Level, words: Pick<Word, 'idx' | 'o' | 'k'>[]) {
  const order = words.map((w) => w.idx).sort((a, b) => words[a].o - words[b].o || a - b)
  infos.set(l, { order, fast: new Set(words.filter((w) => w.k === 'S').map((w) => w.idx)) })
}

type Row = [string, string, string, string, number?, number?, string?, string?, string?, string?, string?]
const TYPES = new Set<string>(WORD_TYPES)

/** One data row as a Word. Rows from before the extra columns (or a cached old file) get idx order and no type. */
export function parseRow(l: Level, row: Row, idx: number): Word {
  const [w, r, ko, en, o, f, k = '', sk = '', ff = '', rt = '', a = ''] = row
  return {
    id: wordId(l, idx),
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
  }
}

const cache = new Map<Level, Promise<Word[]>>()

export function loadLevel(l: Level): Promise<Word[]> {
  let p = cache.get(l)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/n${l}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`단어 데이터를 불러오지 못했어요 (N${l})`)
        return r.json() as Promise<Row[]>
      })
      .then((rows) => {
        const words = rows.map((row, idx) => parseRow(l, row, idx))
        // a file whose `o` is not a permutation (a partial or old file) falls back to idx order
        const os = new Set(words.map((w) => w.o))
        if (os.size !== words.length || words.some((w) => w.o < 0 || w.o >= words.length)) words.forEach((w) => (w.o = w.idx))
        setLevelInfo(l, words)
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
  return { ready: cur.ready, error: cur.error, retry: () => setAttempt((n) => n + 1) }
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
    const w = (await loadLevel(levelOf(id)))[idxOf(id)]
    if (w) out.push(w)
  }
  return out
}
