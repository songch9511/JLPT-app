// Regressions from the second QA round (docs/plan/13-qa-round2.md): each failed before its fix.
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { answer, homeShown, L, NOW, open, READ_MS, saved, todayLog, user } from './fixtures'

const DAY = 86400_000
const review = (due: number) => ({ due, stability: 5, difficulty: 5, elapsed_days: 5, scheduled_days: 5, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: due - 5 * DAY })
const due3 = () => ({ [L('5-1')]: review(NOW.getTime() - DAY), [L('5-2')]: review(NOW.getTime() - DAY), [L('5-3')]: review(NOW.getTime() - DAY) })

test.describe('Space/Enter after a tap or click (Q1)', () => {
  test('a clicked “확인했어요 · 다음” keeps focus, but Space on the next card only shows the answer', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 0 }, { cards: due3() }), hash: '/study' })
    await expect(page.locator('.flash')).toBeVisible()
    await page.waitForTimeout(READ_MS)
    await page.getByRole('button', { name: /^모르겠어요/ }).click()
    await page.waitForTimeout(READ_MS)
    await page.getByRole('button', { name: /^확인했어요/ }).click()
    await expect.poll(async () => (await todayLog(page))?.c).toBe(1)
    await page.waitForTimeout(READ_MS)
    // the button that was clicked is now the next card's "모르겠어요", still focused
    await page.keyboard.press('Space')
    await expect(page.locator('.flash-meaning')).toBeVisible()
    await expect(page.locator('.flash.missed')).toHaveCount(0)
    await page.waitForTimeout(READ_MS)
    await page.keyboard.press('2')
    await expect.poll(async () => (await todayLog(page))?.p).toBe(1) // remembered, not forgotten
  })

  test('after undo with the keyboard, Space shows the card again (the undo button is off by then)', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 0 }, { cards: due3() }), hash: '/study' })
    await expect(page.locator('.flash')).toBeVisible()
    await page.keyboard.press('Space')
    await page.waitForTimeout(READ_MS)
    await page.keyboard.press('2')
    await expect.poll(async () => (await todayLog(page))?.c).toBe(1)
    const undo = page.getByRole('button', { name: '방금 선택 되돌리기' })
    await undo.focus()
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await todayLog(page))?.c ?? 0).toBe(0)
    await expect(undo).toBeFocused()
    await page.waitForTimeout(READ_MS)
    await page.keyboard.press('Space')
    await expect(page.locator('.flash-meaning')).toBeVisible()
  })
})

