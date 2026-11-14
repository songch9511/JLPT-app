// Swiping between the cards of a study session (Study.tsx, src/components/useSwipe.ts, src/session.ts): back through
// the cards answered, forward only as far as the card to answer, and another grade on an earlier card replaces that
// answer. Touch is driven with real touch points (CDP), so `touch-action` and pointer capture behave as on a phone.
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { answer, axeViolations, currentWord, L, NOW, open, READ_MS, rightChoice, saved, todayLog, user } from './fixtures'

const DAY = 86400_000
const review = (due: number, extra: Record<string, number> = {}) => ({ due, stability: 5, difficulty: 5, elapsed_days: 5, scheduled_days: 5, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: due - 5 * DAY, ...extra })
/** Five reviews due today, nothing new: the order is the due order. */
const reviews = (n = 5) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`5-${i + 1}`, review(NOW.getTime() - DAY + i * 60_000)]))

const stage = (page: Page) => page.locator('.card-stage')
/** The card on screen (slot 0). */
const shown = (page: Page) => page.locator('.card-slot:not([data-away]):not([inert]) .flash-word')
const pastBadge = (page: Page) => page.locator('.flash.past .badge').first()
const pressed = (page: Page) => page.locator('.past-bar button[aria-pressed="true"]')

/**
 * A finger on the card, moved `dx` sideways in `steps`, `ms` apart; with `hold` the finger stays still at the end
 * (no flick) before it lifts; `release: false` leaves it down (mid-swipe).
 */
async function touchSwipe(page: Page, dx: number, o: { steps?: number; ms?: number; hold?: boolean; release?: boolean; dy?: number; at?: { x: number; y: number } } = {}) {
  const box = (await stage(page).boundingBox())!
  const x = o.at?.x ?? box.x + box.width / 2
  const y = o.at?.y ?? box.y + box.height * 0.45
  const cdp = await page.context().newCDPSession(page)
  const steps = o.steps ?? 10
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / steps, y: y + ((o.dy ?? 0) * i) / steps }] })
    await page.waitForTimeout(o.ms ?? 16)
  }
  if (o.hold)
    for (let i = 0; i < 7; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx, y: y + (o.dy ?? 0) }] })
      await page.waitForTimeout(30)
    }
  if (o.release === false) return async () => void (await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  // let the card settle
  await page.waitForTimeout(350)
  return async () => {}
}
const back = (page: Page) => touchSwipe(page, 220)
const forward = (page: Page) => touchSwipe(page, -220)

async function studyThree(page: Page, state = user({ dailyNew: 0 }, { cards: reviews() })) {
  await open(page, { state, hash: '/study' })
  const words: string[] = []
  for (let i = 0; i < 3; i++) {
    words.push(await currentWord(page))
    await answer(page, '알아요')
  }
  return words
}

