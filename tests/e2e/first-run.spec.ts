// The first run (boards 1-1 … 1-5; src/guide.ts, screens/LevelCarousel.tsx, screens/Intro.tsx): the five levels as
// stacked cards in a row (word and kanji counts, the level's colour in waves, Ruma), then three short intro pages — the
// card, the grades, the daily new words — then Home with the first session. The level is changed later only in 설정;
// 설정 › 처음 안내 다시 보기 opens the intro pages again. Learners from before the first run see none of it.
import { expect, test } from '@playwright/test'
import { answer, homeShown, KEY, open, saved, user } from './fixtures'

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
/** Each level's colours: the badge's [tint, ink] and the card's waves, light and dark (rumaTheme.ts). */
const LEVEL_TINT: Record<number, { light: string; dark: string }> = {
  5: { light: '#e8f1dc', dark: '#2f3d24' },
  4: { light: '#fbf1c9', dark: '#4a3f1c' },
  3: { light: '#fce8ed', dark: '#4a2a34' },
  2: { light: '#ebe6f7', dark: '#3a3152' },
  1: { light: '#e1edf6', dark: '#233a4b' },
}

test('a new learner: the level cards, three intro pages, then Home with the first session; nothing explained beyond them', async ({ page }) => {
  await open(page)
  await expect(page.locator('#launch')).toHaveCount(0)
  // board 1-1: the question, five cards in a row (N5 first and in the middle), the word and kanji counts
  await expect(page.getByRole('heading', { name: '준비하는 급수', level: 1 })).toBeVisible()
  const cards = page.locator('.lv-slot')
  await expect(cards).toHaveCount(5)
  await expect(cards.locator('.lv-counts')).toHaveText(['718단어 · 450한자', '668단어 · 334한자', '2,140단어 · 657한자', '1,905단어 · 242한자', '2,699단어 · 291한자'])
  await expect(page.getByRole('button', { name: 'N5, 718단어, 450한자' })).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('.first-note')).toHaveCount(0)
  await expect(page.locator('.home-go, .today, .streak, .tabbar')).toHaveCount(0)
  // one primary: start the level in the middle; a dot (or a card at the side) brings another level to the middle
  await expect(page.locator('.btn[data-variant="primary"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'N3', exact: true }).click()
  await expect(page.getByRole('button', { name: 'N3, 2,140단어, 657한자' })).toHaveAttribute('aria-current', 'true')
  await page.getByRole('button', { name: 'N3 시작하기' }).click()
  let s = await saved(page)
  expect(s).toMatchObject({ onboarded: false, settings: { target: 3 }, guide: { done: ['level'] } })

  // board 1-3 … 1-5: three steps, back and 건너뛰기 on the first two
  const steps = page.getByRole('progressbar', { name: /^3단계 중/ })
  await expect(steps).toHaveAttribute('aria-valuenow', '1')
  await expect(page.getByRole('heading', { name: '단어를 보고 뜻을 떠올려요' })).toBeVisible()
  await expect(page.getByText('모르면 의미를 눌러 봐요')).toBeVisible()
  await expect(page.locator('.intro-card .level-badge')).toHaveText('N3')
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await expect(steps).toHaveAttribute('aria-valuenow', '2')
  await expect(page.getByRole('heading', { name: '기억난 만큼 눌러요' })).toBeVisible()
  await expect(page.locator('.intro-bar .g b')).toHaveText(['모르겠어요', '알아요', '쉬워요'])
  // back, then 건너뛰기 to the last page
  await page.getByRole('button', { name: '뒤로' }).click()
  await expect(steps).toHaveAttribute('aria-valuenow', '1')
  await page.getByRole('button', { name: '건너뛰기' }).click()
  await expect(steps).toHaveAttribute('aria-valuenow', '3')
  await expect(page.getByRole('heading', { name: '하루 새 단어' })).toBeVisible()
  await expect(page.getByRole('button', { name: '건너뛰기' })).toHaveCount(0)
  // the daily new words: five pills, 20 chosen, about how long a day takes
  const pills = page.getByRole('group', { name: '하루 새 단어' }).getByRole('button')
  await expect(pills).toHaveText(['5', '10', '20', '30', '40'])
  await expect(pills.nth(2)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.intro-time')).toHaveText('하루 약15분')
  await pills.nth(3).click()
  await expect(page.locator('.intro-time b')).toHaveText('23분')
  await page.getByRole('button', { name: '시작하기', exact: true }).click()

  // Home: the first session, one primary; focus on the day
  await expect(page.getByRole('heading', { name: '오늘', level: 1 })).toBeFocused()
  await expect(page.getByRole('img', { name: '준비하는 급수 N3' })).toHaveText('N3')
  await expect(page.locator('.today-ruma')).toHaveAttribute('data-mood', 'sleep')
  await expect(page.locator('.go-new .home-go-count')).toHaveText('30개')
  await expect(page.locator('.btn[data-variant="primary"]')).toHaveCount(1)
  await expect(page.getByText(/시험|D-\d|아직 몰라요|깨워 줄래요/)).toHaveCount(0)
  s = await saved(page)
  expect(s).toMatchObject({ onboarded: true, settings: { target: 3, dailyNew: 30, includeLower: true }, guide: { done: ['level', 'intro'] } })
  await page.getByRole('button', { name: '첫 학습 시작, 새 단어 30개' }).click()
  for (let i = 0; i < 3; i++) await answer(page, '알아요')
  await page.getByRole('button', { name: /나가기/ }).click()
  await expect(page.getByRole('button', { name: /^새 단어 이어서 하기, \d+개 남음/ })).toBeVisible()
  await expect(page.locator('.today-ruma')).toHaveAttribute('data-mood', 'wake')
})

for (const theme of ['light', 'dark'] as const)
  test(`${theme}: each level card carries its level’s colour in its waves; the level’s name is always written`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await open(page)
    for (const l of [5, 4, 3, 2, 1]) {
      const card = page.locator(`.lv-card[data-level="${l}"]`)
      await expect(card.locator('.lv-name')).toHaveText(`N${l}`)
      expect(await card.locator('.lv-waves .w1').evaluate((el) => getComputedStyle(el).fill)).toBe(rgb(LEVEL_TINT[l][theme]))
    }
    await page.getByRole('button', { name: 'N2', exact: true }).click()
    await page.getByRole('button', { name: 'N2 시작하기' }).click()
    await page.getByRole('button', { name: '건너뛰기' }).click()
    await page.getByRole('button', { name: '시작하기', exact: true }).click()
    const badge = page.getByRole('img', { name: '준비하는 급수 N2' })
    await expect(badge).toHaveText('N2')
    expect(await badge.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(rgb(LEVEL_TINT[2][theme]))
  })

test('the level is changed only in 설정 (the home badge is a label); 설정 shows each level in its colour', async ({ page }) => {
  await open(page, { state: user({ target: 5, dailyNew: 10 }) })
  await homeShown(page)
  await expect(page.getByRole('img', { name: '준비하는 급수 N5' })).toBeVisible()
  await expect(page.getByRole('link', { name: /급수/ })).toHaveCount(0)
  await page.getByRole('link', { name: '설정' }).click()
  const levels = page.getByRole('radiogroup', { name: '준비하는 급수' })
  await expect(levels.getByRole('radio')).toHaveText(['N5', 'N4', 'N3', 'N2', 'N1'])
  await expect(levels.getByRole('radio', { name: 'N5' })).toHaveAttribute('aria-checked', 'true')
  await levels.getByRole('radio', { name: 'N3' }).click()
  const n3 = levels.getByRole('radio', { name: 'N3' })
  await expect(n3).toHaveAttribute('aria-checked', 'true')
  expect(await n3.evaluate((el) => getComputedStyle(el).boxShadow)).toContain(rgb('#8f3550'))
  await expect(page.getByRole('switch', { name: '아래 급수 단어도 함께 (N5·N4)' })).toBeVisible()
  await page.getByRole('link', { name: '홈' }).click()
  await expect(page.getByRole('img', { name: '준비하는 급수 N3' })).toBeVisible()
  expect((await saved(page)).settings.target).toBe(3)
})

test('설정 › 처음 안내 다시 보기: the intro pages again, then back to 설정; the daily new words chosen there are saved', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 10 }), hash: '/settings' })
  await page.getByRole('link', { name: '처음 안내 다시 보기' }).click()
  await expect(page).toHaveURL(/#\/intro$/)
  await expect(page.getByRole('heading', { name: '단어를 보고 뜻을 떠올려요' })).toBeVisible()
  await expect(page.locator('.tabbar')).toHaveCount(0)
  await page.getByRole('button', { name: '건너뛰기' }).click()
  await expect(page.getByRole('group', { name: '하루 새 단어' }).getByRole('button', { name: '10' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('group', { name: '하루 새 단어' }).getByRole('button', { name: '5', exact: true }).click()
  await page.getByRole('button', { name: '확인' }).click()
  await expect(page).toHaveURL(/#\/settings$/)
  const s = await saved(page)
  expect(s.settings.dailyNew).toBe(5)
  expect(s.guide).toBeUndefined()
})

test('a learner saved at the removed exam-date question continues with the intro pages, with the level they chose', async ({ page }) => {
  const state = { v: 4, onboarded: false, settings: { target: 2, examDate: '2026-12-06', dailyNew: 20, theme: 'light', autoSpeak: false, includeLower: true, goal: 0.8, fastTrack: true }, cards: {}, log: {}, marks: [], xp: 0, guide: { done: ['level'] } }
  await open(page, { state })
  await expect(page.getByRole('heading', { name: '단어를 보고 뜻을 떠올려요' })).toBeVisible()
  await page.getByRole('button', { name: '건너뛰기' }).click()
  await page.getByRole('button', { name: '시작하기', exact: true }).click()
  await expect(page.getByRole('img', { name: '준비하는 급수 N2' })).toBeVisible()
  await expect(page.getByText(/시험|아직 몰라요/)).toHaveCount(0)
  const s = await saved(page)
  expect(s).toMatchObject({ onboarded: true, settings: { target: 2 }, guide: { done: ['level', 'intro'] } })
  expect(s.settings).not.toHaveProperty('examDate')
  expect(s.settings).not.toHaveProperty('fastTrack')
})

test('one who had answered the retired steps or seen the retired tips is where they were; those ids are dropped', async ({ page }) => {
  const state = { ...user({ examDate: '2027-07-04' }), v: 4, log: { '2026-11-10': { c: 40, n: 10, r: 32, p: 28 } }, guide: { done: ['level', 'exam', 'exam-unknown', 'srs', 'reading', 'ready'] } }
  await open(page, { state })
  await homeShown(page)
  await expect(page.getByText(/시험|잊을 때쯤/)).toHaveCount(0)
  await page.getByRole('button', { name: '새 단어 시작' }).click()
  await answer(page, '알아요')
  expect((await saved(page)).guide).toEqual({ done: ['level'] })
})

test('a reload continues where it was; before the first run is through the study route shows it', async ({ page }) => {
  await open(page)
  await page.goto('./#/study')
  await expect(page.getByRole('heading', { name: '준비하는 급수' })).toBeVisible()
  await page.goto('./#/')
  await page.getByRole('button', { name: 'N2', exact: true }).click()
  await page.getByRole('button', { name: 'N2 시작하기' }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: '단어를 보고 뜻을 떠올려요' })).toBeVisible()
  // back from the first intro page: the level cards, the chosen level in the middle
  await page.getByRole('button', { name: '뒤로' }).click()
  await expect(page.getByRole('button', { name: 'N2, 1,905단어, 242한자' })).toHaveAttribute('aria-current', 'true')
})

test('works with the keyboard alone', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'N4', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'N4 시작하기' }).focus()
  await page.keyboard.press('Enter')
  for (const name of ['다음', '다음', '시작하기']) {
    await page.getByRole('button', { name, exact: true }).focus()
    await page.keyboard.press('Enter')
  }
  await expect(page.getByRole('heading', { name: '오늘', level: 1 })).toBeFocused()
  await page.getByRole('button', { name: /^첫 학습 시작/ }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/study\/new$/)
  expect((await saved(page)).settings.target).toBe(4)
})

