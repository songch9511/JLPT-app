// Ruma's first run (src/guide.ts) and the `guide` field of the state (src/store.ts): who gets it, how it is kept.
import { describe, expect, it, vi } from 'vitest'
import { boot, card, DAY, KEY } from './helpers'

const NOW = '2026-11-13T09:00:00'
const learner = (extra: Record<string, unknown> = {}) => ({ v: 4, onboarded: true, settings: { target: 4 }, cards: {}, log: {}, marks: [], xp: 10, ...extra })

async function bootGuide(opts: Parameters<typeof boot>[0]) {
  const b = await boot(opts)
  const guide = await import('../../src/guide')
  return { ...b, guide }
}

describe('guide: who sees the first run', () => {
  it('a fresh install starts with an empty guide and Ruma asking the level', async () => {
    const { store, guide } = await bootGuide({ now: NOW })
    expect(store.getState().guide).toEqual({ done: [] })
    expect(guide.phase(store.getState())).toBe('level')
  })

  it('an existing learner (onboarded, saved before the guide) gets no guide, so no first-run prompt or tip ever', async () => {
    const { store, guide } = await bootGuide({ now: NOW, saved: learner({ cards: { w000: card({ due: Date.parse(NOW) + DAY }) } }) })
    const s = store.getState()
    expect(s.guide).toBeUndefined()
    expect(guide.phase(s)).toBeNull()
    expect(guide.homeTip(s)).toBeNull()
  })

  it('a learner from the versions before stable ids (v2/v3) is migrated without a guide', async () => {
    const { store } = await bootGuide({ now: NOW, legacy: { ...learner(), v: 3 } })
    expect(store.getState().onboarded).toBe(true)
    expect(store.getState().guide).toBeUndefined()
  })

  it('an install that never got past the old onboarding page is a new learner', async () => {
    const { store, guide } = await bootGuide({ now: NOW, saved: learner({ onboarded: false }) })
    expect(store.getState().guide).toEqual({ done: [] })
    expect(guide.phase(store.getState())).toBe('level')
  })

  it('a damaged guide is cleaned, not crashed on', async () => {
    const { store } = await bootGuide({ now: NOW, saved: learner({ guide: { done: ['srs', 3, 'srs', null] } }) })
    expect(store.getState().guide).toEqual({ done: ['srs'] })
  })

  it('importing an existing learner’s backup over a new install leaves no first-run prompt', async () => {
    const { store, guide } = await bootGuide({ now: NOW })
    const backup = await import('../../src/backup')
    const read = backup.readBackup({ format: 'jlpt-luma-backup', formatVersion: 3, ...learner({ log: { '2026-11-12': { c: 5, n: 5, r: 0, p: 0 } } }) })
    expect(read.ok).toBe(true)
    if (read.ok) store.importState(read.state)
    const s = store.getState()
    expect(s.guide).toBeUndefined()
    expect(guide.phase(s)).toBeNull()
    expect(guide.homeTip(s)).toBeNull()
  })

  it('a backup made by a learner who started with the guide keeps it (without the retired exam steps and tip), and exports carry it', async () => {
    const { store } = await bootGuide({ now: NOW })
    const backup = await import('../../src/backup')
    const read = backup.readBackup({ format: 'jlpt-luma-backup', formatVersion: 3, ...learner({ guide: { done: ['level', 'exam', 'exam-unknown', 'srs', 'ready'] } }) })
    if (read.ok) store.importState(read.state)
    expect(store.getState().guide).toEqual({ done: ['level', 'srs'] })
    expect(backup.backupFile(store.getState()).guide).toEqual({ done: ['level', 'srs'] })
  })

  it('“모든 기록 초기화” starts the first run again', async () => {
    const { store, guide } = await bootGuide({ now: NOW, saved: learner() })
    store.resetAll()
    expect(guide.phase(store.getState())).toBe('level')
  })
})

