import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findParts, hanjaSoundMatches, inflections, parseHeadword, readingAligns, soundVariants, toHira } from '../lib/jp.mjs'

test('parseHeadword: affixes, annotations, alternatives, mid patterns', () => {
  assert.deepEqual(parseHeadword('～屋', '～や').forms, [['屋']])
  assert.deepEqual(parseHeadword('丸い; 円い', 'まるい').forms, [['丸い'], ['円い']])
  assert.deepEqual(parseHeadword('よし (かん)', '').forms, [['よし']])
  assert.deepEqual(parseHeadword('いくら～ても', '').forms, [['いくら', 'ても']])
  assert.deepEqual(parseHeadword('プール', '').readings, [['プール']])
  // a source row with expression and reading swapped still yields a kana reading
  assert.deepEqual(parseHeadword('いただく', '頂く').readings, [['いただく']])
})

test('readingAligns allows up to 5 kana per kanji (承る, 志)', () => {
  assert.ok(readingAligns('ご注文を承ります。', 'ごちゅうもんをうけたまわります。'))
  assert.ok(readingAligns('志を持つ。', 'こころざしをもつ。'))
})

test('inflections cover godan, ichidan, i-adjective, suru and the 行く exception', () => {
  assert.ok(inflections('書く').includes('書き'))
  assert.ok(inflections('食べる').includes('食べます'))
  assert.ok(inflections('高い').includes('高かっ'))
  assert.ok(inflections('勉強する').includes('勉強し'))
  assert.ok(inflections('勉強する').includes('勉強'))
  assert.ok(inflections('行く').includes('行っ'))
  // a one-kana stem is never matched alone
  assert.ok(!inflections('いる').includes('い'))
})

test('findParts finds conjugated words and ordered parts', () => {
  assert.ok(findParts('毎朝パンを食べました', ['食べる']))
  assert.ok(findParts('昨日行った店', ['行く']))
  assert.equal(findParts('いすがあります', ['いる']), null)
  assert.ok(findParts('いくら高くても買います', ['いくら', 'ても']))
  assert.equal(findParts('高くてもいくら', ['いくら', 'ても']), null)
})

test('soundVariants: rendaku and gemination', () => {
  assert.ok(soundVariants('ほん').includes('ぼん'))
  assert.ok(soundVariants('ほん').includes('ぽん'))
  assert.ok(soundVariants('がく').includes('がっ'))
})

test('readingAligns: kana skeleton and kanji run lengths', () => {
  assert.ok(readingAligns('庭に花があります。', 'にわにはながあります。'))
  assert.ok(readingAligns('このプールは大きいです。', 'このぷーるはおおきいです。'))
  assert.ok(readingAligns('3時に起きます。', 'さんじにおきます。'))
  assert.ok(!readingAligns('庭に花があります。', 'にわではながあります。')) // particle changed
  assert.ok(!readingAligns('庭に花があります。', 'にわにはながある。')) // ending changed
  assert.ok(!readingAligns('庭に花があります。', '庭にはながあります。')) // kanji left in reading
  assert.ok(!readingAligns('学生です。', 'がくせいがくせいがくせいがくせいがくせいがくせいです。')) // far too long for 2 kanji
})

test('toHira and the Korean initial-sound law', () => {
  assert.equal(toHira('プール'), 'ぷーる')
  assert.ok(hanjaSoundMatches('연', ['년']))
  assert.ok(hanjaSoundMatches('년', ['년']))
  assert.ok(!hanjaSoundMatches('원', ['정']))
})
