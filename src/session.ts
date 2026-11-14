// The answers of one study session, kept so the learner can swipe back to a card answered earlier and change its
// grade (docs/design-system.md, "학습 화면 · 카드 넘기기"). A session is one opening of the study screen: it starts
// empty when the screen opens and is forgotten when the learner leaves it or the page reloads. Only the answers
// themselves are saved (as always, at once); this history lives in memory.
//
// Re-grading is defined as: the state is what it would have been had the learner given the new grade at the time
// of the original answer, followed by the rest of the session's answers at their own times. It is computed exactly
// that way — the session's answers from the changed one on are taken back (each records the card and the day's log
// as they were before it) and given again through the same `applyAnswer` the study screen uses, with the original
// times. FSRS is deterministic for a card, grade and time (its fuzz is seeded by both), so answers on other cards
// come out the same, and anything that depends on the whole state (the quest, its XP) is recomputed where it now
// happens. tests/unit/session.test.ts checks "answer A, then change it to B" against "answer B" on random sessions.
//
// Later answers of the same card: they are given again from the new state while the card would still have come back
// that day (it is due before the end of the day of the later answer). Once it would not have — the new grade sent it
// to a later day — that answer and the card's later ones in the session are dropped: they could not have happened,
// and keeping them would answer a card that was not due. Their count, XP and time go with them.
import { applyAnswer, endOfDay, type Grade, type Kind } from './srs'
import { getState, update, type DayLog, type SCard, type State } from './store'
import { dayKey } from './util'

/** A reading card asked with choices: what was offered and what the learner picked (-1: "모르겠어요"). */
export interface QuizRecord {
  choices: string[]
  answer: number
  picked: number
}

export interface Entry {
  /** card id (`w0k3`, `w0k3:r`) */
  id: string
  /** how the queue offered the card; shown as it was if the answer is undone */
  kind: Kind
  grade: Grade
  /** when it was answered (epoch ms): a changed grade is applied at this time, not when it is changed */
  at: number
  /** time the card was on screen before the answer (DayLog.ms) */
  ms?: number
  quiz?: QuizRecord
  /** the card before this answer (undefined: a new word) */
  before?: SCard
  /** the card right after it */
  after: SCard
  /** the answer day's log before this answer (undefined: no log for that day yet) */
  logBefore?: DayLog
  /** XP this answer added (card XP and any quest it completed) */
  gained: number
}

export type Answer = Pick<Entry, 'id' | 'kind' | 'grade' | 'at' | 'ms' | 'quiz'>

const sameCard = (a: SCard | undefined, b: SCard | undefined) =>
  a === b ||
  (!!a &&
    !!b &&
    a.due === b.due &&
    a.stability === b.stability &&
    a.difficulty === b.difficulty &&
    a.elapsed_days === b.elapsed_days &&
    a.scheduled_days === b.scheduled_days &&
    a.learning_steps === b.learning_steps &&
    a.reps === b.reps &&
    a.lapses === b.lapses &&
    a.state === b.state &&
    a.last_review === b.last_review)

/** Apply one answer to a draft and record what it changed. */
function apply(d: State, a: Answer): Entry {
  const before = d.cards[a.id]
  const logBefore = d.log[dayKey(new Date(a.at))]
  const gained = applyAnswer(d, a.id, a.grade, new Date(a.at), a.ms)
  const e: Entry = { id: a.id, kind: a.kind, grade: a.grade, at: a.at, after: d.cards[a.id], gained }
  if (a.ms !== undefined) e.ms = a.ms
  if (a.quiz) e.quiz = a.quiz
  if (before) e.before = before
  if (logBefore) e.logBefore = logBefore
  return e
}

/**
 * Take answers back, last first: each card and each day's log goes back to what it was before, and the XP they
 * added comes off. Extra new words and reviews unlocked in the meantime ("더 하기", x / xr) stay, as with undo.
 */
function revert(d: State, entries: Entry[]) {
  const cards = { ...d.cards }
  const log = { ...d.log }
  for (let j = entries.length - 1; j >= 0; j--) {
    const e = entries[j]
    if (e.before) cards[e.id] = e.before
    else delete cards[e.id]
    const day = dayKey(new Date(e.at))
    const cur = log[day]
    const was: DayLog | undefined = e.logBefore ? { ...e.logBefore } : undefined
    if (cur && (cur.x !== undefined || cur.xr !== undefined)) {
      const keep: DayLog = was ?? { c: 0, n: 0, r: 0, p: 0 }
      if (cur.x !== undefined) keep.x = cur.x
      if (cur.xr !== undefined) keep.xr = cur.xr
      log[day] = keep
    } else if (was) log[day] = was
    else delete log[day]
    d.xp -= e.gained
  }
  d.cards = cards
  d.log = log
}

/** Whether a card answered at `at` would still have been shown that day (a later answer of it can be given again). */
const stillToday = (c: SCard | undefined, at: number) => !!c && c.due < endOfDay(new Date(at))

export class Session {
  private list: Entry[] = []

  get entries(): readonly Entry[] {
    return this.list
  }

  get length() {
    return this.list.length
  }

  last(): Entry | undefined {
    return this.list[this.list.length - 1]
  }

  /** Answer the card on screen: saved at once like every answer, and kept in this session's history. */
  answer(a: Answer): Entry {
    let e!: Entry
    update((d) => {
      e = apply(d, a)
    })
    this.list.push(e)
    return e
  }

  /**
   * Whether the saved cards are still what this history left them (from entry `from` on). Another tab answering,
   * an import or a reset changes them; the history then no longer describes the state and must not edit it.
   */
  consistent(from = 0, s: State = getState()): boolean {
    const lastAfter = new Map<string, SCard>()
    for (const e of this.list) lastAfter.set(e.id, e.after)
    for (let i = from; i < this.list.length; i++) if (!sameCard(s.cards[this.list[i].id], lastAfter.get(this.list[i].id))) return false
    return true
  }

  /** Take back the last answer ("방금 답 되돌리기"). Returns it, or null when there is none or the state moved on. */
  undoLast(): Entry | null {
    const e = this.last()
    if (!e || !this.consistent(this.list.length - 1)) return null
    update((d) => revert(d, [e]))
    this.list.pop()
    return e
  }

  /**
   * Change the grade of answer `index` (see the top of this file). Returns the answers dropped because the card
   * would no longer have come back, or null when nothing changed: the same grade, no such answer, or a state that
   * moved on without this history (then the caller should `clear`).
   */
  regrade(index: number, grade: Grade): { dropped: Entry[] } | null {
    const target = this.list[index]
    if (!target || target.grade === grade || !this.consistent(index)) return null
    const tail = this.list.slice(index)
    const out: Entry[] = []
    const dropped: Entry[] = []
    update((d) => {
      revert(d, tail)
      out.push(apply(d, { ...target, grade }))
      let gone = false
      for (const t of tail.slice(1)) {
        if (t.id === target.id && (gone || !stillToday(d.cards[t.id], t.at))) {
          gone = true
          dropped.push(t)
          continue
        }
        out.push(apply(d, t))
      }
    })
    this.list.splice(index, this.list.length - index, ...out)
    return { dropped }
  }

  clear() {
    this.list = []
  }
}
