// Review sheet for humans: TSV (for a spreadsheet, with empty verdict/note columns) and HTML (to read).
// Rows: a stratified sample (level × word type) of accepted outputs, plus every accepted output with warnings
// that the sample did not already include, up to a cap.

import { stratified } from './words.mjs'

const COLS = ['id', 'level', 'type', 'typeSrc', 'word', 'reading', 'ko', 'ex1_ja', 'ex1_kana', 'ex1_ko', 'ex2_ja', 'ex2_kana', 'ex2_ko', 'kanji', 'tip', 'trap', 'related', 'origin', 'meaningFlag', 'warnings', 'model', 'verdict', 'note']

export function rowFor(word, item) {
  const o = item.output
  const ex = (i, k) => o.examples[i]?.[k] ?? ''
  return {
    id: word.id, level: word.level.toUpperCase(), type: word.tag.k || '?', typeSrc: word.tag.src,
    word: word.w, reading: word.r || word.w, ko: word.ko,
    ex1_ja: ex(0, 'ja'), ex1_kana: ex(0, 'kana'), ex1_ko: ex(0, 'ko'),
    ex2_ja: ex(1, 'ja'), ex2_kana: ex(1, 'kana'), ex2_ko: ex(1, 'ko'),
    kanji: o.kanji.map((k) => `${k.char}(${k.reading || '-'}/${k.kind}) ${k.hanja}`).join(' · '),
    tip: o.tip, trap: o.trap,
    related: o.related.map((r) => `${r.word}(${r.kana}) ${r.ko} [${r.rel}]`).join(' · '),
    origin: o.origin, meaningFlag: o.meaningFlag,
    warnings: (item.warnings || []).map((w) => `${w.code}@${w.field}`).join(' '),
    model: item.meta?.model || '', verdict: '', note: '',
  }
}

/**
 * @param {import('./words.mjs').Word[]} words  candidate words (already filtered by level)
 * @param {Record<string, any>} accepted
 * @param {{ perCell?: number, share?: number, all?: boolean, warnCap?: number, seed?: string }} opt
 *   share: sample this fraction of `words` (e.g. 0.05), spread evenly over level × type cells
 */
export function pickRows(words, accepted, { perCell = 5, share = null, all = false, warnCap = 200, seed = 'review' } = {}) {
  const have = words.filter((w) => accepted[w.id])
  let picked
  if (all) picked = have
  else if (share != null) picked = stratified(have, Math.ceil(share * words.length), seed)
  else {
    const cells = new Set(have.map((w) => `${w.level}|${w.tag.k || '?'}`)).size
    picked = stratified(have, perCell * cells, seed)
  }
  const ids = new Set(picked.map((w) => w.id))
  const flagged = have.filter((w) => !ids.has(w.id) && accepted[w.id].warnings?.length).slice(0, warnCap)
  return [...picked.map((w) => ({ w, why: all ? 'all' : 'sample' })), ...flagged.map((w) => ({ w, why: 'warning' }))]
}

const tsvCell = (s) => String(s).replace(/[\t\r\n]+/g, ' ')
export function toTsv(rows) {
  return [['why', ...COLS].join('\t'), ...rows.map(({ why, row }) => [why, ...COLS.map((c) => tsvCell(row[c]))].join('\t'))].join('\n') + '\n'
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
export function toHtml(rows, title) {
  const cards = rows.map(({ why, row: r }) => `<section class="${why}">
<h2>${esc(r.word)} <small>${esc(r.reading)} · ${esc(r.ko)} · ${esc(r.id)} · ${esc(r.type)}${r.typeSrc === 'hint' ? '(추정)' : ''} · ${esc(why)}</small></h2>
<ol><li><p lang="ja">${esc(r.ex1_ja)}</p><p lang="ja" class="k">${esc(r.ex1_kana)}</p><p>${esc(r.ex1_ko)}</p></li>
<li><p lang="ja">${esc(r.ex2_ja)}</p><p lang="ja" class="k">${esc(r.ex2_kana)}</p><p>${esc(r.ex2_ko)}</p></li></ol>
<dl><dt>한자</dt><dd>${esc(r.kanji || '—')}</dd><dt>팁</dt><dd>${esc(r.tip)}</dd>${r.trap ? `<dt>함정</dt><dd>${esc(r.trap)}</dd>` : ''}
<dt>관련어</dt><dd>${esc(r.related)}</dd>${r.origin ? `<dt>원어</dt><dd>${esc(r.origin)}</dd>` : ''}${r.meaningFlag ? `<dt>뜻 수정 제안</dt><dd class="w">${esc(r.meaningFlag)}</dd>` : ''}
${r.warnings ? `<dt>경고</dt><dd class="w">${esc(r.warnings)}</dd>` : ''}</dl></section>`)
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>:root{--bg:#fff;--fg:#1d1d1f;--mut:#666;--line:#ddd;--warn:#a33}@media(prefers-color-scheme:dark){:root{--bg:#161616;--fg:#eee;--mut:#aaa;--line:#333;--warn:#f88}}
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;max-width:760px;margin:0 auto;padding:16px}
section{border-top:1px solid var(--line);padding:8px 0}h2{font-size:18px;margin:4px 0}small{color:var(--mut);font-weight:normal;font-size:13px}
ol{padding-left:20px}p{margin:0}.k{color:var(--mut);font-size:13px}dl{display:grid;grid-template-columns:5.5em 1fr;gap:2px 8px;margin:6px 0}dt{color:var(--mut)}dd{margin:0}.w{color:var(--warn)}</style></head>
<body><h1>${esc(title)}</h1><p>${rows.length}개. 판정은 TSV의 verdict 열(ok / fix / regen)에 적습니다.</p>${cards.join('\n')}</body></html>\n`
}
