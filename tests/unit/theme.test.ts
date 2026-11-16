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
  ['--color-text-primary', '--color-background-muted', 4.5],
  ['--color-text-secondary', '--color-background-body', 4.5],
  ['--color-text-secondary', '--color-background-surface', 4.5],
  ['--color-text-secondary', '--color-background-muted', 4.5],
  ['--color-text-accent', '--color-background-surface', 4.5],
  ['--color-text-accent', '--color-accent-muted', 4.5],
  ['--color-on-accent', '--color-accent', 4.5],
  // the primary button's label on its face: white on ink in light, dark ink on the light ink in dark
  ['--ruma-on-primary', '--ruma-primary', 4.5],
  ['--color-text-error', '--color-background-surface', 4.5],
  ['--color-text-error', '--color-error-muted', 4.5],
  ['--color-text-success', '--color-success-muted', 4.5],
  // an answer's result line on the card (✓ 맞았어요 · ✕ 틀렸어요 · ↻ 10분 뒤 다시 나와요) and the struck wrong pick
  ['--color-text-success', '--color-background-surface', 4.5],
  ['--color-text-success', '--color-background-body', 4.5],
  ['--color-text-error', '--color-background-body', 4.5],
  // a grade given earlier, pressed: green ink on the green tint (above) with its deeper green line around it
  ['--color-success', '--color-success-muted', 3],
  // the on switch against the card and the page
  ['--color-success', '--color-background-surface', 3],
  ['--color-success', '--color-background-body', 3],
  // pastel fills carry dark ink, never light text: the tints under the body ink and under their own ink
  ['--color-text-primary', '--ruma-pink-tint', 4.5],
  ['--color-text-primary', '--ruma-yellow-tint', 4.5],
  ['--color-text-primary', '--color-success-muted', 4.5],
  ['--ruma-pink-text', '--ruma-pink-tint', 4.5],
  // the target level ("목표") in the pink ink on the ground and on a card
  ['--ruma-pink-text', '--color-background-body', 4.5],
  ['--ruma-pink-text', '--color-background-surface', 4.5],
  ['--color-text-warning', '--color-warning-muted', 4.5],
  ['--color-text-blue', '--color-background-blue', 4.5],
  ['--color-text-red', '--color-background-red', 4.5],
  ['--color-text-pink', '--color-background-pink', 4.5],
  // the selected tab's icon: ink line, pink fill, on the white bar
  ['--color-icon-primary', '--ruma-pink', 3],
  // the focus ring and the chosen chip's face on the grounds
  ['--color-accent', '--color-background-body', 3],
  ['--color-accent', '--color-background-surface', 3],
  ['--color-error', '--color-background-surface', 3],
  ['--color-border-emphasized', '--color-background-surface', 3],
  ['--color-border-emphasized', '--color-background-body', 3],
  ['--color-icon-secondary', '--color-background-surface', 3],
  // a bookmark that is on: on the card, and in its yellow circle on the word sheet
  ['--ruma-gold-icon', '--color-background-surface', 3],
  ['--ruma-gold-icon', '--ruma-yellow-tint', 3],
  ['--ruma-flame', '--color-background-body', 3],
  ['--ruma-flame', '--color-background-surface', 3],
  ['--ruma-stage-young', '--color-background-surface', 3],
  ['--ruma-stage-mature', '--color-background-surface', 3],
  // the five levels: the level's name in its ink on its tint (badges, Home's chip, the picker), on a card and on the
  // ground (the level screen's heading)
  ...[5, 4, 3, 2, 1].flatMap((l): [string, string, number][] => [
    [`--ruma-level-${l}-ink`, `--ruma-level-${l}-tint`, 4.5],
    [`--ruma-level-${l}-ink`, '--color-background-surface', 4.5],
    [`--ruma-level-${l}-ink`, '--color-background-body', 4.5],
    // the body ink on the tint (a level's figures inside its tinted badge)
    ['--color-text-primary', `--ruma-level-${l}-tint`, 4.5],
  ]),
]

