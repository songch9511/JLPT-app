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
    await expect(page.getByRole('button', { name: '아직 몰라요' })).toBeVisible()
    expect(await violations(page)).toEqual([])
    await page.getByRole('button', { name: '아직 몰라요' }).click()
    await expect(page.getByRole('button', { name: '첫 학습 시작' })).toBeVisible()
    expect(await violations(page)).toEqual([])
  })

  test('Ruma’s tips on home and on the study screen', async ({ page }) => {
    const guide = { done: ['level', 'exam'] }
    await open(page, { state: { ...user({ fastTrack: true }), v: 4, guide }, hash: '/study' })
    for (let i = 0; i < 20; i++) {
      await expect(page.locator('.flash')).toBeVisible()
      if (await page.locator('.reading-card').count()) break
      await answer(page, '알아요')
    }
    await expect(page.locator('.study-tip')).toBeVisible()
    expect(await violations(page)).toEqual([])
    await page.getByRole('button', { name: /나가기/ }).click()
    await expect(page.locator('.bubble.tip')).toBeVisible()
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

  test('the largest iOS text sizes do not make the home screen scroll sideways at 320px (Q9)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await open(page, { state: user({ dailyNew: 10 }) })
    await homeShown(page)
    // what syncTextSize (src/themeRoot.ts) sets for the accessibility size AX3
    await page.evaluate(() => {
      const s = { 'large-title': 48 / 34, title1: 43 / 28, title2: 39 / 22, title3: 37 / 20, body: 33 / 17, footnote: 27 / 13, caption1: 26 / 12 }
      for (const [k, v] of Object.entries(s)) document.documentElement.style.setProperty(`--_dynamic-type-${k}`, String(v))
    })
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  })
})

test.describe('exam date (Q3)', () => {
  test('a date typed far in the future is not taken (it froze the home screen)', async ({ page }) => {
    await open(page, { state: user(), hash: '/settings' })
    const input = page.locator('#exam')
    await input.fill('2099-12-06')
    await page.waitForTimeout(200)
    expect((await saved(page))?.settings.examDate ?? '2026-12-06').toBe('2026-12-06')
    await input.fill('2027-12-05')
    await expect.poll(async () => (await saved(page)).settings.examDate).toBe('2027-12-05')
    await page.goto('./#/')
    await homeShown(page)
  })

  test('a far exam date saved before is put back to the next exam at launch', async ({ page }) => {
    await open(page, { state: user({ examDate: '2099-12-06' }) })
    await homeShown(page)
    await expect(page.locator('.home-ctx')).toContainText('12월 6일')
    expect((await saved(page)).settings.examDate).toBe('2026-12-06')
  })
})
