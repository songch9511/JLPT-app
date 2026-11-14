// The web app after the iOS platform layer was added (docs/plan/10-ios-build.md): every device-facing path
// must behave as before — browser speech, browser download, file input, new-window links — and nothing of
// the native shell may appear.
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { answer, open, saved, user } from './fixtures'

test('no native code or native-only UI on the web', async ({ page }) => {
  await open(page, { state: user(), hash: '/settings' })
  await expect(page.getByRole('heading', { name: '설정' })).toBeVisible()
  expect(await page.evaluate(() => 'Capacitor' in window)).toBe(false)
  await expect(page.getByRole('heading', { name: '알림 · 진동 · 발음' })).toHaveCount(0)
  await expect(page.getByText('학습 기록은 이 기기의 브라우저에만 저장돼요. 기기를 바꾸기 전에 백업해 두세요.')).toBeVisible()
  // only the app's own scripts were loaded: no native chunk
  const scripts = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /native|capacitor/i.test(n)))
  expect(scripts).toEqual([])
})

test('pronunciation uses the browser’s speech synthesis in Japanese', async ({ page }) => {
  await page.addInitScript(() => {
    const spoken: { text: string; lang: string; rate: number }[] = ((window as unknown as { __spoken: unknown[] }).__spoken = [])
    Object.defineProperty(window, 'speechSynthesis', {
      value: { speak: (u: SpeechSynthesisUtterance) => spoken.push({ text: u.text, lang: u.lang, rate: u.rate }), cancel: () => {}, getVoices: () => [] },
    })
  })
  await open(page, { state: user({ dailyNew: 5 }) })
  await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
  await page.getByRole('button', { name: '발음 듣기' }).click()
  const spoken = await page.evaluate(() => (window as unknown as { __spoken: { text: string; lang: string; rate: number }[] }).__spoken)
  expect(spoken).toHaveLength(1)
  expect(spoken[0].lang).toBe('ja-JP')
  expect(spoken[0].rate).toBeCloseTo(0.9, 5)
  expect(spoken[0].text).not.toBe('')
})

test('backup is a browser download (without the app-only save counter) and import is a file input', async ({ page }) => {
  await open(page, { state: user({}, { xp: 21 }), hash: '/settings' })
  await page.getByRole('radio', { name: 'N4' }).click() // a save: the state now has a save counter
  expect((await saved(page)).rev).toBeGreaterThan(0)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '백업 내보내기' }).click()])
  const backup = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(backup).toMatchObject({ format: 'jlpt-luma-backup', xp: 21 })
  expect(backup).not.toHaveProperty('rev')
  await expect(page.getByText('마지막 백업: 2026년 11월 13일')).toBeVisible()
  // “백업 가져오기” opens the browser's file chooser
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '백업 가져오기' }).click()])
  expect(chooser.isMultiple()).toBe(false)
})

test('licence links still open in a new browser window', async ({ page, context }) => {
  await context.route('https://github.com/**', (r) => r.fulfill({ body: 'ok', contentType: 'text/plain' }))
  await open(page, { state: user(), hash: '/settings' })
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('link', { name: 'wordfreq' }).click()])
  expect(popup.url()).toBe('https://github.com/rspeer/wordfreq')
  expect(page.url()).toContain('#/settings')
})

test('settings › 정보: the version, and the privacy policy and support pages open as pages of the site in a new window', async ({ page }) => {
  await open(page, { state: user(), hash: '/settings' })
  const version = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')).version
  await expect(page.getByText(`버전 ${version}`)).toBeVisible()
  const [privacy] = await Promise.all([page.waitForEvent('popup'), page.getByRole('link', { name: '개인정보 처리방침' }).click()])
  await privacy.waitForLoadState()
  expect(new URL(privacy.url()).pathname).toBe('/privacy/')
  await expect(privacy.getByRole('heading', { level: 1 })).toHaveText('JLPT 루마 개인정보 처리방침')
  await expect(privacy.locator('main')).not.toContainText('RevenueCat')
  // the page itself, not the app (no service-worker or server fallback to index.html)
  await expect(privacy.locator('#root')).toHaveCount(0)
  await privacy.getByRole('link', { name: 'English' }).click()
  await expect(privacy.getByRole('heading', { level: 1 })).toHaveText('JLPT Ruma Privacy Policy')
  const [support] = await Promise.all([page.waitForEvent('popup'), page.getByRole('link', { name: '도움말 · 문의' }).click()])
  await support.waitForLoadState()
  expect(new URL(support.url()).pathname).toBe('/support/')
  await expect(support.getByRole('heading', { level: 1 })).toHaveText('JLPT 루마 도움말')
  // operator details are blanks, marked as such, until the owner fills them in
  await expect(support.locator('mark.placeholder', { hasText: '[지원 이메일 주소]' })).toBeVisible()
  expect(page.url()).toContain('#/settings')
})

test('finishing the day on the web: no reminder offer', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 1 }) })
  await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
  await answer(page, '쉬워요')
  await expect(page.getByRole('heading', { name: '오늘 목표 달성!' })).toBeVisible()
  await page.waitForTimeout(300)
  await expect(page.getByText('복습할 때가 되면 알려 드릴까요?')).toHaveCount(0)
})
