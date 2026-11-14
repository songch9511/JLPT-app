// Stable word ids (docs/plan/08-word-data.md §7). A word's id is `w` + a base-36 counter issued once in
// data/ids.json (`w000`, `w0k3`); it says nothing about the word's level or position, so the word list can change
// without moving anyone's records. The level of each id comes from the generated table below (the same build that
// writes the word data), so screens that count by level do not have to wait for the word data.
//
// Before stable ids (state v2/v3, backup format 1/2) a word's id was its position `<level>-<idx>`. Those ids can
// never be mistaken for stable ones (different shape) and are translated exactly once, by `fromLegacy`, from a
// frozen table: see store.ts `migrate`.
import { ID_NEXT, ID_RUNS, LEGACY_RUNS } from './generated/word-ids.ts'

type Level = 5 | 4 | 3 | 2 | 1

/** A stable word id: `w` + base-36 counter, at least three digits, no extra leading zeros. */
export const WORD_ID = /^w(?:[0-9a-z]{3}|[1-9a-z][0-9a-z]{3,})$/
/** A positional id of the versions before stable ids, with the optional reading-card suffix. */
export const LEGACY_ID = /^([1-5])-(0|[1-9]\d{0,4})(:r)?$/

export const idOf = (counter: number) => 'w' + counter.toString(36).padStart(3, '0')
/** The counter of a well-formed id, or -1. */
export const counterOf = (id: string) => (WORD_ID.test(id) ? parseInt(id.slice(1), 36) : -1)

/** The level of a live word id (a card's suffix is ignored), or undefined for an id this version does not know. */
export function levelOfId(id: string): Level | undefined {
  const i = id.indexOf(':')
  const n = counterOf(i < 0 ? id : id.slice(0, i))
  if (n < 0) return undefined
  // runs are in counter order: one comparison per run, five today
  for (const [start, len, l] of ID_RUNS) if (n < start + len) return n >= start ? l : undefined
  return undefined
}

/** Whether the id is one of this version's words (`w0k3`; a card id `w0k3:r` is not a word id). */
export const isWordId = (id: string) => WORD_ID.test(id) && levelOfId(id) !== undefined

/** Whether an id was ever issued (live or retired): a well-formed id above this is from a newer data version. */
export const wasIssued = (id: string) => counterOf(id) >= 0 && counterOf(id) < ID_NEXT

/** Live words per level. */
export const COUNTS = ID_RUNS.reduce(
  (c, [, len, l]) => ((c[l] += len), c),
  { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } as Record<Level, number>,
)

const byLevel = new Map<Level, string[]>()
/** A level's ids in issue order (the positional order of the words that existed before stable ids). */
export function idsOfLevel(l: Level): string[] {
  let ids = byLevel.get(l)
  if (!ids) {
    ids = []
    for (const [start, len, lv] of ID_RUNS) if (lv === l) for (let k = 0; k < len; k++) ids.push(idOf(start + k))
    byLevel.set(l, ids)
  }
  return ids
}

/**
 * The stable id of a positional id (`3-17` → `w1bt`, `3-17:r` → `w1bt:r`), or undefined when the positional id
 * never named a word. Frozen: positional ids were last written by the version before stable ids.
 */
export function fromLegacy(id: string): string | undefined {
  const m = LEGACY_ID.exec(id)
  if (!m) return undefined
  const l = Number(m[1])
  const idx = Number(m[2])
  for (const [rl, first, len, counter] of LEGACY_RUNS) if (rl === l && idx >= first && idx < first + len) return idOf(counter + idx - first) + (m[3] ?? '')
  return undefined
}

/**
 * The positional id a stable id had before stable ids, for the words that existed then (`w1bt:r` → `3-17:r`), else
 * the id itself. Used only where a value was derived from the id string and must stay what it was, e.g. the seed
 * that picks a reading card's wrong choices (so the same showing of a card offers the same choices as before).
 */
export function legacySeed(id: string): string {
  const i = id.indexOf(':')
  const n = counterOf(i < 0 ? id : id.slice(0, i))
  if (n >= 0) for (const [l, first, len, counter] of LEGACY_RUNS) if (n >= counter && n < counter + len) return `${l}-${first + n - counter}${i < 0 ? '' : id.slice(i)}`
  return id
}
