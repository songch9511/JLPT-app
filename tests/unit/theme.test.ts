// The built "ruma" theme (src/themes/ruma/ruma.css, from `npm run theme`): WCAG AA for the colour pairs the app uses,
// in light and dark, and nothing the oldest supported Safari would drop (docs/design-system.md).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../../src/themes/ruma/ruma.css', import.meta.url), 'utf8')
const tokens: Record<string, [string, string]> = {}
for (const m of css.matchAll(/(--[a-z0-9-]+):\s*light-dark\((#[0-9a-fA-F]{6,8}),\s*(#[0-9a-fA-F]{6,8})\)/g)) tokens[m[1]] = [m[2], m[3]]
for (const m of css.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens[m[1]] ??= [m[2], m[2]]

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// [foreground, background, minimum]: 4.5 for text, 3 for large text and essential UI (icons, boundaries, focus)
const PAIRS: [string, string, number][] = [
  ['--color-text-primary', '--color-background-body', 4.5],
  ['--color-text-primary', '--color-background-surface', 4.5],
  ['--color-text-secondary', '--color-background-body', 4.5],
  ['--color-text-secondary', '--color-background-surface', 4.5],
  ['--color-text-secondary', '--color-background-muted', 4.5],
  ['--color-text-accent', '--color-background-surface', 4.5],
  ['--color-text-accent', '--color-accent-muted', 4.5],
  ['--color-on-accent', '--color-accent', 4.5],
  ['--color-text-error', '--color-background-surface', 4.5],
  ['--color-text-error', '--color-error-muted', 4.5],
  ['--color-text-success', '--color-success-muted', 4.5],
  ['--color-text-warning', '--color-warning-muted', 4.5],
  ['--color-text-blue', '--color-background-blue', 4.5],
  ['--color-text-red', '--color-background-red', 4.5],
  ['--color-accent', '--color-background-body', 3],
  ['--color-error', '--color-background-surface', 3],
  ['--color-border-emphasized', '--color-background-surface', 3],
  ['--color-border-emphasized', '--color-background-body', 3],
  ['--color-icon-secondary', '--color-background-surface', 3],
  ['--ruma-gold-icon', '--color-background-surface', 3],
  ['--ruma-flame', '--color-background-body', 3],
  ['--ruma-stage-young', '--color-background-surface', 3],
  // Home (docs/design-system.md §3 "홈"): the level seals and the backlog tag on the plan sheet
  ['--ruma-seal', '--color-background-surface', 4.5],
]

// Home's sky, in each of Ruma's states: everything written on it. Held to 5:1 (AA with a margin) for text, 3:1 for the
// streak flame. A stamped seal's ground is the sky with 6% of the seal's ink in it (styles.css `.seals .done`).
const SKIES = ['--ruma-sky-sleep', '--ruma-sky-wake', '--ruma-sky-day', '--ruma-sky-rest']
const ON_SKY: [string, number][] = [
  ['--color-text-primary', 5],
  ['--ruma-sky-text-secondary', 5],
  ['--color-text-accent', 5],
  ['--ruma-seal', 5],
  ['--ruma-flame', 3],
]
const mix = (a: string, b: string, t: number) =>
  '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * t + parseInt(b.slice(i, i + 2), 16) * (1 - t)).toString(16).padStart(2, '0')).join('')

describe('ruma theme', () => {
  for (const [mode, i] of [['light', 0], ['dark', 1]] as const)
    it.each(PAIRS)(`${mode}: %s on %s meets %s:1`, (fg, bgName, min) => {
      expect(tokens[fg], fg).toBeDefined()
      expect(tokens[bgName], bgName).toBeDefined()
      expect(contrast(tokens[fg][i].slice(0, 7), tokens[bgName][i].slice(0, 7))).toBeGreaterThanOrEqual(min)
    })

  for (const [mode, i] of [['light', 0], ['dark', 1]] as const)
    for (const sky of SKIES)
      it.each(ON_SKY)(`${mode}: %s on ${sky} meets %s:1`, (fg, min) => {
        expect(tokens[fg], fg).toBeDefined()
        expect(tokens[sky], sky).toBeDefined()
        const [ink, ground] = [tokens[fg][i].slice(0, 7), tokens[sky][i].slice(0, 7)]
        expect(contrast(ink, ground)).toBeGreaterThanOrEqual(min)
        // a stamped day: the seal's ink on its own 6% tint of the sky
        if (fg === '--ruma-seal') expect(contrast(ink, mix(ink, ground, 0.06))).toBeGreaterThanOrEqual(min)
      })

  it('gives each of Ruma’s states its own sky, distinct from the ground and from each other', () => {
    for (const i of [0, 1]) {
      const values = SKIES.map((k) => tokens[k][i])
      expect(new Set(values).size).toBe(4)
      expect(values).not.toContain(tokens['--color-background-body'][i])
    }
  })

  it('keeps the traditional palette (生成り ground, 墨 text, 藍 accent, 緑青, 朱, 山吹茶)', () => {
    expect(tokens['--color-background-body']).toEqual(['#fbfaf5', '#1b1a18'])
    expect(tokens['--color-text-primary']).toEqual(['#2d2a26', '#ece7db'])
    expect(tokens['--color-accent']).toEqual(['#165e83', '#86aecf'])
    expect(tokens['--color-success'][0]).toBe('#47885e')
    expect(tokens['--color-error'][0]).toBe('#c4553b')
    expect(tokens['--color-warning'][0]).toBe('#c89932')
  })

  it('has no @scope left (Safari < 17.4 would drop every token) and loads no web fonts', () => {
    expect(css).not.toMatch(/@scope\s*\(/)
    expect(css).not.toMatch(/@font-face|@import|url\(/)
  })
})
