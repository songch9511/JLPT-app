// Names and numbers only (docs/copy-inventory.md, 2026-11-16): Ruma no longer speaks, and the helper sentences are
// gone. This walks the app's screens in their states and checks that none of the removed lines is rendered anywhere.
import { expect, test, type Page } from '@playwright/test'
import { answer, homeShown, NOW, open, READ_MS, user } from './fixtures'

const REMOVED = [
  // Ruma's lines
  '자고 있어요', '깨워 줄래요', '한쪽 눈 떴어요', '두 눈 다 떴어요', '반가워요, 루마예요', '내일 봐요', '보고 싶었어요', '같이 치워요',
  '오늘은 쉬어요', '다음은 N', '어느 급수를 준비해요',
  // Ruma's tips and their replay
  '잊을 때쯤 돌아와요', '기억할수록 간격이', '읽기만 골라요', '루마의 안내', '알겠어요',
  // helper sentences
  '오늘 돌아온 단어', '개 포함', '쉬움', '어려움', '카드를 눌러도', '끝냄', '남았어요', '나눠서 나와요', '쉬어 가요', '급수 다시 고르기',
  '정답 보기', '뜻을 이미 아는', '자세히',
]
const MIN = 60_000
const t = NOW.getTime()
const review = (due: number) => ({ due, stability: 20, difficulty: 5, elapsed_days: 20, scheduled_days: 20, learning_steps: 0, reps: 5, lapses: 0, state: 2, last_review: due - 20 * 86400_000 })
const learning = (due: number) => ({ due, stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 0, learning_steps: 1, reps: 1, lapses: 0, state: 1, last_review: t - 5 * MIN })

async function none(page: Page, where: string) {
  await page.waitForTimeout(150)
  const text = await page.locator('body').innerText()
  for (const line of REMOVED) expect(text, `${where}: “${line}”`).not.toContain(line)
}

test('no removed mascot line or helper sentence on the first run, Home in each state, the study card and its ends', async ({ page }) => {
  await open(page)
  await expect(page.getByRole('group', { name: '준비하는 급수' })).toBeVisible()
  await none(page, 'level picker')
  await page.getByRole('button', { name: /^N5, / }).click()
  await homeShown(page)
  await none(page, 'first session')
  await page.getByRole('button', { name: /첫 학습 시작/ }).click()
  await expect(page.locator('.flash')).toBeVisible()
  await none(page, 'card closed')
  // both toggles (Space opens both, also on a kana word whose 히라가나 has nothing to show)
  await page.keyboard.press('Space')
  await expect(page.locator('.flash-meaning')).toBeVisible()
  await none(page, 'card open')
  await page.waitForTimeout(READ_MS)
  await page.getByRole('button', { name: /^모르겠어요/ }).click()
  await none(page, 'card missed')
  await page.waitForTimeout(READ_MS)
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await page.getByRole('button', { name: /나가기/ }).click()
  await homeShown(page)
  await none(page, 'home part-way')
})

const STATES: [string, unknown, string?][] = [
  ['before studying', user({ dailyNew: 20 }, { cards: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`5-${i}`, review(t - 3600_000)])) })],
  ['a backlog', user({ dailyNew: 20 }, { cards: Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`5-${i}`, review(t - 7 * 86400_000)])) })],
  ['a day off', user({ dailyNew: 0 })],
  ['the level finished', user({ target: 5 }, { cards: Object.fromEntries(Array.from({ length: 718 }, (_, i) => [`5-${i}`, review(t + 5 * 86400_000)])) })],
  ['waiting (home)', user({ dailyNew: 0 }, { cards: { '5-0': learning(t + 40 * MIN) }, log: { '2026-11-13': { c: 3, n: 0, r: 3, p: 3 } } })],
  ['waiting (study)', user({ dailyNew: 0 }, { cards: { '5-0': learning(t + 40 * MIN) }, log: { '2026-11-13': { c: 3, n: 0, r: 3, p: 3 } } }), '/study'],
  ['the other session left', user({ dailyNew: 2 }, { cards: { '5-0': review(t - 3600_000) } }), '/study/review'],
]
for (const [name, state, hash] of STATES)
  test(`no removed line: ${name}`, async ({ page }) => {
    await open(page, { state, hash })
    if (name === 'the other session left') {
      await answer(page, '알아요')
      await expect(page.getByRole('heading', { name: '복습 끝', level: 1 })).toBeVisible()
    } else if (hash) await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    else await homeShown(page)
    await none(page, name)
  })

test('no removed line on 단어장, 기록, 설정 and the level screen', async ({ page }) => {
  await open(page, { state: user(), hash: '/words' })
  await expect(page.getByRole('heading', { name: '단어장', level: 1 })).toBeVisible()
  await none(page, '단어장')
  for (const [hash, heading] of [['/stats', '기록'], ['/settings', '설정'], ['/level/5', 'JLPT N5']]) {
    await page.goto(`./#${hash}`)
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
    await none(page, heading)
  }
})
