// Offline simulation behind the P_NEW table in ./pnew.ts (03 §4.1). Not imported by the app:
// tests/unit/pnew.test.ts runs it to check that the shipped table is what this code produces.
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card } from 'ts-fsrs'

const DAY = 86_400_000

/** Small deterministic PRNG so the table can be regenerated exactly. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Expected recall `d` days after a word is introduced, for d = 0…days, when the learner reviews every card
 * on its due time and each answer succeeds with the card's retrievability at that moment (a brand-new word
 * is never recalled on first sight). Default FSRS parameters, no fuzz; averaged over `trials` runs.
 */
export function simulatePNew(days = 180, trials = 1000, seed = 20261113): number[] {
  const model = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: false }))
  const rng = mulberry32(seed)
  const t0 = Date.UTC(2026, 0, 1, 0, 0)
  const end = t0 + days * DAY
  const sum = new Array<number>(days + 1).fill(0)
  for (let n = 0; n < trials; n++) {
    // the card as it stands after each review, in time order
    const history: { at: number; card: Card }[] = []
    let card = createEmptyCard(new Date(t0))
    let at = t0
    while (at <= end) {
      const r = card.state === State.New ? 0 : model.get_retrievability(card, new Date(at), false)
      card = model.next(card, new Date(at), rng() < r ? Rating.Good : Rating.Again).card
      history.push({ at, card })
      at = Math.max(card.due.getTime(), at + 1)
    }
    let h = 0
    for (let d = 1; d <= days; d++) {
      const t = t0 + d * DAY
      while (h + 1 < history.length && history[h + 1].at <= t) h++
      sum[d] += model.get_retrievability(history[h].card, new Date(t), false)
    }
  }
  return sum.map((x) => Math.round((x / trials) * 1000) / 1000)
}
