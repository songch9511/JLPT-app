import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
import { fromLegacy } from '../../src/ids'
import { KANJI_BY_LEVEL } from '../../src/generated/content'

/** Where the app saves its state since stable word ids (v4). */
export const KEY = 'kasane.state.v4'
/** Where the versions before stable ids saved it (v2/v3, positional ids); the app migrates it at launch. */
export const LEGACY_KEY = 'kasane.state.v2'

/** The stable id of a word named by its old positional id (`L('5-0')`), to look a card up in what the app saved. */
export const L = (legacy: string) => {
  const id = fromLegacy(legacy)
  if (!id) throw new Error(`no word ${legacy}`)
  return id
}

/** The key a seeded state belongs under: states of the versions before stable ids (v2/v3) under theirs. */
export const keyFor = (state: unknown) => {
  const v = (typeof state === 'string' ? (() => { try { return JSON.parse(state) } catch { return null } })() : state)?.v
  return v === 4 ? KEY : LEGACY_KEY
}
/** Friday 2026-11-13 09:00 in Seoul (the browser context runs in Asia/Seoul). */
export const NOW = new Date('2026-11-13T09:00:00+09:00')

type Settings = { target: number; dailyNew: number; dailyKanji: number; theme: string; includeLower: boolean }

/**
 * Every kanji as a review card due long after the tests' days (`k` + the kanji): a learner who has them all, so the
 * 한자 session is empty and the day is the words. Scenarios about kanji study leave them out (`noKanji`).
 */
const KNOWN_DUE = Date.parse('2027-09-01T09:00:00+09:00')
export const KNOWN_KANJI: Record<string, object> = Object.fromEntries(
  Object.values(KANJI_BY_LEVEL)
    .flatMap((s) => [...s])
    .map((k) => [`k${k}`, { due: KNOWN_DUE, stability: 300, difficulty: 5, elapsed_days: 30, scheduled_days: 300, learning_steps: 0, reps: 5, lapses: 0, state: 2, last_review: Date.parse('2026-11-01T09:00:00+09:00') }]),
)

/**
 * A saved state as an existing learner has it — saved by the version before stable ids (v2, positional ids like
 * `5-0`, under LEGACY_KEY), so every scenario also goes through the one-time migration. Without `includeLower` it
 * is a learner from before that
 * setting: only the target level is studied (pass `includeLower: true` for a new learner's behaviour).
 * Every kanji is known (KNOWN_KANJI, kept under the cards the scenario gives), so the day is the words; pass
 * `{ kanji: false }` in `extra` for a learner with no kanji studied yet.
 * Like every state saved before 2026-11-14 it carries an exam date, and like one saved before 2026-11-17 the
 * pronunciation setting (`autoSpeak`); the app now drops both on load.
 */
export function user(settings: Partial<Settings> & Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  const { kanji = true, ...rest } = extra
  return {
    v: 2,
    onboarded: true,
    settings: { target: 5, examDate: '2026-12-06', dailyNew: 10, theme: 'light', autoSpeak: false, fastTrack: false, ...settings },
    log: {},
    marks: [],
    xp: 0,
    ...rest,
    cards: { ...(kanji ? KNOWN_KANJI : {}), ...((rest.cards as object) ?? {}) },
  }
}

/**
 * Open the app with a fake clock and, optionally, a saved state. The state is written only on the
 * first load of the tab, so reloads see whatever the app saved since.
 */
export async function open(page: Page, opts: { state?: unknown; time?: Date; hash?: string } = {}) {
  await page.clock.install({ time: opts.time ?? NOW })
  if (opts.state !== undefined)
    await page.addInitScript(
      ([k, v]) => {
        if (!sessionStorage.getItem('e2e-seeded')) {
          localStorage.setItem(k, v)
          sessionStorage.setItem('e2e-seeded', '1')
        }
      },
      [keyFor(opts.state), typeof opts.state === 'string' ? opts.state : JSON.stringify(opts.state)],
    )
  await page.goto(opts.hash ? `./#${opts.hash}` : './')
}

/**
 * What the app saved, without the kanji the fixture gave the learner (KNOWN_KANJI, untouched since), so a scenario
 * about words reads its own cards; a kanji card the scenario studied is kept.
 */
export const saved = async (page: Page) => {
  const s = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), KEY)
  if (s?.cards) s.cards = Object.fromEntries(Object.entries(s.cards as Record<string, { due: number; reps: number }>).filter(([id, c]) => !(id.startsWith('k') && c.due === KNOWN_DUE && c.reps === 5)))
  return s
}
/** What the app saved, as it is. */
export const savedRaw = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), KEY)

export const todayLog = async (page: Page, day = '2026-11-13') => (await saved(page))?.log?.[day]

/**
 * Answers within this long of the previous one are ignored as double taps (Study.tsx), so the tests
 * pause like a person reading the card would.
 */
export const READ_MS = 400

/**
 * Open the current card's meaning and answer it. "모르겠어요" opens everything first, then grades on the second press.
 */
export async function answer(page: Page, choice: '알아요' | '쉬워요' | '모르겠어요' = '알아요') {
  const card = page.locator('.flash')
  await expect(card).toBeVisible()
  await page.waitForTimeout(READ_MS)
  const before = (await todayLog(page))?.c ?? 0
  if (choice === '모르겠어요') {
    await page.getByRole('button', { name: /^모르겠어요/ }).click()
    await page.waitForTimeout(READ_MS)
    await page.getByRole('button', { name: /^모르겠어요/ }).click()
  } else {
    // open the meaning first, as a learner checking it would (grading needs nothing opened: study.spec.ts)
    await page.getByRole('button', { name: '의미', exact: true }).click()
    await expect(page.locator('.flash-meaning')).toBeVisible()
    await page.getByRole('button', { name: new RegExp(`^${choice}`) }).click()
  }
  await expect.poll(async () => (await todayLog(page))?.c ?? 0).toBe(before + 1)
}

/** The home screen has rendered (today's plan is there). */
export const homeShown = (page: Page) => expect(page.getByRole('heading', { name: '오늘의 계획' })).toBeVisible()

/** Current word on the study card. */
export const currentWord = (page: Page) => page.locator('.flash-word').innerText()

const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')
/** axe-core's violations on the page as it is now, once the entry motions have settled. */
export async function axeViolations(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))))
  await page.addScriptTag({ content: AXE })
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (d: Document) => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }> } }).axe
    return (await axe.run(document)).violations.map((v) => `${v.impact} ${v.id} ×${v.nodes.length}`)
  })
}