test.describe('swiping between the cards of the session', () => {
  test('back one card per swipe to the first, forward only to the card to answer; looking changes nothing', async ({ page }) => {
    const [a, b, c] = await studyThree(page)
    const d = await currentWord(page)
    const before = JSON.stringify(await saved(page))
    // the card to answer: a swipe left only stretches and springs back, and is not a tap (the answer stays hidden)
    await touchSwipe(page, -220)
    await expect(shown(page)).toHaveText(d)
    await expect(page.locator('.flash-meaning')).toHaveCount(0)

    await back(page)
    await expect(shown(page)).toHaveText(c)
    await expect(pastBadge(page)).toHaveText('이전 3/3')
    await expect(page.locator('.card-slot:not([inert]) .flash-meaning')).toBeVisible() // shown with its answer
    await expect(pressed(page)).toHaveCount(1)
    await expect(pressed(page)).toContainText('알아요')
    await back(page)
    await back(page)
    await expect(shown(page)).toHaveText(a)
    await expect(pastBadge(page)).toHaveText('이전 1/3')
    // nothing before the first: it stretches and springs back
    await back(page)
    await expect(shown(page)).toHaveText(a)

    await forward(page)
    await expect(shown(page)).toHaveText(b)
    await forward(page)
    await forward(page)
    await expect(shown(page)).toHaveText(d)
    await expect(page.locator('.flash.past')).toHaveCount(0)
    await forward(page)
    await expect(shown(page)).toHaveText(d)
    // nothing was graded, scheduled or logged by looking
    expect(JSON.stringify(await saved(page))).toBe(before)
    // and the card to answer still works as before
    await answer(page, '알아요')
    expect((await todayLog(page)).c).toBe(4)
  })

  test('mid-swipe: the card follows the finger and the earlier card slides in; under the threshold it springs back', async ({ page }) => {
    const [, , c] = await studyThree(page)
    const d = await currentWord(page)
    const x0 = (await page.locator('.card-slot:not([data-away]) .flash').first().boundingBox())!.x
    const lift = await touchSwipe(page, 90, { steps: 6, ms: 40, release: false })
    await page.waitForTimeout(100)
    const current = (await page.locator('.card-slot', { has: page.locator('.flash:not(.past)') }).boundingBox())!
    expect(current.x - x0).toBeGreaterThan(60)
    const prev = page.locator('.card-slot[inert] .flash.past')
    await expect(prev).toHaveCount(1)
    expect((await prev.boundingBox())!.x).toBeLessThan(x0)
    await lift()
    // 90px of a 358px card, slow: not far enough — back to the card to answer
    await page.waitForTimeout(400)
    await expect(shown(page)).toHaveText(d)
    expect(Math.abs((await page.locator('.flash:not(.past)').boundingBox())!.x - x0)).toBeLessThan(1)
    // the rubber band on the card to answer: it moves a little, at most 56px
    const lift2 = await touchSwipe(page, -250, { steps: 8, ms: 20, release: false })
    await page.waitForTimeout(100)
    const moved = (await page.locator('.flash:not(.past)').boundingBox())!.x - x0
    expect(moved).toBeLessThan(-10)
    expect(moved).toBeGreaterThanOrEqual(-56)
    await lift2()
    await page.waitForTimeout(400)
    await expect(shown(page)).toHaveText(d)
    // a quick flick goes back even though it is short
    await touchSwipe(page, 70, { steps: 3, ms: 16 })
    await expect(shown(page)).toHaveText(c)
  })

  test('a mostly vertical move scrolls instead of swiping; a press starting on a control never swipes', async ({ page }) => {
    const [, , c] = await studyThree(page)
    const d = await currentWord(page)
    await touchSwipe(page, 60, { dy: 200 })
    await expect(shown(page)).toHaveText(d)
    // starting on the bookmark button
    const mark = (await page.getByRole('button', { name: '북마크' }).first().boundingBox())!
    await touchSwipe(page, 220, { at: { x: mark.x + mark.width / 2, y: mark.y + mark.height / 2 } })
    await expect(shown(page)).toHaveText(d)
    // starting at the screen's very edge (the system's back-swipe)
    const box = (await stage(page).boundingBox())!
    await touchSwipe(page, 220, { at: { x: 6, y: box.y + box.height / 2 } })
    await expect(shown(page)).toHaveText(d)
    // a tap that moves a few pixels is still a tap: it shows the answer
    await touchSwipe(page, 5, { steps: 2 })
    await expect(page.locator('.flash-meaning')).toBeVisible()
    expect((await todayLog(page)).c).toBe(3)
    await back(page)
    await expect(shown(page)).toHaveText(c)
  })

  test('mouse: dragging works too, and the click at the end of a drag does not reveal the card', async ({ page }) => {
    await studyThree(page)
    const d = await currentWord(page)
    const box = (await stage(page).boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width / 2 - i * 20, box.y + box.height / 2)
    await page.mouse.up()
    await page.waitForTimeout(400)
    await expect(shown(page)).toHaveText(d)
    await expect(page.locator('.flash-meaning')).toHaveCount(0)
    await page.mouse.move(box.x + 40, box.y + box.height / 2)
    await page.mouse.down()
    for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 40 + i * 24, box.y + box.height / 2, { steps: 1 })
    await page.mouse.up()
    await page.waitForTimeout(400)
    await expect(page.locator('.flash.past')).toBeVisible()
  })
})

