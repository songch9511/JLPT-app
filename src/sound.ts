// Korean–Japanese hanja sound correspondences (02 F4): a Korean final consonant and the ending of the
// Japanese on'yomi of the same character, e.g. 館 관 → かん (ㄴ 받침 → ん). Only shown where it is known to hold:
// the word is read entirely on'yomi, its reading splits one way per kanji (the data's `a` column, from
// KANJIDIC2), and the split segment ends as the rule says. Characters the rules do not cover are skipped
// rather than shown as exceptions.
import type { Word } from './data'

/** Korean final consonant (jongseong index) → the Japanese endings it corresponds to, and the rule's name. */
export const SOUND_RULES: Record<number, { ends: string[]; label: string }> = {
  4: { ends: ['ん'], label: 'ㄴ 받침 → ん' },
  16: { ends: ['ん'], label: 'ㅁ 받침 → ん' },
  21: { ends: ['う', 'い'], label: 'ㅇ 받침 → う·い' },
  1: { ends: ['く', 'き'], label: 'ㄱ 받침 → く·き' },
  8: { ends: ['つ', 'ち'], label: 'ㄹ 받침 → つ·ち' },
  17: { ends: ['う'], label: 'ㅂ 받침 → う' },
}

export interface SoundHint {
  kanji: string
  ko: string
  ja: string
  rule: string
}

const isHan = (c: string) => /\p{Script=Han}/u.test(c)
const finalOf = (syllable: string) => {
  const c = syllable.charCodeAt(0) - 0xac00
  return c >= 0 && c < 11172 ? c % 28 : -1
}

/** Correspondence hints for a word, one per kanji the rules cover (empty when none can be shown safely). */
export function soundHints(w: Pick<Word, 'w' | 'sk' | 'rt' | 'a'>): SoundHint[] {
  if (w.rt !== 'on' || !w.sk || !w.a) return []
  const kanji = [...w.w].filter(isHan)
  const segs = w.a.split('|')
  const ko = [...w.sk]
  // the written form must be one kanji per segment and per Korean syllable (alternative spellings are skipped)
  if (kanji.length !== segs.length || ko.length !== segs.length || /[;；、,]/.test(w.w)) return []
  const out: SoundHint[] = []
  segs.forEach((ja, i) => {
    const rule = SOUND_RULES[finalOf(ko[i])]
    if (rule && ja.length >= 2 && rule.ends.includes(ja[ja.length - 1])) out.push({ kanji: kanji[i], ko: ko[i], ja, rule: rule.label })
  })
  return out
}
