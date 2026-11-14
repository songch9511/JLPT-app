// The app as built for the iOS shell (`vite --mode native`), in Chromium with a fake Capacitor bridge.
// What this proves: the native JavaScript paths (durable-copy restore before the first render, share-sheet
// export, document-picker import, reminder offer and scheduling, haptics, links, native-only settings) run
// end to end through Capacitor's real plugin proxies. What it cannot prove: anything on iOS itself (WKWebView,
// the Swift plugins, permissions dialogs) — that is the device checklist in docs/plan/10-ios-build.md.
import { expect, test, type Page } from '@playwright/test'
import { NATIVE_PORT } from '../../playwright.config'
import { answer, homeShown, KEY, keyFor, NOW, user } from './fixtures'

test.use({ baseURL: `http://localhost:${NATIVE_PORT}/` })

type Call = [plugin: string, method: string, options: unknown]

/**
 * Installs `window.Capacitor` the way the iOS runtime does (plugin headers + nativePromise/nativeCallback),
 * backed by fakes that record every call in `window.__calls`. `files` seeds the app's Library directory.
 */
async function openShell(page: Page, opts: { state?: unknown; files?: Record<string, string>; permission?: string; hash?: string; pick?: string } = {}) {
  await page.clock.install({ time: NOW })
  await page.addInitScript(
    ({ files, permission, pick, state, key }) => {
      const w = window as unknown as Record<string, unknown>
      if (!sessionStorage.getItem('e2e-seeded')) {
        sessionStorage.setItem('e2e-seeded', '1')
        sessionStorage.setItem('fake-fs', JSON.stringify(files))
        if (state) localStorage.setItem(key, state)
      }
      const fs: Record<string, string> = JSON.parse(sessionStorage.getItem('fake-fs') ?? '{}')
      const saveFs = () => sessionStorage.setItem('fake-fs', JSON.stringify(fs))
      const calls: unknown[] = (w.__calls = [])
      const listeners: Record<string, (x: unknown) => void> = (w.__listeners = {})
      const pending: { id: number }[] = (w.__pending = [])
      let perm = permission
      const k = (o: { path: string; directory: string }) => `${o.directory}/${o.path}`
      const impl: Record<string, Record<string, (o: never) => unknown>> = {
        Filesystem: {
          readFile: (o: { path: string; directory: string }) => {
            if (!(k(o) in fs)) throw new Error('File does not exist')
            return { data: fs[k(o)] }
          },
          writeFile: (o: { path: string; directory: string; data: string }) => {
            fs[k(o)] = o.data
            saveFs()
            return { uri: `file:///${k(o)}` }
          },
          deleteFile: (o: { path: string; directory: string }) => {
            delete fs[k(o)]
            saveFs()
          },
        },
        Share: { share: () => ({ activityType: 'save-to-files' }) },
        FilePicker: { pickFiles: () => ({ files: [{ name: 'b.json', data: btoa(String.fromCharCode(...new TextEncoder().encode(pick ?? ''))) }] }) },
        LocalNotifications: {
          checkPermissions: () => ({ display: perm }),
          requestPermissions: () => ((perm = 'granted'), { display: perm }),
          getPending: () => ({ notifications: [...pending] }),
          cancel: (o: { notifications: { id: number }[] }) => o.notifications.forEach((n) => pending.splice(pending.findIndex((p) => p.id === n.id), 1)),
          schedule: (o: { notifications: { id: number }[] }) => void pending.push(...o.notifications),
        },
        Haptics: { impact: () => {}, notification: () => {} },
        TextToSpeech: { speak: () => {}, getSupportedVoices: () => ({ voices: [{ name: 'Kyoko', lang: 'ja-JP', voiceURI: 'ja.kyoko', default: false, localService: true }] }) },
        App: { exitApp: () => {} },
        Browser: { open: () => {} },
        StatusBar: { setStyle: () => {} },
        WidgetBridge: { setSnapshot: () => {}, clear: () => {} },
      }
      // what the iOS runtime also provides: Capacitor tells the platform from this handler. Without it Capacitor thinks
      // it runs on the web and, before a plugin's first call reaches the bridge, first imports that plugin's web
      // fallback; on a busy dev server that import could finish after the test had already looked (the first haptic
      // tap was then missing, about 1 run in 3 of the full suite)
      w.webkit = { messageHandlers: { bridge: { postMessage: () => {} } } }
      w.Capacitor = {
        isNativePlatform: () => true,
        PluginHeaders: Object.entries(impl).map(([name, m]) => ({
          name,
          methods: [...Object.keys(m).map((n) => ({ name: n, rtype: 'promise' })), { name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' }],
        })),
        nativePromise: (p: string, m: string, o: never) => {
          calls.push([p, m, o])
          return Promise.resolve().then(() => impl[p][m](o))
        },
        nativeCallback: (p: string, _m: string, o: { eventName: string }, cb: (x: unknown) => void) => {
          listeners[`${p}.${o.eventName}`] = cb
          return `${p}.${o.eventName}`
        },
      }
    },
    { files: opts.files ?? {}, permission: opts.permission ?? 'prompt', pick: opts.pick, state: opts.state ? JSON.stringify(opts.state) : null, key: keyFor(opts.state) },
  )
  await page.goto(opts.hash ? `./#${opts.hash}` : './')
}

const calls = (page: Page, plugin?: string, method?: string) =>
  page.evaluate(([p, m]) => ((window as unknown as { __calls: Call[] }).__calls ?? []).filter((c) => (!p || c[0] === p) && (!m || c[1] === m)), [plugin, method] as const)
const fakeFile = (page: Page, path: string) => page.evaluate((p) => JSON.parse(sessionStorage.getItem('fake-fs') ?? '{}')[p] ?? null, path)

test('iOS evicted localStorage: the study state comes back from the durable copy before the first render', async ({ page }) => {
  const durable = JSON.stringify({ ...user({}, { xp: 4321, rev: 77 }), v: 2 })
  await openShell(page, { files: { 'LIBRARY/ruma/state-a.json': durable } })
  await homeShown(page)
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).xp, KEY)).toBe(4321)
})

