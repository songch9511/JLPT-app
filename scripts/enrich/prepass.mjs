// Deterministic tag pre-pass: everything that needs no judgement, plus candidates for labellers.
//   node scripts/enrich/prepass.mjs        -> data/tags/prepass/n{l}.json
// Per idx: { core, hk, auto, sk, rt, hint }
//   core  the written form the tags are about (first form, no ～ / annotations)
//   hk    1 if core contains kanji
//   auto  'L' (katakana only) | 'K' (kana only, not katakana-only) | '' — final unless a labeller overrides
//   sk    Korean hanja-reading candidates for the kanji in core, best first ([] if a kanji has none)
//   rt    reading-type candidate 'on'|'kun'|'mix'|'irr' from aligning the reading to KANJIDIC on/kun ('' if no kanji)
//   hint  suggested k for labellers (never final): S if an sk candidate starts a Hangul word in the Korean
//         meaning and rt=on; else J for rt=on, N for kun, M for mix/irr or kanji+katakana
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { levelWords, root, LEVELS } from './words.mjs'
import { isHan, isKata, isKanaOnly, isKatakanaOnly } from './forms.mjs'

const toHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))

export function loadKanjiTable() {
  const t = new Map()
  for (const line of readFileSync(`${root}data/hanja/kanji.tsv`, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue
    const [ch, ku, kk, on, kun] = line.split('\t')
    const sp = (s) => (s ? s.split(' ').filter(Boolean) : [])
    t.set(ch, { ko: [...sp(ku), ...sp(kk)], on: sp(on), kun: sp(kun) })
  }
  return t
}

// ---------- Korean reading candidates ----------
const S0 = 0xac00
const jamo = (syl) => {
  const c = syl.charCodeAt(0) - S0
  return { l: Math.floor(c / 588), v: Math.floor((c % 588) / 28), t: c % 28 }
}
const syl = ({ l, v, t }) => String.fromCharCode(S0 + l * 588 + v * 28 + t)
const L_R = 5, L_N = 2, L_ZERO = 11 // ㄹ ㄴ ㅇ (initial)
const Y_VOWELS = new Set([2, 6, 7, 12, 17, 20]) // ㅑ ㅕ ㅖ ㅛ ㅠ ㅣ

/** 두음법칙 on the first syllable: 료리→요리, 려행→여행, 로인→노인, 녀자→여자. */
export function initialRule(s) {
  if (!s) return s
  const j = jamo(s[0])
  if (j.l === L_R) j.l = Y_VOWELS.has(j.v) ? L_ZERO : L_N
  else if (j.l === L_N && Y_VOWELS.has(j.v)) j.l = L_ZERO
  return syl(j) + s.slice(1)
}
/** 렬·률 after a vowel or ㄴ become 열·율 (비율, 규율, 선열). */
function yeolRule(s) {
  const a = [...s]
  for (let i = 1; i < a.length; i++) {
    const j = jamo(a[i]), p = jamo(a[i - 1])
    if (j.l === L_R && j.t === 8 && (j.v === 6 || j.v === 17) && (p.t === 0 || p.t === 4)) {
      j.l = L_ZERO
      a[i] = syl(j)
    }
  }
  return a.join('')
}

export function skCandidates(core, table, { max = 8, suffix = false } = {}) {
  const hans = [...core].filter(isHan)
  if (!hans.length) return []
  const per = []
  for (const ch of hans) {
    const r = ch === '々' ? per[per.length - 1] : table.get(ch)?.ko
    if (!r || !r.length) return []
    per.push(r)
  }
  let combos = ['']
  for (const r of per) combos = combos.flatMap((c) => r.slice(0, 3).map((x) => c + x)).slice(0, 64)
  return [...new Set(combos.map((c) => yeolRule(suffix ? c : initialRule(c))))].slice(0, max)
}

// ---------- reading-type alignment ----------
const VOICE = { か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ',
  た: 'だ', ち: 'ぢじ', つ: 'づず', て: 'で', と: 'ど', は: 'ばぱ', ひ: 'びぴ', ふ: 'ぶぷ', へ: 'べぺ', ほ: 'ぼぽ' }

function variants(r, final) {
  const out = new Set([r])
  for (const v of VOICE[r[0]] ?? '') out.add(v + r.slice(1))
  if (!final) for (const x of [...out]) if (/[つちくき]$/.test(x) && x.length > 1) out.add(x.slice(0, -1) + 'っ')
  return [...out]
}

function unitReadings(ch, prev, table, final) {
  const e = table.get(ch === '々' ? prev : ch)
  if (!e) return []
  const on = e.on.map((r) => toHira(r.replace(/-/g, '')))
  const kun = new Set()
  for (const r of e.kun) {
    const k = r.replace(/-/g, '')
    kun.add(k.split('.')[0])
    kun.add(k.replace('.', ''))
  }
  return [
    ...on.flatMap((r) => variants(r, final).map((v) => [v, 'on'])),
    ...[...kun].filter(Boolean).flatMap((r) => variants(r, final).map((v) => [v, 'kun'])),
  ]
}

/** 'on' | 'kun' | 'mix' | 'irr' for a written form and its kana reading. */
export function readingType(core, reading, table) {
  const chars = [...core]
  if (!chars.some(isHan)) return ''
  const rd = toHira(reading)
  const results = new Set()
  const go = (i, pos, kinds, prevHan) => {
    if (results.size > 20) return
    if (i === chars.length) {
      if (pos === rd.length) results.add(kinds.size === 1 ? [...kinds][0] : 'mix')
      return
    }
    const ch = chars[i]
    if (!isHan(ch)) {
      const k = toHira(ch)
      if (rd.startsWith(k, pos)) go(i + 1, pos + k.length, kinds, prevHan)
      return
    }
    const final = i === chars.length - 1
    for (const [r, kind] of unitReadings(ch, prevHan, table, final))
      if (r && rd.startsWith(r, pos)) go(i + 1, pos + r.length, new Set([...kinds, kind]), ch === '々' ? prevHan : ch)
  }
  go(0, 0, new Set(), null)
  for (const pref of ['on', 'kun', 'mix']) if (results.has(pref)) return pref
  return 'irr'
}

// ---------- hint ----------
export function hintFor({ core, hk, auto, sk, rt, ko }) {
  if (auto) return auto
  if (!hk) return ''
  if ([...core].some((c) => isKata(c) && c !== 'ー')) return 'M'
  // a candidate that IS one of the Korean meanings (薬 -> "약"), or starts a Hangul word of a
  // multi-kanji on-read word (産業 -> "산업 ..."); one-syllable prefixes (庭 정 in 정원) do not count
  const items = ko.split(/[,;()·/]/).map((x) => x.replace(/[~～\s]/g, ''))
  if (sk.some((c) => items.includes(c))) return 'S'
  const inKo = sk.some((c) => c.length > 1 && new RegExp(`(^|[^\\uac00-\\ud7a3])${c}`).test(ko))
  if (inKo && rt !== 'kun') return 'S'
  if (rt === 'on') return 'J'
  if (rt === 'kun') return 'N'
  return 'M'
}

export function prepassLevel(n, table = loadKanjiTable()) {
  const out = {}
  for (const w of levelWords(n)) {
    const core = w.core
    const hk = [...core].some(isHan) ? 1 : 0
    const auto = hk ? '' : isKatakanaOnly(core) ? 'L' : isKanaOnly(core) ? 'K' : 'K'
    const sk = hk ? skCandidates(core, table, { suffix: w.affix === 'suf' }) : []
    const rt = hk ? readingType(core, w.coreReading, table) : ''
    out[w.idx] = { core, hk, auto, sk, rt, hint: hintFor({ core, hk, auto, sk, rt, ko: w.ko }) }
  }
  return out
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const table = loadKanjiTable()
  mkdirSync(`${root}data/tags/prepass`, { recursive: true })
  for (const n of LEVELS) {
    const p = prepassLevel(n, table)
    const v = Object.values(p)
    const c = (f) => v.filter(f).length
    writeFileSync(`${root}data/tags/prepass/n${n}.json`,
      '{\n' + Object.entries(p).map(([k, x]) => `${JSON.stringify(k)}:${JSON.stringify(x)}`).join(',\n') + '\n}\n')
    console.log(`N${n}: ${v.length} words, kanji ${c((x) => x.hk)}, L ${c((x) => x.auto === 'L')}, K ${c((x) => x.auto === 'K')}, ` +
      `sk candidate ${c((x) => x.sk.length)}, rt on/kun/mix/irr ${['on', 'kun', 'mix', 'irr'].map((r) => c((x) => x.rt === r)).join('/')}, ` +
      `hint S/J/N/M ${['S', 'J', 'N', 'M'].map((h) => c((x) => x.hint === h)).join('/')}`)
  }
}
