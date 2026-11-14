import { describe, expect, it } from 'vitest'
import type { ReminderPrefs } from '../../src/platform/reminders'
import { at, bootUser, card, DAY, HOUR, L } from './helpers'

const ON: ReminderPrefs = { enabled: true, hour: 20, minute: 0, quietDays: [] }
const NOW = '2026-11-13T09:00:00' // a Friday, Asia/Seoul

async function setup(extra: Parameters<typeof bootUser>[2] = {}, settings: Parameters<typeof bootUser>[1] = {}, now = NOW) {
  const b = await bootUser(now, { dailyNew: 10, ...settings }, extra)
  const r = await import('../../src/platform/reminders')
  return { ...b, r }
}

describe('planReminders', () => {
  it('nothing when off, or before onboarding', async () => {
    const { store, r } = await setup({ cards: { [L('5-0')]: card({ due: at('2026-11-13T08:00:00').getTime() }) } })
    expect(r.planReminders(store.getState(), { ...ON, enabled: false }, at(NOW))).toEqual([])
    expect(r.planReminders({ ...store.getState(), onboarded: false }, ON, at(NOW))).toEqual([])
  })

  it('today at the chosen time with the real counts, then only days with reviews due', async () => {
    const t = (s: string) => at(s).getTime()
    const { store, r } = await setup({
      cards: {
        [L('5-0')]: card({ due: t('2026-11-12T10:00:00') }), // overdue
        [L('5-1')]: card({ due: t('2026-11-13T15:00:00') }), // later today
        [L('5-2')]: card({ due: t('2026-11-15T07:00:00') }), // Sunday
      },
    })
    const plan = r.planReminders(store.getState(), ON, at(NOW))
    expect(plan.map((p) => [p.day, p.reviews])).toEqual([
      ['2026-11-13', 2],
      // nothing new comes due on Saturday, but the two from today are still waiting if today is skipped
      ['2026-11-14', 2],
      ['2026-11-15', 3],
      ['2026-11-16', 3],
      ['2026-11-17', 3],
      ['2026-11-18', 3],
      ['2026-11-19', 3],
    ])
    expect(plan[0]).toMatchObject({ id: 20261113, at: t('2026-11-13T20:00:00'), fresh: 10 })
    expect(plan[0].title).toBe('복습할 단어 2개가 돌아왔어요')
    expect(plan[0].body).toContain('새 단어 10개')
  })

  it('at most one a day, ids unique per day, within the horizon', async () => {
    const cards = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [L(`5-${i}`), card({ due: at(NOW).getTime() + i * 6 * HOUR })]))
    const { store, r } = await setup({ cards })
    const plan = r.planReminders(store.getState(), ON, at(NOW))
    expect(plan.length).toBe(r.HORIZON_DAYS)
    expect(new Set(plan.map((p) => p.day)).size).toBe(plan.length)
    expect(new Set(plan.map((p) => p.id)).size).toBe(plan.length)
    expect(plan.every((p) => r.isReminderId(p.id))).toBe(true)
  })

  it('a day with only new words and no reviews gets no reminder', async () => {
    const { store, r } = await setup({ cards: { [L('5-0')]: card({ due: at('2026-11-16T09:00:00').getTime() }) } })
    expect(r.planReminders(store.getState(), ON, at(NOW)).map((p) => p.day)[0]).toBe('2026-11-16')
  })

  it('nothing today once the day is done; tomorrow still planned', async () => {
    const { store, srs, r } = await setup({
      cards: { [L('5-0')]: card({ due: at('2026-11-13T08:00:00').getTime() }), [L('5-1')]: card({ due: at('2026-11-14T08:00:00').getTime() }) },
    }, { dailyNew: 0 })
    expect(r.planReminders(store.getState(), ON, at(NOW))[0].day).toBe('2026-11-13')
    srs.answer(L('5-0'), srs.Rating.Good, at('2026-11-13T09:01:00'))
    const plan = r.planReminders(store.getState(), ON, at('2026-11-13T09:02:00'))
    expect(plan[0].day).toBe('2026-11-14')
    expect(r.workOn(store.getState(), at('2026-11-13T00:00:00'), at('2026-11-13T09:02:00')).done).toBe(true)
  })

  it('not in the past: after the chosen time, the first reminder is tomorrow', async () => {
    const { store, r } = await setup({ cards: { [L('5-0')]: card({ due: at('2026-11-13T08:00:00').getTime() }) } }, {}, '2026-11-13T20:30:00')
    expect(r.planReminders(store.getState(), ON, at('2026-11-13T20:30:00'))[0]).toMatchObject({ day: '2026-11-14', at: at('2026-11-14T20:00:00').getTime() })
    // a minute before the time it is still today
    expect(r.planReminders(store.getState(), { ...ON, hour: 20, minute: 31 }, at('2026-11-13T20:30:00'))[0].day).toBe('2026-11-13')
  })

  it('quiet weekdays are skipped', async () => {
    const { store, r } = await setup({ cards: { [L('5-0')]: card({ due: at('2026-11-12T08:00:00').getTime() }) } })
    const plan = r.planReminders(store.getState(), { ...ON, quietDays: [6, 0] }, at(NOW)) // Sat, Sun
    expect(plan.map((p) => p.day)).toEqual(['2026-11-13', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'])
  })

  it('a word with a meaning and a reading card counts once on future days, and resting reading cards not at all', async () => {
    const due = at('2026-11-12T08:00:00').getTime()
    const { store, r } = await setup({ cards: { [L('5-0')]: card({ due }), [L('5-0:r')]: card({ due }), [L('5-1:r')]: card({ due }) } }, { fastTrack: true })
    expect(r.workOn(store.getState(), at('2026-11-14T00:00:00'), at(NOW)).reviews).toBe(2)
    store.update((d) => void (d.settings = { ...d.settings, fastTrack: false }))
    expect(r.workOn(store.getState(), at('2026-11-14T00:00:00'), at(NOW)).reviews).toBe(1)
  })

  it('the message without new words', async () => {
    const { r } = await setup()
    expect(r.reminderText(3, 0)).toEqual({ title: '복습할 단어 3개가 돌아왔어요', body: '잊기 전에 한 번 더 보면 오래 남아요.' })
  })

  it('ids are the day as yyyymmdd', async () => {
    const { r } = await setup()
    expect(r.reminderId(at('2026-11-13T23:59:00'))).toBe(20261113)
    expect(r.isReminderId(20261113)).toBe(true)
    expect(r.isReminderId(42)).toBe(false)
    expect(r.planReminders).toBeTypeOf('function')
    expect(DAY).toBe(86400000)
  })
})

