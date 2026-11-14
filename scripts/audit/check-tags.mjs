// Mechanical checks over EVERY S and F word (docs/plan/12-tag-audit.md §2). Read-only on tag data.
//   node scripts/audit/check-tags.mjs            -> data/tags/audit/mechanical.json + summary on stdout
//   node scripts/audit/check-tags.mjs --list sk  also print the rows of one check (sk | shin | kana | ko | same | ff)
// Needs data/tags/audit/hanja-readings.tsv (scripts/audit/hanja-readings.py; committed, so no download needed).
import { writeFileSync } from 'node:fs'
import { loadTagged, loadReadings, dueum, explainSk, shinjitaiHazards, koRelation, shapeOf, isHan, AUDIT_DIR } from './lib.mjs'

const list = process.argv.includes('--list') ? process.argv[process.argv.indexOf('--list') + 1] : null
const words = loadTagged()
const table = loadReadings()
const SF = words.filter((w) => w.k === 'S' || w.k === 'F')
const row = (w, extra) => ({ id: w.id, level: w.level, k: w.k, core: w.core, reading: w.reading, sk: w.sk, ko: w.ko, ...extra })

// 1. sk consistency ---------------------------------------------------------------------------------
const SK_CLASS = {
  'dueum-missing': '두음법칙 미적용(단어 첫머리)', 'dueum-suffix': '접미사에 두음법칙 적용', 'dueum-inner': '두음법칙(합성어 내부)',
  sai: '사이시옷', drop: '받침 탈락(시월·유월형)', nl: 'ㄴ/ㄹ 교체(활음조·본음)', variant: '구자체 음으로만 설명됨',
  minor: 'kKorean·KANJIDIC에만 있는 음', none: '후보 밖', length: '음절 수 ≠ 한자 수',
}
const skRows = []
for (const w of SF) {
  if (!w.sk) { skRows.push(row(w, { cls: ['missing'], detail: 'sk 없음' })); continue }
  const e = explainSk(w.core, w.sk, w.affix, table)
  if (e.ok) continue
  const bad = e.per.filter((p) => !['reading', 'dueum', 'yeol'].includes(p.how))
  skRows.push(row(w, {
    cls: [...new Set(bad.map((p) => p.how))].concat(e.kinds.has('length') ? ['length'] : []),
    detail: bad.map((p) => `${p.ch}→${p.s} (${SK_CLASS[p.how] ?? p.how}; 후보 ${[...new Set([...(table.get(p.ch)?.uni ?? []), ...(table.get(p.ch)?.table ?? []), ...Object.values(table.get(p.ch)?.vars ?? {}).flat()])].join('/') || '-'})`).join(', '),
  }))
}
// alternate readings: sk uses a reading that is not the character's first (education-hanja) reading
const altRows = []
for (const w of SF) {
  if (!w.sk) continue
  const hans = [...w.core].filter(isHan)
  const sy = [...w.sk]
  if (hans.length !== sy.length) continue
  hans.forEach((ch, i) => {
    const e = table.get(ch)
    if (!e) return
    const edu = e.edu.filter((r) => !r.startsWith('var:'))
    const own = [...new Set([...edu, ...e.uni, ...e.table])]
    if (own.length < 2) return
    const first = edu[0] ?? own[0]
    const s = sy[i]
    if (s === first || dueum(first) === s) return
    altRows.push(row(w, { ch, used: s, first, all: own.join('/') }))
  })
}

// 2. shinjitai / kyujitai -------------------------------------------------------------------------
const hazards = shinjitaiHazards(table)
const hz = new Map(hazards.map((h) => [h.ch, h]))
const shinRows = []
for (const w of SF) {
  const hans = [...w.core].filter(isHan)
  const sy = [...w.sk]
  hans.forEach((ch, i) => {
    const h = hz.get(ch)
    if (!h || hans.length !== sy.length) return
    const s = sy[i]
    const varR = new Set(Object.values(h.vars).flat())
    const usesOwnOnly = h.onlyOwn.some((r) => r === s) && !varR.has(s)
    shinRows.push(row(w, {
      ch, used: s, own: h.own.join('/'), vars: Object.entries(h.vars).map(([v, r]) => `${v} ${r.join('/')}`).join(', '),
      flag: usesOwnOnly ? '신자체 자체의 한국 음(구자체와 다름) 사용 — 오류 의심' : h.split ? '구자체가 여럿(음이 갈림) — 어느 글자인지 확인' : 'ok',
    }))
  })
}