test.describe('another grade on an earlier card', () => {
  test('알아요 → 모르겠어요 and back: the log, the queue, Home and 기록 follow; the card to answer stays', async ({ page }) => {
    const [a] = await studyThree(page)
    const d = await currentWord(page)
    await expect(page.locator('.left-count')).toHaveText('2장 남음')
    expect(await todayLog(page)).toMatchObject({ c: 3, r: 3, p: 3, xp: 30 })
    await back(page)
    await back(page)
    await back(page)
    await expect(shown(page)).toHaveText(a)
    await page.getByRole('button', { name: /^모르겠어요/ }).click()
    // the selection moves, the learner stays on the card
    await expect(pressed(page)).toContainText('모르겠어요')
    await expect(shown(page)).toHaveText(a)
    await expect(page.locator('.flash.past.missed')).toBeVisible()
    await expect(page.locator('.after-note')).toContainText('다시 나와요')
    let s = await saved(page)
    expect(s.log['2026-11-13']).toMatchObject({ c: 3, r: 3, p: 2, xp: 30 })
    expect(s.cards[L('5-1')]).toMatchObject({ state: 3, lapses: 1 })
    // the forgotten card is back in today's queue (a relearning step, shown ahead)
    await expect(page.locator('.left-count')).toHaveText('3장 남음')
    for (let i = 0; i < 3; i++) await forward(page)
    await expect(shown(page)).toHaveText(d) // not replaced by the card that came back
    // the same grade again does nothing
    await back(page)
    await back(page)
    await back(page)
    const rev = (await saved(page)).rev
    await page.getByRole('button', { name: /^모르겠어요/ }).click()
    await page.waitForTimeout(200)
    expect((await saved(page)).rev).toBe(rev)
    // and back to 알아요: the relearning step leaves the queue
    await page.waitForTimeout(READ_MS)
    await page.getByRole('button', { name: /^알아요/ }).click()
    await expect(pressed(page)).toContainText('알아요')
    await expect(page.locator('.left-count')).toHaveText('2장 남음')
    s = await saved(page)
    expect(s.log['2026-11-13']).toMatchObject({ c: 3, r: 3, p: 3, xp: 30 })
    expect(s.cards[L('5-1')]).toMatchObject({ state: 2, lapses: 0 })

    // Home and 기록 show the same as the study screen
    await page.getByRole('button', { name: /나가기/ }).click()
    await expect(page.locator('.home-counts .c-review b')).toHaveText('2')
    await expect(page.locator('.home-counts .c-learning')).toHaveCount(0)
    await page.goto('./#/stats')
    await expect(page.locator('.stat', { hasText: 'XP' }).locator('b')).toHaveText('30')
  })

  test('the done screen is not a card: no swiping from it', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 0 }, { cards: reviews(2) }), hash: '/study' })
    await answer(page, '알아요')
    await answer(page, '알아요')
    await expect(page.getByRole('heading', { name: '오늘 끝', level: 1 })).toBeVisible()
    await expect(page.locator('.card-stage')).toHaveCount(0)
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('heading', { name: '오늘 끝', level: 1 })).toBeVisible()
  })

  test('모르겠어요 on a new word, then 쉬워요 instead: its later step in the session is dropped', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 2 }), hash: '/study' })
    const a = await currentWord(page)
    await answer(page, '모르겠어요') // a new word: back in a minute
    await answer(page, '알아요') // the second new word
    await page.clock.fastForward('02:00')
    await expect(page.locator('.flash-word')).toHaveText(a)
    await answer(page, '알아요') // a's next step
    const before = await todayLog(page)
    expect(before).toMatchObject({ c: 3, n: 2 })
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft')
    await expect(pastBadge(page)).toHaveText('이전 1/3')
    await expect(shown(page)).toHaveText(a)
    await page.getByRole('button', { name: /^쉬워요/ }).click()
    await expect(pressed(page)).toContainText('쉬워요')
    // as if 쉬워요 had been the answer: a graduated at once, its second step never happened
    await expect(pastBadge(page)).toHaveText('이전 1/2')
    const s = await saved(page)
    expect(s.log['2026-11-13']).toMatchObject({ c: 2, n: 2, xp: 20 })
    const graduated = Object.values(s.cards as Record<string, { state: number; reps: number }>).filter((x) => x.state === 2 && x.reps === 1)
    expect(graduated).toHaveLength(1)
  })
})

