// The iOS app's platform (Capacitor). Loaded only by startPlatform() in a `--mode native` build running inside
// the native shell; never part of the web bundle. Plugins are passed in (`NativeDeps`) so the wiring can be
// unit-tested with fakes; `loadDeps` imports the real ones.
import type { AppPlugin } from '@capacitor/app'
import type { BrowserPlugin } from '@capacitor/browser'
import type { FilesystemPlugin } from '@capacitor/filesystem'
import type { HapticsPlugin } from '@capacitor/haptics'
import type { LocalNotificationsPlugin } from '@capacitor/local-notifications'
import type { SharePlugin } from '@capacitor/share'
import type { StatusBarPlugin } from '@capacitor/status-bar'
import type { TextToSpeechPlugin } from '@capacitor-community/text-to-speech'
import type { FilePickerPlugin } from '@capawesome/capacitor-file-picker'
import { getState, hydrate, LEGACY_KEY, setStoreHooks, STATE_KEY } from '../store'
import { DurableStore, legacyCopy, reconcile, type FileAdapter } from './durable'
import { DEFAULT_PREFS, getPrefs, initPrefs, setPrefs } from './prefs'
import { isReminderId, planReminders, type PlannedReminder } from './reminders'
import type { Platform } from './types'
import { webSpeak } from './web'
import { widgetSnapshot } from './widget'
import './native.css'

/** The app's own small plugin (ios/App/App/WidgetBridgePlugin.swift): writes the widget's data to the App Group. */
export interface WidgetBridgePlugin {
  setSnapshot(o: { json: string }): Promise<void>
  clear(): Promise<void>
}

export interface NativeDeps {
  App: AppPlugin
  Browser: BrowserPlugin
  Filesystem: FilesystemPlugin
  Haptics: HapticsPlugin
  LocalNotifications: LocalNotificationsPlugin
  Share: SharePlugin
  StatusBar: StatusBarPlugin
  TextToSpeech: TextToSpeechPlugin
  FilePicker: FilePickerPlugin
  WidgetBridge: WidgetBridgePlugin
}

/** Plugin enum values, spelled out so this module needs no runtime import from the plugin packages. */
const DIR_LIBRARY = 'LIBRARY' as never // Directory.Library: app-private, kept by the OS, included in device backups
const DIR_CACHE = 'CACHE' as never // Directory.Cache: the exported backup file, only until it is shared
const UTF8 = 'utf8' as never
const IMPACT_LIGHT = 'LIGHT' as never
const NOTIFY_SUCCESS = 'SUCCESS' as never
const STYLE_DARK = 'DARK' as never // light text, for the dark theme
const STYLE_LIGHT = 'LIGHT' as never // dark text, for the light theme

export async function loadDeps(): Promise<NativeDeps> {
  const [core, app, browser, fs, haptics, ln, share, sb, tts, fp] = await Promise.all([
    import('@capacitor/core'),
    import('@capacitor/app'),
    import('@capacitor/browser'),
    import('@capacitor/filesystem'),
    import('@capacitor/haptics'),
    import('@capacitor/local-notifications'),
    import('@capacitor/share'),
    import('@capacitor/status-bar'),
    import('@capacitor-community/text-to-speech'),
    import('@capawesome/capacitor-file-picker'),
  ])
  return {
    App: app.App,
    Browser: browser.Browser,
    Filesystem: fs.Filesystem,
    Haptics: haptics.Haptics,
    LocalNotifications: ln.LocalNotifications,
    Share: share.Share,
    StatusBar: sb.StatusBar,
    TextToSpeech: tts.TextToSpeech,
    FilePicker: fp.FilePicker,
    WidgetBridge: core.registerPlugin<WidgetBridgePlugin>('WidgetBridge'),
  }
}

// ── files ──

const DIR = 'ruma'
const PREFS_FILE = 'prefs.json'
/**
 * The state as the version before stable ids saved it (v2/v3), written once before the durable slots are first
 * overwritten with the migrated state: the device's recoverable copy if the migration ever turns out wrong
 * (docs/plan/08 §7.5). localStorage's LEGACY_KEY holds the same, but iOS may evict localStorage. Removed by
 * "모든 기록 초기화".
 */
export const PREMIGRATION_FILE = 'state-v3-premigration.json'

