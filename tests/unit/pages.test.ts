// The privacy policy and support pages (public/privacy, public/support) are generated from docs/store/ by
// scripts/build-pages.mjs, and the app's version has one source (package.json).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildPages, markdownToHtml, publishedMarkdown } from '../../scripts/build-pages.mjs'

const root = new URL('../../', import.meta.url)
const read = (p: string) => readFileSync(new URL(p, root), 'utf8')
const pages = buildPages() as { file: string; html: string }[]
const page = (file: string) => pages.find((p) => p.file === file)!.html
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&')

describe('public pages', () => {
  it('are up to date with their sources in docs/store (run npm run pages)', () => {
    expect(pages.map((p) => p.file)).toEqual(['public/privacy/index.html', 'public/privacy/en/index.html', 'public/support/index.html'])
    for (const p of pages) expect(read(p.file), p.file).toBe(p.html)
  })

  it('publish part 1 of the privacy policy only, without the editor notes', () => {
    for (const file of ['public/privacy/index.html', 'public/privacy/en/index.html']) {
      const t = text(page(file))
      // part 2: Ruma Plus, the server and its processors
      for (const s of ['2부', 'Part 2', '루마 플러스', 'Ruma Plus', 'RevenueCat', 'Cloudflare', 'Anthropic', '약한 단어 이야기', 'weak-word story', 'App Attest'])
        expect(t, `${file}: ${s}`).not.toContain(s)
      // the "before publishing" box
      for (const s of ['게시 전 확인할 것', 'Before publishing', 'privacy-labels.md', '(초안)', '(draft)']) expect(t, `${file}: ${s}`).not.toContain(s)
    }
    // and part 1 is all there: its last section
    expect(text(page('public/privacy/index.html'))).toContain('14. 처리방침의 변경')
    expect(text(page('public/privacy/en/index.html'))).toContain('14. Changes')
    // the cut is made at the part 2 heading of the source, which must exist
    const ko = read('docs/store/privacy-policy-ko.md')
    expect(ko).toMatch(/^## 2부\. /m)
    expect(publishedMarkdown(ko, true)).not.toMatch(/RevenueCat/)
  })

  it('keep the operator blanks visible and marked; invent no operator or contact', () => {
    const support = page('public/support/index.html')
    expect(support).toContain('<mark class="placeholder">[지원 이메일 주소]</mark>')
    expect(support).toContain('<mark class="placeholder">[운영자 실명 또는 상호]</mark>')
    expect(page('public/privacy/index.html')).toContain('<mark class="placeholder">[운영자 실명 또는 상호]</mark>')
    for (const p of pages) expect(p.html, p.file).not.toMatch(/mailto:|@[a-z0-9-]+\.[a-z]/i)
  })

  it('load nothing from elsewhere and link between themselves relatively (so they work in the iOS app)', () => {
    for (const p of pages) {
      expect(p.html, p.file).not.toMatch(/<script|<link|<img|@import|url\(/i)
      expect(p.html, p.file).not.toContain('https://songch9511.github.io/JLPT-app/privacy')
    }
    expect(page('public/support/index.html')).toContain('<a href="../privacy/">개인정보 처리방침</a>')
    expect(page('public/privacy/index.html')).toContain('<a href="en/" lang="en" hreflang="en">English</a>')
    // light and dark, from the ruma palette
    expect(page('public/privacy/index.html')).toMatch(/--bg:#fbfaf5;[\s\S]*prefers-color-scheme:dark\)\{:root\{--bg:#1b1a18;/)
  })

  it('render the Markdown the sources use', () => {
    expect(markdownToHtml('- a\n  - b\n- c', 'support/')).toBe('<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>')
    expect(markdownToHtml('1. **x** `y`', 'support/')).toBe('<ol><li><strong>x</strong> <code>y</code></li></ol>')
    expect(markdownToHtml('| a | b |\n| --- | --- |\n| [c] | <d> |', 'support/')).toBe(
      '<div class="table"><table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td><mark class="placeholder">[c]</mark></td><td>&lt;d&gt;</td></tr></tbody></table></div>',
    )
    expect(markdownToHtml('[EDRDG](https://www.edrdg.org/)', 'privacy/en/')).toBe('<p><a href="https://www.edrdg.org/" target="_blank" rel="noreferrer">EDRDG</a></p>')
    expect(markdownToHtml('[p](https://songch9511.github.io/JLPT-app/privacy/)', 'privacy/en/')).toBe('<p><a href="../../privacy/">p</a></p>')
    expect(markdownToHtml('시행일: [날짜]\n운영자: [이름]', 'privacy/')).toBe('<p>시행일: <mark class="placeholder">[날짜]</mark><br>운영자: <mark class="placeholder">[이름]</mark></p>')
  })
})

describe('app version', () => {
  const version = JSON.parse(read('package.json')).version as string

  it('is one number: package.json, the iOS marketing version, the TestFlight upload', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/)
    const pbx = read('ios/App/App.xcodeproj/project.pbxproj')
    const marketing = [...pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1])
    // the app and the widget, Debug and Release
    expect(marketing).toHaveLength(4)
    expect(new Set(marketing)).toEqual(new Set([version]))
    const workflow = read('.github/workflows/ios-testflight.yml')
    expect(workflow).toContain("require('./package.json').version")
    expect(workflow).not.toMatch(/inputs\.marketing_version/)
  })
})
