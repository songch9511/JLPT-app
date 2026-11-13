// Consistency rules for the word-type tags (data/tags/LABELLING.md §2.1), and the shipped data obeying them.
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs build script without type declarations
import { ruleErrors, sameWordConflicts, hasFinal, headwordKey } from '../../scripts/enrich/tag-rules.mjs'

const w = (core: string, coreReading: string, affix: string | null = null) => ({ core, coreReading, affix })

describe('R1 one-kanji する/じる verbs', () => {
  it('asks for S when Korean has the -하다 verb, J otherwise', () => {
    expect(ruleErrors(w('応じる', 'おうじる'), { k: 'S', sk: '응', rt: 'on' })).toEqual([])
    expect(ruleErrors(w('応じる', 'おうじる'), { k: 'J', sk: '응', rt: 'on' })[0]).toMatch(/R1.*S/)
    expect(ruleErrors(w('感じる', 'かんじる'), { k: 'J', sk: '감', rt: 'on' })).toEqual([])
    expect(ruleErrors(w('感じる', 'かんじる'), { k: 'S', sk: '감', rt: 'on' })[0]).toMatch(/R1.*J/)
  })
  it('leaves kun verbs and other types alone', () => {
    expect(ruleErrors(w('蒸す', 'ふす'), { k: 'M', rt: 'irr' })).toEqual([])
    expect(ruleErrors(w('食べる', 'たべる'), { k: 'N', rt: 'kun' })).toEqual([])
  })
})

describe('R3 counts and the fixed table', () => {
  it('numeral day/person counts are S', () => {
    expect(ruleErrors(w('三日', 'みっか'), { k: 'S', sk: '삼일', rt: 'kun' })).toEqual([])
    expect(ruleErrors(w('三日', 'みっか'), { k: 'M', rt: 'kun' })[0]).toMatch(/R3/)
  })
  it('calendar, kinship and other-character words follow the table, sk included', () => {
    expect(ruleErrors(w('先月', 'せんげつ'), { k: 'J', sk: '선월', rt: 'on' })).toEqual([])
    expect(ruleErrors(w('先月', 'せんげつ'), { k: 'S', sk: '선월', rt: 'on' })[0]).toMatch(/rule table/)
    expect(ruleErrors(w('数字', 'すうじ'), { k: 'S', sk: '수자', rt: 'on' })[0]).toMatch(/sk=숫자/)
    expect(ruleErrors(w('膨張', 'ぼうちょう'), { k: 'S', sk: '팽창', rt: 'on' })[0]).toMatch(/k=J sk=팽장/)
    expect(ruleErrors(w('一月', 'ひとつき'), { k: 'F', sk: '일월', ff: "한국어 '일월'(1월)과 달리 '한 달'이라는 뜻", rt: 'kun' })).toEqual([])
  })
})

describe('R9 false-friend note wording', () => {
  const t = (ff: string, sk = '공부') => ({ k: 'F', sk, ff, rt: 'on' })
  it('accepts the one format with correct particles', () => {
    expect(ruleErrors(w('工夫', 'くふう'), t("한국어 '공부'(학습)와 달리 '궁리·고안'이라는 뜻"))).toEqual([])
    expect(ruleErrors(w('金', 'かね'), t("한국어 '금'(황금)과 달리 주로 '돈'이라는 뜻", '금'))).toEqual([])
  })
  it('rejects other wordings, wrong particles and a quoted word without sk', () => {
    expect(ruleErrors(w('工夫', 'くふう'), t("한국어 '공부'(학습)가 아니라 '궁리'"))[0]).toMatch(/R9 ff must read/)
    expect(ruleErrors(w('工夫', 'くふう'), t("한국어 '공부'(학습)과 달리 '궁리'라는 뜻"))[0]).toMatch(/와/)
    expect(ruleErrors(w('工夫', 'くふう'), t("한국어 '공부'(학습)와 달리 '고안'라는 뜻"))[0]).toMatch(/이라는/)
    expect(ruleErrors(w('工夫', 'くふう'), t("한국어 '학습'(공부)과 달리 '궁리'라는 뜻"))[0]).toMatch(/contain sk/)
  })
  it('knows final consonants', () => {
    expect([hasFinal('공부'), hasFinal('금'), hasFinal('~착'), hasFinal('1번')]).toEqual([false, true, true, true])
  })
})

describe('R10 same headword', () => {
  const e = (key: string, k: string, sk?: string) => ({ key, k, sk, where: key })
  it('flags the same headword with different answers unless excepted', () => {
    const a = headwordKey({ core: '席', coreReading: 'せき', affix: null, reading: 'せき' })
    const b = headwordKey({ core: '席', coreReading: 'せき', affix: 'suf', reading: '～せき' })
    expect(sameWordConflicts([e(a, 'J', '석'), e(b, 'S', '석')], new Set())).toEqual([])
    const c = sameWordConflicts([e(a, 'J', '석'), e(a, 'S', '석')], new Set())
    expect(c).toHaveLength(1)
    expect(sameWordConflicts([e(a, 'J', '석'), e(a, 'S', '석')], new Set(['席|せき']))).toEqual([])
  })
})

describe('the labelled data', () => {
  it('has no tag that breaks a rule (validate-tags.mjs checks the rest)', () => {
    const dir = new URL('../../data/tags/', import.meta.url).pathname
    let fs = 0
    for (const f of readdirSync(dir).filter((f) => /^n\d-\d+\.json$/.test(f))) {
      const d = JSON.parse(readFileSync(dir + f, 'utf8')) as Record<string, { k: string; ff?: string; sk?: string }>
      for (const t of Object.values(d)) if (t.k === 'F') {
        fs++
        expect(ruleErrors(w('', ''), t), `${f} ${t.ff}`).toEqual([])
      }
    }
    expect(fs).toBeGreaterThan(50)
  })
})
