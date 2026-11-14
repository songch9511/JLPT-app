import { SHARDS, WORDS_VERSION } from './generated/words'

export { WORDS_VERSION }

export interface Word {
  id: string
  /** expression as written (kanji/kana) */
  w: string
  /** reading; '' when the expression is already kana */
  r: string
  /** Korean meaning (English when no Korean exists yet) */
  m: string
  /** JLPT level (5 = N5); from the data, never from the id */
  l: number
}

/**
 * A stable word id (the app's docs/plan/08 §7): `w` + a base-36 counter, at least three digits, no extra leading
 * zeros (`w000`, `w0k3`), issued once in the app's data/ids.json and never tied to a word's position or level.
 * Bounded to 7 characters (counters below 36^6). Must match scripts/build-words.mjs.
 */
export const WORD_ID_PATTERN = /^w(?:[0-9a-z]{3}|[1-9a-z][0-9a-z]{3,5})$/

/** Which generated shard holds the id: `w` + the counter's first digit (scripts/build-words.mjs groups the same way). */
const shardOf = (id: string): string => id.slice(0, 2)

const parsed = new Map<string, Map<string, Word>>()

function shard(name: string): Map<string, Word> | undefined {
  let m = parsed.get(name)
  if (!m) {
    const raw = SHARDS[name]
    if (raw === undefined) return undefined
    const rows = JSON.parse(raw) as [string, string, string, string, number][]
    m = new Map(rows.map(([id, w, r, mean, l]) => [id, { id, w, r, m: mean, l }]))
    parsed.set(name, m)
  }
  return m
}

export function lookupWord(id: string): Word | undefined {
  if (!WORD_ID_PATTERN.test(id)) return undefined
  return shard(shardOf(id))?.get(id)
}
