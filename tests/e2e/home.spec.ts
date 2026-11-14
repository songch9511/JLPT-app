// Home, "루마의 하늘" (docs/design-system.md §3 "홈"): every state of the screen — the sky follows Ruma's state, Ruma
// says one line, the plan sheet has at most one primary; it fits a 320×568 screen without scrolling in the common
// states; no accessibility violations in light and dark.
import { expect, test, type Page } from '@playwright/test'
import { axeViolations, homeShown, KEY, keyFor, NOW, open, user } from './fixtures'

const DAY = 86400_000
const MIN = 60_000
const t = NOW.getTime()
const review = (due: number) => ({ due, stability: 20, difficulty: 5, elapsed_days: 20, scheduled_days: 20, learning_steps: 0, reps: 5, lapses: 0, state: 2, last_review: due - 20 * DAY })
const learning = (due: number) => ({ due, stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 0, learning_steps: 1, reps: 1, lapses: 0, state: 1, last_review: t - 5 * MIN })
/** N5 words 0..met-1 met; the first `due` of them due today (`overdue` days late) */
const cards = (met: number, due: number, overdue = 0) =>
  Object.fromEntries(Array.from({ length: met }, (_, i) => [`5-${i}`, review(i < due ? t - overdue * DAY - 60 * MIN + i * 1000 : t + (2 + (i % 30)) * DAY)]))
const days = (n: number, today?: Record<string, number>) => ({
  ...Object.fromEntries(Array.from({ length: n }, (_, i) => [new Date(t - (i + 1) * DAY).toLocaleDateString('sv'), { c: 100, n: 10, r: 90, p: 80, ms: 15 * MIN }])),
  ...(today ? { '2026-11-13': today } : {}),
})

type Case = { state: unknown; sky: string; mood: string; line: RegExp; primary: number; fits?: boolean }
const CASES: Record<string, Case> = {
  'before studying': { state: user({ dailyNew: 20 }, { cards: cards(300, 107), log: days(5) }), sky: 'sleep', mood: 'sleep', line: /^(깨워 줄래요\?|자고 있어요)$/, primary: 1, fits: true },
  'part-way': { state: user({ dailyNew: 20 }, { cards: cards(300, 40), log: days(5, { c: 60, n: 10, r: 50, p: 45, ms: 9 * MIN }) }), sky: 'wake', mood: 'idle', line: /^한쪽 눈 떴어요$/, primary: 1, fits: true },
  'today’s share done': { state: user({ dailyNew: 0 }, { cards: cards(300, 0), log: days(5, { c: 90, n: 10, r: 80, p: 70, ms: 14 * MIN }) }), sky: 'day', mood: 'cheer', line: /^(두 눈 다 떴어요|내일 봐요)$/, primary: 0, fits: true },
  'a backlog': { state: user({ dailyNew: 20 }, { cards: cards(700, 600, 7) }), sky: 'sleep', mood: 'sleep', line: /^(보고 싶었어요|같이 치워요)$/, primary: 1, fits: true },
  'waiting for learning cards': {
    state: user({ dailyNew: 0 }, { cards: { ...cards(100, 0), '5-200': learning(t + 40 * MIN), '5-201': learning(t + 45 * MIN) }, log: days(2, { c: 30, n: 0, r: 28, p: 26 }) }),
    sky: 'wake', mood: 'idle', line: /^한쪽 눈 떴어요$/, primary: 1, fits: true,
  },
  'a day off with words left': { state: user({ dailyNew: 0 }, { cards: cards(100, 0), log: days(3) }), sky: 'rest', mood: 'sleep', line: /^오늘은 쉬어요$/, primary: 1, fits: true },
  'every word of the level met': { state: user({ target: 5 }, { cards: cards(718, 0), log: days(3) }), sky: 'rest', mood: 'sleep', line: /^다음은 N4예요$/, primary: 1, fits: true },
  'the first-run question': { state: undefined, sky: 'rest', mood: 'sleep', line: /^반가워요, 루마예요어느 급수를 준비해요\?$/, primary: 0, fits: true },
  'the first session': { state: { v: 4, onboarded: true, guide: { done: ['level'] }, settings: { target: 3, dailyNew: 20, theme: 'light', autoSpeak: false, fastTrack: true, includeLower: true }, cards: {}, log: {}, marks: [], xp: 0 }, sky: 'sleep', mood: 'sleep', line: /^깨워 줄래요\?$/, primary: 1, fits: true },
}

