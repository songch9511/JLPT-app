// The kanji of the word lists (scripts/build-data.mjs `kanjiRows`, public/data/kanji.json): each kanji belongs to the
// first level (N5 → N1) whose words contain it, and is studied with its own FSRS card, `k` + the kanji (`k強`). Which
// kanji exist and their levels are known at once (src/generated/content.ts); their readings and words load with
// public/data/kanji.json, once, when a screen needs them.
import { useEffect, useState } from 'react'
import { KANJI_BY_LEVEL } from './generated/content.ts'

type Level = 5 | 4 | 3 | 2 | 1
const LEVELS: Level[] = [5, 4, 3, 2, 1]

export interface Kanji {
  /** the card id: `k` + the kanji */
  id: string
  k: string
  level: Level
  /** introduction order within the level, 0 first */
  o: number
  /** 훈 ("강할"); '' until data/hanja/hun.json has it */
  hun: string
  /** 음 ("강") */
  eum: string
  /** on'yomi in katakana */
  on: string[]
  /** kun'yomi in hiragana, KANJIDIC2 notation: okurigana after the dot ("つよ.い") */
  kun: string[]
  /** every Korean reading the table gives (search) */
  ko: string[]
  /** ids of the words containing it, easiest level first */
  words: string[]
}

const KANJI_ID = /^k(.)$/u
export const kanjiId = (k: string) => `k${k}`
export const isKanjiId = (id: string) => id.charCodeAt(0) === 107 && KANJI_ID.test(id)

const levelOfChar = new Map<string, Level>()
const orderOfChar = new Map<string, number>()
for (const l of LEVELS) [...KANJI_BY_LEVEL[l]].forEach((k, i) => (levelOfChar.set(k, l), orderOfChar.set(k, i)))

/** The level of a kanji card id (`k強`), or undefined for one this version does not know. */
export const kanjiLevel = (id: string): Level | undefined => (isKanjiId(id) ? levelOfChar.get(id.slice(1)) : undefined)
/** Whether the id is a kanji card of this version. */
export const isKnownKanjiId = (id: string) => kanjiLevel(id) !== undefined
/** Kanji per level. */
export const KANJI_COUNTS = Object.fromEntries(LEVELS.map((l) => [l, [...KANJI_BY_LEVEL[l]].length])) as Record<Level, number>
/** A level's kanji card ids in introduction order. */
const idsMemo = new Map<Level, string[]>()
export const kanjiIdsOfLevel = (l: Level): string[] => {
  let ids = idsMemo.get(l)
  if (!ids) idsMemo.set(l, (ids = [...KANJI_BY_LEVEL[l]].map(kanjiId)))
  return ids
}
/** Whether a character is one of the app's kanji. */
export const isStudiedKanji = (ch: string) => levelOfChar.has(ch)

type Row = [string, Level, string, string, string, string, string, string[]]
const split = (s: string) => (s ? s.split(' ').filter(Boolean) : [])

let all: Promise<Map<string, Kanji>> | null = null
let loaded: Map<string, Kanji> | null = null
/** Every kanji by its character; the file is fetched once (a failed load is tried again next time). */
export function loadKanji(): Promise<Map<string, Kanji>> {
  if (!all) {
    all = fetch(`${import.meta.env.BASE_URL}data/kanji.json`)
      .then((r) => {
        if (!r.ok) throw new Error('한자 데이터를 불러오지 못했어요')
        return r.json() as Promise<Row[]>
      })
      .then((rows) => {
        const m = new Map<string, Kanji>()
        for (const [k, level, hun, eum, on, kun, ko, words] of rows)
          if (levelOfChar.get(k) === level) m.set(k, { id: kanjiId(k), k, level, o: orderOfChar.get(k) ?? 0, hun, eum, on: split(on), kun: split(kun), ko: split(ko), words })
        loaded = m
        return m
      })
    all.catch(() => (all = null))
  }
  return all
}

/** A kanji by its card id or character, once the file has loaded (null before). */
export const kanjiInfo = (idOrChar: string): Kanji | null => loaded?.get(idOrChar.length > 1 && isKanjiId(idOrChar) ? idOrChar.slice(1) : idOrChar) ?? null

