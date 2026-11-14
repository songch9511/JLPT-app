import { expect, test } from '@playwright/test'
import { answer, homeShown, L, NOW, open, saved, todayLog, user } from './fixtures'

const DAY = 86400_000
const MIN = 60_000
const t = NOW.getTime()

/** `n` review cards of N5 that came due a minute apart, the oldest a week ago. */
function overdue(n: number) {
  const cards: Record<string, unknown> = {}
  for (let i = 0; i < n; i++) {
    const due = t - 7 * DAY + i * MIN
    cards[`5-${i}`] = { due, stability: 6, difficulty: 5, elapsed_days: 6, scheduled_days: 6, learning_steps: 0, reps: 4, lapses: 0, state: 2, last_review: due - 6 * DAY }
  }
  return cards
}

test.describe('backlog on home', () => {
  test('after a week away: today’s share, the backlog as a tag, fewer new words and “더”', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 20 }, { cards: overdue(600) }) })
    await homeShown(page)
    const plan = page.getByRole('region', { name: '오늘의 계획' })
    await expect(plan.locator('.big .num')).toHaveText('230')
    await expect(plan.locator('.c-review b')).toHaveText('225')
    // fewer new words while behind (03 §5.1)
    await expect(plan.locator('.c-new b')).toHaveText('5')
    // the backlog is a tag on the numbers, read in full; no paragraph, no catch-up estimate
    await expect(plan.getByRole('img', { name: '밀린 복습 375장' })).toHaveText('밀린 375')
    await expect(page.getByText(/따라잡아요|나눠서 해요|오래된 것부터/)).toHaveCount(0)
    // Ruma has missed the learner; asleep, in the dawn sky
    await expect(page.locator('.ruma-line')).toHaveText(/^(보고 싶었어요|같이 치워요)$/)
    await expect(page.locator('.home-sky')).toHaveAttribute('data-sky', 'sleep')
    // one primary button in the group; "더" is a quiet text action under it
    await expect(plan.locator('.btn[data-variant="primary"]')).toHaveCount(1)
    await expect(plan.getByRole('button', { name: '오늘의 학습 시작, 230장' })).toHaveText('시작하기')
    await expect(plan.getByRole('button', { name: '하루 새 단어' })).toHaveCount(0)
    const more = plan.getByRole('button', { name: '밀린 복습 50장 더 하기' })
    await expect(more).toHaveText('50장 더')
    await expect(more).toHaveAttribute('data-variant', 'ghost')
    // the button stays where it was when the quiet action turns into the undo line
    const y = (await plan.locator('.home-go').boundingBox())!.y
    await more.click()
    await expect(plan.getByRole('status')).toContainText('복습 50장 늘렸어요')
    await expect(plan.locator('.c-review b')).toHaveText('275')
    expect((await plan.locator('.home-go').boundingBox())!.y).toBe(y)
    expect((await todayLog(page))?.xr).toBe(50)
    await plan.getByRole('button', { name: '되돌리기' }).click()
    await expect(plan.locator('.c-review b')).toHaveText('225')
    // no exam-day estimate, gain or pace advice anywhere on the screen
    await expect(page.getByText(/시험|예상|목표에 닿아요/)).toHaveCount(0)
  })

  test('today’s share done: the rest waits for the coming days, and the learner can choose to do more', async ({ page }) => {
    const state = user({ dailyNew: 0 }, { cards: overdue(300), log: { '2026-11-13': { c: 225, n: 0, r: 225, p: 200 } } })
    await open(page, { state })
    await homeShown(page)
    const plan = page.getByRole('region', { name: '오늘의 계획' })
    // today's share is done: both eyes, the day sky, what was done today, and the rest as a tag
    await expect(plan.locator('.plan-eyebrow')).toHaveText('오늘 끝')
    await expect(plan.locator('.big .num')).toHaveText('225')
    await expect(plan.getByRole('img', { name: '밀린 복습 300장' })).toBeVisible()
    await expect(page.locator('.home-sky')).toHaveAttribute('data-sky', 'day')
    await expect(page.locator('.ruma.cheer')).toBeVisible()
    await expect(plan.locator('.btn[data-variant="primary"]')).toHaveCount(0)
    await expect(plan.getByRole('button', { name: '새 단어 10개 더 하기' })).toHaveCount(0)
    const more = plan.getByRole('button', { name: '밀린 복습 50장 더 하기' })
    await expect(more).toHaveText('50장 더')
    await more.click()
    await expect(page).toHaveURL(/#\/study$/)
    await answer(page, '알아요')
    expect(await todayLog(page)).toMatchObject({ r: 226, xr: 50 })
    // oldest due first: the first card shown was the oldest
    expect((await saved(page)).cards[L('5-0')].last_review).toBeGreaterThan(t - DAY)
  })

  test('the study done screen offers more reviews rather than more new words while catching up', async ({ page }) => {
    const cards = overdue(226)
    // 225 already answered today: one card is due, held beyond the quota; let one in and answer it
    const state = user({ dailyNew: 0 }, { cards, log: { '2026-11-13': { c: 224, n: 0, r: 224, p: 200 } } })
    await open(page, { state, hash: '/study' })
    await answer(page, '알아요')
    await expect(page.getByRole('heading', { name: '오늘 끝', level: 1 })).toBeVisible()
    await expect(page.locator('.done-text')).toContainText('밀린 복습 225장은 내일부터 나눠서 나와요.')
    // the same button as Home's: short on screen, the whole action as its name
    await expect(page.getByRole('button', { name: '밀린 복습 50장 더 하기' })).toHaveText('50장 더')
    await expect(page.getByRole('button', { name: '새 단어 10개 더 하기' })).toHaveCount(0)
  })
})
