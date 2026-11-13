import { describe, expect, it } from 'vitest'
import { P_NEW, pNew } from '../../src/pnew'
import { simulatePNew } from '../../src/pnew-sim'

describe('P_NEW (expected exam-day recall of a word introduced d days before)', () => {
  it('the shipped table is exactly what the simulation produces', () => {
    expect(simulatePNew()).toEqual([...P_NEW])
  })

  it('the projection uses a non-decreasing envelope that never exceeds the table', () => {
    expect(pNew(0)).toBe(0)
    expect(pNew(-3)).toBe(0)
    let prev = 0
    for (let d = 1; d <= 200; d++) {
      expect(pNew(d)).toBeGreaterThanOrEqual(prev)
      expect(pNew(d)).toBeLessThanOrEqual(P_NEW[Math.min(d, P_NEW.length - 1)])
      expect(pNew(d)).toBeGreaterThan(0.8)
      prev = pNew(d)
    }
    expect(pNew(500)).toBe(pNew(180))
  })
})
