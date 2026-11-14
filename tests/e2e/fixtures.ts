import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
import { fromLegacy } from '../../src/ids'

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

type Settings = { target: number; dailyNew: number; theme: string; autoSpeak: boolean; includeLower: boolean; fastTrack: boolean }

/**
 * A saved state as an existing learner has it — saved by the version before stable ids (v2, positional ids like
 * `5-0`, under LEGACY_KEY), so every scenario also goes through the one-time migration. Without `includeLower` it
 * is a learner from before that
 * setting: only the target level is studied (pass `includeLower: true` for a new learner's behaviour).
 * The cognate fast-track is off unless asked for (`fastTrack: true`), so scenarios about the meaning card,
 * its three answers and their intervals see meaning cards only; fasttrack.spec.ts covers reading cards.
 * Like every state saved before 2026-11-14 it carries an exam date, which the app now drops on load.
 */
export function user(settings: Partial<Settings> & Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return {
    v: 2,
    onboarded: true,
    settings: { target: 5, examDate: '2026-12-06', dailyNew: 10, theme: 'light', autoSpeak: false, fastTrack: false, ...settings },
    cards: {},
    log: {},
    marks: [],
    xp: 0,
    ...extra,
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

export const saved = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), KEY)

export const todayLog = async (page: Page, day = '2026-11-13') => (await saved(page))?.log?.[day]

/**
 * Answers within this long of the previous one are ignored as double taps (Study.tsx), so the tests
 * pause like a person reading the card would.
 */
export const READ_MS = 400

/** Every reading the word data gives a written form, to pick the right choice on a reading card. */
const READINGS = (() => {
  const m = new Map<string, Set<string>>()
  for (const l of [1, 2, 3, 4, 5])
    for (const [, w, r] of JSON.parse(readFileSync(new URL(`../../public/data/words-n${l}.json`, import.meta.url), 'utf8')) as string[][]) {
      const set = m.get(w) ?? m.set(w, new Set()).get(w)!
      for (const x of (r || w).replace(/[(（][^)）]*[)）]/g, ' ').split(/[;；、,，\s]+/)) if (x) set.add(x.replace(/[～〜~]/g, ''))
    }
  return m
})()

/** The right choice on the reading card shown now. */
export async function rightChoice(page: Page) {
  const w = await currentWord(page)
  const choices = await page.locator('.choice').allInnerTexts()
  const right = choices.find((c) => READINGS.get(w)?.has(c.trim()))
  if (!right) throw new Error(`no right reading for ${w} among ${choices.join(', ')}`)
  return page.locator('.choice', { hasText: new RegExp(`^${right.trim()}$`) })
}

/**
 * Reveal the current card and answer it. On a reading card (fast-track) "알아요"/"쉬워요" pick the right
 * reading — a reading card has no "쉬워요" — and "모르겠어요" is its own button.
 */
export async function answer(page: Page, choice: '알아요' | '쉬워요' | '모르겠어요' = '알아요') {
  const card = page.locator('.flash')
  await expect(card).toBeVisible()
  await page.waitForTimeout(READ_MS)
  const before = (await todayLog(page))?.c ?? 0
  if (await page.locator('.reading-card').count()) {
    if (choice === '모르겠어요') await page.getByRole('button', { name: /^모르겠어요/ }).click()
    else await (await rightChoice(page)).click()
    await page.waitForTimeout(READ_MS)
    await page.getByRole('button', { name: /^다음/ }).click()
  } else if (choice === '모르겠어요') {
    await page.getByRole('button', { name: /^모르겠어요/ }).click()
    await page.waitForTimeout(READ_MS)
    await page.getByRole('button', { name: '다음', exact: true }).click()
  } else {
    await card.click()
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