test.describe('accessibility (Q7, Q8)', () => {
  const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')
  async function violations(page: Page) {
    // colours are checked once the entry motions have settled (a fading-in answer is not yet its colour)
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))))
    await page.addScriptTag({ content: AXE })
    return page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (d: Document) => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }> } }).axe
      return (await axe.run(document)).violations.map((v) => `${v.impact} ${v.id} ×${v.nodes.length}`)
    })
  }

  test('the first run on home: every step of Ruma’s questions, and the first session offer', async ({ page }) => {
    await open(page)
    await expect(page.getByRole('button', { name: 'N5' })).toBeVisible()
    expect(await violations(page)).toEqual([])
    await page.getByRole('button', { name: 'N3' }).click()
    await expect(page.getByRole('button', { name: '첫 학습 시작' })).toBeVisible()
    expect(await violations(page)).toEqual([])
  })

  test('Ruma’s tips on home and on the study screen', async ({ page }) => {
    const guide = { done: ['level'] }
    await open(page, { state: { ...user({ fastTrack: true }), v: 4, guide }, hash: '/study' })
    for (let i = 0; i < 20; i++) {
      await expect(page.locator('.flash')).toBeVisible()
      if (await page.locator('.reading-card').count()) break
      await answer(page, '알아요')
    }
    await expect(page.locator('.study-tip')).toBeVisible()
    expect(await violations(page)).toEqual([])
    await page.getByRole('button', { name: /나가기/ }).click()
    await expect(page.locator('.ruma-line.tip')).toBeVisible()
    expect(await violations(page)).toEqual([])
  })

  test('the study screen has a main landmark and a page heading, on both sides of the card', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 0 }, { cards: due3() }), hash: '/study' })
    await expect(page.locator('.flash')).toBeVisible()
    expect(await violations(page)).toEqual([])
    await page.getByRole('button', { name: /^정답 보기/ }).click()
    expect(await violations(page)).toEqual([])
  })

  test('links inside text are not told apart by colour alone (settings credits, the in-app pages)', async ({ page }) => {
    await open(page, { state: user(), hash: '/settings' })
    await expect(page.getByRole('heading', { name: '정보' })).toBeVisible()
    expect(await violations(page)).toEqual([])
    await page.goto('./#/doc/support')
    await expect(page.locator('article.doc')).toBeVisible()
    expect(await violations(page)).toEqual([])
  })

  // home without the exam-day estimate (2026-11-14): a new learner after the first session, an established one and a
  // backlog, at 320 and 390, light and dark
  const t = NOW.getTime()
  const established = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`5-${i}`, { ...review(t + ((i % 20) - 6) * DAY), stability: 5 + (i % 40), scheduled_days: 5 + (i % 40) }]))
  const backlog = Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`5-${i}`, review(t - 7 * DAY + i * 60_000)]))
  const homes: Record<string, (theme: string) => unknown> = {
    'a new learner after the first session': (theme) => ({ ...user({ includeLower: true, fastTrack: true, dailyNew: 20, theme }, { log: { '2026-11-13': { c: 40, n: 20, r: 0, p: 0 } } }), guide: { done: ['level', 'srs'] } }),
    'an established learner': (theme) => user({ target: 4, includeLower: true, dailyNew: 10, theme }, { cards: established, log: { '2026-11-12': { c: 60, n: 10, r: 40, p: 36 } } }),
    'a backlog': (theme) => user({ dailyNew: 20, theme }, { cards: backlog }),
  }
  for (const [name, state] of Object.entries(homes))
    for (const width of [320, 390])
      for (const theme of ['light', 'dark'])
        test(`home, ${name}, ${width}px ${theme}: no violations, no sideways scroll, at most one primary, nothing about an exam`, async ({ page }) => {
          await page.setViewportSize({ width, height: 800 })
          await open(page, { state: state(theme) })
          await homeShown(page)
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
          await expect(page.locator('.home-words')).toBeVisible()
          expect(await violations(page)).toEqual([])
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
          expect(await page.locator('.btn[data-variant="primary"]').count()).toBeLessThanOrEqual(1)
          await expect(page.getByText(/시험|D-\d|예상/)).toHaveCount(0)
        })

  test('the largest iOS text sizes do not make the home screen scroll sideways at 320px (Q9)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await open(page, { state: user({ dailyNew: 10 }) })
    await homeShown(page)
    // what syncTextSize (src/themeRoot.ts) sets for the accessibility size AX3
    await page.evaluate(() => {
      const s = { 'large-title': 48 / 34, title1: 43 / 28, title2: 39 / 22, title3: 37 / 20, body: 33 / 17, footnote: 27 / 13, caption1: 26 / 12 }
      for (const [k, v] of Object.entries(s)) document.documentElement.style.setProperty(`--_dynamic-type-${k}`, String(v))
      document.documentElement.dataset.textSize = 'large'
    })
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    // the sky folds into one row, so the start button stays on the first screen
    const box = (await page.getByRole('button', { name: /^오늘의 학습 시작/ }).boundingBox())!
    const tabbar = (await page.locator('.tabbar').boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(tabbar.y)
  })
})

test.describe('exam date (Q3, removed 2026-11-14)', () => {
  test('a far exam date saved before loads; home and settings show nothing of it, and the next save drops it', async ({ page }) => {
    await open(page, { state: user({ examDate: '2099-12-06', goal: 0.9 }) })
    await homeShown(page)
    await expect(page.getByText(/시험|D-/)).toHaveCount(0)
    expect((await saved(page)).settings).not.toHaveProperty('examDate')
    await page.goto('./#/settings')
    await expect(page.getByRole('heading', { name: '학습 계획' })).toBeVisible()
    await expect(page.getByText(/시험일|시험날/)).toHaveCount(0)
    await expect(page.locator('input[type="date"]')).toHaveCount(0)
  })
})