export function fileAdapter(Filesystem: FilesystemPlugin): FileAdapter {
  const at = (name: string) => ({ path: `${DIR}/${name}`, directory: DIR_LIBRARY })
  return {
    read: (name) =>
      Filesystem.readFile({ ...at(name), encoding: UTF8 }).then(
        (r) => (typeof r.data === 'string' ? r.data : null),
        () => null,
      ),
    write: (name, data) => Filesystem.writeFile({ ...at(name), data, encoding: UTF8, recursive: true }).then(() => {}),
    remove: (name) => Filesystem.deleteFile(at(name)).catch(() => {}),
  }
}

const cancelled = (e: unknown) => /cancel/i.test(String((e as { message?: unknown })?.message ?? e))

/** Backup export: write the file to the cache directory, then the share sheet (Save to Files, AirDrop, …). */
export async function shareFile(d: Pick<NativeDeps, 'Filesystem' | 'Share'>, name: string, json: string): Promise<boolean> {
  let uri: string
  try {
    uri = (await d.Filesystem.writeFile({ path: name, data: json, directory: DIR_CACHE, encoding: UTF8 })).uri
  } catch {
    alert('백업 파일을 만들지 못했어요. 기기의 저장 공간을 확인해 주세요.')
    return false
  }
  try {
    await d.Share.share({ title: name, files: [uri] })
    return true
  } catch (e) {
    if (!cancelled(e)) alert('공유 화면을 열지 못했어요. 잠시 뒤 다시 시도해 주세요.')
    return false
  } finally {
    void d.Filesystem.deleteFile({ path: name, directory: DIR_CACHE }).catch(() => {})
  }
}

/** UTF-8 text from base64 (the picker returns file contents as base64). */
export function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/** Backup import: the system document picker, JSON files only. null when cancelled. */
export async function pickTextFile(d: Pick<NativeDeps, 'FilePicker'>): Promise<string | null> {
  let res
  try {
    res = await d.FilePicker.pickFiles({ types: ['application/json'], limit: 1, readData: true })
  } catch (e) {
    if (!cancelled(e)) alert('파일을 열지 못했어요.')
    return null
  }
  const data = res.files[0]?.data
  return data ? decodeBase64Utf8(data) : null
}

// ── reminders ──

/** Make the pending reminders exactly `plan`: cancel ours that are pending, schedule the plan. */
export async function applyReminderPlan(LN: LocalNotificationsPlugin, plan: PlannedReminder[]): Promise<void> {
  const { notifications } = await LN.getPending()
  const ours = notifications.filter((n) => isReminderId(n.id)).map((n) => ({ id: n.id }))
  if (ours.length) await LN.cancel({ notifications: ours })
  if (!plan.length) return
  await LN.schedule({
    notifications: plan.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      schedule: { at: new Date(r.at) },
      extra: { route: '/study' },
    })),
  })
}

export type Permission = 'granted' | 'denied' | 'prompt'

// ── the running app ──

interface Ctx {
  d: NativeDeps
  durable: DurableStore
  files: FileAdapter
  now: () => Date
  refreshTimer: ReturnType<typeof setTimeout> | null
  voices: Promise<{ index: number; name: string; voiceURI: string; lang: string }[]> | null
}
let ctx: Ctx | null = null

async function permission(d: NativeDeps): Promise<Permission> {
  try {
    const p = (await d.LocalNotifications.checkPermissions()).display
    return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'prompt'
  } catch {
    return 'denied'
  }
}

/** Re-plan reminders and refresh the widget now. Errors are kept quiet: neither may disturb studying. */
export async function refreshNow(): Promise<void> {
  if (!ctx) return
  const { d, now } = ctx
  const s = getState()
  const t = now()
  const prefs = getPrefs()
  try {
    const allowed = prefs.reminders.enabled && (await permission(d)) === 'granted'
    await applyReminderPlan(d.LocalNotifications, allowed ? planReminders(s, prefs.reminders, t) : [])
  } catch (e) {
    console.warn('reminders', e)
  }
  try {
    await d.WidgetBridge.setSnapshot({ json: JSON.stringify(widgetSnapshot(s, t)) })
  } catch (e) {
    console.warn('widget', e)
  }
}

function refreshSoon(ms = 1500) {
  if (!ctx) return
  if (ctx.refreshTimer) clearTimeout(ctx.refreshTimer)
  ctx.refreshTimer = setTimeout(() => {
    if (ctx) ctx.refreshTimer = null
    void refreshNow()
  }, ms)
}

