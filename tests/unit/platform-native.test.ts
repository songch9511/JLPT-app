import { afterEach, describe, expect, it, vi } from 'vitest'
import { at, bootUser, card, KEY, MemoryStorage } from './helpers'

/** Fake Capacitor plugins: an in-memory Library directory, a share sheet, a picker, notifications, haptics… */
function fakes(opts: { permission?: 'granted' | 'denied' | 'prompt'; shareCancels?: boolean; pickCancels?: boolean; pickData?: string } = {}) {
  const files = new Map<string, string>()
  const key = (o: { path: string; directory?: string }) => `${o.directory}/${o.path}`
  const pending: { id: number; title?: string; body?: string; schedule?: { at: Date } }[] = []
  const listeners: Record<string, (x: unknown) => void> = {}
  let perm = opts.permission ?? 'granted'
  const d = {
    Filesystem: {
      readFile: vi.fn(async (o: { path: string; directory: string }) => {
        if (!files.has(key(o))) throw new Error('File does not exist')
        return { data: files.get(key(o))! }
      }),
      writeFile: vi.fn(async (o: { path: string; directory: string; data: string }) => {
        files.set(key(o), o.data)
        return { uri: `file:///${o.directory}/${o.path}` }
      }),
      deleteFile: vi.fn(async (o: { path: string; directory: string }) => void files.delete(key(o))),
    },
    Share: { share: vi.fn(async () => (opts.shareCancels ? Promise.reject(new Error('Share canceled')) : { activityType: 'com.apple.DocumentManagerUICore.SaveToFiles' })) },
    FilePicker: {
      pickFiles: vi.fn(async () => (opts.pickCancels ? Promise.reject(new Error('pickFiles canceled.')) : { files: [{ name: 'b.json', data: opts.pickData }] })),
    },
    LocalNotifications: {
      checkPermissions: vi.fn(async () => ({ display: perm })),
      requestPermissions: vi.fn(async () => {
        perm = 'granted'
        return { display: perm }
      }),
      getPending: vi.fn(async () => ({ notifications: [...pending] })),
      cancel: vi.fn(async ({ notifications }: { notifications: { id: number }[] }) => {
        for (const n of notifications) pending.splice(pending.findIndex((p) => p.id === n.id), 1)
      }),
      schedule: vi.fn(async ({ notifications }: { notifications: typeof pending }) => void pending.push(...notifications)),
      addListener: vi.fn(async (ev: string, f: (x: unknown) => void) => void (listeners[ev] = f)),
    },
    Haptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) },
    TextToSpeech: {
      speak: vi.fn(async () => {}),
      getSupportedVoices: vi.fn(async () => ({
        voices: [
          { name: 'Samantha', lang: 'en-US', voiceURI: 'en.samantha', default: true, localService: true },
          { name: 'Kyoko', lang: 'ja-JP', voiceURI: 'ja.kyoko', default: false, localService: true },
        ],
      })),
    },
    App: { addListener: vi.fn(async (ev: string, f: (x: unknown) => void) => void (listeners[ev] = f)), exitApp: vi.fn() },
    Browser: { open: vi.fn(async () => {}) },
    StatusBar: { setStyle: vi.fn(async () => {}) },
    WidgetBridge: { setSnapshot: vi.fn(async () => {}), clear: vi.fn(async () => {}) },
  }
  return { d, files, pending, listeners }
}

const SLOT_A = 'LIBRARY/ruma/state-a.json'
const SLOT_B = 'LIBRARY/ruma/state-b.json'

async function start(f: ReturnType<typeof fakes>) {
  const native = await import('../../src/platform/native')
  const platform = await native.createNativePlatform(f.d as never, () => new Date())
  return { native, platform }
}

afterEach(async () => {
  ;(await import('../../src/platform/native'))._resetNativeForTests()
})

