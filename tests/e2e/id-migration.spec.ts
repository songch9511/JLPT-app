// Stable word ids (docs/plan/08-word-data.md §7): a learner's storage as the last positional-id version saved it
// (tests/fixtures/legacy/state-v3.json, made by that version's own scheduler) loads, migrates, and every screen
// shows the same words and counts as that version showed. The expected texts in legacy-screens.json were
// recorded from the app at commit 5fd69b4 with RECORD_LEGACY=1 (this spec, run before any id change).
// One later, deliberate edit: the tag audit's corrections (docs/plan/12) took 7 of this learner's reading-card-only
// words off S (N5 前·～中(じゅう)·元気, N4 大体, N2 伯父さん·叔父さん·作者). Those reading cards now rest and the
// words count as new until their meaning card is learned, so the N5/N4/N2 breakdowns, readiness (−7 words) and
// today's reading-card count (8 → 6) changed by hand; every other recorded text is as recorded.
// A second (2026-11-14): the exam-day estimate was removed from Home. The plan lost its "오늘 하면 시험날 예상" line and
// pace advice, and the readiness card gave way to the word card, whose counts were written by hand from this file's
// own level breakdowns (N5~N2: 5,431 words, 2,655 new → 2,776 met; 631 + 566 + 634 + 259 = 2,090 long-term).
// A third (2026-11-14, Home "루마의 하늘"): the same counts in the new plan sheet — 159 left (130 + 12 + 17), 26 min,
// "계속하기" — and the word line without the long-term count and the "(읽기만 6)" note; rewritten by hand from the above.
import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { homeShown, KEY, L, NOW, open, saved, user } from './fixtures'

const fixture = (name: string) => readFileSync(new URL(`../fixtures/legacy/${name}`, import.meta.url), 'utf8')
const LEGACY_KEY = 'kasane.state.v2'
const EXPECTED = new URL('../fixtures/legacy/legacy-screens.json', import.meta.url)
const RECORD = !!process.env.RECORD_LEGACY
/** The fixture's clock: the learner stopped part-way through this day's session. */
const AT = new Date('2026-11-13T09:00:00+09:00')

const text = (page: Page, sel: string) =>
  page
    .locator(sel)
    .allInnerTexts()
    .then((t) => t.map((x) => x.replace(/\s+/g, ' ').trim()))

/** What a learner sees of their records: home plan and word card, the first study card, the word lists, each level's breakdown. */
async function screens(page: Page) {
  const out: Record<string, unknown> = {}
  await homeShown(page)
  // the counts are final once the studied levels' data has loaded: before that the 7 words the tag audit took off S
  // still count as met (2,783 instead of 2,776; "(읽기만 n)", the old signal, is no longer on Home)
  await expect(page.locator('.plan .c-new b')).toHaveText('17')
  await expect(page.locator('.home-words')).toContainText('2,776 / 5,431')
  out.home = { plan: await text(page, '.plan'), words: await text(page, '.home-words') }
  await page.goto('./#/words')
  await page.getByRole('radio', { name: /^북마크/ }).click()
  await expect(page.locator('.word-row').first()).toBeVisible()
  out.bookmarks = await text(page, '.word-row')
  await page.getByRole('radio', { name: /^약한 단어/ }).click()
  await expect(page.locator('.word-row').first()).toBeVisible()
  out.weak = await text(page, '.word-row')
  for (const l of [5, 4, 3, 2, 1]) {
    await page.goto(`./#/level/${l}`)
    await expect(page.getByRole('heading', { name: `JLPT N${l}` })).toBeVisible()
    await expect(page.locator('.word-row').first()).toBeVisible()
    out[`level${l}`] = { breakdown: await text(page, '.breakdown'), first: (await text(page, '.word-row')).slice(0, 30) }
  }
  await page.goto('./#/study')
  await expect(page.locator('.flash')).toBeVisible()
  out.study = { word: await page.locator('.flash-word').innerText(), top: await text(page, '.study-top') }
  return out
}