describe('widget snapshot', () => {
  it('one entry per day, today done flag, readiness figure', async () => {
    const { store } = await setup({ cards: { [L('5-0')]: card({ due: at('2026-11-13T08:00:00').getTime() }) } })
    const { widgetSnapshot } = await import('../../src/platform/widget')
    const w = widgetSnapshot(store.getState(), at(NOW))
    expect(w.days.map((d) => d.day)).toEqual(['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'])
    expect(w.days[0]).toEqual({ day: '2026-11-13', due: 1, fresh: 10, done: false })
    expect(w).toMatchObject({ v: 1, onboarded: true, levels: 'N5', total: 718, examDate: '2026-12-06' })
    expect(typeof w.plan).toBe('number')
    expect(JSON.parse(JSON.stringify(w))).toEqual(w)
  })
  it('no readiness figure once the exam is past', async () => {
    const { store } = await setup({}, { examDate: '2026-07-05' })
    const { widgetSnapshot } = await import('../../src/platform/widget')
    expect(widgetSnapshot(store.getState(), at(NOW)).plan).toBeNull()
  })
})

describe('native prefs', () => {
  it('normalises whatever was stored', async () => {
    const { normalizePrefs, DEFAULT_PREFS } = await import('../../src/platform/prefs')
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(normalizePrefs({ reminders: { enabled: true, hour: 25, minute: -1, quietDays: [6, 6, 9, 'x', 0] }, haptics: false, voiceURI: '' })).toEqual({
      reminders: { enabled: true, hour: 20, minute: 0, quietDays: [0, 6] },
      reminderAsked: false,
      haptics: false,
      voiceURI: null,
    })
  })
})