test('first launch with nothing saved shows onboarding; progress is mirrored to the durable copy', async ({ page }) => {
  await openShell(page)
  await expect(page.getByRole('button', { name: '시작하기' })).toBeVisible()
  await page.getByRole('button', { name: '시작하기' }).click()
  await homeShown(page)
  await expect.poll(async () => JSON.parse((await fakeFile(page, 'LIBRARY/ruma/state-a.json')) ?? 'null')?.onboarded).toBe(true)
  // nothing asked of iOS at first launch: no notification permission request
  expect(await calls(page, 'LocalNotifications', 'requestPermissions')).toEqual([])
})

test('settings: native section shown, export through the share sheet, import through the document picker', async ({ page }) => {
  const backup = { format: 'jlpt-luma-backup', formatVersion: 2, ...user({}, { xp: 999 }) }
  await openShell(page, { state: user({}, { xp: 5 }), hash: '/settings', pick: JSON.stringify(backup) })
  await expect(page.getByRole('heading', { name: '알림 · 진동 · 발음' })).toBeVisible()
  await expect(page.getByText('학습 기록은 이 기기에만 저장돼요.', { exact: false })).toBeVisible()

  // no browser download inside the app: the file goes to the share sheet
  let downloaded = false
  page.on('download', () => (downloaded = true))
  await page.getByRole('button', { name: '백업 내보내기' }).click()
  await expect.poll(async () => (await calls(page, 'Share', 'share')).length).toBe(1)
  const [, , share] = (await calls(page, 'Share', 'share'))[0] as Call
  expect(share).toEqual({ title: 'jlpt-ruma-backup-2026-11-13.json', files: ['file:///CACHE/jlpt-ruma-backup-2026-11-13.json'] })
  await expect(page.getByText('마지막 백업: 2026년 11월 13일')).toBeVisible()
  expect(downloaded).toBe(false)

  await page.getByRole('button', { name: '백업 가져오기' }).click()
  await page.getByRole('alertdialog', { name: '백업으로 바꿀까요?' }).getByRole('button', { name: '백업으로 바꾸기' }).click()
  await expect.poll(async () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).xp, KEY)).toBe(999)
  const [, , pick] = (await calls(page, 'FilePicker', 'pickFiles'))[0] as Call
  expect(pick).toEqual({ types: ['application/json'], limit: 1, readData: true })
})

test('licence links open in the in-app Safari view, the local notice in a sheet; nothing navigates away', async ({ page }) => {
  await openShell(page, { state: user(), hash: '/settings' })
  let popup = false
  page.on('popup', () => (popup = true))
  await page.getByRole('link', { name: 'wordfreq' }).click()
  await expect.poll(async () => (await calls(page, 'Browser', 'open')).length).toBe(1)
  expect(((await calls(page, 'Browser', 'open'))[0] as Call)[2]).toEqual({ url: 'https://github.com/rspeer/wordfreq' })
  await page.getByRole('link', { name: '고지문' }).click()
  await expect(page.locator('.text-sheet pre')).toContainText(/\S/)
  await page.locator('.text-sheet').getByRole('button', { name: '닫기' }).click()
  await expect(page.locator('.text-sheet')).toHaveCount(0)
  expect(popup).toBe(false)
  expect(page.url()).toContain('#/settings')
})