export const reminderPermission = async (): Promise<Permission> => (ctx ? permission(ctx.d) : 'denied')

/**
 * Turn reminders on: asks iOS for permission if it has not been asked (only ever from a tap on an in-app
 * explanation or the settings switch), then schedules. Returns the permission state.
 */
export async function enableReminders(): Promise<Permission> {
  if (!ctx) return 'denied'
  let p = await permission(ctx.d)
  if (p === 'prompt') {
    try {
      const r = (await ctx.d.LocalNotifications.requestPermissions()).display
      p = r === 'granted' ? 'granted' : 'denied'
    } catch {
      p = 'denied'
    }
  }
  setPrefs({ reminderAsked: true, reminders: { ...getPrefs().reminders, enabled: p === 'granted' } })
  await refreshNow()
  return p
}

export function setReminderPrefs(patch: Partial<ReturnType<typeof getPrefs>['reminders']>) {
  setPrefs({ reminders: { ...getPrefs().reminders, ...patch } })
  refreshSoon(300)
}

/** The installed Japanese voices, with their index in the plugin's voice list (what `speak` takes). */
export function japaneseVoices() {
  if (!ctx) return Promise.resolve([])
  ctx.voices ??= ctx.d.TextToSpeech.getSupportedVoices().then(
    ({ voices }) =>
      voices
        .map((v, index) => ({ index, name: v.name, voiceURI: v.voiceURI, lang: v.lang }))
        .filter((v) => v.lang.toLowerCase().startsWith('ja')),
    () => [],
  )
  return ctx.voices
}

const reducedMotion = () => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function speakNative(d: NativeDeps, text: string) {
  const t = text.replace(/[～~]/g, '')
  const uri = getPrefs().voiceURI
  void japaneseVoices()
    .then((vs) => {
      const v = uri ? vs.find((x) => x.voiceURI === uri) : undefined
      // 'playback': audible with the ring/silent switch on silent, like a media app; the speech is always tapped for
      return d.TextToSpeech.speak({ text: t, lang: 'ja-JP', rate: 0.9, voice: v?.index, category: 'playback' })
    })
    // no Japanese voice or the engine failed: the web view's own speech is the fallback
    .catch(() => webSpeak(t))
}

// ── lifecycle, status bar, links (DOM wiring, skipped where there is no DOM) ──

function syncStatusBar(d: NativeDeps) {
  const root = document.documentElement
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  void d.StatusBar.setStyle({ style: dark ? STYLE_DARK : STYLE_LIGHT }).catch(() => {})
}

/** A local text file (the data licence notice) shown in a sheet: the web view must not navigate away from the app. */
async function showTextSheet(href: string) {
  let text: string
  try {
    text = await (await fetch(href)).text()
  } catch {
    return
  }
  const back = document.createElement('div')
  back.className = 'sheet-backdrop'
  const sheet = document.createElement('div')
  sheet.className = 'sheet text-sheet'
  sheet.setAttribute('role', 'dialog')
  sheet.setAttribute('aria-modal', 'true')
  const close = document.createElement('button')
  close.className = 'btn ghost'
  close.textContent = '닫기'
  const pre = document.createElement('pre')
  pre.textContent = text
  sheet.append(close, pre)
  back.append(sheet)
  const done = () => back.remove()
  back.addEventListener('click', (e) => e.target === back && done())
  close.addEventListener('click', done)
  document.body.append(back)
}

function wireDom(d: NativeDeps) {
  if (typeof document === 'undefined') return
  // links that would open a new browser window: web pages in the in-app Safari view, local files in a sheet
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target !== '_blank') return
      e.preventDefault()
      const url = new URL(a.getAttribute('href')!, location.href)
      // the app's own files (capacitor://localhost/…) are shown in place; other web pages in the Safari view
      if (url.origin === location.origin) void showTextSheet(url.href)
      else if (url.protocol === 'https:' || url.protocol === 'http:') void d.Browser.open({ url: url.href }).catch(() => {})
    },
    true,
  )
  syncStatusBar(d)
  new MutationObserver(() => syncStatusBar(d)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => syncStatusBar(d))
  // assets are bundled in the app: a service worker is never needed here (and WKWebView would not run it)
  void navigator.serviceWorker
    ?.getRegistrations?.()
    .then((rs) => rs.forEach((r) => void r.unregister()))
    .catch(() => {})
}

