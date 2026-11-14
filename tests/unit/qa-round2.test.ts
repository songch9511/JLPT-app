// Regressions from the second QA round (docs/plan/13-qa-round2.md): each failed before its fix.
import { describe, expect, it, vi } from 'vitest'
import { at, boot, bootUser, card, DAY, L } from './helpers'

const NOW = '2026-11-14T09:00:00'
const T = Date.parse(NOW)

describe('Q2: a backup the app accepts never breaks it', () => {
  const file = (cards: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    v: 4,
    onboarded: true,
    settings: { target: 5, examDate: '2026-12-06', dailyNew: 10, theme: 'light', autoSpeak: false },
    cards,
    log: {},
    marks: [],
    xp: 0,
    ...extra,
  })

  it('rejects a card without the FSRS numbers, or studied without a last review (Home threw while rendering)', async () => {
    const { store } = await boot({ now: NOW })
    const good = card({ due: T })
    expect(store.isBackup(file({ [L('5-1')]: good }))).toBe(true)
    // a card never studied (state 0) has no last review
    const { last_review: _l, ...fresh } = good
    expect(store.isBackup(file({ [L('5-1')]: { ...fresh, state: 0 } }))).toBe(true)
    const bad = [
      { due: T, state: 2 },
      fresh,
      { ...good, stability: '5' },
      { ...good, reps: undefined },
      { ...good, state: 7 },
      { ...good, last_review: null },
    ]
    for (const c of bad) expect(store.isBackup(file({ [L('5-1')]: c })), JSON.stringify(c)).toBe(false)
    // the same check guards the records kept apart
    expect(store.isBackup(file({}, { orphans: { cards: { wzzzz: { due: T, state: 2 } }, marks: [] } }))).toBe(false)
  })

  it('a card the check lets through can be scheduled and counted', async () => {
    const { store, srs } = await boot({ now: NOW })
    const readiness = await import('../../src/readiness')
    const ok = file({ [L('5-1')]: card({ due: T - DAY }) })
    expect(store.isBackup(ok)).toBe(true)
    store.importState(ok as never)
    expect(() => readiness.readiness(store.getState(), at(NOW))).not.toThrow()
    expect(srs.buildQueue(store.getState(), at(NOW)).review).toBe(1)
  })

  it('rejects a day log with a field that is not a count (Home showed NaN)', async () => {
    const { store } = await boot({ now: NOW })
    expect(store.isBackup(file({}, { log: { '2026-11-14': { c: 3, n: 1, r: 0, p: 0, xp: 30 } } }))).toBe(true)
    expect(store.isBackup(file({}, { log: { '2026-11-14': { c: 'x', n: 1, r: 1, p: 1 } } }))).toBe(false)
    expect(store.isBackup(file({}, { log: { '2026-11-14': { c: 1, e: null } } }))).toBe(false)
  })
})

describe('Q3: the exam date', () => {
  it('examDateOk: a calendar day, at most three years ahead; past days are fine', async () => {
    const { store } = await boot({ now: NOW })
    const now = at(NOW)
    expect(store.examDateOk('2026-12-06', now)).toBe(true)
    expect(store.examDateOk('2020-07-05', now)).toBe(true)
    expect(store.examDateOk('2029-07-01', now)).toBe(true)
    expect(store.examDateOk('2099-12-06', now)).toBe(false)
    expect(store.examDateOk('9999-12-31', now)).toBe(false)
    expect(store.examDateOk('soon', now)).toBe(false)
    expect(store.examDateOk(20261206, now)).toBe(false)
    expect(store.examDateOk(undefined, now)).toBe(false)
  })

  it('a far, malformed or non-text exam date in a saved state or a backup becomes the next exam', async () => {
    for (const examDate of ['2099-12-06', 'soon', 20261206]) {
      const { store } = await boot({ now: NOW, saved: { v: 4, onboarded: true, settings: { target: 5, examDate }, cards: {}, log: {}, marks: [], xp: 0 } })
      expect(store.getState().settings.examDate).toBe('2026-12-06')
      const backup = await import('../../src/backup')
      const r = backup.readBackup({ v: 4, settings: { target: 5, examDate }, cards: {} })
      expect(r.ok && r.state.settings.examDate).toBe('2026-12-06')
    }
  })

  it('readiness for the furthest allowed exam stays quick', async () => {
    const { store } = await bootUser(NOW, { target: 3, includeLower: true, examDate: '2029-11-11' })
    store.update((d) => {
      d.cards = Object.fromEntries(Array.from({ length: 600 }, (_, i) => [L(`5-${i}`), card({ due: T + ((i % 60) - 20) * DAY, stability: 1 + (i % 50), scheduled_days: 1 + (i % 50) })]))
    })
    const readiness = await import('../../src/readiness')
    const t0 = performance.now()
    readiness.readiness(store.getState(), at(NOW))
    expect(performance.now() - t0).toBeLessThan(3000)
  })
})

describe('Q4: undo keeps "더 하기"', () => {
  it('undoing the last answer after unlocking more reviews or new words keeps the unlock', async () => {
    const { srs, store } = await bootUser(NOW, { dailyNew: 1 })
    store.update((d) => void (d.cards = { [L('5-1')]: card({ due: T - DAY }) }))
    const snap = srs.snapshot()
    srs.answer(L('5-1'), srs.Rating.Good, at(NOW))
    srs.unlockMoreReviews(50, at(NOW))
    srs.unlockMoreNew(10, at(NOW))
    srs.restore(snap)
    const log = store.getState().log['2026-11-14']
    expect(log).toMatchObject({ c: 0, xr: 50, x: 10 })
    expect(store.getState().cards[L('5-1')]).toEqual(snap.cards[L('5-1')])
    expect(srs.reviewQuota(store.getState(), at(NOW)).extra).toBe(50)
  })
})

describe('Q6: a level that cannot be fetched says so in Korean', () => {
  it('a network failure gives the app’s message, not the browser’s', async () => {
    await boot({ now: NOW })
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
    const data = await import('../../src/data')
    await expect(data.loadLevel(4)).rejects.toThrow('단어 데이터를 불러오지 못했어요 (N4)')
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('{not json', { status: 200 })))
    await expect(data.loadLevel(4)).rejects.toThrow('단어 데이터를 불러오지 못했어요 (N4)')
  })
})
