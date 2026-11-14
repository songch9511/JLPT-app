// Word-type tag schema (see data/tags/LABELLING.md and docs/plan/08-word-data.md).
// One labelled file per chunk: data/tags/n<level>-<part>.json = { "<word id>": { k, sk?, ff?, rt? }, ... }
// (stable word ids, docs/plan/08 §7)

/** k — word type relative to Korean. Decide S/F first (relation to an everyday Korean hanja word), then origin. */
export const K = {
  S: '동형동의 한자어 — 같은 한자 단어를 한국어에서 일상적으로 쓰고 핵심 뜻이 같음 (産業=산업)',
  F: '거짓 친구 — 같은 한자 단어가 한국어에 있으나 뜻·쓰임이 달라 한국인이 틀리게 짐작함 (工夫≠공부)',
  J: '일본 한자어 — 음독 한자어인데 한국어에서 일상적으로 쓰지 않음(없음·드묾·고어) (挨拶, 弁当)',
  N: '고유어(和語) — 훈독 한자 표기 고유어, 오쿠리가나 동사·형용사 포함 (手紙, 食べる, 青い)',
  M: '혼종·기타 — 음훈 섞인 읽기(本屋), 숙자훈·아테지(今日, 素敵), 한자+가타카나(消しゴム)',
  L: '외래어 — 가타카나 외래어 (자동 판정)',
  K: '가나 표기어 — 한자 없이 가나로만 쓰인 고유어·문법어·감탄사 (자동 판정)',
}
/** rt — how the Japanese reading relates to the kanji (only for words written with kanji). */
export const RT = {
  on: '모든 한자를 음독 (さんぎょう) — 한·일 한자음 대응 힌트를 쓸 수 있음',
  kun: '모든 한자를 훈독 (てがみ, たべる)',
  mix: '음독과 훈독이 섞임 (ほんや, だいどころ, まいあさ)',
  irr: '단어 단위로 붙은 읽기: 숙자훈·아테지 (きょう, おとな, すてき)',
}
export const K_VALUES = Object.keys(K)
export const RT_VALUES = Object.keys(RT)
/** sk (Korean hanja reading): required / optional / forbidden per k. */
export const SK_RULE = { S: 'req', F: 'req', J: 'req', N: 'opt', M: 'opt', L: 'no', K: 'no' }
export const FF_MAX = 60

export const HANGUL_ONLY = /^[가-힣]+$/u // complete syllables only, no spaces
export const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー々]/u

/**
 * App semantics (docs/plan/03 §2.4): ask the READING instead of the meaning iff k === 'S'.
 * The F4 hanja-sound hint applies iff rt === 'on' and sk is present.
 */
export const asksReadingOnly = (t) => t?.k === 'S'

// ── consistency rules (data/tags/LABELLING.md §2.1, docs/plan/08 §3.4) ──
// Only what can be checked mechanically lives here; validate-tags.mjs reports a breach as an ERROR.
// Not checked (needs a Korean speaker): R2, R6, R7, R8, and R6's supplement — a bridge word (sk) that Korean
// readers take first for a more common homophone with other hanja (점점 漸漸, 향수 香水, 공원 公園, 수학 數學) is
// J, not S, because the reading card shows the bridge in Hangul only. A decision taken on such a word belongs
// in FIXED below when it must not drift.

/**
 * R1: one on-read kanji + する/じる/ずる/す. S exactly when Korean has the same-hanja '-하다' verb in everyday
 * use with the same core meaning (통하다, 응하다…); otherwise J (感じる: '감하다' is another word).
 */
export const HADA_VERBS = new Set([...'罰通対達命論関応接属面禁要害準反称'])

/** R3: numeral + 日/人/歳 day, person and age counts read the same in Korean (三日 = 3일, 二人 = 2인) → S. */
export const COUNT_WORD = /^[一二三四五六七八九十]+(日|人|歳)$/u

/**
 * Decisions taken once for words labellers disagreed on, keyed `core|reading` (reading as in the data).
 * The value is the required k (and sk when given). Covers calendar words (R3), kinship terms (R4) and words
 * Korean writes with another character (R5).
 */
export const FIXED = {
  // R3 calendar: S when the Korean Sino word is in current use (금일·명일·금주·내주·금월·내월·금년·내년)
  '今日|きょう': ['S', '금일'], '明日|あした': ['S', '명일'], '明日|あす': ['S', '명일'], '今週|こんしゅう': ['S', '금주'],
  '来週|らいしゅう': ['S', '내주'], '今月|こんげつ': ['S', '금월'], '来月|らいげつ': ['S', '내월'], '今年|ことし': ['S', '금년'],
  '来年|らいねん': ['S', '내년'], '一月|ひとつき': ['F', '일월'],
  // …J/M when it is not (선월·선주·거년·작일·금만·금야·금회·선일 are not current Korean words)
  '先月|せんげつ': ['J'], '先週|せんしゅう': ['J'], '去年|きょねん': ['J'], '今晩|こんばん': ['J'], '今夜|こんや': ['J'],
  '今回|こんかい': ['J'], '先日|せんじつ': ['J'], '昨日|きのう': ['M'], '今朝|けさ': ['M'], '昨夜|ゆうべ': ['M'],
  // R4 kinship: the Sino term decides; お～/～さん do not change the type…
  '祖父|そふ': ['S', '조부'], '祖母|そぼ': ['S', '조모'], '伯父|おじ': ['S', '백부'], '叔父|おじ': ['S', '숙부'],
  '伯母|おば': ['S', '백모'], '叔母|おば': ['S', '숙모'],
  // …except おじさん/おばさん, whose first sense is '아저씨/아주머니' whatever the kanji (小父さん): M like N5 w09f/w0dr
  // (native review of the tag audit, docs/plan/12)
  '伯父さん|おじさん': ['M'], '叔父さん|おじさん': ['M'],
  'お兄さん|おにいさん': ['S', '형'], 'お姉さん|おねえさん': ['M'], '両親|りょうしん': ['S', '양친'], '親父|おやじ': ['M'],
  // R5 Korean writes another character: S only if reading the Japanese characters gives the Korean word
  '総合|そうごう': ['J', '총합'], '膨張|ぼうちょう': ['J', '팽장'], '衣装|いしょう': ['J', '의장'], '探検|たんけん': ['J', '탐검'],
  '適確|てきかく': ['S', '적확'], '的確|てきかく': ['S', '적확'], '交差点|こうさてん': ['S', '교차점'], '障害|しょうがい': ['S', '장해'],
  '数字|すうじ': ['S', '숫자'], '回数|かいすう': ['S', '횟수'],
  // 激 reads 격, but Korean writes 刺戟 자극 and the meaning is the same: S 자극 (tag audit, docs/plan/12)
  '刺激|しげき': ['S', '자극'],
}

/** Same headword (core + reading + affix position) labelled differently on purpose. None so far. */
export const SAME_WORD_EXCEPTIONS = new Set([])

/**
 * R9 ff wording: 한국어 '<Korean word>'(<its sense>)와/과 달리 [주로] '<Japanese sense>'(이)라는 뜻.
 * The quoted Korean word must contain sk (the word the learner would think of).
 */
export const FF_FORMAT = /^한국어 '([^']+)'\(([^)]+)\)(와|과) 달리 (주로 )?'([^']+)'(이라는|라는) 뜻$/u
