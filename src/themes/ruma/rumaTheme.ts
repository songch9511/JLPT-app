// The "ruma" Astryx theme: the single source of truth for the app's colours, type, spacing, shape, depth and motion.
// Colours are traditional Japanese colours (伝統色), kept low in saturation; dark mode is an ink (墨) ground.
// Every value is a [light, dark] pair where the modes differ. docs/design-system.md explains each token's job.
//
// Build after any change:  npm run theme   (astryx theme build → ruma.css / ruma.js, then the Safari 16.4 pass)
import { defineTheme } from '@astryxdesign/core/theme'
import { rumaIcons } from './icons'

/** The palette. Names are the traditional colours; values were checked for WCAG AA (docs/design-system.md §색). */
const c = {
  kinari: ['#fbfaf5', '#1b1a18'], // 生成り ground / 墨 ground
  gofun: ['#fffefb', '#252321'], // 胡粉 surface
  shironeri: ['#f1ede3', '#32302c'], // 白練 muted surface
  kaihaku: ['#e3ded2', '#403c36'], // 灰白 hairline
  inputLine: ['#938f86', '#716c63'], // 灰白 deepened toward 利休鼠: input edges and the off switch, 3:1 on the grounds
  sumi: ['#2d2a26', '#ece7db'], // 墨 text
  rikyu: ['#6b665d', '#a39d90'], // 利休鼠 secondary text
  ai: ['#165e83', '#86aecf'], // 藍 accent
  // 藍 as a surface: the primary button's face. In light it is the 藍 ink itself; in dark a deeper 藍 (the bright ink as
  // a face was the brightest slab on the screen), with 生成り-white text on it (6.1:1)
  aiFace: ['#165e83', '#2b5878'],
  onAiFace: ['#ffffff', '#ece7db'],
  kon: ['#0f3f5c', '#173a54'], // 紺 the primary button's pressed edge
  shiraai: ['#e1ecf1', '#24323f'], // 白藍 accent tint
  onAi: ['#ffffff', '#10171d'],
  rokusho: ['#47885e', '#7fb996'], // 緑青 success / long-term memory
  tokiwa: ['#2f6b48', '#7fb996'], // 常磐 success text
  byakuroku: ['#e3eee3', '#22332a'], // 白緑 success tint
  shu: ['#c4553b', '#e08c74'], // 朱 wrong / forgot / warning
  bengara: ['#9c3b26', '#e08c74'], // 弁柄 vermilion text
  sakura: ['#f6e4dc', '#40271f'], // 桜 vermilion tint
  asagi: ['#4d9aa6', '#6fb3bd'], // 浅葱 "다지는 중" (young)
  yamabukicha: ['#c89932', '#d9b45a'], // 山吹茶 "익히는 중" (learning), XP
  odo: ['#866415', '#d9b45a'], // 黄土 gold text and icons (3% darker than before: 4.6:1 on 鳥の子)
  torinoko: ['#f6ecd0', '#2e2718'], // 鳥の子 gold tint
  kaki: ['#c9662f', '#e08a55'], // 柿 the streak flame (deepened from #d9743f: 3.3:1 on every Home sky, 3.8 on 生成り)
  kakiSoft: ['#f8e4d5', '#40291b'],
  // Home's sky (docs/design-system.md §3 "홈"): pale grounds that follow Ruma's state, and their seigaiha line
  shiraaiSky: ['#e8eef2', '#1a222a'], // 白藍 dawn (asleep) / night
  torinokoSky: ['#f7eedb', '#29241a'], // 鳥の子 sunrise (one eye) / lamplight
  byakurokuSky: ['#e8f0e6', '#1c2a22'], // 白緑 day (both eyes) / forest
  shironeriSky: ['#f2eee5', '#24221f'], // 白練 a day off, the first run / quiet night
  shiraaiWave: ['#d5e1e8', '#243140'],
  torinokoWave: ['#ecdcb6', '#3a3223'],
  byakurokuWave: ['#d1e3cd', '#29402f'],
  shironeriWave: ['#e5dfd1', '#312e29'],
  skyInk: ['#5f5a52', '#a39d90'], // 利休鼠 one step deeper: secondary text on the sky, 5.8:1 on every sky
  fuji: ['#8f7fb0', '#b3a6d1'], // 藤 (not used by the app; keeps Astryx's purple role on-palette)
  ink: ['#2d2a26', '#000000'],
} as const

