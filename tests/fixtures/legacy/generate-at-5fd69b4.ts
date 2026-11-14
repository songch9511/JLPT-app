// Generates the legacy (positional-id) fixtures in this folder with the app code as it was at commit 5fd69b4,
// the last version before stable word ids (docs/plan/08-word-data.md §7). It drives the real scheduler of that
// version — buildQueue/answer/toggleMark/backupFile — so the FSRS fields, logs and reading cards are what a real
// learner's storage held. It only runs against that commit:
//
//   git worktree add /tmp/at-5fd69b4 5fd69b4 && cp -r tests/fixtures/legacy /tmp/at-5fd69b4/tests/fixtures/
//   cd /tmp/at-5fd69b4 && npx vitest run --config tests/fixtures/legacy/vitest.generate.config.ts
//
// The fixtures are committed; nothing in the test suite runs this file.
import { readFileSync, writeFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'

class MemoryStorage {
  map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null
  }
  getItem(k: string) {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v))
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  clear() {
    this.map.clear()
  }
}

const out = new URL('./', import.meta.url)
const rows = (l: number) => JSON.parse(readFileSync(new URL(`../../../public/data/n${l}.json`, import.meta.url), 'utf8'))

function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function bootApp() {
  vi.stubGlobal('localStorage', new MemoryStorage())
  vi.resetModules()
  const data = await import('../../../src/data')
  for (const l of data.LEVELS) data.setLevelInfo(l, rows(l).map((r: never, i: number) => data.parseRow(l, r, i)))
  const store = await import('../../../src/store')
  const srs = await import('../../../src/srs')
  const backup = await import('../../../src/backup')
  return { data, store, srs, backup }
}

type App = Awaited<ReturnType<typeof bootApp>>

/** One day of study from 08:00: answer what the queue offers, like a learner, up to `max` answers. */
function studyDay(app: App, day: Date, rnd: () => number, max = 400) {
  const t = new Date(day)
  t.setHours(8, 0, 0, 0)
  for (let i = 0; i < max; i++) {
    vi.setSystemTime(t)
    const q = app.srs.buildQueue(app.store.getState(), t, undefined, { finishNow: true })
    if (!q.next) break
    const x = rnd()
    const reading = q.next.id.endsWith(':r')
    const grade = reading ? (x < 0.15 ? 1 : 3) : x < 0.12 ? 1 : x < 0.2 ? 2 : x < 0.92 ? 3 : 4
    app.srs.answer(q.next.id, grade as 1, new Date(t), 4000 + Math.floor(rnd() * 8000))
    t.setTime(t.getTime() + 6000 + Math.floor(rnd() * 9000))
  }
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

it('generates the legacy fixtures', async () => {
  process.env.TZ = 'Asia/Seoul'
  vi.useFakeTimers({ toFake: ['Date'] })

  // ── a v3 learner (fast-track on): N5–N3 with lower levels, then some N2 and N1, then back; mid-session at the end ──
  const start = new Date(2026, 7, 1)
  vi.setSystemTime(start)
  const app = await bootApp()
  const rnd = rng(7)
  app.store.update((d) => {
    d.onboarded = true
    Object.assign(d.settings, { target: 3, includeLower: true, dailyNew: 40, fastTrack: true, examDate: '2026-12-06', goal: 0.8 })
  })
  let day = start
  const phase = (days: number, settings: object) => {
    app.store.update((d) => Object.assign(d.settings, settings))
    for (let i = 0; i < days; i++, day = addDays(day, 1)) if (rnd() > 0.08) studyDay(app, day, rnd)
  }
  phase(48, { target: 3, includeLower: true })
  phase(10, { target: 2, includeLower: false })
  phase(10, { target: 1, includeLower: false })
  phase(36, { target: 2, includeLower: true, dailyNew: 25 })
  // bookmarks across levels (words that have a card, and a few that do not)
  const ids = Object.keys(app.store.getState().cards)
  for (let i = 0; i < 70; i++) {
    const id = ids[Math.floor(rnd() * ids.length)].replace(/:r$/, '')
    if (!app.store.getState().marks.includes(id)) app.store.toggleMark(id)
  }
  for (const id of ['1-2698', '2-0', '4-667', '5-717']) if (!app.store.getState().marks.includes(id)) app.store.toggleMark(id)
  // today: part of the day's session done, learning cards still pending (a learner who stopped mid-session)
  const today = new Date(2026, 10, 13)
  studyDay(app, today, rnd, 37)
  vi.setSystemTime(new Date(2026, 10, 13, 9, 0, 0))
  const s = app.store.getState()
  expect(Object.keys(s.cards).length).toBeGreaterThan(2000)
  expect(Object.keys(s.cards).some((id) => id.endsWith(':r'))).toBe(true)
  for (const l of [1, 2, 3, 4, 5]) expect(Object.keys(s.cards).some((id) => id.startsWith(`${l}-`))).toBe(true)
  writeFileSync(new URL('state-v3.json', out), localStorage.getItem(app.store.STATE_KEY)!)
  writeFileSync(new URL('backup-format2-v3.json', out), JSON.stringify(app.backup.backupFile(s, new Date(2026, 10, 13, 9, 0, 0))))

  // ── a v2 learner (before the fast-track and the save counter): N5 only, meaning cards ──
  const start2 = new Date(2026, 9, 1)
  vi.setSystemTime(start2)
  const app2 = await bootApp()
  const rnd2 = rng(11)
  app2.store.update((d) => {
    d.onboarded = true
    Object.assign(d.settings, { target: 4, includeLower: true, dailyNew: 20, fastTrack: false, examDate: '2026-12-06' })
  })
  for (let i = 0; i < 30; i++) studyDay(app2, addDays(start2, i), rnd2)
  for (const id of ['5-3', '4-10', '5-500', '4-1']) app2.store.toggleMark(id)
  const s2 = app2.store.getState()
  const { rev: _rev, bestE: _bestE, ...rest } = s2
  const { fastTrack: _ft, autoSpeak: _as, includeLower: _il, goal: _g, ...settings2 } = s2.settings
  // as the first deployed version (#1) saved it: v 2, fewer settings (and the AI key of that time)
  const plain = { ...rest, v: 2, settings: { ...settings2, apiKey: 'sk-ant-fixture' } }
  writeFileSync(new URL('backup-plain-v2.json', out), JSON.stringify(plain))
  // the format-1 exporter (cc122b2..5e2bfad): the state of that time inside the envelope
  const format1 = { format: 'jlpt-luma-backup', formatVersion: 1, app: 'jlpt-ruma 0.1.0', exportedAt: '2026-11-13T00:00:00.000Z', ...rest, v: 2, settings: { ...s2.settings, fastTrack: undefined } }
  writeFileSync(new URL('backup-format1-v2.json', out), JSON.stringify(format1))
  vi.useRealTimers()
})
