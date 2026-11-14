import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SYSTEM } from '../lib/prompt.mjs'
import { crossCheck, validate } from '../lib/validate.mjs'
import { GOOD, mutate } from './fixtures/outputs.mjs'
import { fixtureWords } from './helpers.mjs'

const { byId } = fixtureWords()
const run = (id, out) => validate(out, byId.get(id))
const codes = (r) => r.errors.map((e) => e.code)
const wcodes = (r) => r.warnings.map((e) => e.code)
const fails = (id, fn, code) => {
  const r = run(id, mutate(id, fn))
  assert.ok(codes(r).includes(code), `${id}: expected error ${code}, got ${JSON.stringify(r.errors)}`)
}
const warns = (id, fn, code) => {
  const r = run(id, mutate(id, fn))
  assert.deepEqual(codes(r), [], `${id}: unexpected errors ${JSON.stringify(r.errors)}`)
  assert.ok(wcodes(r).includes(code), `${id}: expected warning ${code}, got ${JSON.stringify(r.warnings)}`)
}

test('every good fixture passes with no errors and no warnings', () => {
  for (const [id, out] of Object.entries(GOOD)) {
    const r = run(id, out)
    assert.deepEqual(r.errors, [], id)
    assert.deepEqual(r.warnings, [], id)
  }
})

test('the example inside the system prompt passes the validator', () => {
  const ex = JSON.parse(SYSTEM.split('Output: ')[1])
  assert.deepEqual(run('w005', ex).errors, [])
})

test('schema: missing field, extra field, wrong type, bad enum', () => {
  fails('w001', (o) => delete o.tip, 'schema')
  fails('w001', (o) => (o.extra = 1), 'schema')
  fails('w001', (o) => (o.examples = 'x'), 'schema')
  fails('w001', (o) => (o.related[0].rel = 'friend'), 'schema')
  fails('w001', (o) => (o.kanji[0].kind = 'nanori'), 'schema')
})

test('exactly two examples, and they differ', () => {
  fails('w001', (o) => o.examples.pop(), 'count')
  fails('w001', (o) => (o.examples[1] = { ...o.examples[0] }), 'duplicate')
})

test('headword must be in each example (conjugation allowed)', () => {
  fails('w001', (o) => (o.examples[0] = { ja: '花があります。', kana: 'はながあります。', ko: '꽃이 있어요.' }), 'headword-missing')
  // conjugated forms pass: 食べました, 行った, 勉強しました (good fixtures already cover them)
  assert.deepEqual(codes(run('w003', GOOD['w003'])), [])
  // headword written in kana instead of kanji: allowed but flagged for review
  warns('w001', (o) => (o.examples[0] = { ja: 'にわに花があります。', kana: 'にわにはながあります。', ko: '정원에 꽃이 있어요.' }), 'headword-as-kana')
})

test('kana reading: no kanji/latin, aligned with the sentence, contains the headword reading', () => {
  fails('w001', (o) => (o.examples[0].kana = '庭にはながあります。'), 'kana-has-kanji')
  fails('w001', (o) => (o.examples[0].kana = 'にわではながあります。'), 'reading-misaligned')
  fails('w001', (o) => (o.examples[0].kana = 'ていにはながあります。'), 'headword-reading-missing')
  fails('w001', (o) => (o.examples[0].kana = 'niwa ni hana ga arimasu.'), 'latin')
})

test('no Latin letters except origin; full-width letters count too', () => {
  fails('w001', (o) => (o.tip = '庭(niwa)는 마당'), 'latin')
  fails('w001', (o) => (o.examples[0].ko = '정원에 flower가 있어요.'), 'latin')
  fails('w001', (o) => (o.related[0].ko = 'ｐａｒｋ 공원'), 'latin')
  assert.deepEqual(codes(run('w002', GOOD['w002'])), []) // origin "pool (영어)" is allowed
  warns('w001', (o) => (o.origin = 'niwa (일본어)'), 'origin-on-non-loanword')
})

test('Korean fields must contain Korean', () => {
  fails('w001', (o) => (o.examples[0].ko = '庭に花があります'), 'not-korean')
  fails('w001', (o) => (o.tip = 'にわ'), 'not-korean')
  fails('w001', (o) => (o.related[0].ko = 'こうえん'), 'not-korean')
  fails('w001', (o) => (o.kanji[0].hanja = 'にわ'), 'not-korean')
})

