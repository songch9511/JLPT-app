import { describe, expect, it } from 'vitest'
import { simulateBacklog } from '../../src/backlog-sim'

// The order of held-back reviews (03 §5.3): the full runs are recorded in docs/plan/03-curriculum-dashboard.md;
// this small run checks the conclusion still holds and that the simulation is repeatable.
describe('backlog order simulation', () => {
  it('no order that looks at the measurement day beats oldest-due-first by more than 1% of the deck; most-overdue-relative-to-S is not better', () => {
    const run = simulateBacklog({ cards: 400, history: 40, away: 7, horizon: 7, cap: 50, trials: 3 }, ['due', 'lowR', 'gain', 'wait'])
    expect(run.backlog).toBeGreaterThan(150)
    const { lowR, gain, wait } = run.summary
    for (const p of [lowR, gain, wait]) expect(p.vsDue).toBeLessThan(0.01 * 400)
    expect(lowR.vsDue).toBeLessThan(0)
  })

  it('is deterministic', () => {
    const a = simulateBacklog({ cards: 120, history: 20, away: 5, horizon: 5, cap: 20, trials: 1 }, ['due', 'lowR'])
    const b = simulateBacklog({ cards: 120, history: 20, away: 5, horizon: 5, cap: 20, trials: 1 }, ['due', 'lowR'])
    expect(b.perTrial).toEqual(a.perTrial)
  })
})