const withTheme = (state: unknown, theme: string) =>
  state && typeof state === 'object' ? { ...state, settings: { ...(state as { settings: object }).settings, theme } } : state

async function shown(page: Page, c: Case) {
  await expect(page.locator('.home-sky')).toHaveAttribute('data-sky', c.sky)
  await expect(page.locator('html')).toHaveAttribute('data-sky', c.sky)
  await expect(page.locator('.home-sky .ruma')).toHaveClass(new RegExp(`\\b${c.mood}\\b`))
  await expect(page.locator('.ruma-line')).toHaveText(c.line)
}

for (const [name, c] of Object.entries(CASES)) {
  test(`${name}: the sky matches Ruma, one line, at most one primary; light and dark without violations`, async ({ page }) => {
    await open(page, { state: c.state })
    await shown(page, c)
    await expect(page.locator('.btn[data-variant="primary"]')).toHaveCount(c.primary)
    // one text alternative for the week; the ground behind the page and the browser's bar take the sky's colour
    await expect(page.locator('.seals[role="img"]')).toHaveCount(name.startsWith('the first') ? 0 : 1)
    const sky = await page.locator('.home-sky').evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(sky)
    expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe(sky)
    expect(await axeViolations(page)).toEqual([])
    // dark: the same state at night
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
    await shown(page, c)
    expect(await axeViolations(page)).toEqual([])
  })

  if (c.fits)
    test(`${name}: fits 320×568 without scrolling, the button on the first screen`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 568 })
      await open(page, { state: withTheme(c.state, 'dark') })
      await shown(page, c)
      await page.waitForTimeout(100)
      const size = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])
      expect(size).toEqual([320, 568])
      const go = page.locator('.home-go')
      if (c.primary) expect((await go.boundingBox())!.y + (await go.boundingBox())!.height).toBeLessThanOrEqual((await page.locator('.tabbar').boundingBox())!.y)
    })
}

test('the button does not move between before, part-way and a backlog', async ({ page }) => {
  const ys: number[] = []
  await open(page, { state: CASES['before studying'].state })
  for (const name of ['before studying', 'part-way', 'a backlog']) {
    // the next saved state, as the app would find it at launch
    await page.evaluate(([v4, k, v]) => (localStorage.removeItem(v4), localStorage.setItem(k, v)), [KEY, keyFor(CASES[name].state), JSON.stringify(CASES[name].state)])
    await page.reload()
    await shown(page, CASES[name])
    ys.push(Math.round((await page.locator('.home-go').boundingBox())!.y))
  }
  expect(new Set(ys).size).toBe(1)
})

test('the sky’s colour changes with a gentle cross-fade, none with reduced motion', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 3 }) })
  await shown(page, { ...CASES['before studying'], line: /.+/ })
  const dur = () => page.locator('.home-sky').evaluate((el) => getComputedStyle(el).transitionDuration)
  expect(parseFloat(await dur())).toBeGreaterThan(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(parseFloat(await dur())).toBe(0)
})

test('words met: the level seals, the count and a link to 기록; the tab bar takes the sheet’s colour on Home only', async ({ page }) => {
  await open(page, { state: user({ target: 4, includeLower: true }, { cards: cards(718, 0) }) })
  await homeShown(page)
  const link = page.getByRole('link', { name: 'N5~N4 단어 1,386개 중 718개 만남, 기록 보기' })
  await expect(link.locator('.level-seals span')).toHaveText(['N5', 'N4'])
  await expect(link.locator('.level-seals .full')).toHaveText('N5')
  const tabbar = () => page.locator('.tabbar').evaluate((el) => getComputedStyle(el).backgroundColor)
  const sheet = await page.locator('.home-sheet').evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(await tabbar()).toBe(sheet)
  await link.click()
  await expect(page.getByRole('heading', { name: '기록', level: 1 })).toBeVisible()
  expect(await tabbar()).toBe(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))
  await expect(page.locator('html')).not.toHaveAttribute('data-sky', /.*/)
})
