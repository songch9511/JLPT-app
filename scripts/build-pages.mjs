// Builds the public privacy-policy and support pages from their sources in docs/store/ (the single source):
//
//   docs/store/privacy-policy-ko.md  →  public/privacy/index.html      (part 1 only)
//   docs/store/privacy-policy-en.md  →  public/privacy/en/index.html   (part 1 only)
//   docs/store/support-ko.md         →  public/support/index.html
//
// Vite copies public/ into both builds, so the pages are served next to the web app on GitHub Pages
// (…/JLPT-app/privacy/, …/support/) and bundled in the iOS app, where Settings › 정보 shows them in place
// (src/screens/Doc.tsx), offline. What is left out of a page: the "before publishing" box (the blockquote at the
// top) and everything from part 2 on (the Plus/server features, which do not exist yet). `[brackets]` are the
// operator's blanks and stay visible, marked as placeholders, until the source is filled in.
//
// Colours come from the ruma theme's palette (src/themes/ruma/rumaTheme.ts); no external resources.
//
// Usage: npm run pages            (write the pages)
//        npm run pages -- --check (exit 1 if a page is not what the sources make; tests/unit/pages.test.ts does the same)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
/** The web app's address; links to it in the sources become relative links, so they also work inside the iOS app. */
export const SITE = 'https://songch9511.github.io/JLPT-app/'

/** The pages, by their path under public/ (= under the site). */
export const PAGES = [
  { path: 'privacy/', source: 'docs/store/privacy-policy-ko.md', lang: 'ko', part1: true, alt: { path: 'privacy/en/', label: 'English', lang: 'en' } },
  { path: 'privacy/en/', source: 'docs/store/privacy-policy-en.md', lang: 'en', part1: true, alt: { path: 'privacy/', label: '한국어', lang: 'ko' } },
  { path: 'support/', source: 'docs/store/support-ko.md', lang: 'ko', part1: false },
]

// ── the source text that is published ──