export async function createNativePlatform(d?: NativeDeps, now: () => Date = () => new Date()): Promise<Platform> {
  d ??= await loadDeps()
  const files = fileAdapter(d.Filesystem)
  const durable = new DurableStore(files)
  ctx = { d, durable, files, now, refreshTimer: null, voices: null }

  // 1. which copy of the study state to start from (before the first render)
  let localRaw: string | null = null
  let localLegacy: string | null = null
  try {
    localRaw = localStorage.getItem(STATE_KEY)
    localLegacy = localStorage.getItem(LEGACY_KEY)
  } catch {
    /* unreadable: counts as empty */
  }
  const slots = await durable.readSlots()
  // before any slot is overwritten with a migrated state: keep the pre-migration copy once, as a file
  const pre = legacyCopy([localLegacy, ...slots])
  if (pre !== null && (await files.read(PREMIGRATION_FILE)) === null) await files.write(PREMIGRATION_FILE, pre).catch(() => {})
  // a slot of either version competes on its save counter (the migration keeps the counter); `hydrate` migrates
  const decision = reconcile(localRaw, slots)
  if (decision.use === 'durable') hydrate(decision.raw)
  else if (decision.writeDurable) {
    durable.schedule(decision.raw)
    await durable.flush()
  }

  // 2. device settings
  let stored: unknown = null
  try {
    stored = JSON.parse((await files.read(PREFS_FILE)) ?? 'null')
  } catch {
    /* damaged: defaults */
  }
  initPrefs(stored, (p) => void files.write(PREFS_FILE, JSON.stringify(p)).catch(() => {}))

  // 3. every save is mirrored; reminders and the widget follow the state
  setStoreHooks({
    onSave: (raw) => {
      durable.schedule(raw)
      refreshSoon()
    },
    onReset: () => {
      void (async () => {
        // the old history must not survive in the other slot: clear both, then keep the fresh state
        await durable.clear()
        await files.remove(PREMIGRATION_FILE).catch(() => {})
        durable.schedule(JSON.stringify(getState()))
        await durable.flush()
        initPrefs(DEFAULT_PREFS, (p) => void files.write(PREFS_FILE, JSON.stringify(p)).catch(() => {}))
        await files.write(PREFS_FILE, JSON.stringify(DEFAULT_PREFS)).catch(() => {})
        await refreshNow()
      })()
    },
  })

  // 4. lifecycle: back to the foreground rolls the day over (useClock listens to visibilitychange) and
  // re-plans; going to the background writes the durable copy at once
  void d.App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      if (typeof document !== 'undefined') document.dispatchEvent(new Event('visibilitychange'))
      void refreshNow()
    } else void durable.flush()
  })
  // Android's back button (iOS has none; the app's own close/back buttons cover it there)
  void d.App.addListener('backButton', ({ canGoBack }) => {
    if (location.hash && location.hash !== '#/' && canGoBack) history.back()
    else if (location.hash && location.hash !== '#/') location.hash = '#/'
    else void d.App.exitApp()
  })
  // a tapped reminder opens today's session
  void d.LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    if (isReminderId(a.notification.id)) location.hash = '#/study'
  })
  wireDom(d)
  void refreshNow()

  const deps = d
  return {
    native: true,
    speak: (text) => speakNative(deps, text),
    haptic: (kind) => {
      if (!getPrefs().haptics || reducedMotion()) return
      const p = kind === 'answer' ? deps.Haptics.impact({ style: IMPACT_LIGHT }) : deps.Haptics.notification({ type: NOTIFY_SUCCESS })
      void p.catch(() => {})
    },
    saveFile: (name, json) => shareFile(deps, name, json),
    pickFile: () => pickTextFile(deps),
    clearDeviceData: async () => {
      await applyReminderPlan(deps.LocalNotifications, []).catch(() => {})
      await deps.WidgetBridge.clear().catch(() => {})
      await durable.clear()
      await files.remove(PREMIGRATION_FILE).catch(() => {})
      await files.remove(PREFS_FILE)
      initPrefs(DEFAULT_PREFS, (p) => void files.write(PREFS_FILE, JSON.stringify(p)).catch(() => {}))
    },
  }
}

/** For tests: forget the running app. */
export const _resetNativeForTests = () => {
  if (ctx?.refreshTimer) clearTimeout(ctx.refreshTimer)
  ctx = null
}