test.describe('reading cards', () => {
  test('an earlier reading card shows the choices with the answer and the pick; its grade is 모르겠어요 · 알아요', async ({ page }) => {
    // a reading card (警官, read like its Korean hanja word) due for review, then a meaning card
    const t = NOW.getTime()
    const r = 'w00o:r'
    const state = { ...user({ fastTrack: true, dailyNew: 0 }), v: 4, cards: { [r]: review(t - DAY), w01a: review(t - DAY + 60_000) } }
    await open(page, { state, hash: '/study' })
    await expect(page.locator('.reading-card')).toBeVisible()
    const word = await currentWord(page)
    // pick a wrong reading
    const right = await (await rightChoice(page)).innerText()
    const wrong = page.locator('.choice').filter({ hasNotText: right }).first()
    const wrongText = await wrong.innerText()
    await page.waitForTimeout(READ_MS)
    await wrong.click()
    await page.waitForTimeout(READ_MS)
    await page.getByRole('button', { name: /^다음,/ }).click()
    await expect.poll(async () => (await todayLog(page))?.c).toBe(1)
    expect((await saved(page)).cards[r]).toMatchObject({ state: 3, lapses: 1 })
    await back(page)
    await expect(shown(page)).toHaveText(word)
    const card = page.locator('.card-slot:not([inert]) .flash.past')
    await expect(card.locator('.choice.right')).toHaveText(right)
    await expect(card.locator('.choice.wrong')).toHaveText(wrongText)
    await expect(card.getByRole('button', { name: `${wrongText.trim()}, 고른 답, 오답` })).toBeVisible()
    await expect(page.locator('.past-bar button')).toHaveCount(2)
    await expect(pressed(page)).toContainText('모르겠어요')
    expect(await axeViolations(page)).toEqual([])
    await page.getByRole('button', { name: /^알아요/ }).click()
    await expect(pressed(page)).toContainText('알아요')
    const s = await saved(page)
    // remembered after all: a review again, no lapse, counted as remembered; no meaning card appears
    expect(s.cards[r]).toMatchObject({ state: 2, lapses: 0 })
    expect(s.cards[r].due).toBeGreaterThan(t + DAY)
    expect(s.log['2026-11-13']).toMatchObject({ c: 1, r: 1, p: 1 })
    expect(s.cards.w00o).toBeUndefined()
    // the pick is on record as it was
    await expect(card.locator('.choice.wrong')).toHaveText(wrongText)
  })
})