describe('guide: the conversation', () => {
  it('the level is the one question: answered, the plan is complete and Ruma offers the first session; saved at once', async () => {
    const { store, guide, ls } = await bootGuide({ now: NOW })
    guide.chooseLevel(3)
    const s = store.getState()
    expect(s.settings.target).toBe(3)
    expect(s.onboarded).toBe(true)
    expect(guide.phase(s)).toBe('start')
    expect(s.settings).not.toHaveProperty('examDate')
    // reload
    const again = await bootGuide({ now: NOW, storage: ls })
    expect(again.guide.phase(again.store.getState())).toBe('start')
    expect(JSON.parse(again.ls.getItem(KEY)!).guide.done).toEqual(['level'])
  })

  it('a learner saved at the removed exam-date question continues at the first session, with the level they chose', async () => {
    // as the version with the exam question saved it: level answered, not yet onboarded, the default exam date set
    const saved = { v: 4, onboarded: false, settings: { target: 3, examDate: '2026-12-06', goal: 0.8, dailyNew: 20, includeLower: true }, cards: {}, log: {}, marks: [], xp: 0, guide: { done: ['level'] } }
    const { store, guide } = await bootGuide({ now: NOW, saved })
    const s = store.getState()
    expect(s.onboarded).toBe(true)
    expect(s.settings.target).toBe(3)
    expect(guide.phase(s)).toBe('start')
    expect(s.settings).not.toHaveProperty('examDate')
  })

  it('a learner who had answered the exam question too (or “아직 몰라요”) is where they were: the first session', async () => {
    const saved = { v: 4, onboarded: true, settings: { target: 5, examDate: '2026-12-06' }, cards: {}, log: {}, marks: [], xp: 0, guide: { done: ['level', 'exam', 'exam-unknown'] } }
    const { store, guide } = await bootGuide({ now: NOW, saved })
    expect(guide.phase(store.getState())).toBe('start')
    expect(store.getState().guide).toEqual({ done: ['level'] })
  })

  it('a learner saved at the level question is still asked it', async () => {
    const saved = { v: 4, onboarded: false, settings: { target: 5, examDate: '2026-12-06' }, cards: {}, log: {}, marks: [], xp: 0, guide: { done: [] } }
    const { store, guide } = await bootGuide({ now: NOW, saved })
    expect(store.getState().onboarded).toBe(false)
    expect(guide.phase(store.getState())).toBe('level')
  })

  it('“급수 다시 고르기” before the first session goes back to the level question', async () => {
    const { store, guide } = await bootGuide({ now: NOW })
    guide.chooseLevel(2)
    guide.askLevelAgain()
    expect(store.getState().onboarded).toBe(false)
    expect(guide.phase(store.getState())).toBe('level')
    guide.chooseLevel(4)
    expect(guide.phase(store.getState())).toBe('start')
    expect(store.getState().settings.target).toBe(4)
  })

  it('the first-run card stays until something is studied; then the spaced-repetition tip, once', async () => {
    vi.setSystemTime(new Date(NOW))
    const { store, guide } = await bootGuide({ now: NOW })
    guide.chooseLevel(5)
    expect(guide.homeTip(store.getState())).toBeNull()
    store.update((d) => void (d.log = { '2026-11-13': { c: 1, n: 1, r: 0, p: 0 } }))
    expect(guide.phase(store.getState())).toBeNull()
    expect(guide.homeTip(store.getState())).toBe('srs')
    guide.markDone('srs')
    expect(guide.homeTip(store.getState())).toBeNull()
  })

  it('“루마의 안내 다시 보기” brings the tips back, also for a learner from before the guide, but not the question', async () => {
    const { store, guide } = await bootGuide({ now: NOW, saved: learner({ log: { '2026-11-12': { c: 5, n: 5, r: 0, p: 0 } } }) })
    guide.replayTips()
    const s = store.getState()
    expect(guide.phase(s)).toBeNull()
    expect(guide.homeTip(s)).toBe('srs')
    expect(guide.done(s, 'reading')).toBe(false)
  })
})