test('the privacy policy and support pages open inside the app, from the bundled files; nothing navigates away', async ({ page }) => {
  await openShell(page, { state: user(), hash: '/settings' })
  let popup = false
  page.on('popup', () => (popup = true))
  await page.getByRole('link', { name: '개인정보 처리방침' }).click()
  await expect(page).toHaveURL(/#\/doc\/privacy$/)
  await expect(page.getByRole('heading', { level: 1, name: '개인정보 처리방침' })).toBeVisible()
  const doc = page.locator('article.doc')
  await expect(doc.getByRole('heading', { name: '1. 한눈에 보기' })).toBeVisible()
  await expect(doc).not.toContainText('RevenueCat')
  await expect(doc.locator('mark.placeholder').first()).toBeVisible()
  // the English version is the next page in the app
  await doc.getByRole('link', { name: 'English' }).click()
  await expect(page).toHaveURL(/#\/doc\/privacy-en$/)
  await expect(page.getByRole('article')).toContainText('We do not collect personal data.')
  await page.getByRole('link', { name: '뒤로' }).click()
  await expect(page).toHaveURL(/#\/doc\/privacy$/)
  await page.getByRole('link', { name: '뒤로' }).click()
  await page.getByRole('link', { name: '도움말 · 문의' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '도움말 · 문의' })).toBeVisible()
  // the support page's link to the policy stays in the app too
  await page.locator('article.doc').getByRole('link', { name: '개인정보 처리방침' }).click()
  await expect(page).toHaveURL(/#\/doc\/privacy$/)
  await expect(page.locator('article.doc')).toContainText('운영자는 이용자의 개인정보를')
  expect(await calls(page, 'Browser', 'open')).toEqual([])
  await expect(page.locator('.text-sheet')).toHaveCount(0)
  expect(popup).toBe(false)
  // the tab bar keeps 설정 as the current tab
  await expect(page.getByRole('link', { name: '설정' })).toHaveAttribute('aria-current', 'page')
})

test('finishing the day: haptics, then the reminder offer; permission is asked only on “알림 받기”, then reminders are scheduled', async ({ page }) => {
  await openShell(page, { state: user({ dailyNew: 1 }) })
  await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
  await answer(page, '쉬워요')
  await expect(page.getByRole('heading', { name: '오늘 목표 달성!' })).toBeVisible()
  expect((await calls(page, 'Haptics', 'impact')).length).toBe(1)
  await expect.poll(async () => (await calls(page, 'Haptics', 'notification')).length).toBe(1)

  const offer = page.getByRole('region', { name: /복습할 때가 되면 알려 드릴까요/ })
  await expect(offer).toBeVisible()
  expect(await calls(page, 'LocalNotifications', 'requestPermissions')).toEqual([])
  await offer.getByRole('button', { name: '알림 받기' }).click()
  await expect(page.getByText(/20:00에 알려 드릴게요/)).toBeVisible()
  expect((await calls(page, 'LocalNotifications', 'requestPermissions')).length).toBe(1)
  // the day is done: no reminder today; the word answered "쉬워요" comes back in a few days
  const pending = (await page.evaluate(() => (window as unknown as { __pending: { id: number; title: string }[] }).__pending)) ?? []
  expect(pending.every((p) => p.id > 20261113)).toBe(true)
})

test('the offer is not repeated once answered “나중에”', async ({ page }) => {
  await openShell(page, { state: user({ dailyNew: 1 }) })
  await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
  await answer(page, '쉬워요')
  await page.getByRole('region', { name: /복습할 때가 되면/ }).getByRole('button', { name: '나중에' }).click()
  await expect(page.getByRole('region', { name: /복습할 때가 되면/ })).toHaveCount(0)
  await expect.poll(async () => JSON.parse((await fakeFile(page, 'LIBRARY/ruma/prefs.json')) ?? '{}').reminderAsked).toBe(true)
  // the done screen again after a relaunch: still no offer
  await page.reload()
  await expect(page.getByRole('heading', { name: '오늘 목표 달성!' })).toBeVisible()
  await page.waitForTimeout(500)
  await expect(page.getByRole('region', { name: /복습할 때가 되면/ })).toHaveCount(0)
})

test('reset clears the durable copy of the old history', async ({ page }) => {
  await openShell(page, { state: user({}, { xp: 50, rev: 3 }), hash: '/settings', files: { 'LIBRARY/ruma/state-b.json': JSON.stringify(user({}, { xp: 40, rev: 2 })) } })
  await page.getByRole('button', { name: '모든 기록 초기화' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '모두 지우기' }).click()
  await expect(page.getByRole('button', { name: '시작하기' })).toBeVisible()
  await expect
    .poll(async () => {
      const slots = [await fakeFile(page, 'LIBRARY/ruma/state-a.json'), await fakeFile(page, 'LIBRARY/ruma/state-b.json')].filter(Boolean)
      return slots.map((s) => JSON.parse(s).xp)
    })
    .toEqual([0])
})
