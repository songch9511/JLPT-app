import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { homeShown, L, NOW, open, saved, user } from './fixtures'

const DAY = 86400_000
const review = (due: number, extra: Record<string, number> = {}) => ({
  due,
  stability: 30,
  difficulty: 5,
  elapsed_days: 25,
  scheduled_days: 25,
  learning_steps: 0,
  reps: 5,
  lapses: 0,
  state: 2,
  last_review: due - 25 * DAY,
  ...extra,
})

test.describe('단어장 (boards 5-1 … 5-11)', () => {
  test('the 단어 tab: a search field, 북마크 and 약한 단어 with their counts, the five levels with their words met', async ({ page }) => {
    const cards = { '5-1': review(NOW.getTime() + DAY, { lapses: 3 }), '5-2': review(NOW.getTime() + DAY, { lapses: 1 }) }
    await open(page, { state: user({}, { cards, marks: ['5-3', '5-4'] }), hash: '/words' })
    await expect(page.getByRole('heading', { name: '단어장', level: 1 })).toBeVisible()
    await expect(page.getByRole('radio', { name: '단어' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('link', { name: '북마크 2' })).toBeVisible()
    await expect(page.getByRole('link', { name: '약한 단어 1' })).toBeVisible()
    const rows = page.locator('.levels-card .level-row')
    await expect(rows).toHaveCount(5)
    await expect(rows.locator('.level-count')).toHaveText(['2 / 718', '0 / 668', '0 / 2,140', '0 / 1,905', '0 / 2,699'])
    await rows.first().click()
    await expect(page).toHaveURL(/#\/level\/5$/)
  })

  test('the 한자 tab: the same for kanji, with the levels’ kanji counts', async ({ page }) => {
    await open(page, { state: user({}, { kanji: false, cards: { 'k日': review(NOW.getTime() + DAY, { lapses: 2 }), 'k月': review(NOW.getTime() + DAY) }, marks: ['k日'] }), hash: '/words' })
    await page.getByRole('radio', { name: '한자' }).click()
    await expect(page).toHaveURL(/#\/words\/kanji$/)
    await expect(page.getByRole('link', { name: '북마크 1' })).toBeVisible()
    await expect(page.getByRole('link', { name: '약한 한자 1' })).toBeVisible()
    await expect(page.locator('.levels-card .level-count')).toHaveText(['2 / 450', '0 / 334', '0 / 657', '0 / 242', '0 / 291'])
    await page.locator('.levels-card .level-row').first().click()
    await expect(page).toHaveURL(/#\/kanji\/5$/)
  })

  test('word search: by the word, its reading, its meaning; the word sheet; bookmark; Escape', async ({ page }) => {
    await open(page, { state: user(), hash: '/words' })
    await page.getByRole('link', { name: '단어 검색' }).click()
    await expect(page).toHaveURL(/#\/search\/word$/)
    const box = page.getByRole('searchbox', { name: '단어 검색' })
    await expect(box).toBeFocused()
    for (const q of ['学校', 'がっこう', '학교', 'school']) {
      await box.fill(q)
      await expect(page.locator('.word-row').filter({ hasText: '学校' }).first()).toBeVisible()
    }
    // the meaning searched for is in bold in the results; the count above them
    await box.fill('맡기')
    await expect(page.locator('.word-row .word-meaning b').first()).toHaveText('맡기')
    await expect(page.locator('.list-caption')).toHaveText(/^\d+개$/)
    await box.fill('学校')
    await page.locator('.word-row').filter({ hasText: 'がっこう' }).first().click()
    const sheet = page.getByRole('dialog', { name: '学校 단어 정보' })
    await expect(sheet.locator('.sheet-word')).toHaveText('学校')
    await expect(sheet.locator('.sheet-reading')).toHaveText('がっこう')
    await expect(sheet.locator('.sheet-meaning')).toHaveText('학교')
    await expect(sheet).toContainText('새 단어')
    // board 5-4: the kanji with their 음 and reading in this word, the example
    await expect(sheet.locator('.sk-chip')).toHaveCount(2)
    await expect(sheet.locator('.sk-chip').first()).toContainText('学')
    await expect(sheet.getByRole('heading', { name: '예문' })).toBeVisible()
    await sheet.getByRole('button', { name: '북마크' }).click()
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
    expect((await saved(page)).marks).toEqual([L('5-452')])
    // no results
    await box.fill('zzzzqqq')
    await expect(page.getByRole('heading', { name: '찾는 단어가 없어요' })).toBeVisible()
  })

  test('kanji search by Korean 음: every kanji read that way, its 훈음 and readings; the kanji sheet without stroke counts', async ({ page }) => {
    await open(page, { state: user({}, { kanji: false }), hash: '/search/kanji' })
    const box = page.getByRole('searchbox', { name: '한자 검색' })
    await box.fill('강')
    const rows = page.locator('.kanji-list-row')
    await expect(rows.first()).toBeVisible()
    for (const r of await rows.all()) await expect(r.locator('.klr-hun')).toContainText('강')
    await expect(rows.filter({ hasText: '強' })).toHaveCount(1)
    await rows.filter({ hasText: '強' }).click()
    const sheet = page.getByRole('dialog', { name: '強 한자 정보' })
    await expect(sheet.locator('.sheet-hun')).toContainText('강')
    await expect(sheet.locator('.sheet-yomi')).toContainText('キョウ')
    await expect(sheet.locator('.sheet-yomi')).toContainText('つよ(い)')
    await expect(sheet).not.toContainText('획')
    await expect(sheet.getByRole('heading', { name: '이 한자가 든 단어' })).toBeVisible()
    // a word of it opens its word sheet in its place
    await sheet.locator('.sheet-word-row').first().click()
    await expect(page.getByRole('dialog', { name: /단어 정보$/ })).toBeVisible()
  })

  test('북마크 (5-7): words and kanji, each tab with its count', async ({ page }) => {
    await open(page, { state: user({}, { marks: ['5-452', 'k日'] }), hash: '/marks' })
    await expect(page.getByRole('heading', { name: '북마크', level: 1 })).toBeVisible()
    await expect(page.getByRole('radio')).toHaveText(['단어 1', '한자 1'])
    await expect(page.locator('.word-row')).toHaveCount(1)
    await expect(page.locator('.word-row')).toContainText('学校')
    await page.getByRole('radio', { name: '한자 1' }).click()
    await expect(page.locator('.kanji-list-row')).toHaveCount(1)
    await expect(page.locator('.kanji-list-row .klr-char')).toHaveText('日')
  })

  test('약한 단어 (5-8): forgotten twice or more, most first, and a look at them all again that grades nothing', async ({ page }) => {
    const cards = { '5-1': review(NOW.getTime() + DAY, { lapses: 3 }), '5-2': review(NOW.getTime() + DAY, { lapses: 5 }), '5-3': review(NOW.getTime() + DAY, { lapses: 1 }) }
    await open(page, { state: user({}, { cards }), hash: '/weak' })
    await expect(page.getByText('자주 잊은 순서')).toBeVisible()
    await expect(page.locator('.word-row')).toHaveCount(2)
    await expect(page.locator('.word-row .lapses')).toHaveText(['잊음 5번', '잊음 3번'])
    await page.getByRole('button', { name: '이 단어들 다시 보기' }).click()
    await expect(page).toHaveURL(/#\/practice\/weak$/)
    await expect(page.locator('.flash-meta')).toHaveText('다시 보기')
    await expect(page.locator('.left-count')).toHaveText('0 / 2')
    // 모르겠어요 opens the card, then puts it once more at the end
    await page.getByRole('button', { name: /^모르겠어요/ }).click()
    await expect(page.locator('.flash-meaning')).toBeVisible()
    await page.getByRole('button', { name: /^모르겠어요/ }).click()
    await expect(page.locator('.left-count')).toHaveText('1 / 3')
    await page.getByRole('button', { name: /^알아요/ }).click()
    await page.getByRole('button', { name: /^쉬워요/ }).click()
    await expect(page.getByRole('heading', { name: '다시 보기 끝', level: 1 })).toBeVisible()
    // nothing was graded
    const s = await saved(page)
    expect(s.log).toEqual({})
    expect(s.cards[L('5-2')]).toMatchObject({ lapses: 5 })
    await page.getByRole('button', { name: '돌아가기' }).click()
    await expect(page).toHaveURL(/#\/weak$/)
  })
})

test.describe('a level (5-2, 5-3, 5-6)', () => {
  const first = (n: number) => {
    const order = JSON.parse(readFileSync(new URL('../../public/data/words-n5.json', import.meta.url), 'utf8')) as [string, string, string, string, string, number][]
    return [...order].sort((a, b) => a[5] - b[5]).slice(0, n).map((r) => r[0])
  }

  test('chapters: 50 words each in frequency order; done ones sealed 済, the current one marked 지금, later ones empty', async ({ page }) => {
    const ids = first(74)
    await open(page, { state: { ...user({}, { kanji: false }), v: 4, cards: Object.fromEntries(ids.map((id) => [id, review(NOW.getTime() + DAY)])) }, hash: '/level/5' })
    await expect(page.getByRole('heading', { name: 'N5', level: 1 })).toBeVisible()
    await expect(page.locator('.summary-card .summary-line')).toHaveText(/15챕터 중 1 끝\s*74 \/ 718/)
    const rows = page.locator('.chapter-row')
    await expect(rows).toHaveCount(15)
    await expect(rows.nth(0)).toHaveClass(/done/)
    await expect(rows.nth(0).locator('.seal')).toHaveText('済')
    await expect(rows.nth(1)).toHaveAccessibleName('챕터 2, 지금, 50단어 중 24 만남')
    await expect(rows.nth(1).locator('.now-tag')).toHaveText('지금')
    await expect(rows.nth(1).locator('.chapter-sub')).toHaveText('24 / 50')
    await expect(rows.nth(2).locator('.seal-empty')).toHaveCount(1)
    await expect(rows.nth(14).locator('.chapter-sub')).toHaveText('18단어')
    await rows.nth(1).click()
    // a chapter's words, its met words in stages, and a look at them again
    await expect(page.getByRole('heading', { name: 'N5 챕터 2', level: 1 })).toBeVisible()
    await expect(page.locator('.summary-card .summary-line')).toHaveText(/만난 단어\s*24 \/ 50/)
    await expect(page.locator('.word-row')).toHaveCount(50)
    await expect(page.locator('.legend')).toHaveText(/장기 기억 24\s*익히는 중 0\s*아직 26/)
    await page.getByRole('button', { name: '챕터 2 만난 단어 24개 다시 보기' }).click()
    await expect(page).toHaveURL(/#\/practice\/chapter\/5\/2$/)
    await expect(page.locator('.left-count')).toHaveText('0 / 24')
  })

  test('a level’s kanji as a grid: each with its 음 and a dot for its stage; a tap opens its sheet', async ({ page }) => {
    await open(page, { state: user({}, { kanji: false, cards: { 'k日': review(NOW.getTime() + DAY) } }), hash: '/kanji/5' })
    await expect(page.getByRole('heading', { name: 'N5 한자', level: 1 })).toBeVisible()
    await expect(page.locator('.summary-card .summary-line')).toHaveText(/만난 한자\s*1 \/ 450/)
    const tiles = page.locator('.kanji-tile')
    await expect(tiles).toHaveCount(450)
    await expect(page.getByRole('button', { name: '日 일, 장기 기억' })).toBeVisible()
    await page.getByRole('button', { name: '日 일, 장기 기억' }).click()
    await expect(page.getByRole('dialog', { name: '日 한자 정보' })).toBeVisible()
  })

  test('garbage hash routes fall back to home', async ({ page }) => {
    await open(page, { state: user() })
    for (const h of ['#/level/9', '#/level/', '#/level/05', '#/nope', '#%%%', '#/../settings', '#/kanji/0', '#/practice/chapter/5/99']) {
      await page.evaluate((x) => (location.hash = x), h)
      await expect(page.getByRole('heading', { name: '오늘의 계획' }), h).toBeVisible()
    }
    // a chapter number out of range is the level
    await page.evaluate(() => (location.hash = '#/level/4/extra'))
    await expect(page.getByRole('heading', { name: 'N4', level: 1 })).toBeVisible()
  })
})

test.describe('settings', () => {
  test('target level, daily new words and theme apply and persist', async ({ page }) => {
    await open(page, { state: user({ theme: 'system' }), hash: '/settings' })
    await page.getByRole('radio', { name: 'N2' }).click()
    await page.getByRole('radio', { name: '30', exact: true }).click()
    await page.getByRole('radio', { name: '다크' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('link', { name: '홈' }).click()
    await expect(page.getByRole('img', { name: '준비하는 급수 N2' })).toHaveText('N2')
    await expect(page.locator('.go-new .home-go-count')).toHaveText('30개')
    await page.getByRole('link', { name: '설정' }).click()
    await page.getByRole('radio', { name: '시스템' }).click()
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)
  })

  test('an API key saved by an older version is dropped and never exported; import restores a backup', async ({ page }) => {
    await open(page, { state: user({ apiKey: 'sk-ant-secret' }, { xp: 77, marks: ['5-3'] }), hash: '/settings' })
    // no API key field any more
    await expect(page.getByText(/API 키/)).toHaveCount(0)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '백업 내보내기' }).click()])
    expect(download.suggestedFilename()).toBe('jlpt-ruma-backup-2026-11-13.json')
    const backup = JSON.parse(await readFile((await download.path())!, 'utf8'))
    expect(backup.settings).not.toHaveProperty('apiKey')
    expect(backup.xp).toBe(77)

    // change things, then import the backup back
    await page.getByRole('radio', { name: 'N1' }).click()
    await page.locator('input[type=file]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
    // the in-app confirmation (no browser confirm())
    await page.getByRole('dialog', { name: '이 백업으로 바꿀까요?' }).getByRole('button', { name: '바꾸기', exact: true }).click()
    await expect(page.getByRole('radio', { name: 'N5' })).toBeChecked()
    const s = await saved(page)
    expect(s.xp).toBe(77)
    expect(JSON.stringify(s)).not.toContain('sk-ant-secret')
  })

  test('import rejects files that are not backups, and malformed backups that would break the app', async ({ page }) => {
    await open(page, { state: user({}, { xp: 5 }), hash: '/settings' })
    const bad = [
      'not json',
      JSON.stringify({ hello: 1 }),
      JSON.stringify({ ...user(), cards: { '5-0': null } }),
      JSON.stringify({ ...user(), log: null }),
    ]
    for (const body of bad) {
      await page.locator('input[type=file]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(body) })
      // an in-app message (no browser alert())
      const d = page.getByRole('dialog', { name: '가져오지 못했어요' })
      await expect(d, body).toBeVisible()
      await expect(d).toContainText('JLPT 루마 백업 파일이 아니에요.')
      await d.getByRole('button', { name: '알겠어요' }).click()
      await expect(d).toBeHidden()
    }
    expect((await saved(page)).xp).toBe(5)
    await page.getByRole('link', { name: '홈' }).click()
    await homeShown(page)
  })

  test('declining the import confirmation changes nothing', async ({ page }) => {
    await open(page, { state: user({}, { xp: 5 }), hash: '/settings' })
    await page.locator('input[type=file]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(user({}, { xp: 999, kanji: false }))) })
    await page.getByRole('dialog', { name: '이 백업으로 바꿀까요?' }).getByRole('button', { name: '취소' }).click()
    await expect(page.getByRole('dialog', { name: '이 백업으로 바꿀까요?' })).toBeHidden()
    await page.waitForTimeout(300)
    expect((await saved(page)).xp).toBe(5)
  })

  test('reset asks first, then starts the first run again', async ({ page }) => {
    await open(page, { state: user({}, { xp: 50 }), hash: '/settings' })
    await page.getByRole('button', { name: '모든 기록 초기화' }).click()
    const ask = page.getByRole('dialog', { name: '모든 기록을 지울까요?' })
    await expect(ask).toContainText('되돌릴 수 없어요')
    await ask.getByRole('button', { name: '취소' }).click()
    await expect(ask).toBeHidden()
    await expect(page.getByRole('heading', { name: '설정' })).toBeVisible()
    expect((await saved(page)).xp).toBe(50)
    await page.getByRole('button', { name: '모든 기록 초기화' }).click()
    await ask.getByRole('button', { name: '지우기', exact: true }).click()
    await page.getByRole('link', { name: '홈' }).click()
    await expect(page.getByRole('button', { name: 'N5 시작하기' })).toBeVisible()
    expect((await saved(page)).onboarded).toBe(false)
  })
})

test('P9: home never offers more than 40 new words a day and gives no pace advice; the pace is a setting', async ({ page }) => {
  // the old “맞추기” link offered 100 a day, and a later lever pushed the pace towards an exam-day goal
  await open(page, { state: user({ target: 1, dailyNew: 100 }) })
  await homeShown(page)
  await expect(page.locator('.go-new .home-go-count')).toHaveText('40개')
  await expect(page.getByRole('button', { name: /맞추기|바꾸기/ })).toHaveCount(0)
  await expect(page.locator('.plan-lever')).toHaveCount(0)
  await expect(page.getByText(/목표에 닿아요|목표를|시험/)).toHaveCount(0)
})

test('settings: daily new words stop at 40; lower levels can be set; no exam date or goal; the unofficial notice is shown', async ({ page }) => {
  await open(page, { state: user({ target: 3, dailyNew: 100 }), hash: '/settings' })
  // an old value above the cap is held to it
  await expect(page.getByRole('radio', { name: '40', exact: true })).toBeChecked()
  await expect(page.getByRole('radio', { name: '50', exact: true })).toHaveCount(0)
  const lower = page.getByRole('switch', { name: /아래 급수 단어도 함께 \(N5·N4\)/ })
  await expect(lower).not.toBeChecked()
  await lower.check()
  await expect.poll(async () => (await saved(page)).settings).toMatchObject({ includeLower: true, dailyNew: 40 })
  // the exam date (chips, date field) and the exam-day goal are gone
  await expect(page.getByRole('radio', { name: '90%' })).toHaveCount(0)
  await expect(page.getByRole('group', { name: '시험일' })).toHaveCount(0)
  await expect(page.locator('input[type="date"]')).toHaveCount(0)
  await expect(page.getByText(/시험일|시험날|준비도/)).toHaveCount(0)
  expect((await saved(page)).settings).not.toHaveProperty('goal')
  await expect(page.locator('.about .unofficial')).toContainText('관계없는 비공식 학습 앱')
  await expect(page.locator('.about .unofficial')).toContainText('승인하거나 후원하지 않아요')
})

test('P4: with lower levels included an N3 learner meets N5 words first, and the card names the level in its colour', async ({ page }) => {
  await open(page, { state: user({ target: 3, includeLower: true }) })
  await page.goto('./#/stats')
  await expect(page.getByRole('img', { name: 'N5~N3 단어 3,526 중 0' })).toBeAttached()
  const met = page.getByRole('heading', { name: '공부한 단어 · 한자' })
  await expect(met).toBeVisible()
  // the level range sits apart, at the right of the heading row, in small secondary text
  await expect(met.locator('.group-range')).toHaveText('N5~N3')
  await expect(page.getByRole('heading', { name: '복습 예정' })).toBeVisible()
  await page.locator('.tabbar').getByRole('link', { name: '홈' }).click()
  await page.getByRole('button', { name: '단어 시작' }).click()
  // the card's head names the level in its badge, then the kind as plain text
  await expect(page.locator('.flash-head .level-badge')).toHaveText('N5')
  await expect(page.locator('.flash-head .level-badge')).toHaveAttribute('data-level', '5')
  await expect(page.locator('.flash-head .flash-meta')).toHaveText('새 단어')
})

test.describe('home: the day, Ruma, the sessions', () => {
  test('an established learner: the level badge, the date and the streak, the 오늘 card with Ruma, the day’s figures and the sessions with one primary, then the chapter; nothing about an exam', async ({ page }) => {
    const t = NOW.getTime()
    const cards = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`5-${i}`, review(t + ((i % 20) - 5) * DAY, { stability: 10 + (i % 30) })]))
    await open(page, { state: user({}, { cards, log: { '2026-11-12': { c: 60, n: 0, r: 40, p: 36 } } }) })
    await homeShown(page)
    await expect(page.getByRole('heading', { name: '오늘', level: 1 })).toBeVisible()
    await expect(page.getByRole('img', { name: '준비하는 급수 N5' })).toHaveText('N5')
    await expect(page.locator('.home-date')).toHaveText('11월 13일 금요일')
    await expect(page.getByRole('img', { name: '연속 1일, 오늘 하면 2일' })).toHaveText('1')
    // order: the header, the 오늘 card (Ruma and the figures, then the plan), the chapter, the level's line
    await expect(page.locator('main.page > *')).toHaveClass([/home-head/, /today/, /home-chapter/, /home-foot/])
    await expect(page.locator('.today > *')).toHaveClass([/today-top/, /home-actions/])
    await expect(page.locator('.today-count')).toHaveText('0 / 70')
    await expect(page.getByRole('progressbar', { name: '오늘 학습' })).toHaveAttribute('aria-valuetext', '오늘 70장 중 0장')
    const plan = page.locator('.today > .home-actions')
    await expect(plan).toHaveAccessibleName('오늘의 계획')
    await expect(plan.getByRole('button')).toHaveText(['복습60장', '단어10개'])
    await expect(plan.getByRole('button', { name: '복습 시작, 60장' })).toHaveAttribute('data-variant', 'primary')
    await expect(plan.getByRole('button', { name: '단어 시작, 10개' })).toHaveAttribute('data-variant', 'secondary')
    await expect(page.getByText(/이번 주|오늘 분량 끝내기|읽기만/)).toHaveCount(0)
    await expect(page.locator('.btn[data-variant="primary"]')).toHaveCount(1)
    const box = await plan.getByRole('button', { name: '단어 시작, 10개' }).boundingBox()
    expect(box!.y + box!.height).toBeLessThan(844 - 70)
    await expect(page.getByText(/시험|D-\d|예상|목표에 닿아요|합격/)).toHaveCount(0)
  })

  test('기록 (6-1): the three figures, words and kanji met, the forecast with today in ink, the heatmap with its months and today outlined', async ({ page }) => {
    await open(page, { state: user({}, { xp: 1234, log: { '2026-11-12': { c: 60, n: 0, r: 40, p: 36 }, '2026-11-13': { c: 5, n: 5, r: 0, p: 0 } } }) })
    await expect(page.locator('.heatmap')).toHaveCount(0)
    await page.locator('.tabbar').getByRole('link', { name: '기록' }).click()
    await expect(page.getByRole('heading', { name: '기록', level: 1 })).toBeVisible()
    await expect(page.locator('.stat-grid')).toContainText('1,234')
    await expect(page.locator('.meter .meter-name')).toHaveText(['단어', '한자'])
    await expect(page.locator('.forecast-chart')).toBeVisible()
    expect(await page.locator('.forecast-chart .is-today i').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(45, 42, 38)')
    await expect(page.locator('.heat-month').first()).toHaveText(/^\d+월$/)
    await expect(page.locator('.heat.is-today')).toHaveCount(1)
    expect(await page.locator('.heat.is-today').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid')
    await expect(page.getByText(/도장 여정/)).toHaveCount(0)
  })
})

test('no AI entry points are left: study card, word sheet and weak words', async ({ page }) => {
  const leech = review(NOW.getTime() + DAY, { lapses: 3 })
  await open(page, { state: user({ apiKey: 'sk-ant-old' }, { cards: { '5-1': leech } }), hash: '/weak' })
  await expect(page.locator('.word-row')).toHaveCount(1)
  await expect(page.getByText(/이야기/)).toHaveCount(0)
  await page.goto('./#/search/word')
  await page.getByPlaceholder('단어 · 읽기 · 뜻').fill('学校')
  await page.locator('.word-row').filter({ hasText: 'がっこう' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog').getByText(/AI/)).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.evaluate(() => (location.hash = '#/study'))
  await page.getByRole('button', { name: '의미', exact: true }).click()
  await expect(page.locator('.flash-meaning')).toBeVisible()
  await expect(page.getByText(/AI/)).toHaveCount(0)
  expect(JSON.stringify(await saved(page))).not.toContain('sk-ant-old')
})
