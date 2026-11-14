// The surface rules the owner cares about (docs/design-system.md §4 "표면"), checked on the rendered screens in light
// and dark, from computed styles: no rounded element has a border on one side only or thicker on some sides (the
// "edge stripe" on a card), no element has a thick border on one side only, and no screen shows more than one filled
// primary button. Each screen is also run through axe.
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { answer, axeViolations, homeShown, open, READ_MS, rightChoice, user } from './fixtures'

// N5 in introduction order: seeding the words before the first S word makes it the next card (as fasttrack.spec.ts)
const N5 = JSON.parse(readFileSync(new URL('../../public/data/n5.json', import.meta.url), 'utf8')) as (string | number)[][]
const ORDER = N5.map((r, i) => [r[4] as number, i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i)

/** Every element (and the open dialog's) whose border breaks the rules, with why. */
const offenders = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = []
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const sides = (['Top', 'Right', 'Bottom', 'Left'] as const).map((s) =>
        cs.getPropertyValue(`border-${s.toLowerCase()}-style`) === 'none' ? 0 : parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) || 0,
      )
      const radius = ['top-left', 'top-right', 'bottom-right', 'bottom-left'].some((c) => parseFloat(cs.getPropertyValue(`border-${c}-radius`)) > 0)
      const max = Math.max(...sides)
      const name = `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} [${sides.join(' ')}]`
      const lined = sides.filter((w) => w > 0).length
      // a rounded surface with a line on one side only, or a thicker line on some sides: the stripe on a card
      // (a sheet docked at the bottom keeps its even hairline on the three sides that show)
      if (radius && lined === 1) out.push(`rounded, one-side border: ${name}`)
      if (radius && max >= 2 && sides.some((w) => w !== max)) out.push(`rounded, uneven thick border: ${name}`)
      // a thick line on one side, rounded or not
      if (max >= 2 && sides.filter((w) => w > 0).length === 1) out.push(`one-side thick border: ${name}`)
    }
    return out
  })

/** Filled primary buttons that can be seen (not inside an inert or hidden card slot). */
const primaries = (page: Page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>('[data-variant="primary"]')].filter((b) => {
        const r = b.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && !b.closest('[inert], [aria-hidden="true"]') && getComputedStyle(b).visibility !== 'hidden'
      }).length,
  )

const check = async (page: Page, screen: string) => {
  expect(await offenders(page), screen).toEqual([])
  expect(await primaries(page), `${screen}: primary buttons`).toBeLessThanOrEqual(1)
  // and every screen passes axe (contrast included) in both themes
  expect(await axeViolations(page), `${screen}: axe`).toEqual([])
}

const DAY = 86_400_000
const T = new Date('2026-11-13T09:00:00+09:00').getTime()
const review = (due: number, lapses = 0) => ({ due, stability: 10, difficulty: 5, elapsed_days: 5, scheduled_days: 5, learning_steps: 0, reps: 3, lapses, state: 2, last_review: due - 5 * DAY })
const cards = (n: number, due: (i: number) => number, lapses = (_i: number) => 0) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`5-${i}`, review(T + due(i) * DAY, lapses(i))]))

