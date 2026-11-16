// Home (docs/design-system.md §3 "홈"): every state of the screen — Ruma's circle follows Ruma's state, Ruma says one
// line, the day's two sessions are two buttons in the thumb zone with at most one primary, each button's number is what
// its session shows; it fits a 320×568 screen without scrolling in the common states; no accessibility violations in
// light and dark.
import { expect, test, type Page } from '@playwright/test'
import { answer, axeViolations, homeShown, KEY, keyFor, NOW, open, todayLog, user } from './fixtures'

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

/** `review` / `fresh`: the numbers on the 복습하기 and 새 단어 buttons (null: no such button in this state). */
type Case = { state: unknown; mood: string; ruma: string; line: RegExp; primary: number; review: string | null; fresh: string | null; progress: RegExp | null }
const CASES: Record<string, Case> = {
  'before studying': { state: user({ dailyNew: 20 }, { cards: cards(300, 107), log: days(5) }), mood: 'sleep', ruma: 'sleep', line: /^(깨워 줄래요\?|자고 있어요)$/, primary: 1, review: '107', fresh: '20', progress: /^오늘 0 \/ 127장약 \d+분$/ },
  'part-way': { state: user({ dailyNew: 20 }, { cards: cards(300, 40), log: days(5, { c: 60, n: 10, r: 50, p: 45, ms: 9 * MIN }) }), mood: 'wake', ruma: 'idle', line: /^한쪽 눈 떴어요$/, primary: 1, review: '40', fresh: '10', progress: /^오늘 60 \/ 110장약 \d+분 남음$/ },
  'today’s share done': { state: user({ dailyNew: 0 }, { cards: cards(300, 0), log: days(5, { c: 90, n: 10, r: 80, p: 70, ms: 14 * MIN }) }), mood: 'day', ruma: 'cheer', line: /^(두 눈 다 떴어요|내일 봐요)$/, primary: 0, review: null, fresh: null, progress: /^오늘 90 \/ 90장14분$/ },
  'a backlog': { state: user({ dailyNew: 20 }, { cards: cards(700, 600, 7) }), mood: 'sleep', ruma: 'sleep', line: /^(보고 싶었어요|같이 치워요)$/, primary: 1, review: '225', fresh: '5', progress: /^오늘 0 \/ 230장약 \d+분$/ },
  'waiting for learning cards': {
    state: user({ dailyNew: 0 }, { cards: { ...cards(100, 0), '5-200': learning(t + 40 * MIN), '5-201': learning(t + 45 * MIN) }, log: days(2, { c: 30, n: 0, r: 28, p: 26 }) }),
    // the two words still in their first steps are the new session's
    mood: 'wake', ruma: 'idle', line: /^한쪽 눈 떴어요$/, primary: 1, review: null, fresh: '2', progress: /^오늘 30 \/ 32장40분 뒤$/,
  },
  'a day off with words left': { state: user({ dailyNew: 0 }, { cards: cards(100, 0), log: days(3) }), mood: 'rest', ruma: 'sleep', line: /^오늘은 쉬어요$/, primary: 1, review: null, fresh: null, progress: /^오늘 0 \/ 0장$/ },
  'every word of the level met': { state: user({ target: 5 }, { cards: cards(718, 0), log: days(3) }), mood: 'rest', ruma: 'sleep', line: /^다음은 N4예요$/, primary: 1, review: null, fresh: null, progress: /^오늘 0 \/ 0장$/ },
  'the first-run question': { state: undefined, mood: 'rest', ruma: 'sleep', line: /^반가워요, 루마예요어느 급수를 준비해요\?$/, primary: 0, review: null, fresh: null, progress: null },
  'the first session': { state: { v: 4, onboarded: true, guide: { done: ['level'] }, settings: { target: 3, dailyNew: 20, theme: 'light', autoSpeak: false, fastTrack: true, includeLower: true }, cards: {}, log: {}, marks: [], xp: 0 }, mood: 'sleep', ruma: 'sleep', line: /^깨워 줄래요\?$/, primary: 1, review: null, fresh: '20', progress: /^오늘 0 \/ 20장약 \d+분$/ },
}

const withTheme = (state: unknown, theme: string) =>
  state && typeof state === 'object' ? { ...state, settings: { ...(state as { settings: object }).settings, theme } } : state

async function shown(page: Page, c: Case) {
  await expect(page.locator('.home-ruma')).toHaveAttribute('data-mood', c.mood)
  await expect(page.locator('.home-ruma .ruma')).toHaveClass(new RegExp(`\\b${c.ruma}\\b`))
  await expect(page.locator('.ruma-line')).toHaveText(c.line)
}

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
/** Ruma's circle by state, light and dark: pink asleep, yellow with one eye, green when done, beige at rest. */
const CIRCLE: Record<string, [string, string]> = { sleep: ['#fce8ed', '#3a2229'], wake: ['#fbf1c9', '#332b12'], day: ['#e8f1dc', '#26321c'], rest: ['#f3efe7', '#33302a'] }

