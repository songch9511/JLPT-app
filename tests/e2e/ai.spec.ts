import { expect, test, type Page, type Route } from '@playwright/test'
import { open, user } from './fixtures'

const EXPLAIN = {
  examples: [
    { ja: '学校へ行きます。', kana: 'がっこうへいきます。', ko: '학교에 갑니다.' },
    { ja: '学校は大きいです。', kana: 'がっこうはおおきいです。', ko: '학교는 큽니다.' },
  ],
  kanji: '学(학) 배우다 · 校(교) 학교',
  tip: '한국어 “학교”와 한자가 같아요.',
  related: [{ word: '先生', kana: 'せんせい', ko: '선생님' }],
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' }

async function mockApi(page: Page, handler: (route: Route) => Promise<void>) {
  const calls: unknown[] = []
  await page.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    calls.push(route.request().postDataJSON())
    await handler(route)
  })
  return calls
}

const message = (body: unknown) => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content: [{ type: 'text', text: JSON.stringify(body) }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 10 },
})

async function openSheet(page: Page) {
  await page.getByPlaceholder('일본어, 읽기, 뜻으로 검색').fill('学校')
  await page.locator('.word-row').filter({ hasText: 'がっこう' }).first().click()
  return page.getByRole('dialog')
}

test('success: shows examples, kanji, tip and caches the result', async ({ page }) => {
  const calls = await mockApi(page, (r) => r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(message(EXPLAIN)) }))
  await open(page, { state: user({ apiKey: 'sk-ant-test' }), hash: '/words' })
  const sheet = await openSheet(page)
  await sheet.getByRole('button', { name: /AI 예문/ }).click()
  await expect(sheet.getByText('学校へ行きます。')).toBeVisible()
  await expect(sheet.getByText('한국어 “학교”와 한자가 같아요.')).toBeVisible()
  await expect(sheet.getByText('先生')).toBeVisible()
  expect(calls).toHaveLength(1)
  expect(JSON.stringify(calls[0])).toContain('学校')
  // opening the word again uses the cache
  await sheet.getByRole('button', { name: '닫기' }).click()
  await openSheet(page)
  await expect(page.getByText('学校へ行きます。')).toBeVisible()
  expect(calls).toHaveLength(1)
})

test('401: tells the user the key is wrong', async ({ page }) => {
  await mockApi(page, (r) =>
    r.fulfill({
      status: 401,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
    }),
  )
  await open(page, { state: user({ apiKey: 'sk-ant-wrong' }), hash: '/words' })
  const sheet = await openSheet(page)
  await sheet.getByRole('button', { name: /AI 예문/ }).click()
  await expect(sheet.locator('.error')).toContainText('API 키가 올바르지 않아요. 설정에서 확인해 주세요.')
  await expect(sheet.getByRole('button', { name: /AI 예문/ })).toBeEnabled()
})

test('network failure: says so after the SDK’s retries', async ({ page }) => {
  const calls = await mockApi(page, (r) => r.abort('internetdisconnected'))
  await open(page, { state: user({ apiKey: 'sk-ant-test' }), hash: '/words' })
  const sheet = await openSheet(page)
  await sheet.getByRole('button', { name: /AI 예문/ }).click()
  await expect(sheet.getByRole('button', { name: /AI가 설명을 쓰는 중/ })).toBeDisabled()
  await expect(sheet.locator('.error')).toContainText('네트워크에 연결할 수 없어요.', { timeout: 30_000 })
  expect(calls.length).toBeGreaterThanOrEqual(1)
})

test('no key: points to settings without calling the API', async ({ page }) => {
  const calls = await mockApi(page, (r) => r.abort())
  await open(page, { state: user({ apiKey: '   ' }), hash: '/words' })
  const sheet = await openSheet(page)
  await sheet.getByRole('button', { name: /AI 예문/ }).click()
  await expect(sheet.locator('.error')).toContainText('AI 설명은 설정에서 켤 수 있어요.')
  await sheet.getByRole('link', { name: '설정으로' }).click()
  await expect(page.getByRole('heading', { name: '설정' })).toBeVisible()
  expect(calls).toHaveLength(0)
})

test('AI explain from the study card', async ({ page }) => {
  await mockApi(page, (r) => r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(message(EXPLAIN)) }))
  await open(page, { state: user({ apiKey: 'sk-ant-test' }), hash: '/study' })
  await page.locator('.flash').click()
  await page.getByRole('button', { name: 'AI 설명 보기' }).click()
  await page.getByRole('button', { name: /AI 예문/ }).click()
  await expect(page.getByText('学校へ行きます。')).toBeVisible()
})

test('weak-word story: success and error', async ({ page }) => {
  const story = { title: '잊지 않는 하루', lines: [{ ja: '庭で私は待ちます。', kana: 'にわでわたしはまちます。', ko: '정원에서 나는 기다립니다.' }] }
  let fail = false
  await mockApi(page, (r) =>
    fail
      ? r.fulfill({ status: 529, headers: { ...CORS, 'content-type': 'application/json', 'x-should-retry': 'false' }, body: JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'x' } }) })
      : r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(message(story)) }),
  )
  const t = Date.parse('2026-11-13T09:00:00+09:00')
  const leech = { due: t + 86400_000, stability: 2, difficulty: 8, elapsed_days: 1, scheduled_days: 1, learning_steps: 0, reps: 6, lapses: 3, state: 2, last_review: t - 86400_000 }
  await open(page, { state: user({ apiKey: 'sk-ant-test' }, { cards: { '5-1': leech, '5-2': leech } }), hash: '/words' })
  await page.getByRole('button', { name: /^약한 단어/ }).click()
  await page.getByRole('button', { name: '이야기 만들기' }).click()
  await expect(page.locator('.story-title')).toHaveText('잊지 않는 하루')
  fail = true
  await page.getByRole('button', { name: '다른 이야기 만들기' }).click()
  await expect(page.locator('.story .error')).toContainText('AI 요청에 실패했어요 (529).')
})