/** The published part of a source: no title suffix "(초안)/(draft)", no leading notice box, part 1 only. */
export function publishedMarkdown(md, part1) {
  let lines = md.replace(/\r\n/g, '\n').split('\n')
  if (part1) {
    const end = lines.findIndex((l) => /^## (2부|Part 2)[.\s]/.test(l))
    if (end < 0) throw new Error('no part 2 heading: the cut between what is published and what is not is unclear')
    lines = lines.slice(0, end)
    // the part 1 heading itself: a published policy has no parts
    lines = lines.filter((l) => !/^## (1부|Part 1)[.\s]/.test(l))
  }
  // the first blockquote (the editor's notes) is never published
  const q = lines.findIndex((l) => l.startsWith('>'))
  if (q >= 0) {
    let e = q
    while (e < lines.length && lines[e].startsWith('>')) e++
    lines.splice(q, e - q)
  }
  lines[0] = lines[0].replace(/\s*\((초안|draft)\)\s*$/, '')
  // trailing rules and blank lines left by the cut
  while (lines.length && /^(\s*|---)$/.test(lines[lines.length - 1])) lines.pop()
  return lines.join('\n')
}

// ── a small Markdown subset (what the sources use) ──

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The relative link from one page path to another (`privacy/` → `privacy/en/` is `en/`). */
export function relative(from, to) {
  if (to.startsWith(from)) return to.slice(from.length) || './'
  return '../'.repeat(from.split('/').filter(Boolean).length) + to
}

/** A link target as the page should have it: the app's own pages relative to this page, others as they are. */
function href(url, pagePath) {
  if (!url.startsWith(SITE)) return { url, external: /^https?:/.test(url) }
  return { url: relative(pagePath, url.slice(SITE.length)), external: false }
}

function inline(text, pagePath) {
  const out = []
  // code spans first: their content is literal
  const parts = text.split(/(`[^`]+`)/)
  for (const part of parts) {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
      out.push(`<code>${esc(part.slice(1, -1))}</code>`)
      continue
    }
    let s = ''
    let i = 0
    // [text](url) is a link; any other [text] is a blank the operator fills in
    const re = /\[([^\]]+)\]\(([^)\s]+)\)|\[([^\]]+)\]/g
    let m
    while ((m = re.exec(part))) {
      s += esc(part.slice(i, m.index))
      if (m[2]) {
        const h = href(m[2], pagePath)
        s += `<a href="${esc(h.url)}"${h.external ? ' target="_blank" rel="noreferrer"' : ''}>${esc(m[1])}</a>`
      } else s += `<mark class="placeholder">[${esc(m[3])}]</mark>`
      i = m.index + m[0].length
    }
    s += esc(part.slice(i))
    out.push(s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'))
  }
  return out.join('')
}

const cells = (row) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())

/** Markdown (headings, paragraphs, nested lists, tables, rules) → HTML. `#` is the h1; `##` and `###` are h2. */
export function markdownToHtml(md, pagePath) {
  const lines = md.split('\n')
  const html = []
  let i = 0
  const isBlockStart = (l) => /^(#{1,6} |\s*[-*] |\s*\d+\. |\||---\s*$|>)/.test(l) || l.trim() === ''
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i++
      continue
    }
    let m
    if ((m = /^(#{1,6}) (.*)$/.exec(line))) {
      // # title → h1; ## and ### → h2 (a published policy has no parts, so its sections are the top level)
      const h = m[1].length === 1 ? 1 : 2
      html.push(`<h${h}>${inline(m[2], pagePath)}</h${h}>`)
      i++
    } else if (/^---\s*$/.test(line)) {
      html.push('<hr>')
      i++
    } else if (line.startsWith('|')) {
      const head = cells(line)
      i += 2 // header and the |---| row
      const rows = []
      while (i < lines.length && lines[i].startsWith('|')) rows.push(cells(lines[i++]))
      html.push(
        '<div class="table"><table>' +
          `<thead><tr>${head.map((c) => `<th>${inline(c, pagePath)}</th>`).join('')}</tr></thead>` +
          `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, pagePath)}</td>`).join('')}</tr>`).join('')}</tbody>` +
          '</table></div>',
      )
    } else if (/^\s*([-*]|\d+\.) /.test(line)) {
      // a list, nested by indentation
      const items = []
      while (i < lines.length && /^\s*([-*]|\d+\.) /.test(lines[i])) {
        const mm = /^(\s*)([-*]|\d+\.) (.*)$/.exec(lines[i])
        items.push({ indent: mm[1].length, ordered: /\d/.test(mm[2]), text: mm[3] })
        i++
      }
      const render = (from, indent) => {
        const tag = items[from].ordered ? 'ol' : 'ul'
        let s = `<${tag}>`
        let k = from
        while (k < items.length && items[k].indent >= indent) {
          if (items[k].indent > indent) {
            const [sub, next] = render(k, items[k].indent)
            s = s.replace(/<\/li>$/, sub + '</li>')
            k = next
            continue
          }
          s += `<li>${inline(items[k].text, pagePath)}</li>`
          k++
        }
        return [s + `</${tag}>`, k]
      }
      let k = 0
      while (k < items.length) {
        const [s, next] = render(k, items[k].indent)
        html.push(s)
        k = next
      }
    } else {
      // a paragraph: following lines that start no other block are its own lines
      const para = [line]
      i++
      while (i < lines.length && !isBlockStart(lines[i])) para.push(lines[i++])
      html.push(`<p>${para.map((l) => inline(l.trim(), pagePath)).join('<br>')}</p>`)
    }
  }
  return html.join('\n')
}

// ── the page ──

/** The ruma palette's [light, dark] pairs by their traditional-colour names (rumaTheme.ts `const c`). */
export function palette() {
  const src = readFileSync(join(ROOT, 'src/themes/ruma/rumaTheme.ts'), 'utf8')
  const out = {}
  for (const m of src.matchAll(/^\s*(\w+): \['(#[0-9a-f]{6})', '(#[0-9a-f]{6})'\]/gm)) out[m[1]] = [m[2], m[3]]
  for (const k of ['kinari', 'gofun', 'shironeri', 'kaihaku', 'sumi', 'rikyu', 'ai', 'shiraai', 'odo', 'torinoko'])
    if (!out[k]) throw new Error(`palette colour ${k} not found in rumaTheme.ts`)
  return out
}

function css(p) {
  const vars = (i) =>
    `--bg:${p.kinari[i]};--surface:${p.gofun[i]};--muted:${p.shironeri[i]};--line:${p.kaihaku[i]};--text:${p.sumi[i]};` +
    `--text2:${p.rikyu[i]};--accent:${p.ai[i]};--accent-tint:${p.shiraai[i]};--mark:${p.torinoko[i]};--mark-text:${p.odo[i]};`
  return [
    `:root{color-scheme:light dark;${vars(0)}}`,
    `@media (prefers-color-scheme:dark){:root{${vars(1)}}}`,
    '*{box-sizing:border-box}',
    'html{-webkit-text-size-adjust:100%;text-size-adjust:100%}',
    "body{margin:0;background:var(--bg);color:var(--text);font:500 16px/1.6 ui-rounded,'SF Pro Rounded',-apple-system,BlinkMacSystemFont,'Pretendard','Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',system-ui,sans-serif;word-break:keep-all;overflow-wrap:break-word}",
    '.wrap{max-width:680px;margin:0 auto;padding:calc(env(safe-area-inset-top) + 8px) calc(env(safe-area-inset-right) + 16px) calc(env(safe-area-inset-bottom) + 40px) calc(env(safe-area-inset-left) + 16px)}',
    '.site{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:52px;border-bottom:1px solid var(--line);margin-bottom:8px}',
    '.site a{color:var(--text2);text-decoration:none;font-size:14px;font-weight:700;min-height:44px;display:inline-flex;align-items:center}',
    '.site a.home{color:var(--text)}',
    '.alt{margin:-4px 0 16px;font-size:14px;font-weight:700}',
    'h1{font-size:24px;line-height:1.3;font-weight:700;margin:24px 0 8px}',
    'h2{font-size:20px;line-height:1.3;font-weight:700;margin:32px 0 8px}',
    'p,ul,ol{margin:0 0 12px}',
    'ul,ol{padding-left:22px}',
    'li{margin:4px 0}',
    'li>ul,li>ol{margin:4px 0 0}',
    'a{color:var(--accent);text-underline-offset:2px}',
    'strong{font-weight:700}',
    'code{font:14px ui-monospace,Menlo,monospace;background:var(--muted);border-radius:4px;padding:1px 4px;word-break:break-all}',
    'hr{border:0;border-top:1px solid var(--line);margin:24px 0}',
    '.table{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 0 16px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}',
    'table{border-collapse:collapse;font-size:14px;line-height:1.5;min-width:100%}',
    'th,td{text-align:left;vertical-align:top;padding:8px 12px;border-bottom:1px solid var(--line);min-width:7.5em}',
    'tr:last-child td{border-bottom:0}',
    'th{background:var(--muted);font-weight:700}',
    '.placeholder{background:var(--mark);color:var(--mark-text);border-radius:4px;padding:0 3px;font-weight:700;-webkit-box-decoration-break:clone;box-decoration-break:clone}',
    'footer{margin-top:40px;padding-top:12px;border-top:1px solid var(--line);font-size:14px;color:var(--text2)}',
  ].join('\n')
}

const TEXT = {
  ko: { home: 'JLPT 루마', footer: '이 페이지에서 <mark class="placeholder">[대괄호]</mark>로 표시된 곳은 아직 채워지지 않은 자리예요.' },
  en: { home: 'JLPT 루마', footer: 'Text marked <mark class="placeholder">[in brackets]</mark> has not been filled in yet.' },
}

/** One page's HTML. The policy text is inside <main class="doc">, which the iOS app shows in place. */
export function renderPage(page, md) {
  const body = markdownToHtml(publishedMarkdown(md, page.part1), page.path)
  const title = /<h1>(.*?)<\/h1>/.exec(body)?.[1].replace(/<[^>]+>/g, '') ?? 'JLPT 루마'
  const depth = page.path.split('/').filter(Boolean).length
  const app = '../'.repeat(depth)
  const p = palette()
  const t = TEXT[page.lang]
  const alt = page.alt ? `<a href="${relative(page.path, page.alt.path)}" lang="${page.alt.lang}" hreflang="${page.alt.lang}">${page.alt.label}</a>` : ''
  return `<!doctype html>
<!-- Generated by scripts/build-pages.mjs from ${page.source}. Do not edit: change the source and run npm run pages. -->
<html lang="${page.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="${p.kinari[0]}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${p.kinari[1]}" media="(prefers-color-scheme: dark)">
<title>${title}</title>
<style>
${css(p)}
</style>
</head>
<body>
<div class="wrap">
<header class="site"><a class="home" href="${app}">${t.home}</a></header>
<main class="doc">
${alt ? body.replace(/<\/h1>/, `</h1>\n<p class="alt">${alt}</p>`) : body}
</main>
${body.includes('class="placeholder"') ? `<footer>${t.footer}</footer>\n` : ''}</div>
</body>
</html>
`
}

/** Every page: its path under public/ and its HTML. */
export function buildPages() {
  return PAGES.map((page) => ({ file: `public/${page.path}index.html`, html: renderPage(page, readFileSync(join(ROOT, page.source), 'utf8')) }))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check')
  let stale = 0
  for (const { file, html } of buildPages()) {
    const abs = join(ROOT, file)
    let cur = null
    try {
      cur = readFileSync(abs, 'utf8')
    } catch {
      /* missing */
    }
    if (cur === html) continue
    if (check) {
      console.error(`${file} is out of date: run npm run pages`)
      stale++
    } else {
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, html)
      console.log(`wrote ${file}`)
    }
  }
  process.exit(stale ? 1 : 0)
}
