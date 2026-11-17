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
  await page.locator('input[type=file]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(user({}, { xp: 70, kanji: false }))) })
  // board 6-4: a sheet from the bottom with what the file holds; the action is the primary, cancel is offered
  const ask = page.getByRole('dialog', { name: '이 백업으로 바꿀까요?' })
  await expect(ask.locator('.confirm-box')).toContainText('백업 파일')
  await expect(ask.locator('.confirm-box')).toContainText('단어 0개 · 한자 0자')
  await expect(ask).toContainText('지금 기록은 이 백업으로 바뀌어요.')
  await expect(ask.getByRole('button', { name: '바꾸기', exact: true })).toHaveAttribute('data-variant', 'primary')
  await ask.getByRole('button', { name: '바꾸기', exact: true }).click()
  await expect.poll(async () => (await saved(page)).xp).toBe(70)
  // board 6-3: the reset is destructive: a red action, never the ink primary; what goes is counted
  await page.getByRole('button', { name: '모든 기록 초기화' }).click()
  const reset = page.getByRole('dialog', { name: '모든 기록을 지울까요?' })
  await expect(reset).toContainText('단어 0개, 한자 0자 기록이 사라져요.')
  await expect(reset).toContainText('되돌릴 수 없어요.')
  await expect(reset.getByRole('button', { name: '지우기', exact: true })).toHaveAttribute('data-variant', 'destructive')
  expect(await reset.getByRole('button', { name: '지우기', exact: true }).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(196, 85, 59)')
  await reset.getByRole('button', { name: '취소' }).click()
  expect((await saved(page)).xp).toBe(70)
})

test('a confirm sheet keeps focus inside, and Escape returns focus to its button', async ({ page }) => {
  await open(page, { state: user({}, { xp: 7 }), hash: '/settings' })
  const opener = page.getByRole('button', { name: '모든 기록 초기화' })
  await opener.click()
  const reset = page.getByRole('dialog', { name: '모든 기록을 지울까요?' })
  await expect(reset.getByRole('button', { name: '취소' })).toBeVisible()
  await expect.poll(() => reset.evaluate((d) => d.contains(document.activeElement))).toBe(true)
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
  await open(page, { state: user(), hash: '/search/word' })
  await page.getByPlaceholder('단어 · 읽기 · 뜻').fill('学校')
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

test('theme modes reach the controls: light, dark and system (following the OS); a group is a white card on the cream ground', async ({ page }) => {
  // N4, so the settings show a switch (아래 급수 단어도 함께)
  await open(page, { state: user({ theme: 'light', target: 4 }), hash: '/settings' })
  const group = '.group'
  const card = '.group-body'
  // the chosen segment is white on the beige track, in the ink
  const segment = '.segmented:not(.level-choice) [role="radio"][aria-checked="true"]'
  const ground = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const css = (selector: string, prop: string) => page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop)
  // a group is a small heading and one card: the group itself has no surface, its rows sit in a white card with a
  // 1px hairline all round and the 20px corner, on the cream ground
  expect(await bg(page, group)).toBe('rgba(0, 0, 0, 0)')
  expect(await css(group, 'border-top-width')).toBe('0px')
  expect(await ground()).toBe('rgb(250, 248, 245)')
  expect(await bg(page, card)).toBe('rgb(255, 255, 255)')
  expect(await css(card, 'border-top-width')).toBe('1px')
  expect(await css(card, 'border-top-color')).toBe('rgb(233, 228, 217)')
  expect(await css(card, 'border-top-left-radius')).toBe('20px')
  expect(await css(card, 'box-shadow')).toBe('none')
  expect(await bg(page, '.segmented:not(.level-choice)')).toBe('rgb(243, 239, 231)')
  expect(await bg(page, segment)).toBe('rgb(255, 255, 255)')
  expect(await css(segment, 'color')).toBe('rgb(45, 42, 38)')
  // a switch that is on is the ink
  await page.getByRole('switch', { name: /^아래 급수 단어도 함께/ }).check()
  await expect.poll(() => bg(page, '.switch-input:checked')).toBe('rgb(45, 42, 38)')
  await page.getByRole('radio', { name: '다크' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  // a warm dark ground, a lighter dark card, light ink (boards 7-1, 7-2)
  await expect.poll(ground).toBe('rgb(27, 25, 23)')
  await expect.poll(() => bg(page, card)).toBe('rgb(37, 34, 31)')
  await expect.poll(() => bg(page, segment)).toBe('rgb(37, 34, 31)')
  expect(await bg(page, group)).toBe('rgba(0, 0, 0, 0)')
  expect(await css(segment, 'color')).toBe('rgb(241, 237, 229)')
  // system follows the OS setting
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.getByRole('radio', { name: '시스템' }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)
  expect(await ground()).toBe('rgb(27, 25, 23)')
  // the primary button on home in dark: the light ink as its face with a dark label, readable on the dark ground
  await page.getByRole('link', { name: '홈' }).click()
  await homeShown(page)
  const primary = 'button[data-variant="primary"]'
  await expect.poll(() => bg(page, primary)).toBe('rgb(241, 237, 229)')
  expect(await css(primary, 'color')).toBe('rgb(27, 25, 23)')
  await page.emulateMedia({ colorScheme: 'light' })
  // in light: the ink face, a white label, a 4px darker edge under it
  await expect.poll(() => bg(page, primary)).toBe('rgb(45, 42, 38)')
  expect(await css(primary, 'color')).toBe('rgb(255, 255, 255)')
  await expect.poll(() => css(primary, 'box-shadow')).toContain('rgb(20, 18, 15) 0px 4px 0px 0px')
  await page.getByRole('link', { name: '설정' }).click()
  await expect.poll(ground).toBe('rgb(250, 248, 245)')
})

test('with reduced motion nothing slides or fades: card entry, a toggle opening and button press are instant', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page, { state: user({ dailyNew: 5 }), hash: '/study' })
  const card = page.locator('.flash')
  await expect(card).toBeVisible()
  expect(await card.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
  await page.getByRole('button', { name: '의미', exact: true }).click()
  await expect(page.locator('.flash-meaning')).toBeVisible()
  expect(await page.locator('.flash-meaning-slot').evaluate((el) => getComputedStyle(el).transitionDuration.split(',').every((d) => parseFloat(d) === 0))).toBe(true)
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
  await page.getByRole('button', { name: '단어 시작' }).click()
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
  test(`records: XP ${shown} stays on one line inside its column from 320 to 430px, never below the 16px step`, async ({ page }) => {
    await open(page, { state: user({}, { xp }), hash: '/stats' })
    for (const width of [320, 360, 390, 402, 430]) {
      await page.setViewportSize({ width, height: 844 })
      const n = page.locator('.stat').filter({ has: page.locator('.stat-label', { hasText: /^XP$/ }) }).locator('b')
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
      expect(m.left, `${width}px: inside its column`).toBeGreaterThanOrEqual(0)
      expect(m.right, `${width}px: inside its column`).toBeGreaterThanOrEqual(0)
    }
    // the short form's name is the whole number
    if (xp >= 1_000_000) await expect(page.locator('.stat b', { hasText: '123만' })).toHaveAttribute('aria-label', '1,234,567')
  })