test.describe('undo, keyboard, screen readers, motion, sizes', () => {
  test('undo: off on an earlier card; on the card to answer it takes back the last answer, re-graded or not', async ({ page }) => {
    const [a, , c] = await studyThree(page)
    const d = await currentWord(page)
    const undo = page.getByRole('button', { name: '방금 답 되돌리기' })
    await expect(undo).toBeEnabled()
    await back(page)
    await expect(undo).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByRole('button', { name: '되돌리기', exact: true })).toHaveCount(0)
    await back(page)
    await back(page)
    await expect(shown(page)).toHaveText(a)
    await page.getByRole('button', { name: /^쉬워요/ }).click()
    for (let i = 0; i < 3; i++) await forward(page)
    await expect(shown(page)).toHaveText(d)
    await expect(undo).not.toHaveAttribute('aria-disabled', 'true')
    await undo.click()
    // c (the last answer) comes back; a keeps 쉬워요
    await expect(page.locator('.flash-word')).toHaveText(c)
    const s = await saved(page)
    expect(s.log['2026-11-13'].c).toBe(2)
    expect(s.cards[L('5-1')].scheduled_days).toBeGreaterThan(s.cards[L('5-2')].scheduled_days)
    // only that one answer can be undone, and the history now ends at b
    await expect(undo).toHaveAttribute('aria-disabled', 'true')
    await back(page)
    await expect(pastBadge(page)).toHaveText('이전 2/2')
  })

  test('keyboard: ← / → with the same limits, 1–3 re-grade an earlier card, Space on the card to answer still reveals', async ({ page }) => {
    const [, b, c] = await studyThree(page)
    const d = await currentWord(page)
    await page.keyboard.press('ArrowRight')
    await expect(shown(page)).toHaveText(d)
    await page.keyboard.press('ArrowLeft')
    await expect(shown(page)).toHaveText(c)
    await page.keyboard.press('ArrowLeft')
    await expect(shown(page)).toHaveText(b)
    await page.keyboard.press('3')
    await expect(pressed(page)).toContainText('쉬워요')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft') // first card: stays
    await expect(pastBadge(page)).toHaveText('이전 1/3')
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
    await expect(shown(page)).toHaveText(d)
    await expect(page.locator('.flash.past')).toHaveCount(0)
    await page.waitForTimeout(READ_MS)
    await page.keyboard.press('Space')
    await expect(page.locator('.flash-meaning')).toBeVisible()
    expect((await todayLog(page)).c).toBe(3)
  })

  test('screen readers: previous / later buttons (shown on focus), the place announced, the grade given pressed', async ({ page }) => {
    const [, , c] = await studyThree(page)
    const nav = page.getByRole('group', { name: '카드 넘기기' })
    const prev = nav.getByRole('button', { name: '이전 카드' })
    const next = nav.getByRole('button', { name: '이후 카드' })
    await expect(next).toHaveAttribute('aria-disabled', 'true')
    await prev.focus()
    await expect(prev).toBeInViewport()
    await prev.click()
    await expect(shown(page)).toHaveText(c)
    await expect(page.getByRole('status').filter({ hasText: '이전 카드 3 / 3' })).toHaveCount(1)
    await expect(page.locator('.past-bar').getByRole('button', { name: /^알아요/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.past-bar').getByRole('button', { name: /^모르겠어요/ })).toHaveAttribute('aria-pressed', 'false')
    // the card to answer is out of reach of the reader while an earlier card is shown
    await expect(page.locator('.card-slot[inert][aria-hidden="true"]')).toHaveCount(1)
    expect(await axeViolations(page)).toEqual([])
    await next.click()
    await expect(page.locator('.flash.past')).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: '지금 카드' })).toHaveCount(1)
  })

  test('auto-speak does not play an earlier card again', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __spoken: string[] }
      w.__spoken = []
      speechSynthesis.speak = (u: SpeechSynthesisUtterance) => void w.__spoken.push(u.text)
      speechSynthesis.cancel = () => {}
    })
    await studyThree(page, user({ dailyNew: 0, autoSpeak: true }, { cards: reviews() }))
    const spoken = () => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.length)
    const n = await spoken()
    await back(page)
    await back(page)
    await forward(page)
    await forward(page)
    await page.waitForTimeout(300)
    expect(await spoken()).toBe(n)
  })

  test('reduced motion: the card changes at once, with no slide', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const [, , c] = await studyThree(page)
    const box = (await stage(page).boundingBox())!
    const cdp = await page.context().newCDPSession(page)
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 28, y }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    // no settling motion: the earlier card is there in the next frames
    await page.waitForTimeout(50)
    await expect(stage(page)).not.toHaveClass(/settling/)
    await expect(shown(page)).toHaveText(c)
  })

  for (const theme of ['light', 'dark'])
    test(`320px ${theme}: an earlier card and its grades fit, no sideways scroll, no axe violations`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 568 })
      await studyThree(page, user({ dailyNew: 0, theme }, { cards: reviews() }))
      await back(page)
      await expect(page.locator('.flash.past')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
      for (const b of await page.locator('.past-bar button').all())
        expect(await b.evaluate((el) => el.querySelector('.grade-label')!.getClientRects().length)).toBe(1)
      expect(await axeViolations(page)).toEqual([])
    })

  test('a reload mid-session: the answers are saved, the history to swipe back to is not', async ({ page }) => {
    await studyThree(page)
    await page.reload()
    await expect(page.locator('.flash')).toBeVisible()
    expect((await todayLog(page)).c).toBe(3)
    const d = await currentWord(page)
    await back(page)
    await expect(shown(page)).toHaveText(d)
    await expect(page.locator('.flash.past')).toHaveCount(0)
    await expect(page.getByRole('group', { name: '카드 넘기기' })).toHaveCount(0)
  })

  test('the largest saved state: moving between cards and re-grading stay quick', async ({ page }) => {
    const big = readFileSync(new URL('../fixtures/legacy/state-v3.json', import.meta.url), 'utf8')
    await open(page, { state: big, hash: '/study' })
    for (let i = 0; i < 3; i++) await answer(page, '알아요')
    const ms = await page.evaluate(async () => {
      const t = performance.now()
      for (let i = 0; i < 3; i++) {
        dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r)))
      }
      return performance.now() - t
    })
    await expect(page.locator('.flash.past .badge').first()).toHaveText('이전 1/3')
    expect(ms).toBeLessThan(1500)
    const t0 = Date.now()
    await page.waitForTimeout(READ_MS)
    await page.locator('.past-bar').getByRole('button', { name: /^모르겠어요/ }).click()
    await expect(pressed(page)).toContainText('모르겠어요')
    expect(Date.now() - t0).toBeLessThan(READ_MS + 2000)
    // a drag moves the cards by a CSS variable only: no re-render per move (the card element stays the same)
    await page.evaluate(() => ((window as unknown as { __card: Element }).__card = document.querySelector('.card-slot:not([inert]) .flash')!))
    await touchSwipe(page, 60, { steps: 12, ms: 10, hold: true })
    expect(await page.evaluate(() => (window as unknown as { __card: Element }).__card === document.querySelector('.card-slot:not([inert]) .flash'))).toBe(true)
  })
})
