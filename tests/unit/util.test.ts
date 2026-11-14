import { describe, expect, it } from 'vitest'
import { addDays, dayKey, daysBetween, formatDay, parseDay, shuffle } from '../../src/util'

describe('dayKey / parseDay / addDays', () => {
  it('uses the local calendar day, zero-padded', () => {
    expect(dayKey(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05')
    expect(dayKey(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31')
  })

  it('local midnight belongs to the new day even when UTC is still on the previous one', () => {
    // 00:30 in Seoul is 15:30 UTC the day before
    expect(dayKey(new Date('2026-11-14T00:30:00+09:00'))).toBe('2026-11-14')
  })

  it('parseDay round-trips with dayKey', () => {
    for (const k of ['2026-01-01', '2026-02-28', '2028-02-29', '2026-12-31']) expect(dayKey(parseDay(k))).toBe(k)
  })

  it('addDays crosses month and year ends without mutating its input', () => {
    const d = new Date(2026, 11, 31, 10)
    expect(dayKey(addDays(d, 1))).toBe('2027-01-01')
    expect(dayKey(addDays(d, -365))).toBe('2025-12-31')
    expect(dayKey(d)).toBe('2026-12-31')
  })

  it('formatDay renders Korean dates', () => {
    expect(formatDay('2026-12-06')).toBe('2026년 12월 6일')
  })
})

describe('daysBetween', () => {
  it('counts calendar days, not 24h blocks', () => {
    expect(daysBetween(new Date(2026, 10, 13, 23, 59), new Date(2026, 10, 14, 0, 1))).toBe(1)
    expect(daysBetween(new Date(2026, 10, 13, 0, 1), new Date(2026, 10, 13, 23, 59))).toBe(0)
    expect(daysBetween(new Date(2026, 10, 14), new Date(2026, 10, 13))).toBe(-1)
    expect(daysBetween(new Date(2026, 11, 31), new Date(2027, 0, 1))).toBe(1)
  })

  it('is not thrown off by DST changes (America/New_York)', () => {
    process.env.TZ = 'America/New_York'
    // spring forward 2026-03-08 (23h day), fall back 2026-11-01 (25h day)
    expect(daysBetween(new Date(2026, 2, 7, 12), new Date(2026, 2, 9, 12))).toBe(2)
    expect(daysBetween(new Date(2026, 2, 8, 0, 0), new Date(2026, 2, 8, 23, 59))).toBe(0)
    expect(daysBetween(new Date(2026, 9, 31, 23, 30), new Date(2026, 10, 1, 23, 30))).toBe(1)
    expect(daysBetween(new Date(2026, 10, 1, 0, 30), new Date(2026, 10, 2, 0, 30))).toBe(1)
    expect(dayKey(addDays(new Date(2026, 2, 8, 0, 30), 1))).toBe('2026-03-09')
    expect(dayKey(addDays(new Date(2026, 10, 2, 0, 30), -1))).toBe('2026-11-01')
  })

  it('handles a zone whose DST change happens at midnight (America/Santiago)', () => {
    process.env.TZ = 'America/Santiago'
    // Chile springs forward at 24:00 on the first Saturday of September: 2026-09-06 00:00 does not exist
    const sat = new Date(2026, 8, 5, 12)
    const next = addDays(sat, 1)
    expect(dayKey(next)).toBe('2026-09-06')
    expect(daysBetween(sat, next)).toBe(1)
  })
})

describe('shuffle', () => {
  it('returns a permutation without touching the input', () => {
    const a = [1, 2, 3, 4, 5]
    const b = shuffle(a)
    expect(a).toEqual([1, 2, 3, 4, 5])
    expect([...b].sort()).toEqual(a)
  })
})