describe('native start: which copy of the study state the app opens with', () => {
  it('localStorage evicted: the durable copy is restored before the first render', async () => {
    const b = await bootUser('2026-11-13T09:00:00')
    const durable = JSON.stringify({ ...b.store.getState(), xp: 777, rev: 50 })
    // a fresh launch after iOS cleared the web view's storage
    const ls = new MemoryStorage()
    vi.stubGlobal('localStorage', ls)
    vi.resetModules()
    const store = await import('../../src/store')
    expect(store.getState().onboarded).toBe(false)
    const f = fakes()
    f.files.set(SLOT_A, durable)
    await start(f)
    expect(store.getState()).toMatchObject({ onboarded: true, xp: 777, rev: 50 })
    expect(JSON.parse(ls.getItem(KEY)!).xp).toBe(777)
  })

  it('first launch with data only in localStorage: it is mirrored to a durable file at once', async () => {
    const b = await bootUser('2026-11-13T09:00:00', {}, { xp: 33 })
    const f = fakes()
    await start(f)
    expect(JSON.parse(f.files.get(SLOT_A)!).xp).toBe(33)
    expect(b.store.getState().xp).toBe(33)
  })

  it('every later save is written through (debounced) to alternating slots', async () => {
    const b = await bootUser('2026-11-13T09:00:00', {}, { xp: 1 })
    const f = fakes()
    await start(f)
    b.store.update((d) => void (d.xp = 2))
    await vi.waitFor(() => expect(JSON.parse(f.files.get(SLOT_B) ?? 'null')?.xp).toBe(2), { timeout: 2000 })
  })
})

describe('backup export and import go through the share sheet and the document picker', () => {
  it('export: writes the file, opens the share sheet, records the export only when shared', async () => {
    const b = await bootUser('2026-11-13T09:00:00', {}, { xp: 12 })
    const f = fakes()
    const { platform } = await start(f)
    const backup = await import('../../src/backup')
    const ok = await platform.saveFile('jlpt-ruma-backup-2026-11-13.json', JSON.stringify(backup.backupFile(b.store.getState())))
    expect(ok).toBe(true)
    expect(f.d.Filesystem.writeFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'jlpt-ruma-backup-2026-11-13.json', directory: 'CACHE', encoding: 'utf8' }))
    expect(f.d.Share.share).toHaveBeenCalledWith({ title: 'jlpt-ruma-backup-2026-11-13.json', files: ['file:///CACHE/jlpt-ruma-backup-2026-11-13.json'] })
    // the temporary file is removed after sharing
    await vi.waitFor(() => expect(f.files.has('CACHE/jlpt-ruma-backup-2026-11-13.json')).toBe(false))
  })

  it('the app’s 백업 내보내기 (backup.ts) uses the share sheet and records the day only once shared', async () => {
    await bootUser('2026-11-13T09:00:00', {}, { xp: 12 })
    const ok = fakes()
    const { platform } = await start(ok)
    const idx = await import('../../src/platform')
    idx._setPlatformForTests(platform)
    const backup = await import('../../src/backup')
    backup.exportBackup()
    await vi.waitFor(() => expect(backup.getMeta().lastExport).toBe('2026-11-13'))
    const shared = ok.d.Filesystem.writeFile.mock.calls.find((c) => c[0].directory === 'CACHE')![0]
    expect(JSON.parse(shared.data)).toMatchObject({ format: 'jlpt-luma-backup', xp: 12 })
    expect(JSON.parse(shared.data)).not.toHaveProperty('rev')
  })

  it('a cancelled share does not count as a backup', async () => {
    await bootUser('2026-11-13T09:00:00')
    const f = fakes({ shareCancels: true })
    const { platform } = await start(f)
    ;(await import('../../src/platform'))._setPlatformForTests(platform)
    const backup = await import('../../src/backup')
    backup.exportBackup()
    await vi.waitFor(() => expect(f.d.Share.share).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 10))
    expect(backup.getMeta().lastExport).toBeUndefined()
  })

  it('export cancelled in the share sheet: false, no error shown', async () => {
    await bootUser('2026-11-13T09:00:00')
    const alert = vi.fn()
    vi.stubGlobal('alert', alert)
    const f = fakes({ shareCancels: true })
    const { platform } = await start(f)
    expect(await platform.saveFile('x.json', '{}')).toBe(false)
    expect(alert).not.toHaveBeenCalled()
  })

  it('import: JSON files only, contents decoded as UTF-8; cancel gives null', async () => {
    await bootUser('2026-11-13T09:00:00')
    const text = JSON.stringify({ v: 3, settings: { target: 3 }, note: '루마 ルマ' })
    const f = fakes({ pickData: Buffer.from(text, 'utf8').toString('base64') })
    const { platform } = await start(f)
    expect(await platform.pickFile!()).toBe(text)
    expect(f.d.FilePicker.pickFiles).toHaveBeenCalledWith({ types: ['application/json'], limit: 1, readData: true })
    const g = fakes({ pickCancels: true })
    ;(await import('../../src/platform/native'))._resetNativeForTests()
    const { platform: p2 } = await start(g)
    expect(await p2.pickFile!()).toBeNull()
  })
})