test('a learner saved by the positional-id version sees the same words and counts after the migration', async ({ page }) => {
  test.setTimeout(120_000)
  const raw = fixture('state-v3.json')
  await page.clock.install({ time: AT })
  await page.addInitScript(
    ([k, v]) => {
      if (!sessionStorage.getItem('e2e-seeded')) {
        localStorage.setItem(k, v)
        sessionStorage.setItem('e2e-seeded', '1')
      }
    },
    [LEGACY_KEY, raw],
  )
  await page.goto('./')
  const seen = await screens(page)
  if (RECORD) {
    writeFileSync(EXPECTED, JSON.stringify(seen, null, 1) + '\n')
    return
  }
  expect(seen).toEqual(JSON.parse(readFileSync(EXPECTED, 'utf8')))
})

const DAY = 86_400_000
const review = (due: number, extra: Record<string, number> = {}) => ({ due, stability: 30, difficulty: 5, elapsed_days: 25, scheduled_days: 25, learning_steps: 0, reps: 5, lapses: 0, state: 2, last_review: due - 25 * DAY, ...extra })

test('records whose word this version does not know are kept apart, and settings says so calmly (only then)', async ({ page }) => {
  const t = NOW.getTime()
  await open(page, { state: user({}, { cards: { '5-0': review(t + DAY), '9-0': review(t + DAY), '5-718': review(t + DAY) } }), hash: '/settings' })
  await expect(page.getByText('이 버전에 없는 단어의 기록 2개도 지우지 않고 함께 보관하고 있어요.', { exact: false })).toBeVisible()
  const s = await saved(page)
  expect(Object.keys(s.cards)).toEqual([L('5-0')])
  expect(Object.keys(s.orphans.cards)).toEqual(['9-0', '5-718'])
  // and the home screen counts only the known word
  await page.goto('./#/level/5')
  await expect(page.locator('.breakdown .mature b')).toHaveText('1')
  await expect(page.locator('.breakdown .new b')).toHaveText('717')
})

test('no note without quarantined records', async ({ page }) => {
  await open(page, { state: user({}, { cards: { '5-0': review(NOW.getTime() + DAY) } }), hash: '/settings' })
  await expect(page.getByRole('heading', { name: '설정' })).toBeVisible()
  await expect(page.locator('.orphans-note')).toHaveCount(0)
})

test('a tab still running the old version saves while this one is open: its records are merged in, nothing here is lost', async ({ page, context }) => {
  const t = NOW.getTime()
  await open(page, { state: user({}, { cards: { '5-0': review(t + DAY), '5-1': review(t + DAY) }, rev: 3 }), hash: '/level/5' })
  await expect(page.locator('.breakdown .mature b')).toHaveText('2')
  expect(Object.keys((await saved(page)).cards)).toEqual([L('5-0'), L('5-1')])
  // the "old tab": same origin, writes only the old key, from its stale copy plus one more word
  const old = await context.newPage()
  await old.goto('./data/NOTICE.txt')
  await old.evaluate(
    ([k, v]) => localStorage.setItem(k, v),
    [LEGACY_KEY, JSON.stringify(user({}, { cards: { '5-0': review(t + DAY), '5-1': review(t + DAY), '5-2': review(t + DAY) }, rev: 4 }))],
  )
  await expect(page.locator('.breakdown .mature b')).toHaveText('3')
  await expect.poll(async () => Object.keys((await saved(page)).cards)).toEqual([L('5-0'), L('5-1'), L('5-2')])
  // the old key itself is left as that tab wrote it
  expect(JSON.parse((await old.evaluate((k) => localStorage.getItem(k), LEGACY_KEY))!).cards).toHaveProperty('5-2')
})

