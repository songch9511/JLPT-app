// The "ruma" Astryx theme: the single source of truth for the app's colours, type, spacing, shape, depth and motion.
// A warm cream ground, white surfaces with a hairline, ink for text and the one primary button, and three pastel
// accents (pink, green, yellow) used only in small places. Dark mode is a warm dark ground with the same roles.
// Every value is a [light, dark] pair where the modes differ. docs/design-system.md explains each token's job.
//
// Build after any change:  npm run theme   (astryx theme build → ruma.css / ruma.js, then the Safari 16.4 pass)
import { defineTheme } from '@astryxdesign/core/theme'
import { rumaIcons } from './icons'

/** The palette. Values were checked for WCAG AA (tests/unit/theme.test.ts, docs/design-system.md §2). */
const c = {
  ground: ['#faf8f5', '#1b1917'], // the page
  surface: ['#ffffff', '#25221f'], // cards, sheets, dialogs, the tab bar, secondary buttons
  muted: ['#f3efe7', '#36322c'], // beige: segmented track, quiet fills, the mascot circle at rest
  track: ['#efeae0', '#36322c'], // the empty part of a progress bar
  line: ['#e9e4d9', '#36322c'], // the hairline around a surface and between rows
  edge: ['#e3ded2', '#3d3832'], // the soft bottom edge of a secondary button
  inputLine: ['#938f86', '#7d776c'], // input edges and the off switch, 3:1 on the grounds
  ink: ['#2d2a26', '#f1ede5'], // text; the primary button's face
  inkEdge: ['#14120f', '#8f897e'], // the primary button's bottom edge
  onInk: ['#ffffff', '#1b1917'], // the primary button's label
  ink2: ['#6b665d', '#a39d92'], // secondary text
  // pastel accents: a fill (small marks), a tint (a ground for dark ink) and the ink that is readable on the tint
  pink: ['#f7c6d0', '#f7c6d0'],
  pinkTint: ['#fce8ed', '#3a2229'],
  pinkInk: ['#8f3550', '#f0b3c1'],
  green: ['#8fb573', '#8fb573'], // progress
  greenDeep: ['#5f8f45', '#7fae62'], // the on switch, long-term memory, the line around a chosen grade
  greenTint: ['#e8f1dc', '#26321c'],
  greenInk: ['#3f6426', '#b5d39b'],
  yellow: ['#edc94f', '#d9b84a'], // "익히는 중" (learning)
  yellowTint: ['#fbf1c9', '#332b12'],
  yellowInk: ['#735a0c', '#e6cf7a'],
  red: ['#c4553b', '#e08c74'], // wrong / forgot / destructive
  redInk: ['#9c3b26', '#f0a48e'],
  redTint: ['#fbe6e0', '#40271f'],
  teal: ['#4d9aa6', '#6fb3bd'], // "다지는 중" (young): a stage mark only
  tealInk: ['#2f6e78', '#6fb3bd'],
  flame: ['#c9662f', '#e0894f'], // the streak flame
  flameTint: ['#f8e4d5', '#40291b'],
  purple: ['#8f7fb0', '#b3a6d1'], // not used by the app; keeps Astryx's purple role on-palette
  black: ['#2d2a26', '#000000'],
  // memory stages, all in ink (bars and dots): long-term memory the ink itself, learning a grey ink, not yet the faintest
  stageLearn: ['#a8a196', '#8f897e'],
  stageNew: ['#dcd5c7', '#4a453e'],
  // one colour per JLPT level, with the same meaning wherever a level is named (picker, Home's chip, badges, the
  // level screen): a tint as the badge's ground, the ink readable on it (and on the ground and a card), and a fill for
  // the level's small bars. The level's name is always written: the colour never carries it alone.
  lv5Tint: ['#e8f1dc', '#2f3d24'], // N5 green
  lv5Ink: ['#3f6426', '#c6e0ae'],
  lv5Fill: ['#8fb573', '#7fae62'],
  lv5Wave: ['#d3e5c0', '#3a4c2c'], // the deeper wave of the level card
  lv4Tint: ['#fbf1c9', '#4a3f1c'], // N4 yellow
  lv4Ink: ['#6e5210', '#f3dc8a'],
  lv4Fill: ['#e2bc3c', '#c9a73a'],
  lv4Wave: ['#f3e2a0', '#5a4c20'], // the deeper wave of the level card
  lv3Tint: ['#fce8ed', '#4a2a34'], // N3 pink
  lv3Ink: ['#8f3550', '#f4c3d0'],
  lv3Fill: ['#e08aa0', '#c77d91'],
  lv3Wave: ['#f6cfda', '#5c3341'], // the deeper wave of the level card
  lv2Tint: ['#ebe6f7', '#3a3152'], // N2 violet
  lv2Ink: ['#56428f', '#d8cdf6'],
  lv2Fill: ['#9a87d1', '#8e7cc7'],
  lv2Wave: ['#d9cff0', '#473c63'], // the deeper wave of the level card
  lv1Tint: ['#e1edf6', '#233a4b'], // N1 sky
  lv1Ink: ['#2c5f85', '#bcdaf0'],
  lv1Fill: ['#7fb0d6', '#6aa0c9'],
  lv1Wave: ['#c9ddee', '#2c475c'], // the deeper wave of the level card
} as const

