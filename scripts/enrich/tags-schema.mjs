// Word-type tag schema (see data/tags/LABELLING.md and docs/plan/08-word-data.md).
// One labelled file per chunk: data/tags/n<level>-<part>.json = { "<idx>": { k, sk?, ff?, rt? }, ... }

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