for (const theme of ['light', 'dark'] as const)
  test.describe(`${theme}: surfaces and the one primary`, () => {
    test('home, words, a level, records, settings and their sheet and dialog', async ({ page }) => {
      const state = user({ theme }, { cards: cards(120, (i) => (i % 20) - 3, (i) => (i % 9 === 0 ? 3 : 0)), marks: ['5-1', '5-2'], xp: 4321 })
      await open(page, { state })
      await homeShown(page)
      await check(page, 'home')
      await page.goto('./#/words')
      await page.getByRole('searchbox').fill('水')
      await expect(page.locator('.word-row').first()).toBeVisible()
      await check(page, 'words')
      await page.locator('.word-row').first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.waitForTimeout(500)
      await check(page, 'word sheet')
      await page.keyboard.press('Escape')
      await page.getByRole('radio', { name: /^약한 단어/ }).click()
      await check(page, 'weak words')
      await page.goto('./#/level/5')
      await expect(page.locator('.word-row').first()).toBeVisible()
      await check(page, 'level')
      await page.goto('./#/stats')
      await expect(page.getByRole('heading', { name: '기록', exact: true })).toBeVisible()
      await check(page, 'records')
      await page.goto('./#/settings')
      await expect(page.getByRole('heading', { name: '설정', level: 1 })).toBeVisible()
      await check(page, 'settings')
      await page.getByRole('button', { name: '모든 기록 초기화' }).click()
      await expect(page.getByRole('alertdialog')).toBeVisible()
      await page.waitForTimeout(400)
      await check(page, 'reset dialog')
    })

    test('the study card: front, back, forgotten, an earlier card, and the done screen', async ({ page }) => {
      await open(page, { state: user({ theme, dailyNew: 0 }, { cards: cards(3, () => -1) }), hash: '/study' })
      await expect(page.locator('.flash')).toBeVisible()
      await check(page, 'study front')
      await page.waitForTimeout(READ_MS)
      await page.locator('.flash').click()
      await expect(page.locator('.flash-meaning')).toBeVisible()
      await check(page, 'study back')
      await page.getByRole('button', { name: /^모르겠어요/ }).click()
      await page.waitForTimeout(READ_MS)
      await answer(page, '알아요')
      await page.waitForTimeout(READ_MS)
      await page.getByRole('button', { name: /^모르겠어요/ }).click()
      await expect(page.locator('.flash.missed')).toBeVisible()
      // the forgotten card: its surface unchanged, the result one line with its mark
      await check(page, 'study forgotten')
      await expect(page.locator('.flash-head .result[data-tone="again"] svg')).toHaveCount(1)
      await page.waitForTimeout(READ_MS)
      await page.getByRole('button', { name: '다음', exact: true }).click()
      await page.waitForTimeout(READ_MS)
      // back to the card answered "알아요": the grade given is pressed, not a second primary
      await page.keyboard.press('ArrowLeft')
      await expect(page.locator('.flash.past')).toBeVisible()
      await expect(page.locator('.past-bar button[aria-pressed="true"]')).toHaveAttribute('data-variant', 'secondary')
      await check(page, 'study earlier card')
      await page.keyboard.press('ArrowRight')
      await expect(page.locator('.flash.past')).toHaveCount(0)
      while (await page.locator('.flash').count()) await answer(page, '쉬워요')
      await expect(page.getByRole('heading', { name: '오늘 끝' })).toBeVisible()
      await check(page, 'done')
    })

    test('a reading card answered wrong', async ({ page }) => {
      const pos = ORDER.findIndex((i) => N5[i][6] === 'S')
      const seen = Object.fromEntries(ORDER.slice(0, pos).map((i) => [`5-${i}`, review(T + 20 * DAY)]))
      await open(page, { state: user({ theme, fastTrack: true, dailyNew: 3 }, { cards: seen }), hash: '/study' })
      await expect(page.locator('.flash.reading-card')).toBeVisible()
      await page.waitForTimeout(READ_MS)
      const right = (await (await rightChoice(page)).innerText()).trim()
      await page.locator('.choice').filter({ hasNotText: new RegExp(`^${right}$`) }).first().click()
      await expect(page.locator('.choice.wrong')).toBeVisible()
      await check(page, 'reading wrong')
      // the result is one line with a mark; the wrong pick is struck through, the right one marked ✓
      await expect(page.locator('#reading-prompt .result[data-tone="wrong"]')).toHaveText('틀렸어요')
      await expect(page.locator('.choice.wrong .choice-text')).toHaveCSS('text-decoration-line', 'line-through')
      await expect(page.locator('.choice.right svg')).toHaveCount(1)
    })
  })