test('word data from another deploy (or none): an error until the data is there, never a change to the records', async ({ page }) => {
  const t = NOW.getTime()
  let fail = true
  await page.route('**/data/words-n5.json', (r) => (fail ? r.fulfill({ status: 404, body: 'not found' }) : r.fallback()))
  await open(page, { state: user({ dailyNew: 0 }, { cards: { '5-0': review(t - DAY) } }), hash: '/study' })
  await expect(page.getByRole('alert')).toContainText('단어 데이터를 불러오지 못했어요')
  const before = await saved(page)
  expect(Object.keys(before.cards)).toEqual([L('5-0')])
  fail = false
  await page.reload()
  await expect(page.locator('.flash')).toBeVisible()
  expect((await saved(page)).cards).toEqual(before.cards)
})

test('migration time for a full state (8,130 words + 3,489 reading cards) at 4× CPU throttle', async ({ page, context }) => {
  test.setTimeout(120_000)
  const rows = (l: number) => JSON.parse(readFileSync(new URL(`../../public/data/n${l}.json`, import.meta.url), 'utf8')) as unknown[][]
  const cards: Record<string, unknown> = {}
  let k = 0
  for (const l of [5, 4, 3, 2, 1])
    rows(l).forEach((row, i) => {
      const c = () => review(NOW.getTime() + ((k++ % 90) - 30) * DAY, { stability: 1 + (k % 97) * 1.2345678901234567, difficulty: 1 + (k % 9) * 0.987654321, reps: 1 + (k % 12), lapses: k % 4 })
      cards[`${l}-${i}`] = c()
      if (row[6] === 'S') cards[`${l}-${i}:r`] = c()
    })
  const log: Record<string, unknown> = {}
  for (let d = 0; d < 365; d++) log[new Date(NOW.getTime() - d * DAY).toISOString().slice(0, 10)] = { c: 80, n: 20, r: 50, p: 45, ms: 640000, e: 44.5, xp: 800 }
  const state = user({ target: 1, includeLower: true, dailyNew: 0 }, { cards, log, xp: 99999, rev: 40000, v: 3 })
  const raw = JSON.stringify(state)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  // the real clock here (a faked one stops performance.now() during the migration)
  await page.addInitScript(([k, v]) => localStorage.getItem('kasane.state.v4') === null && localStorage.setItem(k, v), [LEGACY_KEY, raw])
  await page.goto('./')
  await homeShown(page)
  const ms = await page.evaluate(() => performance.getEntriesByName('kasane.migrate')[0]?.duration ?? -1)
  const after = await page.evaluate((k) => localStorage.getItem(k)!.length, KEY)
  console.log(`full state at 4x CPU throttle: migration ${ms.toFixed(0)} ms; ${Object.keys(cards).length} cards; localStorage ${raw.length} chars (v3) → ${after} chars (v4)`)
  expect(ms).toBeGreaterThan(0)
  expect(ms).toBeLessThan(2000)
  // every later launch only checks whether a tab of the old version wrote since (a fingerprint of the kept copy)
  await page.reload()
  await homeShown(page)
  const check = await page.evaluate(() => performance.getEntriesByName('kasane.legacy-check')[0]?.duration ?? -1)
  const load = await page.evaluate(() => performance.getEntriesByName('kasane.load')[0]?.duration ?? -1)
  // what loading always cost before stable ids too: reading and parsing the stored text
  const parse = await page.evaluate((k) => {
    const t = performance.now()
    JSON.parse(localStorage.getItem(k)!)
    return performance.now() - t
  }, KEY)
  console.log(`later launch at 4x CPU throttle: whole state load ${load.toFixed(0)} ms (read+parse alone ${parse.toFixed(0)} ms), of which old-copy check ${check.toFixed(0)} ms`)
  expect(check).toBeGreaterThanOrEqual(0)
  expect(await page.evaluate(() => performance.getEntriesByName('kasane.migrate').length)).toBe(0)
  expect(Object.keys((await saved(page)).cards)).toHaveLength(8130 + 3489)
})