for (const [name, c] of Object.entries(CASES)) {
  test(`${name}: the circle matches Ruma, one line, the two sessions with at most one primary; light and dark without violations`, async ({ page }) => {
    await open(page, { state: c.state })
    await shown(page, c)
    await expect(page.locator('.btn[data-variant="primary"]')).toHaveCount(c.primary)
    // the two sessions: a button each when it has cards, its number what the session will show; the first is the primary
    const review = page.locator('.home-go.go-review')
    const fresh = page.locator('.home-go.go-new')
    await expect(review).toHaveCount(c.review ? 1 : 0)
    await expect(fresh).toHaveCount(c.fresh ? 1 : 0)
    if (c.review) {
      await expect(review.locator('.c-review')).toHaveText(`${c.review}장`)
      await expect(review).toHaveAttribute('data-variant', 'primary')
    }
    if (c.fresh) {
      await expect(fresh.locator('.c-new')).toHaveText(`${c.fresh}개`)
      await expect(fresh).toHaveAttribute('data-variant', c.review ? 'secondary' : 'primary')
    }
    // the day's progress: one bar with a text alternative, "오늘 n / m장" over it (not while Ruma asks the level)
    await expect(page.getByRole('progressbar', { name: '오늘 학습' })).toHaveCount(c.progress ? 1 : 0)
    if (c.progress) await expect(page.locator('.home-progress-text')).toHaveText(c.progress)
    // the old sky is gone: the page stands on the theme's ground, which the browser's bar takes; only the circle is tinted
    await expect(page.locator('.home-sky, .waves, .seals, .home-sheet')).toHaveCount(0)
    await expect(page.locator('html')).not.toHaveAttribute('data-sky', /.*/)
    const circle = () => page.locator('.home-ruma').evaluate((el) => getComputedStyle(el).backgroundColor)
    const ground = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(await ground()).toBe(rgb('#faf8f5'))
    expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe(rgb('#faf8f5'))
    expect(await circle()).toBe(rgb(CIRCLE[c.mood][0]))
    expect(await axeViolations(page)).toEqual([])
    // dark: the same state at night
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
    await shown(page, c)
    await expect.poll(circle).toBe(rgb(CIRCLE[c.mood][1]))
    expect(await ground()).toBe(rgb('#1c1a17'))
    expect(await axeViolations(page)).toEqual([])
  })

  test(`${name}: fits 320×568 without scrolling, the buttons on the first screen`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await open(page, { state: withTheme(c.state, 'dark') })
    await shown(page, c)
    await page.waitForTimeout(100)
    const size = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])
    expect(size).toEqual([320, 568])
    const tabbar = (await page.locator('.tabbar').boundingBox())!.y
    // every button of the thumb zone (the sessions, or the level answers) is above the tab bar
    for (const b of await page.locator('.home-actions .btn').all()) {
      const box = (await b.boundingBox())!
      expect(box.y + box.height).toBeLessThanOrEqual(tabbar)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
  })
}

test('the two buttons do not move between before and part-way; a backlog adds its line under them', async ({ page }) => {
  const ys: Record<string, number[]> = {}
  await open(page, { state: CASES['before studying'].state })
  for (const name of ['before studying', 'part-way', 'a backlog']) {
    // the next saved state, as the app would find it at launch
    await page.evaluate(([v4, k, v]) => (localStorage.removeItem(v4), localStorage.setItem(k, v)), [KEY, keyFor(CASES[name].state), JSON.stringify(CASES[name].state)])
    await page.reload()
    await shown(page, CASES[name])
    ys[name] = [Math.round((await page.locator('.home-go.go-review').boundingBox())!.y), Math.round((await page.locator('.home-go.go-new').boundingBox())!.y)]
  }
  expect(ys['part-way']).toEqual(ys['before studying'])
  // the backlog's "밀린 n · 50장 더" is one line under the buttons, above the tab bar
  const lever = (await page.locator('.plan-lever').boundingBox())!
  expect(lever.y).toBeGreaterThan(ys['a backlog'][1])
  expect(lever.y + lever.height).toBeLessThanOrEqual((await page.locator('.tabbar').boundingBox())!.y)
})

test('the circle’s colour changes with a gentle cross-fade, none with reduced motion', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 3 }) })
  await shown(page, { ...CASES['before studying'], line: /.+/ })
  const dur = () => page.locator('.home-ruma').evaluate((el) => getComputedStyle(el).transitionDuration)
  expect(parseFloat(await dur())).toBeGreaterThan(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(parseFloat(await dur())).toBe(0)
})

