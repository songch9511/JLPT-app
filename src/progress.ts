// Chapters (docs/design-system.md §3 "챕터"): a level's words, 50 at a time in their introduction order (frequency).
// A chapter is done (済) once all its words were met; the current chapter is the one holding the next new word.
import { CHAPTER, chapterCount, chapterIds, COUNTS, type Level } from './data'
import type { State } from './store'

type Cards = Pick<State, 'cards'>

/** Words of chapter `n` (1-based) already met. */
export const chapterMet = (s: Cards, l: Level, n: number) => chapterIds(l, n).reduce((k, id) => k + (s.cards[id] ? 1 : 0), 0)
/** How many words chapter `n` has (the last one can be short). */
export const chapterSize = (l: Level, n: number) => Math.max(0, Math.min(CHAPTER, COUNTS[l] - (n - 1) * CHAPTER))
/** Chapters whose every word was met. */
export function chaptersDone(s: Cards, l: Level): number {
  let n = 0
  for (let c = 1; c <= chapterCount(l); c++) if (chapterMet(s, l, c) === chapterSize(l, c)) n++
  return n
}
/** The chapter that holds the level's next new word; the last chapter once every word was met. */
export function currentChapter(s: Cards, l: Level): number {
  for (let c = 1; c <= chapterCount(l); c++) if (chapterMet(s, l, c) < chapterSize(l, c)) return c
  return chapterCount(l)
}
/** Whether every word of chapter `n` was met. */
export const chapterDone = (s: Cards, l: Level, n: number) => chapterMet(s, l, n) === chapterSize(l, n)