// 3. kana in S words, kun / irregular readings ---------------------------------------------------------
const kanaRows = []
for (const w of words.filter((x) => x.k === 'S')) {
  const shape = shapeOf(w.core)
  if (shape !== 'kana' && w.rt === 'on') continue
  const kana = [...w.core].filter((c) => !isHan(c)).join('')
  let pattern
  if (/^\p{Script=Han}(する|じる|ずる|す)$/u.test(w.core)) pattern = 'R1 한 글자+する/じる'
  else if (/(する)$/.test(w.core)) pattern = '～する'
  else if (/^[おご御]/.test(w.core) && shape === 'kana') pattern = 'お/ご 접두'
  else if (/さん$/.test(w.core)) pattern = '～さん(R4)'
  else if (shape === 'kana') pattern = w.rt === 'on' ? '음독+가나' : 'R7 훈독 복합어(오쿠리가나·の)'
  else pattern = w.rt === 'kun' ? '한자만·훈독' : w.rt === 'irr' ? '한자만·숙자훈' : '한자만·음훈 혼합'
  kanaRows.push(row(w, { kana, rt: w.rt, pattern }))
}

// 4. internal contradictions -----------------------------------------------------------------------
const byCore = new Map()
for (const w of words) (byCore.get(w.core) ?? byCore.set(w.core, []).get(w.core)).push(w)
const sameRows = []
for (const [core, ws] of byCore) {
  if (ws.length < 2 || !ws.some((w) => w.k === 'S' || w.k === 'F')) continue
  const keys = new Set(ws.map((w) => `${w.k}/${w.sk}`))
  if (keys.size < 2) continue
  sameRows.push({ core, entries: ws.map((w) => ({ id: w.id, level: w.level, reading: w.reading, affix: w.affix, k: w.k, sk: w.sk, ko: w.ko })) })
}
const ffRows = []
for (const w of words) {
  if (w.k === 'S' && w.ff) ffRows.push(row(w, { problem: 'S인데 ff 있음', ff: w.ff }))
  if (w.k === 'F' && !w.ff) ffRows.push(row(w, { problem: 'F인데 ff 없음' }))
  if (w.k !== 'F' && w.k !== 'S' && w.ff) ffRows.push(row(w, { problem: `${w.k}인데 ff 있음`, ff: w.ff }))
}
const koRows = []
const koStats = { exact: 0, word: 0, inside: 0, none: 0 }
for (const w of words.filter((x) => x.k === 'S')) {
  const rel = koRelation(w.sk, w.ko)
  koStats[rel]++
  if (rel === 'inside' || rel === 'none') koRows.push(row(w, { rel, en: w.en, shape: shapeOf(w.core), rt: w.rt }))
}

// output -----------------------------------------------------------------------------------------------
const count = (rows, f) => rows.reduce((m, r) => { for (const k of [].concat(f(r))) m[k] = (m[k] ?? 0) + 1; return m }, {})
const out = {
  generated: 'node scripts/audit/check-tags.mjs',
  totals: { S: words.filter((w) => w.k === 'S').length, F: words.filter((w) => w.k === 'F').length, words: words.length },
  sk: { count: skRows.length, byClass: count(skRows, (r) => r.cls), rows: skRows },
  altReadings: { count: altRows.length, note: 'sk가 그 글자의 대표(교육용) 음이 아닌 다른 음을 씀 — 대부분 정당(音楽 악, 銀行 행)', rows: altRows },
  shinjitai: {
    hazards: hazards.map((h) => ({ ch: h.ch, own: h.own.join('/'), vars: Object.entries(h.vars).map(([v, r]) => `${v} ${r.join('/')}`).join(', ') })),
    count: shinRows.length, byFlag: count(shinRows, (r) => r.flag), rows: shinRows,
  },
  kanaOrKun: { count: kanaRows.length, byPattern: count(kanaRows, (r) => r.pattern), rows: kanaRows },
  sameCore: { count: sameRows.length, rows: sameRows },
  ff: { count: ffRows.length, rows: ffRows },
  koContainsSk: { stats: koStats, count: koRows.length, rows: koRows },
}
writeFileSync(`${AUDIT_DIR}/mechanical.json`, JSON.stringify(out, null, 1) + '\n')
console.log(`S ${out.totals.S}, F ${out.totals.F} of ${out.totals.words} words`)
console.log(`1  sk not explained by per-kanji readings + 두음법칙: ${skRows.length}`, out.sk.byClass)
console.log(`   sk uses a non-first reading of a kanji: ${altRows.length}`)
console.log(`2  shinjitai hazard kanji: ${hazards.length}; S/F occurrences: ${shinRows.length}`, out.shinjitai.byFlag)
console.log(`3  S with kana or non-on reading: ${kanaRows.length}`, out.kanaOrKun.byPattern)
console.log(`4  same written form, different k/sk (S/F involved): ${sameRows.length}; ff misuse: ${ffRows.length}`)
console.log(`   S: ko vs sk`, koStats, `→ listed (inside+none): ${koRows.length}`)
console.log(`-> ${AUDIT_DIR}/mechanical.json`)
const show = { sk: skRows, alt: altRows, shin: shinRows.filter((r) => r.flag !== 'ok'), kana: kanaRows, ko: koRows, same: sameRows, ff: ffRows }[list]
if (show) for (const r of show) console.log(JSON.stringify(r))
