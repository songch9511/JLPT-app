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

test.describe('backlog on home (board 2-4)', () => {
  test('after a week away: “n일 만이에요”, the reviews as “all due 중 today’s share”, fewer new words and kanji', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 20 }, { cards: overdue(600), log: { '2026-11-04': { c: 80, n: 10, r: 70, p: 60 } } }) })
    await homeShown(page)
    const plan = page.getByRole('region', { name: '오늘의 계획' })
    await expect(page.getByRole('heading', { name: '9일 만이에요', level: 1 })).toBeVisible()
    await expect(page.locator('.today-count')).toHaveText('0 / 230')
    const reviews = plan.getByRole('button', { name: '복습 시작, 쌓인 600장 중 225장' })
    await expect(reviews).toHaveText('복습600장 중225장')
    await expect(reviews).toHaveAttribute('data-variant', 'primary')
    // fewer new words while behind (03 §5.1)
    await expect(plan.getByRole('button', { name: '단어 시작, 5개' })).toHaveAttribute('data-variant', 'secondary')
    // no tag, no catch-up estimate, no sentence
    await expect(page.getByText(/따라잡아요|나눠서 해요|오래된 것부터|밀린/)).toHaveCount(0)
    // Ruma is asleep (today's study has not started) and says nothing; the streak is gone
    await expect(page.locator('.today-ruma')).toHaveAttribute('data-mood', 'sleep')
    await expect(page.locator('.home-head .streak')).toHaveText('0')
    await expect(plan.locator('.btn[data-variant="primary"]')).toHaveCount(1)
    // no exam-day estimate, gain or pace advice anywhere on the screen
    await expect(page.getByText(/시험|예상|목표에 닿아요/)).toHaveCount(0)
  })

  test('new kanji are cut too while reviews wait', async ({ page }) => {
    await open(page, { state: user({ dailyNew: 20, dailyKanji: 15 }, { kanji: false, cards: overdue(600) }) })
    await homeShown(page)
    await expect(page.locator('.go-kanji .home-go-count')).toHaveText('5자')
  })

  test('today’s share done: “오늘 끝”, and the learner can choose to do more of what waits', async ({ page }) => {
    const state = user({ dailyNew: 0 }, { cards: overdue(300), log: { '2026-11-13': { c: 225, n: 0, r: 225, p: 200 } } })
    await open(page, { state })
    await homeShown(page)
    const plan = page.getByRole('region', { name: '오늘의 계획' })
    await expect(plan.locator('.home-done')).toHaveText('오늘 끝')
    await expect(page.locator('.today-count')).toHaveText('225 / 225')
    await expect(page.locator('.today-ruma')).toHaveAttribute('data-mood', 'day')
    await expect(page.locator('.ruma.cheer')).toBeVisible()
    await expect(plan.locator('.btn[data-variant="primary"]')).toHaveCount(0)
    await expect(plan.getByRole('button', { name: /^단어 더 하기/ })).toHaveCount(0)
    const more = plan.getByRole('button', { name: '밀린 복습 50장 더 하기' })
    await expect(more).toHaveText('밀린 복습 더50장')
    await more.click()
    // what is let in is the review session's
    await expect(page).toHaveURL(/#\/study\/review$/)
    await answer(page, '알아요')
    expect(await todayLog(page)).toMatchObject({ r: 226, xr: 50 })
    // oldest due first: the first card shown was the oldest
    expect((await saved(page)).cards[L('5-0')].last_review).toBeGreaterThan(t - DAY)
  })

  test('the study done screen offers more reviews rather than more new words while catching up', async ({ page }) => {
    const cards = overdue(226)
    // 224 already answered today: two are due within the quota
    const state = user({ dailyNew: 0 }, { cards, log: { '2026-11-13': { c: 224, n: 0, r: 224, p: 200 } } })
    await open(page, { state, hash: '/study' })
    await answer(page, '알아요')
    await expect(page.getByRole('heading', { name: '오늘 끝', level: 1 })).toBeVisible()
    await expect(page.getByText(/나눠서|밀린 \d/)).toHaveCount(0)
    // the same button as Home's: short on screen, the whole action as its name
    await expect(page.getByRole('button', { name: '밀린 복습 50장 더 하기' })).toHaveText('밀린 복습 더50장')
    await expect(page.getByRole('button', { name: /^단어 더 하기/ })).toHaveCount(0)
  })
})
