// Ruma's first run (src/guide.ts) and the `guide` field of the state (src/store.ts): who gets it, how it is kept.
import { describe, expect, it, vi } from 'vitest'
import { boot, card, DAY, KEY } from './helpers'

const NOW = '2026-11-13T09:00:00'
const learner = (extra: Record<string, unknown> = {}) => ({ v: 4, onboarded: true, settings: { target: 4, examDate: '2027-07-04' }, cards: {}, log: {}, marks: [], xp: 10, ...extra })

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
    expect(guide.homeTip(s, true)).toBeNull()
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
    expect(guide.homeTip(s, true)).toBeNull()
  })

  it('a backup made by a learner who started with the guide keeps it, and exports carry it', async () => {
    const { store } = await bootGuide({ now: NOW })
    const backup = await import('../../src/backup')
    const read = backup.readBackup({ format: 'jlpt-luma-backup', formatVersion: 3, ...learner({ guide: { done: ['level', 'exam', 'srs'] } }) })
    if (read.ok) store.importState(read.state)
    expect(store.getState().guide).toEqual({ done: ['level', 'exam', 'srs'] })
    expect(backup.backupFile(store.getState()).guide).toEqual({ done: ['level', 'exam', 'srs'] })
  })

  it('“모든 기록 초기화” starts the first run again', async () => {
    const { store, guide } = await bootGuide({ now: NOW, saved: learner() })
    store.resetAll()
    expect(guide.phase(store.getState())).toBe('level')
  })
})

describe('guide: the conversation', () => {
  it('level, then exam date: each answer is saved at once (a reload continues where it was)', async () => {
    const { store, guide, ls } = await bootGuide({ now: NOW })
    guide.chooseLevel(3)
    expect(store.getState().settings.target).toBe(3)
    expect(store.getState().onboarded).toBe(false)
    expect(guide.phase(store.getState())).toBe('exam')
    // reload
    const again = await bootGuide({ now: NOW, storage: ls })
    expect(again.guide.phase(again.store.getState())).toBe('exam')
    again.guide.chooseExam('2027-07-04')
    const s = again.store.getState()
    expect(s.onboarded).toBe(true)
    expect(s.settings.examDate).toBe('2027-07-04')
    expect(again.guide.phase(s)).toBe('start')
    expect(JSON.parse(again.ls.getItem(KEY)!).guide.done).toEqual(['level', 'exam'])
  })

  it('“아직 몰라요” keeps the default every new state has (the next JLPT date) and remembers that it was a guess', async () => {
    const { store, guide } = await bootGuide({ now: NOW })
    guide.chooseLevel(5)
    store.update((d) => void (d.settings.examDate = '2027-12-05'))
    guide.chooseExam(null)
    expect(store.getState().settings.examDate).toBe('2026-12-06')
    expect(guide.done(store.getState(), 'exam-unknown')).toBe(true)
  })

  it('“급수 다시 고르기” goes back to the level question', async () => {
    const { store, guide } = await bootGuide({ now: NOW })
    guide.chooseLevel(2)
    guide.askLevelAgain()
    expect(guide.phase(store.getState())).toBe('level')
  })

  it('the first-run card stays until something is studied; then the tips, each once', async () => {
    vi.setSystemTime(new Date(NOW))
    const { store, guide } = await bootGuide({ now: NOW })
    guide.chooseLevel(5)
    guide.chooseExam('2027-07-04')
    expect(guide.homeTip(store.getState(), false)).toBeNull()
    store.update((d) => void (d.log = { '2026-11-13': { c: 1, n: 1, r: 0, p: 0 } }))
    expect(guide.phase(store.getState())).toBeNull()
    expect(guide.homeTip(store.getState(), true)).toBe('srs')
    guide.markDone('srs')
    expect(guide.homeTip(store.getState(), false)).toBeNull()
    expect(guide.homeTip(store.getState(), true)).toBe('ready')
    guide.markDone('ready')
    expect(guide.homeTip(store.getState(), true)).toBeNull()
  })

  it('“루마의 안내 다시 보기” brings the tips back, also for a learner from before the guide, but not the questions', async () => {
    const { store, guide } = await bootGuide({ now: NOW, saved: learner({ log: { '2026-11-12': { c: 5, n: 5, r: 0, p: 0 } } }) })
    guide.replayTips()
    const s = store.getState()
    expect(guide.phase(s)).toBeNull()
    expect(guide.homeTip(s, false)).toBe('srs')
    expect(guide.done(s, 'reading')).toBe(false)
  })
})
