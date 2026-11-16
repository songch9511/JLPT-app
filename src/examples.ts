// Example sentences (data/examples/README.md): one per word for the levels that have them, loaded with the first card
// of that level that needs one. public/data/examples-n{l}.json is written by scripts/build-data.mjs; the service
// worker precaches it with the word files (vite.config.ts) and the iOS app bundles it, so it works offline.
import { useEffect, useState } from 'react'
import { levelOf, wordOfCard, type Level } from './data.ts'

/** A piece of the sentence: kana or punctuation alone, or kanji with its reading in hiragana. */
export type Segment = [text: string] | [text: string, reading: string]
export interface Example {
  seg: Segment[]
  /** the Korean translation */
  ko: string
}

/**
 * Levels with an example file: every level that has data/examples/n{l}.json when `npm run data` ran (written into
 * src/generated/content.ts; tests/unit/examples.test.ts checks this against public/data).
 */
export { EXAMPLE_LEVELS } from './generated/content.ts'
import { EXAMPLE_LEVELS } from './generated/content.ts'

const cache = new Map<Level, Promise<Record<string, Example>>>()

/** A level's examples; an empty set for a level without them. A failed load is not kept, so it is tried again. */
export function loadExamples(l: Level): Promise<Record<string, Example>> {
  if (!EXAMPLE_LEVELS.includes(l)) return Promise.resolve({})
  let p = cache.get(l)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/examples-n${l}.json`).then((r) => {
      if (!r.ok) throw new Error(`examples-n${l}.json: ${r.status}`)
      return r.json() as Promise<Record<string, Example>>
    })
    p.catch(() => cache.delete(l))
    cache.set(l, p)
  }
  return p
}

/**
 * The example sentence of a word (or of a card of it), or null: none for its level, not loaded yet, or the file
 * could not be read (the card then simply shows no example).
 */
export function useExample(id: string | null | undefined): Example | null {
  const word = id ? wordOfCard(id) : null
  const level = word ? levelOf(word) : undefined
  const [res, setRes] = useState<{ word: string | null; example: Example | null }>({ word: null, example: null })
  useEffect(() => {
    if (!word || level === undefined || !EXAMPLE_LEVELS.includes(level)) return
    let live = true
    loadExamples(level).then(
      (all) => live && setRes({ word, example: all[word] ?? null }),
      () => live && setRes({ word, example: null }),
    )
    return () => {
      live = false
    }
  }, [word, level])
  return res.word === word ? res.example : null
}

const KANJI = /[㐀-鿿々〆ヶ]/

/**
 * The part of a headword that stays when it is inflected in a sentence: up to and including its last kanji, else
 * all but the last kana of a longer kana word (the rule data/examples was checked with).
 */
export function headwordCore(w: string): string {
  const s = w.replace(/[～〜~]/g, '').trim()
  let last = -1
  for (let i = 0; i < s.length; i++) if (KANJI.test(s[i])) last = i
  if (last >= 0) return s.slice(0, last + 1)
  return s.length > 2 ? s.slice(0, -1) : s
}

/**
 * Which segments spell the headword in the sentence: those overlapping the first place its core appears (any of its
 * written forms, "A; B"). Their furigana would give the answer away, so the card holds it back until the reading is
 * asked for. None when the headword cannot be found.
 */
export function headwordSegments(headword: string, seg: Segment[]): boolean[] {
  const text = seg.map((g) => g[0]).join('')
  const marks = seg.map(() => false)
  for (const form of headword.split(/[;；]/)) {
    const core = headwordCore(form)
    const at = core ? text.indexOf(core) : -1
    if (at < 0) continue
    let pos = 0
    seg.forEach((g, i) => {
      const end = pos + g[0].length
      if (end > at && pos < at + core.length) marks[i] = true
      pos = end
    })
    return marks
  }
  return marks
}
