// The Astryx-based design system (docs/design-system.md): in-app dialogs instead of the browser's confirm()/alert(),
// focus kept inside overlays and returned to where it was, the ruma theme reaching Astryx components in every theme
// mode, and reduced motion.
import { expect, test, type Page } from '@playwright/test'
import { homeShown, open, saved, user } from './fixtures'

/** Fails the test if the page opens a browser dialog (alert/confirm/prompt). */
const noBrowserDialogs = (page: Page) =>
  page.on('dialog', (d) => {
    throw new Error(`browser ${d.type()}() opened: ${d.message()}`)
  })

const bg = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).backgroundColor)

test('reset and import confirm inside the app, never with confirm()/alert()', async ({ page }) => {
  noBrowserDialogs(page)
  await open(page, { state: user({}, { xp: 7 }), hash: '/settings' })
  // a file that is not a backup: a message dialog with one way out
  await page.locator('input[type=file]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('nope') })
  const problem = page.getByRole('dialog', { name: '가져오지 못했어요' })
  await expect(problem).toContainText('JLPT 루마 백업 파일이 아니에요.')
  await page.keyboard.press('Escape')
  await expect(problem).toBeHidden()
  // a real backup: asks first; the action is the primary, cancel is offered
  await page.locator('input[type=file]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(user({}, { xp: 70 }))) })
  const ask = page.getByRole('alertdialog', { name: '백업으로 바꿀까요?' })
  await expect(ask).toContainText('바로 되돌릴 수 있어요')
  await expect(ask.getByRole('button', { name: '백업으로 바꾸기' })).toHaveAttribute('data-variant', 'primary')
  await ask.getByRole('button', { name: '백업으로 바꾸기' }).click()
  await expect.poll(async () => (await saved(page)).xp).toBe(70)
  // the reset is destructive: its action is the destructive style, never the filled primary
  await page.getByRole('button', { name: '모든 기록 초기화' }).click()
  const reset = page.getByRole('alertdialog', { name: '모든 기록을 지울까요?' })
  await expect(reset.getByRole('button', { name: '모두 지우기' })).toHaveAttribute('data-variant', 'destructive')
  await reset.getByRole('button', { name: '취소' }).click()
  expect((await saved(page)).xp).toBe(70)
})

test('a confirm dialog starts on the safe choice, keeps focus inside, and Escape returns focus to its button', async ({ page }) => {
  await open(page, { state: user({}, { xp: 7 }), hash: '/settings' })
  const opener = page.getByRole('button', { name: '모든 기록 초기화' })
  await opener.click()
  const reset = page.getByRole('alertdialog', { name: '모든 기록을 지울까요?' })
  await expect(reset.getByRole('button', { name: '취소' })).toBeFocused()
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab')
    expect(await reset.evaluate((d) => d.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(reset).toBeHidden()
  await expect(opener).toBeFocused()
  expect((await saved(page)).xp).toBe(7)
})

test('the word sheet traps focus, closes on Escape and gives focus back to the row that opened it', async ({ page }) => {
  await open(page, { state: user(), hash: '/words' })
  await page.getByPlaceholder('일본어, 읽기, 뜻으로 검색').fill('学校')
  const row = page.locator('.word-row').filter({ hasText: 'がっこう' }).first()
  await row.focus()
  await page.keyboard.press('Enter')
  const sheet = page.getByRole('dialog', { name: '学校 단어 정보' })
  await expect(sheet).toBeVisible()
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab')
    expect(await sheet.evaluate((d) => d.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(row).toBeFocused()
})

test('theme modes reach the controls: light, dark and system (following the OS)', async ({ page }) => {
  await open(page, { state: user({ theme: 'light' }), hash: '/settings' })
  const card = '.card'
  const segment = '[role="radio"][aria-checked="true"]'
  // 胡粉 card, 藍 ink on the chosen segment
  expect(await bg(page, card)).toBe('rgb(255, 254, 251)')
  expect(await page.locator(segment).first().evaluate((el) => getComputedStyle(el).color)).toBe('rgb(22, 94, 131)')
  await page.getByRole('radio', { name: '다크' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  // 墨 card, light 藍 ink
  await expect.poll(() => bg(page, card)).toBe('rgb(37, 35, 33)')
  expect(await page.locator(segment).first().evaluate((el) => getComputedStyle(el).color)).toBe('rgb(134, 174, 207)')
  // system follows the OS setting
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.getByRole('radio', { name: '시스템' }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)
  expect(await bg(page, card)).toBe('rgb(37, 35, 33)')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => bg(page, card)).toBe('rgb(255, 254, 251)')
  // the primary button on home: 藍 face in light mode
  await page.getByRole('link', { name: '홈' }).click()
  await homeShown(page)
  await expect.poll(() => bg(page, 'button[data-variant="primary"]')).toBe('rgb(22, 94, 131)')
})

test('with reduced motion nothing slides or fades: card entry, answer reveal and button press are instant', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page, { state: user({ dailyNew: 5 }), hash: '/study' })
  const card = page.locator('.flash')
  await expect(card).toBeVisible()
  expect(await card.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
  await page.getByRole('button', { name: '정답 보기' }).click()
  expect(await page.locator('.flash-answer').evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
  const grade = page.getByRole('button', { name: /^알아요/ })
  expect(await grade.evaluate((el) => getComputedStyle(el).transitionDuration.split(',').every((d) => parseFloat(d) === 0))).toBe(true)
})

test('touch targets: every button and link on home and in study is at least 44px tall', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 5 }) })
  await homeShown(page)
  const small = async () =>
    page.evaluate(() =>
      [...document.querySelectorAll('button, a[href], [role="radio"]')]
        .filter((el) => !el.closest('.plan-lever p') && !el.classList.contains('inline-btn'))
        .map((el) => [el.textContent?.trim() || el.getAttribute('aria-label'), el.getBoundingClientRect().height] as const)
        .filter(([, h]) => h > 0 && h < 44),
    )
  expect(await small()).toEqual([])
  await page.getByRole('button', { name: '오늘의 학습 시작' }).click()
  await expect(page.locator('.flash')).toBeVisible()
  // measured after the card's entry motion (a translate): mid-motion the transformed boxes read 43.99999px
  await page.locator('.flash').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  expect(await small()).toEqual([])
})

for (const [xp, shown] of [
  [174_670, '174,670'],
  [999_999, '999,999'],
  [1_234_567, '123만'],
] as const)
  test(`records: XP ${shown} stays on one line inside its tile from 320 to 430px, never below the 16px step`, async ({ page }) => {
    await open(page, { state: user({}, { xp }), hash: '/stats' })
    for (const width of [320, 360, 390, 402, 430]) {
      await page.setViewportSize({ width, height: 844 })
      const n = page.locator('.stat').filter({ hasText: '누적 XP' }).locator('b')
      await expect(n).toHaveText(shown)
      const m = await n.evaluate((b) => {
        const tile = b.parentElement!.getBoundingClientRect()
        const r = document.createRange()
        r.selectNodeContents(b)
        const text = r.getBoundingClientRect()
        return { height: text.height, size: parseFloat(getComputedStyle(b).fontSize), left: text.left - tile.left, right: tile.right - text.right }
      })
      expect(m.height, `${width}px: one line`).toBeLessThan(m.size * 1.6)
      expect(m.size, `${width}px`).toBeGreaterThanOrEqual(16)
      expect(m.left, `${width}px: inside the tile`).toBeGreaterThanOrEqual(0)
      expect(m.right, `${width}px: inside the tile`).toBeGreaterThanOrEqual(0)
    }
    // the short form's name is the whole number
    if (xp >= 1_000_000) await expect(page.locator('.stat b', { hasText: '123만' })).toHaveAttribute('aria-label', '1,234,567')
  })