describe('ruma theme', () => {
  for (const [mode, i] of [['light', 0], ['dark', 1]] as const)
    it.each(PAIRS)(`${mode}: %s on %s meets %s:1`, (fg, bgName, min) => {
      expect(tokens[fg], fg).toBeDefined()
      expect(tokens[bgName], bgName).toBeDefined()
      expect(contrast(tokens[fg][i].slice(0, 7), tokens[bgName][i].slice(0, 7))).toBeGreaterThanOrEqual(min)
    })

  it('keeps surfaces apart from the ground: a card, the muted fill and the hairline are each their own value', () => {
    for (const i of [0, 1]) {
      const values = ['--color-background-surface', '--color-background-muted', '--color-border'].map((k) => tokens[k][i])
      expect(new Set(values).size).toBe(3)
      expect(values).not.toContain(tokens['--color-background-body'][i])
    }
  })

  it('keeps the palette: cream ground, white surface, ink text, and the three pastels', () => {
    expect(tokens['--color-background-body']).toEqual(['#faf8f5', '#1c1a17'])
    expect(tokens['--color-background-surface'][0]).toBe('#ffffff')
    expect(tokens['--color-border'][0]).toBe('#e9e4d9')
    expect(tokens['--color-text-primary']).toEqual(['#2d2a26', '#ece7db'])
    expect(tokens['--ruma-pink'][0]).toBe('#f7c6d0')
    expect(tokens['--ruma-pink-tint'][0]).toBe('#fce8ed')
    expect(tokens['--ruma-green'][0]).toBe('#8fb573')
    expect(tokens['--color-success-muted'][0]).toBe('#e8f1dc')
    expect(tokens['--color-success'][0]).toBe('#5f8f45')
    expect(tokens['--ruma-yellow'][0]).toBe('#edc94f')
    expect(tokens['--ruma-yellow-tint'][0]).toBe('#fbf1c9')
    expect(tokens['--color-error'][0]).toBe('#c4553b')
  })

  it('the one primary is the ink in light mode and readable in dark: a light face with dark ink, on a darker edge', () => {
    expect(tokens['--ruma-primary'][0]).toBe(tokens['--color-text-primary'][0])
    expect(tokens['--ruma-on-primary'][0]).toBe('#ffffff')
    // the edge under the face is darker than the face in both modes
    for (const i of [0, 1]) expect(lum(tokens['--ruma-edge-accent'][i])).toBeLessThan(lum(tokens['--ruma-primary'][i]))
    // in dark the face stands out from the ground and from a card
    expect(contrast(tokens['--ruma-primary'][1], tokens['--color-background-body'][1])).toBeGreaterThanOrEqual(4.5)
    expect(contrast(tokens['--ruma-primary'][1], tokens['--color-background-surface'][1])).toBeGreaterThanOrEqual(4.5)
  })

  it('gives each level its own colour, the same pastels as the mockups: N5 green, N4 yellow, N3 pink, N2 violet, N1 sky', () => {
    expect(tokens['--ruma-level-5-tint'][0]).toBe('#e8f1dc')
    expect(tokens['--ruma-level-4-tint'][0]).toBe('#fbf1c9')
    expect(tokens['--ruma-level-3-tint'][0]).toBe('#fce8ed')
    expect(tokens['--ruma-level-2-tint'][0]).toBe('#ebe6f7')
    expect(tokens['--ruma-level-1-tint'][0]).toBe('#e1edf6')
    for (const i of [0, 1])
      for (const role of ['tint', 'ink', 'fill']) {
        const values = [5, 4, 3, 2, 1].map((l) => tokens[`--ruma-level-${l}-${role}`]?.[i])
        expect(values.every(Boolean), role).toBe(true)
        // five different colours in each mode, so no two levels look alike
        expect(new Set(values).size, `${role} ${i ? 'dark' : 'light'}`).toBe(5)
      }
  })

  it('has no @scope left (Safari < 17.4 would drop every token) and loads no web fonts', () => {
    expect(css).not.toMatch(/@scope\s*\(/)
    expect(css).not.toMatch(/@font-face|@import|url\(/)
  })

  it('headwords ask for a textbook hand first and fall back to the device’s mincho, then any serif', () => {
    const stack = /--ruma-font-ja-head:\s*([^;]+);/.exec(css)?.[1] ?? ''
    const names = stack.split(',').map((x) => x.trim().replace(/['"]/g, ''))
    expect(names.slice(0, 2)).toEqual(['YuKyokasho Yoko', 'YuKyokasho'])
    expect(names).toContain('Klee')
    expect(names.indexOf('Hiragino Mincho ProN')).toBeGreaterThan(names.indexOf('Klee'))
    expect(names.at(-1)).toBe('serif')
  })
})