test('복습하기 opens a session of the reviews only, 새 단어 one of the new words only; each button’s number is its session’s', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 3 }, { cards: cards(40, 4) }) })
  await homeShown(page)
  await expect(page.locator('.go-review .c-review')).toHaveText('4장')
  await expect(page.locator('.go-new .c-new')).toHaveText('3개')
  // the reviews: four cards, none of them new; the new words are untouched
  await page.getByRole('button', { name: '복습 시작, 4장' }).click()
  await expect(page).toHaveURL(/#\/study\/review$/)
  await expect(page.locator('.left-count')).toHaveText('4장 남음')
  for (let i = 0; i < 4; i++) {
    await expect(page.locator('.flash-meta')).not.toContainText('새 단어')
    await answer(page, '알아요')
  }
  // the session is over while the day is not: it says what is left and goes home
  await expect(page.getByRole('heading', { name: '복습 끝', level: 1 })).toBeVisible()
  await expect(page.locator('.done-text')).toHaveText('새 단어 3개가 남았어요.')
  await expect(page.getByRole('button', { name: '새 단어 10개 더 하기' })).toHaveCount(0)
  expect(await todayLog(page)).toMatchObject({ c: 4, n: 0, r: 4 })
  await page.getByRole('button', { name: '홈으로' }).click()
  await homeShown(page)
  await expect(page.locator('.home-go.go-review')).toHaveCount(0)
  // the new words are now the one primary
  const fresh = page.getByRole('button', { name: '새 단어 시작, 3개' })
  await expect(fresh).toHaveAttribute('data-variant', 'primary')
  await fresh.click()
  await expect(page).toHaveURL(/#\/study\/new$/)
  await expect(page.locator('.left-count')).toHaveText('3장 남음')
  await expect(page.locator('.flash-meta')).toContainText('새 단어')
  await answer(page, '쉬워요')
  expect(await todayLog(page)).toMatchObject({ c: 5, n: 1, r: 4 })
  // leaving part-way: Home counts what the session still holds
  await page.getByRole('button', { name: /나가기/ }).click()
  await expect(page.getByRole('button', { name: '새 단어 이어서 하기, 2개 남음' })).toBeVisible()
  await expect(page.locator('.home-progress-text > :first-child')).toHaveText('오늘 5 / 7장')
})

test('a word forgotten in the new session stays there; a review forgotten stays with the reviews', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 1 }, { cards: cards(40, 1) }) })
  await homeShown(page)
  await page.getByRole('button', { name: '새 단어 시작, 1개' }).click()
  await answer(page, '모르겠어요')
  await page.getByRole('button', { name: /나가기/ }).click()
  // the word is in its first steps: still the new session's (said on the button), not a review
  const fresh = page.getByRole('button', { name: '새 단어 이어서 하기, 1개 남음, 익히는 중 1개 포함' })
  await expect(fresh.locator('.c-learning')).toHaveText('익히는 중 1개 포함')
  await expect(page.locator('.go-review .c-review')).toHaveText('1장')
  await page.getByRole('button', { name: '복습 시작, 1장' }).click()
  await answer(page, '모르겠어요')
  await page.getByRole('button', { name: /나가기/ }).click()
  // the forgotten review comes back within minutes: it waits in the review session
  await expect(page.locator('.go-review .c-review')).toHaveText('1장')
  await expect(page.locator('.go-new .c-new')).toHaveText('1개')
})

test('the tab bar is a white surface with rounded top corners on every tab; the tab you are on has its icon filled pink', async ({ page }) => {
  await open(page, { state: user({ target: 4, includeLower: true }, { cards: cards(718, 0) }) })
  await homeShown(page)
  const tabbar = page.locator('.tabbar')
  for (const [tab, heading] of [['홈', '오늘'], ['단어장', '단어장'], ['기록', '기록'], ['설정', '설정']]) {
    await tabbar.getByRole('link', { name: tab }).click()
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
    const css = await tabbar.evaluate((el) => {
      const cs = getComputedStyle(el)
      return [cs.backgroundColor, cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius]
    })
    expect(css).toEqual(['rgb(255, 255, 255)', '24px', '24px', '0px'])
    const on = tabbar.locator('a[aria-current="page"]')
    await expect(on).toHaveText(tab)
    expect(await on.locator('svg').evaluate((el) => getComputedStyle(el).fill)).toBe(rgb('#f7c6d0'))
    expect(await on.evaluate((el) => getComputedStyle(el).color)).toBe(rgb('#2d2a26'))
    expect(await tabbar.locator('a:not([aria-current]) svg').first().evaluate((el) => getComputedStyle(el).fill)).toBe('none')
  }
  // Home no longer links to 기록 with a word card: the words met are on 기록 and 단어장
  await tabbar.getByRole('link', { name: '홈' }).click()
  await expect(page.locator('.home-words')).toHaveCount(0)
})
