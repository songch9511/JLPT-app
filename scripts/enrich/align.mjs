// Splits an on-read word's kana reading into one segment per kanji, using KANJIDIC2 on-readings
// (with rendaku and っ variants). Used by build-data.mjs --extras for the `a` column, which the app's
// sound-correspondence hint reads (src/sound.ts). Only an unambiguous split is returned: a word whose
// reading can be cut in two ways, or not at all, gets null and shows no hint.
import { isHan } from './forms.mjs'

const toHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
const VOICE = { か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ',
  た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど', は: 'ばぱ', ひ: 'びぴ', ふ: 'ぶぷ', へ: 'べぺ', ほ: 'ぼぽ' }

function onReadings(ch, table, last) {
  const e = table.get(ch)
  if (!e) return []
  const out = new Set()
  for (const r0 of e.on) {
    const r = toHira(r0.replace(/-/g, ''))
    const forms = [r, ...[...(VOICE[r[0]] ?? '')].map((v) => v + r.slice(1))]
    for (const f of forms) {
      out.add(f)
      // 学校 がっこう: a final く/き/つ/ち becomes っ before the next kanji
      if (!last && /[くきつち]$/.test(f) && f.length > 1) out.add(f.slice(0, -1) + 'っ')
    }
  }
  return [...out]
}

/**
 * `core`: the written form (kanji only — a word with kana in it is skipped), `reading`: its kana reading.
 * Returns the reading cut into one segment per kanji, or null when there is not exactly one way to do it.
 */
export function alignOn(core, reading, table) {
  const chars = [...core]
  if (!chars.length || !chars.every((c) => isHan(c) && c !== '々')) return null
  const rd = toHira(reading)
  const found = []
  const go = (i, pos, segs) => {
    if (found.length > 1) return
    if (i === chars.length) {
      if (pos === rd.length) found.push(segs)
      return
    }
    for (const r of onReadings(chars[i], table, i === chars.length - 1)) if (rd.startsWith(r, pos)) go(i + 1, pos + r.length, [...segs, r])
  }
  go(0, 0, [])
  return found.length === 1 ? found[0] : null
}