test('an existing learner sees nothing of the first run', async ({ page }) => {
  await open(page, { state: user({ dailyNew: 20 }) })
  await homeShown(page)
  await expect(page.locator('.lv-slot, .intro-body')).toHaveCount(0)
  await page.getByRole('button', { name: '새 단어 시작' }).click()
  for (let i = 0; i < 4; i++) await answer(page, '알아요')
  await page.getByRole('button', { name: /나가기/ }).click()
  await homeShown(page)
  expect((await saved(page)).guide).toBeUndefined()
})

test('restoring an existing learner’s backup during the first run ends it, with no prompts', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'N5 시작하기' }).click()
  await page.getByRole('button', { name: '건너뛰기' }).click()
  await page.getByRole('button', { name: '시작하기', exact: true }).click()
  await page.getByRole('link', { name: '설정' }).click()
  const backup = { format: 'jlpt-luma-backup', formatVersion: 3, ...user({ target: 2 }, { kanji: false, log: { '2026-11-12': { c: 5, n: 5, r: 0, p: 0 } } }), v: 4 }
  await page.locator('input[type=file]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
  await page.getByRole('dialog', { name: '이 백업으로 바꿀까요?' }).getByRole('button', { name: '바꾸기', exact: true }).click()
  await page.getByRole('link', { name: '홈' }).click()
  await homeShown(page)
  await expect(page.getByRole('img', { name: '준비하는 급수 N2' })).toBeVisible()
  await expect(page.getByRole('button', { name: /첫 학습 시작/ })).toHaveCount(0)
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).guide, KEY)).toBeUndefined()
})

test('320px and the largest text sizes: the level cards and the intro pages do not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await open(page)
  await expect(page.getByRole('button', { name: 'N5 시작하기' })).toBeVisible()
  for (const large of [false, true]) {
    if (large)
      await page.evaluate(() => {
        const s = { 'large-title': 48 / 34, title1: 43 / 28, title2: 39 / 22, title3: 37 / 20, body: 33 / 17, footnote: 27 / 13, caption1: 26 / 12 }
        for (const [k, v] of Object.entries(s)) document.documentElement.style.setProperty(`--_dynamic-type-${k}`, String(v))
      })
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    const go = (await page.getByRole('button', { name: 'N5 시작하기' }).boundingBox())!
    expect(go.y + go.height).toBeLessThanOrEqual(568)
  }
  await page.getByRole('button', { name: 'N5 시작하기' }).click()
  for (const name of ['다음', '다음']) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    await page.getByRole('button', { name, exact: true }).click()
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})