describe('reminders, haptics, speech, reset', () => {
  const dueToday = () => ({ cards: { '5-0': card({ due: at('2026-11-13T08:00:00').getTime() }) } })

  it('nothing is scheduled and no permission is asked at launch; enabling asks, then schedules', async () => {
    await bootUser('2026-11-13T09:00:00', {}, dueToday())
    const f = fakes({ permission: 'prompt' })
    const { native } = await start(f)
    await native.refreshNow()
    expect(f.d.LocalNotifications.requestPermissions).not.toHaveBeenCalled()
    expect(f.pending).toEqual([])
    expect(await native.enableReminders()).toBe('granted')
    expect(f.d.LocalNotifications.requestPermissions).toHaveBeenCalledTimes(1)
    expect(f.pending[0]).toMatchObject({ id: 20261113, title: '복습할 단어 1개가 돌아왔어요' })
    const prefs = await import('../../src/platform/prefs')
    expect(prefs.getPrefs()).toMatchObject({ reminderAsked: true, reminders: { enabled: true } })
    // saved for the next launch
    await vi.waitFor(() => expect(JSON.parse(f.files.get('LIBRARY/ruma/prefs.json')!).reminders.enabled).toBe(true))
  })

  it('re-planning replaces what was pending; turning off cancels everything', async () => {
    await bootUser('2026-11-13T09:00:00', {}, dueToday())
    const f = fakes()
    f.pending.push({ id: 20261110 }, { id: 7 }) // a stale reminder of ours, and something that is not ours
    const { native } = await start(f)
    await native.enableReminders()
    expect(f.pending.map((p) => p.id).sort()).toEqual([7, 20261113, 20261114, 20261115, 20261116, 20261117, 20261118, 20261119].sort())
    native.setReminderPrefs({ enabled: false })
    await native.refreshNow()
    expect(f.pending.map((p) => p.id)).toEqual([7])
  })

  it('denied permission: reminders stay off and nothing is scheduled', async () => {
    await bootUser('2026-11-13T09:00:00', {}, dueToday())
    const f = fakes({ permission: 'denied' })
    const { native } = await start(f)
    expect(await native.enableReminders()).toBe('denied')
    expect((await import('../../src/platform/prefs')).getPrefs().reminders.enabled).toBe(false)
    expect(f.pending).toEqual([])
  })

  it('the widget gets the snapshot', async () => {
    await bootUser('2026-11-13T09:00:00', {}, dueToday())
    const f = fakes()
    const { native } = await start(f)
    await native.refreshNow()
    const snap = JSON.parse(f.d.WidgetBridge.setSnapshot.mock.calls.at(-1)![0].json)
    expect(snap.days[0]).toMatchObject({ day: '2026-11-13', due: 1 })
  })

  it('haptics follow the setting', async () => {
    await bootUser('2026-11-13T09:00:00')
    const f = fakes()
    const { platform } = await start(f)
    platform.haptic('answer')
    platform.haptic('done')
    expect(f.d.Haptics.impact).toHaveBeenCalledWith({ style: 'LIGHT' })
    expect(f.d.Haptics.notification).toHaveBeenCalledWith({ type: 'SUCCESS' })
    ;(await import('../../src/platform/prefs')).setPrefs({ haptics: false })
    platform.haptic('answer')
    expect(f.d.Haptics.impact).toHaveBeenCalledTimes(1)
  })

  it('haptics stay silent with reduced motion', async () => {
    await bootUser('2026-11-13T09:00:00')
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduced-motion') }))
    const f = fakes()
    const { platform } = await start(f)
    platform.haptic('answer')
    expect(f.d.Haptics.impact).not.toHaveBeenCalled()
  })

  it('speech: the iOS Japanese voice, the chosen one by its index; the web speech if the plugin fails', async () => {
    await bootUser('2026-11-13T09:00:00')
    const f = fakes()
    const { platform } = await start(f)
    platform.speak('～食べる')
    await vi.waitFor(() => expect(f.d.TextToSpeech.speak).toHaveBeenCalledWith({ text: '食べる', lang: 'ja-JP', rate: 0.9, voice: undefined, category: 'playback' }))
    ;(await import('../../src/platform/prefs')).setPrefs({ voiceURI: 'ja.kyoko' })
    platform.speak('水')
    await vi.waitFor(() => expect(f.d.TextToSpeech.speak).toHaveBeenLastCalledWith(expect.objectContaining({ text: '水', voice: 1 })))
    const web = { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] }
    vi.stubGlobal('window', { speechSynthesis: web })
    vi.stubGlobal('speechSynthesis', web)
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} })
    f.d.TextToSpeech.speak.mockRejectedValueOnce(new Error('Language not supported'))
    platform.speak('山')
    await vi.waitFor(() => expect(web.speak).toHaveBeenCalled())
  })

  it('reset: the old history is removed from both durable slots, reminders cancelled, device settings back to default', async () => {
    const b = await bootUser('2026-11-13T09:00:00', {}, { ...dueToday(), xp: 500 })
    const f = fakes()
    const { native } = await start(f)
    await native.enableReminders()
    b.store.update((d) => void (d.xp = 600)) // fills the second slot
    await vi.waitFor(() => expect(f.files.has(SLOT_B)).toBe(true), { timeout: 2000 })
    b.store.resetAll()
    await vi.waitFor(() => {
      const slots = [f.files.get(SLOT_A), f.files.get(SLOT_B)].filter(Boolean).map((x) => JSON.parse(x!))
      expect(slots.length).toBe(1)
      expect(slots[0]).toMatchObject({ onboarded: false, xp: 0, cards: {} })
    })
    await vi.waitFor(() => expect(f.pending).toEqual([]))
    expect((await import('../../src/platform/prefs')).getPrefs().reminders.enabled).toBe(false)
  })

  it('clearDeviceData (the recovery screen) removes the durable copy, reminders, widget data and settings', async () => {
    await bootUser('2026-11-13T09:00:00', {}, dueToday())
    const f = fakes()
    const { native, platform } = await start(f)
    await native.enableReminders()
    await platform.clearDeviceData()
    expect([...f.files.keys()].filter((k) => k.startsWith('LIBRARY/'))).toEqual([])
    expect(f.pending).toEqual([])
    expect(f.d.WidgetBridge.clear).toHaveBeenCalled()
  })

  it('a tapped reminder opens today’s session', async () => {
    await bootUser('2026-11-13T09:00:00')
    const loc = { hash: '' }
    vi.stubGlobal('location', loc)
    const f = fakes()
    await start(f)
    f.listeners.localNotificationActionPerformed({ notification: { id: 20261113 } })
    expect(loc.hash).toBe('#/study')
  })
})

describe('web platform stays as it was', () => {
  it('the default platform is the web one: download export, browser speech, no haptics, no picker', async () => {
    vi.resetModules()
    const { platform, isNativeRuntime } = await import('../../src/platform')
    expect(platform.native).toBe(false)
    expect(platform.pickFile).toBeUndefined()
    expect(isNativeRuntime()).toBe(false)
    const a = { href: '', download: '', click: vi.fn() }
    vi.stubGlobal('document', { createElement: () => a })
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    expect(platform.saveFile('b.json', '{}')).toBe(true)
    expect(a).toMatchObject({ download: 'b.json', href: 'blob:x' })
    expect(a.click).toHaveBeenCalled()
    create.mockRestore()
    expect(() => platform.haptic('answer')).not.toThrow()
  })

  it('startPlatform does nothing outside a native build', async () => {
    vi.resetModules()
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true })
    const idx = await import('../../src/platform')
    expect(idx.isNativeRuntime()).toBe(true)
    await idx.startPlatform()
    expect(idx.platform.native).toBe(false)
  })
})