/** Every kanji, or null while the file loads (and after a failed load). `retry` loads again. */
export function useKanji(enabled = true): Map<string, Kanji> | null {
  const [m, setM] = useState<Map<string, Kanji> | null>(loaded)
  useEffect(() => {
    if (!enabled || m) return
    let live = true
    loadKanji().then(
      (x) => live && setM(x),
      () => {},
    )
    return () => {
      live = false
    }
  }, [enabled, m])
  return enabled ? m : null
}

/** "강할 강", or the 음 alone while the 훈 is not known. */
export const hunEum = (k: Pick<Kanji, 'hun' | 'eum'>) => (k.hun ? `${k.hun} ${k.eum}` : k.eum)

/** Katakana → hiragana (on'yomi are shown in hiragana on the card). */
export const toHiragana = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))

/** A kun'yomi in KANJIDIC2 notation as its stem and its okurigana: "つよ.い" → ["つよ", "い"]; prefix/suffix dashes go. */
export function kunParts(kun: string): [stem: string, okurigana: string] {
  const k = kun.replace(/-/g, '')
  const i = k.indexOf('.')
  return i < 0 ? [k, ''] : [k.slice(0, i), k.slice(i + 1)]
}
/** "つよ(い)": a kun'yomi with its okurigana in brackets, as the sheet and the search list write it. */
export const kunText = (kun: string) => {
  const [stem, oku] = kunParts(kun)
  return oku ? `${stem}(${oku})` : stem
}

// ── a word's reading cut per kanji (the study card's kanji chips) ──

const VOICED: Record<string, string> = {}
for (const [a, b] of ['かが', 'きぎ', 'くぐ', 'けげ', 'こご', 'さざ', 'しじ', 'すず', 'せぜ', 'そぞ', 'ただ', 'ちぢ', 'つづ', 'てで', 'とど', 'はば', 'ひび', 'ふぶ', 'へべ', 'ほぼ'])
  VOICED[a] = (VOICED[a] ?? '') + b
for (const [a, b] of ['はぱ', 'ひぴ', 'ふぷ', 'へぺ', 'ほぽ']) VOICED[a] = (VOICED[a] ?? '') + b

/** The forms a kanji's reading can take inside a word: as written, voiced (rendaku), and cut short before っ. */
function variants(r: string): string[] {
  const out = new Set([r])
  for (const v of VOICED[r[0]] ?? '') out.add(v + r.slice(1))
  if (r.length >= 2 && 'つくちき'.includes(r[r.length - 1])) for (const x of [...out]) out.add(x.slice(0, -1) + 'っ')
  return [...out]
}

const isKanaChar = (c: string) => /[ぁ-ゖァ-ーー]/.test(c)

/**
 * A word's reading cut per kanji (勉強 べんきょう → べん | きょう; 預ける あずける → あず), from each kanji's on and kun
 * readings, or null when the reading cannot be cut that way (irregular readings like 今日, kanji not in the table).
 */
export function alignReading(word: string, reading: string, info: (k: string) => Pick<Kanji, 'on' | 'kun'> | null): string[] | null {
  const chars = [...word]
  const target = toHiragana(reading)
  const candidates = chars.map((c) => {
    if (isKanaChar(c)) return null
    const k = info(c)
    if (!k) return []
    const rs = [...k.on.map(toHiragana), ...k.kun.map((x) => kunParts(x)[0])].filter(Boolean)
    return [...new Set(rs.flatMap(variants))].sort((a, b) => b.length - a.length)
  })
  const out: string[] = []
  const go = (i: number, pos: number): boolean => {
    if (i === chars.length) return pos === target.length
    const c = chars[i]
    const cand = candidates[i]
    if (cand === null) return target[pos] === toHiragana(c) && go(i + 1, pos + 1)
    for (const r of cand) {
      if (target.startsWith(r, pos)) {
        out.push(r)
        if (go(i + 1, pos + r.length)) return true
        out.pop()
      }
    }
    return false
  }
  if (!candidates.some((c) => c !== null)) return null
  return go(0, 0) ? out : null
}