test('length limits', () => {
  fails('w001', (o) => (o.examples[0] = { ja: '庭に花がたくさんあって、とてもきれいで、毎日見ています。', kana: 'にわにはながたくさんあって、とてもきれいで、まいにちみています。', ko: '정원에 꽃이 많아요.' }), 'too-long')
  fails('w001', (o) => (o.tip = '가'.repeat(81)), 'too-long')
  fails('w001', (o) => (o.related[0].ko = '가'.repeat(21)), 'too-long')
  fails('w001', (o) => (o.kanji[0].hanja = '가'.repeat(13)), 'too-long')
  // the same sentence length is fine at N4 (limit 28)
  const r = run('w0k0', mutate('w0k0', (o) => (o.examples[0] = { ja: '明日は友だちと一緒に学校へ行きます。', kana: 'あしたはともだちといっしょにがっこうへいきます。', ko: '내일은 친구와 같이 학교에 가요.' })))
  assert.deepEqual(codes(r), [])
})

test('kanji entries: in the headword, reading used in this word, hanja sound checked against the table', () => {
  fails('w001', (o) => (o.kanji[0].char = '家'), 'kanji-not-in-word')
  fails('w002', (o) => (o.kanji = [{ char: '水', reading: 'みず', kind: 'kun', hanja: '물 수' }]), 'kanji-not-in-word')
  fails('w001', (o) => (o.kanji[0].reading = 'てい'), 'kanji-reading-not-in-word')
  fails('w001', (o) => (o.kanji[0].reading = 'niwa'), 'not-kana')
  fails('w001', (o) => (o.kanji = []), 'kanji-missing')
  fails('w004', (o) => o.kanji.push({ ...o.kanji[0] }), 'duplicate')
  warns('w001', (o) => (o.kanji[0].hanja = '뜰 원'), 'hanja-sound-mismatch')
  warns('w004', (o) => o.kanji.pop(), 'kanji-incomplete')
  warns('w001', (o) => (o.kanji[0].hanja = ''), 'hanja-missing')
  // rendaku/gemination in the word reading are accepted (学 がく → がっ in 学校)
  assert.deepEqual(codes(run('w004', GOOD['w004'])), [])
})

test('word type shapes the content: F needs a trap, S tip should show the reading', () => {
  fails('w000', (o) => (o.trap = ''), 'trap-missing')
  fails('w005', (o) => (o.trap = ''), 'trap-missing')
  warns('w001', (o) => (o.trap = '한국어 정원과 같아요'), 'trap-on-non-F')
  warns('w004', (o) => (o.tip = '학생과 같은 뜻이에요'), 'S-tip-without-reading')
})

test('related words: 2–3, kana reading, not the headword, no duplicates', () => {
  fails('w001', (o) => o.related.pop(), 'count')
  fails('w001', (o) => o.related.push(o.related[0], o.related[1]), 'count')
  fails('w001', (o) => (o.related[0] = { word: '庭', kana: 'にわ', ko: '정원', rel: 'syn' }), 'related-is-headword')
  fails('w003', (o) => (o.related[0] = { word: 'たべる', kana: 'たべる', ko: '먹다', rel: 'syn' }), 'related-is-headword')
  fails('w001', (o) => (o.related[1] = { ...o.related[0] }), 'duplicate')
  fails('w001', (o) => (o.related[0].kana = '公園'), 'not-kana')
})

test('editor flags and content check are warnings, not errors', () => {
  warns('w001', (o) => (o.meaningFlag = '정원'), 'meaning-flag')
  warns('w001', (o) => (o.examples[0].ko = '정원에 마약이 있어요.'), 'content-check')
})

test('cross-word checks: reused example is a warning, identical output an error', () => {
  const outs = new Map([['w001', GOOD['w001']], ['w003', mutate('w003', (o) => (o.examples[1] = GOOD['w001'].examples[0]))]])
  const r = crossCheck(outs)
  assert.equal(r.get('w001').warnings[0].code, 'example-reused')
  assert.equal(r.get('w003').warnings[0].code, 'example-reused')
  const dup = crossCheck(new Map([['w001', GOOD['w001']], ['w003', GOOD['w001']]]))
  assert.equal(dup.get('w001').errors[0].code, 'duplicate-output')
  assert.equal(crossCheck(new Map(Object.entries(GOOD))).size, 0)
})