type Pair = readonly [string, string]
const pair = (p: Pair): [string, string] => [p[0], p[1]]
const alpha = (hex: string, a: string) => `${hex}${a}`

export const rumaTheme = defineTheme({
  name: 'ruma',
  typography: {
    // Noto Sans KR, bundled with the app (src/main.tsx, @fontsource: only the subsets a page uses are loaded); the
    // device's Korean gothic until it has loaded
    body: {
      family: 'Noto Sans KR',
      fallbacks: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Malgun Gothic', system-ui, sans-serif",
    },
    heading: {
      family: 'Noto Sans KR',
      fallbacks: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Malgun Gothic', system-ui, sans-serif",
    },
    code: { family: 'ui-monospace', fallbacks: "'SF Mono', Menlo, Consolas, monospace" },
  },
  // 120 / 200 / 400 ms on one calm curve: things move when their state changes, nothing springs
  motion: { fast: 120, medium: 200, slow: 400, ratio: 0.75, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  tokens: {
    // ── surfaces ──
    '--color-background-body': pair(c.ground),
    '--color-background-surface': pair(c.surface),
    '--color-background-card': pair(c.surface),
    '--color-background-popover': pair(c.surface),
    '--color-background-muted': pair(c.muted),
    '--color-background-inverted': pair(c.ink),
    '--color-background-error-inverted': [c.redInk[0], c.red[1]],
    '--color-overlay': ['#2d2a2673', '#0000008c'],
    '--color-overlay-hover': [alpha(c.black[0], '0a'), '#ffffff0d'],
    '--color-overlay-pressed': [alpha(c.black[0], '14'), '#ffffff1a'],
    '--color-neutral': pair(c.muted),
    '--color-skeleton': pair(c.muted),
    '--color-track': pair(c.track),
    '--color-shadow': [alpha(c.black[0], '1f'), '#00000066'],
    '--color-tint-hover': pair(c.ink),
    // ── lines ──
    '--color-border': pair(c.line),
    '--color-border-emphasized': pair(c.inputLine),
    // ── text and icons ──
    '--color-text-primary': pair(c.ink),
    '--color-text-secondary': pair(c.ink2),
    '--color-text-disabled': pair(c.inputLine),
    '--color-text-accent': pair(c.ink),
    '--color-on-dark': '#ffffff',
    '--color-on-light': c.black[0],
    '--color-icon-primary': pair(c.ink),
    '--color-icon-secondary': pair(c.ink2),
    '--color-icon-disabled': pair(c.inputLine),
    '--color-icon-accent': pair(c.ink),
    // ── accent: the ink itself (the focus ring, links, the one primary of a group); its quiet ground is the beige ──
    '--color-accent': pair(c.ink),
    '--color-accent-muted': pair(c.muted),
    '--color-on-accent': pair(c.onInk),
    // ── status ──
    '--color-info': pair(c.ink2),
    '--color-info-muted': pair(c.muted),
    '--color-on-info': pair(c.onInk),
    '--color-text-info': pair(c.ink),
    '--color-icon-info': pair(c.ink2),
    '--color-border-info': pair(c.inputLine),
    '--color-on-info-muted': pair(c.ink),
    '--color-success': pair(c.greenDeep),
    '--color-success-muted': pair(c.greenTint),
    '--color-on-success': ['#ffffff', '#1c1a17'],
    '--color-text-success': pair(c.greenInk),
    '--color-icon-success': pair(c.greenInk),
    '--color-border-success': pair(c.greenDeep),
    '--color-on-success-muted': pair(c.greenInk),
    '--color-error': pair(c.red),
    '--color-error-muted': pair(c.redTint),
    '--color-on-error': ['#ffffff', '#1c1a17'],
    '--color-text-error': pair(c.redInk),
    '--color-icon-error': pair(c.redInk),
    '--color-border-error': pair(c.red),
    '--color-on-error-muted': pair(c.redInk),
    '--color-warning': pair(c.yellow),
    '--color-warning-muted': pair(c.yellowTint),
    '--color-on-warning': ['#2d2a26', '#1c1a17'],
    '--color-text-warning': pair(c.yellowInk),
    '--color-icon-warning': pair(c.yellowInk),
    '--color-border-warning': pair(c.yellow),
    '--color-on-warning-muted': pair(c.yellowInk),
    // ── hue roles (Astryx Badge/Token colours) mapped onto the same palette ──
    '--color-background-blue': pair(c.muted),
    '--color-border-blue': pair(c.inputLine),
    '--color-icon-blue': pair(c.ink),
    '--color-text-blue': pair(c.ink),
    '--color-background-cyan': ['#e2f0f1', '#1f3235'],
    '--color-border-cyan': pair(c.teal),
    '--color-icon-cyan': pair(c.tealInk),
    '--color-text-cyan': pair(c.tealInk),
    '--color-background-teal': ['#e2f0f1', '#1f3235'],
    '--color-border-teal': pair(c.teal),
    '--color-icon-teal': pair(c.tealInk),
    '--color-text-teal': pair(c.tealInk),
    '--color-background-green': pair(c.greenTint),
    '--color-border-green': pair(c.greenDeep),
    '--color-icon-green': pair(c.greenInk),
    '--color-text-green': pair(c.greenInk),
    '--color-background-red': pair(c.redTint),
    '--color-border-red': pair(c.red),
    '--color-icon-red': pair(c.redInk),
    '--color-text-red': pair(c.redInk),
    '--color-background-orange': pair(c.flameTint),
    '--color-border-orange': pair(c.flame),
    '--color-icon-orange': ['#9a4a1f', c.flame[1]],
    '--color-text-orange': ['#9a4a1f', c.flame[1]],
    '--color-background-yellow': pair(c.yellowTint),
    '--color-border-yellow': pair(c.yellow),
    '--color-icon-yellow': pair(c.yellowInk),
    '--color-text-yellow': pair(c.yellowInk),
    '--color-background-gray': pair(c.muted),
    '--color-border-gray': pair(c.inputLine),
    '--color-icon-gray': pair(c.ink2),
    '--color-text-gray': pair(c.ink2),
    '--color-background-purple': ['#eeeaf4', '#2c2736'],
    '--color-border-purple': pair(c.purple),
    '--color-icon-purple': ['#5f4f80', c.purple[1]],
    '--color-text-purple': ['#5f4f80', c.purple[1]],
    '--color-background-pink': pair(c.pinkTint),
    '--color-border-pink': pair(c.pink),
    '--color-icon-pink': pair(c.pinkInk),
    '--color-text-pink': pair(c.pinkInk),
    // ── type scale (rem, 16px base; follows the reader's text size) ──
    // 12 caption · 14 small · 16 body · 20 title · 24 display · 32 hero
    '--font-size-xs': '0.6875rem',
    '--font-size-sm': '0.75rem',
    '--font-size-base': '0.875rem',
    '--font-size-lg': '1rem',
    '--font-size-xl': '1.25rem',
    '--font-size-2xl': '1.5rem',
    '--font-size-3xl': '2rem',
    '--font-size-4xl': '2.75rem',
    '--font-size-5xl': '3.5rem',
    // two weights carry the hierarchy: 500 by default, 700 for emphasis and numbers (400 for long help text)
    '--font-weight-normal': '400',
    '--font-weight-medium': '500',
    '--font-weight-semibold': '700',
    '--font-weight-bold': '700',
    '--text-body-size': 'var(--font-size-lg)',
    '--text-body-weight': 'var(--font-weight-medium)',
    '--text-body-leading': '1.5',
    '--text-label-size': 'var(--font-size-base)',
    '--text-label-weight': 'var(--font-weight-bold)',
    '--text-label-leading': '1.4',
    '--text-supporting-size': 'var(--font-size-base)',
    '--text-supporting-weight': 'var(--font-weight-medium)',
    '--text-supporting-leading': '1.5',
    '--text-large-size': 'var(--font-size-xl)',
    '--text-large-weight': 'var(--font-weight-bold)',
    '--text-large-leading': '1.3',
    '--text-heading-1-size': 'var(--font-size-2xl)',
    '--text-heading-1-weight': 'var(--font-weight-bold)',
    '--text-heading-1-leading': '1.3',
    '--text-heading-2-size': 'var(--font-size-xl)',
    '--text-heading-2-weight': 'var(--font-weight-bold)',
    '--text-heading-2-leading': '1.3',
    '--text-heading-3-size': 'var(--font-size-lg)',
    '--text-heading-3-weight': 'var(--font-weight-bold)',
    '--text-heading-3-leading': '1.4',
    '--text-display-1-size': 'var(--font-size-3xl)',
    '--text-display-1-weight': 'var(--font-weight-bold)',
    '--text-display-1-leading': '1.2',
    // ── spacing: Astryx's 4px steps are the app's (page sides 5, card inside 4, between cards 3, sections 6) ──
    // ── shape: 16 for controls (buttons, inputs, the segmented track), 12 inside them (a segment), 24 for what you
    // hold and the big buttons (the study card, sheets, dialogs, Home's two buttons), full for pills. A grouping card
    // is 20 (`--ruma-radius-card`). `inner` and `container` are the names Astryx's dialogs read. ──
    '--radius-inner': '12px',
    '--radius-element': '16px',
    '--radius-container': '24px',
    '--radius-page': '24px',
    '--radius-chat': '24px',
    // ── control heights: every target at least 44px ──
    '--size-element-sm': '36px',
    '--size-element-md': '44px',
    '--size-element-lg': '52px',
    // ── depth: surfaces are flat (1px hairline); only floating layers cast a shadow ──
    '--shadow-low': [`0 1px 4px ${alpha(c.black[0], '14')}`, '0 1px 4px #00000059'],
    '--shadow-med': [`0 4px 16px ${alpha(c.black[0], '1f')}`, '0 4px 16px #00000073'],
    '--shadow-high': [`0 8px 32px ${alpha(c.black[0], '29')}`, '0 8px 32px #00000080'],
    // ── focus: a 3px ink ring ──
    '--focus-outline-width': '3px',
    '--focus-outline-offset': '2px',
  },
  localTokens: {
    // the pastel accents: a fill for small marks, a tint as a ground, the ink readable on that tint
    '--ruma-pink': pair(c.pink),
    '--ruma-pink-tint': pair(c.pinkTint),
    '--ruma-pink-text': pair(c.pinkInk),
    '--ruma-green': pair(c.green),
    '--ruma-yellow': pair(c.yellow),
    '--ruma-yellow-tint': pair(c.yellowTint),
    // the five levels (c.lv*): tint, ink, fill
    ...Object.fromEntries(
      ([5, 4, 3, 2, 1] as const).flatMap((l) => [
        [`--ruma-level-${l}-tint`, pair(c[`lv${l}Tint`])],
        [`--ruma-level-${l}-ink`, pair(c[`lv${l}Ink`])],
        [`--ruma-level-${l}-fill`, pair(c[`lv${l}Fill`])],
        [`--ruma-level-${l}-wave`, pair(c[`lv${l}Wave`])],
      ]),
    ),
    // memory stages (only on stage marks: bars, legend, dots)
    '--ruma-stage-mature': pair(c.ink),
    '--ruma-stage-young': pair(c.stageLearn),
    '--ruma-stage-learning': pair(c.stageLearn),
    '--ruma-stage-new': pair(c.stageNew),
    // the 済 seal: a vermilion stamp
    '--ruma-seal': ['#c4553b', '#e08c74'],
    // game marks: gold only on the bookmark that is on, persimmon only on the streak flame
    '--ruma-gold-icon': pair(c.yellowInk),
    '--ruma-flame': pair(c.flame),
    // the edge under a pressable thing (4px; 3px under the 48px controls); the ink's own edge under the primary
    '--ruma-depth': '4px',
    '--ruma-depth-sm': '3px',
    '--ruma-edge': pair(c.edge),
    '--ruma-edge-line': [c.edge[0], c.line[1]],
    '--ruma-edge-accent': pair(c.inkEdge),
    // the primary button's face and label: ink with a white label; in dark the light ink with a dark label
    '--ruma-primary': pair(c.ink),
    '--ruma-on-primary': pair(c.onInk),
    '--ruma-radius-card': '20px',
    // a text button's height (icon buttons and chips stay at the 44px minimum)
    '--ruma-control': '48px',
    // Japanese text: Noto Sans JP for sentences and readings, Klee One (a textbook hand) for headwords; both bundled
    // with the app (src/main.tsx), the device's fonts until they have loaded
    '--ruma-font-ja': "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Noto Sans CJK JP', sans-serif",
    '--ruma-font-ja-head': "'Klee One', 'YuKyokasho Yoko', 'YuKyokasho', 'Klee', 'Hiragino Mincho ProN', 'Yu Mincho', serif",
  },
  icons: rumaIcons,
  // Only the Astryx components the app still uses are themed here: the buttons inside its dialogs (AlertDialog,
  // MessageDialog). The app's own controls (src/components/ui.tsx) are styled in styles.css from the same tokens.
  components: {
    // flat faces, one edge that presses down (the press itself is in styles.css: theme targets have no :active)
    button: {
      // labels at the 16px body size, 700: buttons are read at a glance (14px for the small size)
      base: { fontSize: 'var(--font-size-lg)', fontWeight: '700', borderRadius: 'var(--radius-element)', boxShadow: '0 var(--ruma-depth-sm) 0 var(--ruma-edge)' },
      'size:sm': { fontSize: 'var(--font-size-base)' },
      'variant:secondary': {
        backgroundColor: 'var(--color-background-surface)',
        boxShadow: '0 var(--ruma-depth-sm) 0 var(--ruma-edge), inset 0 0 0 1px var(--ruma-edge-line)',
      },
      'variant:primary': { backgroundColor: 'var(--ruma-primary)', color: 'var(--ruma-on-primary)', boxShadow: '0 var(--ruma-depth-sm) 0 var(--ruma-edge-accent)' },
      'variant:ghost': { boxShadow: 'none', color: 'var(--color-icon-secondary)' },
      // destructive: a soft red face with dark red ink, never the filled primary; flat
      'variant:destructive': { backgroundColor: 'var(--color-error-muted)', color: 'var(--color-text-error)', boxShadow: 'none' },
    },
  },
})