type Pair = readonly [string, string]
const pair = (p: Pair): [string, string] => [p[0], p[1]]
const alpha = (hex: string, a: string) => `${hex}${a}`

export const rumaTheme = defineTheme({
  name: 'ruma',
  typography: {
    // Rounded Latin digits where the platform has them (SF Pro Rounded); Korean falls to SD Gothic Neo / Pretendard
    body: {
      family: 'ui-rounded',
      fallbacks:
        "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', -apple-system, BlinkMacSystemFont, 'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', system-ui, sans-serif",
    },
    heading: {
      family: 'ui-rounded',
      fallbacks:
        "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', -apple-system, BlinkMacSystemFont, 'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', system-ui, sans-serif",
    },
    code: { family: 'ui-monospace', fallbacks: "'SF Mono', Menlo, Consolas, monospace" },
  },
  // 120 / 200 / 400 ms on one calm curve: things move when their state changes, nothing springs
  motion: { fast: 120, medium: 200, slow: 400, ratio: 0.75, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  tokens: {
    // ── surfaces ──
    '--color-background-body': pair(c.kinari),
    '--color-background-surface': pair(c.gofun),
    '--color-background-card': pair(c.gofun),
    '--color-background-popover': pair(c.gofun),
    '--color-background-muted': pair(c.shironeri),
    '--color-background-inverted': [c.sumi[0], c.sumi[1]],
    '--color-background-error-inverted': [c.bengara[0], c.shu[1]],
    '--color-overlay': ['#1e1a1480', '#0000008c'],
    '--color-overlay-hover': [alpha(c.ink[0], '0a'), '#ffffff0d'],
    '--color-overlay-pressed': [alpha(c.ink[0], '14'), '#ffffff1a'],
    '--color-neutral': [alpha(c.ink[0], '0f'), '#ffffff14'],
    '--color-skeleton': pair(c.shironeri),
    '--color-track': pair(c.shironeri),
    '--color-shadow': [alpha(c.ink[0], '1f'), '#00000066'],
    '--color-tint-hover': pair(c.sumi),
    // ── lines ──
    '--color-border': pair(c.kaihaku),
    '--color-border-emphasized': pair(c.inputLine),
    // ── text and icons ──
    '--color-text-primary': pair(c.sumi),
    '--color-text-secondary': pair(c.rikyu),
    '--color-text-disabled': pair(c.inputLine),
    '--color-text-accent': pair(c.ai),
    '--color-on-dark': '#ffffff',
    '--color-on-light': c.ink[0],
    '--color-icon-primary': pair(c.sumi),
    '--color-icon-secondary': pair(c.rikyu),
    '--color-icon-disabled': pair(c.inputLine),
    '--color-icon-accent': pair(c.ai),
    // ── accent: 藍, one per group of buttons ──
    '--color-accent': pair(c.ai),
    '--color-accent-muted': pair(c.shiraai),
    '--color-on-accent': pair(c.onAi),
    // ── status ──
    '--color-info': pair(c.ai),
    '--color-info-muted': pair(c.shiraai),
    '--color-on-info': pair(c.onAi),
    '--color-text-info': pair(c.ai),
    '--color-icon-info': pair(c.ai),
    '--color-border-info': pair(c.ai),
    '--color-on-info-muted': [c.kon[0], c.ai[1]],
    '--color-success': pair(c.rokusho),
    '--color-success-muted': pair(c.byakuroku),
    '--color-on-success': ['#ffffff', '#10171d'],
    '--color-text-success': pair(c.tokiwa),
    '--color-icon-success': pair(c.tokiwa),
    '--color-border-success': pair(c.rokusho),
    '--color-on-success-muted': pair(c.tokiwa),
    '--color-error': pair(c.shu),
    '--color-error-muted': pair(c.sakura),
    '--color-on-error': ['#ffffff', '#10171d'],
    '--color-text-error': pair(c.bengara),
    '--color-icon-error': pair(c.bengara),
    '--color-border-error': pair(c.shu),
    '--color-on-error-muted': pair(c.bengara),
    '--color-warning': pair(c.yamabukicha),
    '--color-warning-muted': pair(c.torinoko),
    '--color-on-warning': ['#2d2a26', '#10171d'],
    '--color-text-warning': pair(c.odo),
    '--color-icon-warning': pair(c.odo),
    '--color-border-warning': pair(c.yamabukicha),
    '--color-on-warning-muted': pair(c.odo),
    // ── hue roles (Badge/Token colours) mapped onto the same traditional colours ──
    '--color-background-blue': pair(c.shiraai),
    '--color-border-blue': pair(c.ai),
    '--color-icon-blue': pair(c.ai),
    '--color-text-blue': pair(c.ai),
    '--color-background-cyan': ['#e2f0f1', '#1f3235'],
    '--color-border-cyan': pair(c.asagi),
    '--color-icon-cyan': ['#2f6e78', c.asagi[1]],
    '--color-text-cyan': ['#2f6e78', c.asagi[1]],
    '--color-background-teal': ['#e2f0f1', '#1f3235'],
    '--color-border-teal': pair(c.asagi),
    '--color-icon-teal': ['#2f6e78', c.asagi[1]],
    '--color-text-teal': ['#2f6e78', c.asagi[1]],
    '--color-background-green': pair(c.byakuroku),
    '--color-border-green': pair(c.rokusho),
    '--color-icon-green': pair(c.tokiwa),
    '--color-text-green': pair(c.tokiwa),
    '--color-background-red': pair(c.sakura),
    '--color-border-red': pair(c.shu),
    '--color-icon-red': pair(c.bengara),
    '--color-text-red': pair(c.bengara),
    '--color-background-orange': pair(c.kakiSoft),
    '--color-border-orange': pair(c.kaki),
    '--color-icon-orange': ['#9a4a1f', c.kaki[1]],
    '--color-text-orange': ['#9a4a1f', c.kaki[1]],
    '--color-background-yellow': pair(c.torinoko),
    '--color-border-yellow': pair(c.yamabukicha),
    '--color-icon-yellow': pair(c.odo),
    '--color-text-yellow': pair(c.odo),
    '--color-background-gray': pair(c.shironeri),
    '--color-border-gray': pair(c.inputLine),
    '--color-icon-gray': pair(c.rikyu),
    '--color-text-gray': pair(c.rikyu),
    '--color-background-purple': ['#eeeaf4', '#2c2736'],
    '--color-border-purple': pair(c.fuji),
    '--color-icon-purple': ['#5f4f80', c.fuji[1]],
    '--color-text-purple': ['#5f4f80', c.fuji[1]],
    '--color-background-pink': pair(c.sakura),
    '--color-border-pink': pair(c.shu),
    '--color-icon-pink': pair(c.bengara),
    '--color-text-pink': pair(c.bengara),
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
    // ── spacing: Astryx's 4px steps are the app's (page sides 4, card inside 4, between cards 3, sections 6) ──
    // ── shape: three radii. 12 for controls (buttons, inputs, segments, choices), 24 for what you hold (the study card,
    // sheets, dialogs), full for pills (chips, the tab indicator, Home's start). `inner` and `container` are kept as
    // names Astryx's dialogs read, set to the same two values. ──
    '--radius-inner': '12px',
    '--radius-element': '12px',
    '--radius-container': '24px',
    '--radius-page': '24px',
    '--radius-chat': '24px',
    // ── control heights: every target at least 44px ──
    '--size-element-sm': '36px',
    '--size-element-md': '44px',
    '--size-element-lg': '52px',
    // ── depth: static surfaces are flat (1px line); only floating layers cast a shadow ──
    '--shadow-low': [`0 1px 2px ${alpha(c.ink[0], '14')}`, '0 1px 2px #00000059'],
    '--shadow-med': [`0 4px 16px ${alpha(c.ink[0], '1f')}`, '0 4px 16px #00000073'],
    '--shadow-high': [`0 8px 28px ${alpha(c.ink[0], '29')}`, '0 8px 28px #00000080'],
    // ── focus: the 3px 藍 ring the app has always had ──
    '--focus-outline-width': '3px',
    '--focus-outline-offset': '2px',
  },
  localTokens: {
    // memory stages (only on stage marks: bars, legend, counts)
    '--ruma-stage-mature': pair(c.rokusho),
    '--ruma-stage-young': pair(c.asagi),
    '--ruma-stage-learning': pair(c.yamabukicha),
    // game marks: gold only on XP/quest icons, persimmon only on the streak flame
    '--ruma-gold-icon': pair(c.odo),
    '--ruma-flame': pair(c.kaki),
    // Home's sky by Ruma's state (sleep = before studying today, wake = started, day = today's share done, rest = nothing
    // to do today / the first run) and the seigaiha drawn along its foot; secondary text on the sky; the week's seals
    '--ruma-sky-sleep': pair(c.shiraaiSky),
    '--ruma-sky-wake': pair(c.torinokoSky),
    '--ruma-sky-day': pair(c.byakurokuSky),
    '--ruma-sky-rest': pair(c.shironeriSky),
    '--ruma-wave-sleep': pair(c.shiraaiWave),
    '--ruma-wave-wake': pair(c.torinokoWave),
    '--ruma-wave-day': pair(c.byakurokuWave),
    '--ruma-wave-rest': pair(c.shironeriWave),
    '--ruma-sky-text-secondary': pair(c.skyInk),
    // a stamped seal (a studied day, a level whose words are all met): 弁柄 in light, the dark theme's 朱
    '--ruma-seal': [c.bengara[0], c.shu[1]],
    // the shallow edge under a pressable thing; 紺 under the primary
    '--ruma-depth': '3px',
    '--ruma-edge': pair(c.kaihaku),
    '--ruma-edge-accent': pair(c.kon),
    // the primary button's face and label (docs/design-system.md §2): 藍, a deeper 藍 in dark
    '--ruma-primary': pair(c.aiFace),
    '--ruma-on-primary': pair(c.onAiFace),
    // Japanese text: gothic for readings and choices, mincho for headwords
    '--ruma-font-ja': "'Hiragino Sans', 'Yu Gothic', 'Noto Sans JP', 'Noto Sans CJK JP', sans-serif",
    '--ruma-font-ja-serif': "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', 'Noto Serif CJK JP', serif",
  },
  icons: rumaIcons,
  // Only the Astryx components the app still uses are themed here: the buttons inside its dialogs (AlertDialog,
  // MessageDialog). The app's own controls (src/components/ui.tsx) are styled in styles.css from the same tokens.
  components: {
    // flat faces, one shallow edge that presses down (the press itself is in styles.css: theme targets have no :active)
    button: {
      // labels at the 16px body size, 700: buttons are read at a glance (14px for the small size)
      base: { fontSize: 'var(--font-size-lg)', fontWeight: '700', borderRadius: 'var(--radius-element)', boxShadow: '0 var(--ruma-depth) 0 var(--ruma-edge)' },
      'size:sm': { fontSize: 'var(--font-size-base)' },
      'variant:secondary': {
        backgroundColor: 'var(--color-background-surface)',
        boxShadow: '0 var(--ruma-depth) 0 var(--ruma-edge), inset 0 0 0 1px var(--color-border)',
      },
      'variant:primary': { backgroundColor: 'var(--ruma-primary)', color: 'var(--ruma-on-primary)', boxShadow: '0 var(--ruma-depth) 0 var(--ruma-edge-accent)' },
      'variant:ghost': { boxShadow: 'none', color: 'var(--color-icon-secondary)' },
      // destructive: a soft vermilion face (朱 on 桜), never the filled primary; still pressable
      'variant:destructive': {
        backgroundColor: 'var(--color-error-muted)',
        color: 'var(--color-text-error)',
        boxShadow: '0 var(--ruma-depth) 0 color-mix(in srgb, var(--color-error) 40%, var(--color-error-muted))',
      },
    },
  },
})
