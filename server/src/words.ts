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
}

/**
 * Word ids are positional today: `<level>-<index>` (index into public/data/n<level>.json).
 * A stable-id migration is planned. Re-keying touches only three places: `idOf()` in
 * scripts/build-words.mjs, this pattern, and `shardOf()` below.
 */
export const WORD_ID_PATTERN = /^[1-5]-(0|[1-9][0-9]{0,4})$/

/** Which generated shard holds the id (today: the JLPT level, the id's first character). */
const shardOf = (id: string): string => id.slice(0, 1)

const parsed = new Map<string, Map<string, Word>>()

function shard(name: string): Map<string, Word> | undefined {
  let m = parsed.get(name)
  if (!m) {
    const raw = SHARDS[name]
    if (raw === undefined) return undefined
    const rows = JSON.parse(raw) as [string, string, string, string][]
    m = new Map(rows.map(([id, w, r, mean]) => [id, { id, w, r, m: mean }]))
    parsed.set(name, m)
  }
  return m
}

export function lookupWord(id: string): Word | undefined {
  if (!WORD_ID_PATTERN.test(id)) return undefined
  return shard(shardOf(id))?.get(id)
}
