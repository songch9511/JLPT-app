import { useEffect, useState } from 'react'

export type Level = 5 | 4 | 3 | 2 | 1
export const LEVELS: Level[] = [5, 4, 3, 2, 1]

/** Word counts per level (kept in sync with public/data by scripts/build-data.mjs output). */
export const COUNTS: Record<Level, number> = { 5: 718, 4: 668, 3: 2140, 2: 1905, 1: 2699 }

export interface Word {
  id: string
  level: Level
  idx: number
  w: string
  /** reading; empty when the word is already kana */
  r: string
  ko: string
  en: string
}

export const meaning = (w: Word) => w.ko || w.en
export const wordId = (l: Level, idx: number) => `${l}-${idx}`
export const levelOf = (id: string) => Number(id[0]) as Level

const cache = new Map<Level, Promise<Word[]>>()

export function loadLevel(l: Level): Promise<Word[]> {
  let p = cache.get(l)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/n${l}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`단어 데이터를 불러오지 못했어요 (N${l})`)
        return r.json() as Promise<[string, string, string, string][]>
      })
      .then((rows) => rows.map(([w, r, ko, en], idx) => ({ id: wordId(l, idx), level: l, idx, w, r, ko, en })))
    p.catch(() => cache.delete(l))
    cache.set(l, p)
  }
  return p
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

export function useAllWords(): Word[] | null {
  const [words, setWords] = useState<Word[] | null>(null)
  useEffect(() => {
    let live = true
    Promise.all(LEVELS.map(loadLevel)).then((all) => live && setWords(all.flat()), () => {})
    return () => {
      live = false
    }
  }, [])
  return words
}

export async function wordsById(ids: string[]): Promise<Word[]> {
  const out: Word[] = []
  for (const id of ids) {
    const [l, idx] = id.split('-').map(Number)
    const w = (await loadLevel(l as Level))[idx]
    if (w) out.push(w)
  }
  return out
}
