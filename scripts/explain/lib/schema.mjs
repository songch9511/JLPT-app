// The explanation schema (one object per word) and its length limits.
// Structured outputs guarantee the shape (types, required fields, enums). They do not support string length
// or array size constraints, so those are stated in the field descriptions for the model and enforced by
// validate.mjs. Lengths are counted in characters (Unicode code points).

/** Japanese example sentence length, by level: shorter at N5 so the sentence stays readable. */
export const JA_MAX = { n5: 24, n4: 28, n3: 32, n2: 40, n1: 40 }

export const LIMITS = Object.freeze({
  examples: 2, // exactly
  kanaMax: (level) => JA_MAX[level] * 2 + 10,
  exampleKo: 50,
  kanjiEntries: 6,
  kanjiReading: 8,
  kanjiHanja: 12,
  tip: 80,
  trap: 80,
  relatedMin: 2,
  relatedMax: 3,
  relatedWord: 15,
  relatedKana: 20,
  relatedKo: 20,
  origin: 30,
  meaningFlag: 40,
})

const str = (description) => ({ type: 'string', description })

export const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['examples', 'kanji', 'tip', 'trap', 'related', 'origin', 'meaningFlag'],
  properties: {
    examples: {
      type: 'array',
      description: 'Exactly 2 example sentences that each contain the headword.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ja', 'kana', 'ko'],
        properties: {
          ja: str('Japanese sentence containing the headword as written (conjugated if needed). Length limit depends on level: N5 24, N4 28, N3 32, N2/N1 40 characters.'),
          kana: str('Reading of the whole sentence in hiragana (katakana words may stay katakana), same punctuation, no kanji, no romaji.'),
          ko: str('Natural Korean translation, at most 50 characters.'),
        },
      },
    },
    kanji: {
      type: 'array',
      description: 'One entry per distinct kanji in the headword, in order, at most 6. Empty array if the headword has no kanji.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['char', 'reading', 'kind', 'hanja'],
        properties: {
          char: str('One kanji character from the headword.'),
          reading: str('Reading of this character in THIS word, in hiragana (at most 8). Empty string if the word is read as a whole (jukujikun) and the character has no separable reading.'),
          kind: { type: 'string', enum: ['on', 'kun', 'whole'], description: 'on = on-yomi, kun = kun-yomi, whole = part of a whole-word reading.' },
          hanja: str('Korean hanja meaning and sound (훈음), e.g. "배울 학", at most 12 characters. Empty string only if the character has no Korean reading.'),
        },
      },
    },
    tip: str('Memory tip for a Korean speaker, in Korean, at most 80 characters. Kana or kanji may appear; no romaji.'),
    trap: str('Only for false friends: the meaning trap versus the Korean word with the same hanja, in Korean, at most 80 characters. Empty string otherwise.'),
    related: {
      type: 'array',
      description: '2 or 3 related words (synonym, antonym, shared kanji, or commonly confused).',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['word', 'kana', 'ko', 'rel'],
        properties: {
          word: str('The related word as usually written (at most 15). Never the headword itself or a spelling variant of it.'),
          kana: str('Its reading in hiragana or katakana (at most 20).'),
          ko: str('Its Korean meaning (at most 20).'),
          rel: { type: 'string', enum: ['syn', 'ant', 'kanji', 'confusable'] },
        },
      },
    },
    origin: str('Only for katakana loanwords: the source word and language, e.g. "pool (영어)", at most 30 characters. Empty string otherwise. This is the only field where Latin letters are allowed.'),
    meaningFlag: str('Empty string if the given Korean meaning fits the word. Otherwise a corrected short Korean meaning (at most 40 characters). For the editors, not shown to learners.'),
  },
}
