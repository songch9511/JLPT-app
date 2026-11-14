// The app's public pages — privacy policy, support — shown inside the app (settings › 정보 in the iOS app).
//
// The pages are static files the app ships with: public/privacy/index.html, public/privacy/en/index.html and
// public/support/index.html, made by scripts/build-pages.mjs from docs/store/ (the one source). The web build serves
// them as pages of the site; the iOS app bundles the same files, and this screen shows the text of one (its
// `<main class="doc">`) in place, so it opens offline and the web view never navigates away from the app. The in-app
// Safari view (Browser plugin) cannot do this: it opens only http(s) addresses, which need the network, and
// `showTextSheet` in platform/native.ts shows plain text only.
import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { Button, IconButton, Skeleton } from '../components/ui'

/** Each page: its path under the app's base URL, the screen's title, the page's language, where "back" goes. */
export const DOCS = {
  privacy: { path: 'privacy/', title: '개인정보 처리방침', lang: 'ko', back: '#/settings' },
  'privacy-en': { path: 'privacy/en/', title: 'Privacy Policy', lang: 'en', back: '#/doc/privacy' },
  support: { path: 'support/', title: '도움말 · 문의', lang: 'ko', back: '#/settings' },
} as const
export type DocName = keyof typeof DOCS
export const isDoc = (s: string | undefined): s is DocName => !!s && Object.hasOwn(DOCS, s)

/** The page's address in this build (GitHub Pages: …/JLPT-app/privacy/; iOS app: capacitor://localhost/privacy/). */
const pageUrl = (d: DocName) => new URL(`${import.meta.env.BASE_URL}${DOCS[d].path}`, location.href)
/** The web address of a page, for the web build's links (a new browser window, beside the app). */
export const docHref = (d: DocName) => `${import.meta.env.BASE_URL}${DOCS[d].path}`

/** The page's text as HTML, its links between the pages turned into the app's own routes. */
async function load(d: DocName): Promise<string> {
  const r = await fetch(new URL('index.html', pageUrl(d)))
  if (!r.ok) throw new Error(String(r.status))
  const page = new DOMParser().parseFromString(await r.text(), 'text/html')
  const main = page.querySelector('main.doc')
  if (!main) throw new Error('not a page')
  // the screen's header has the title
  main.querySelector('h1')?.remove()
  for (const a of main.querySelectorAll('a[href]')) {
    // web pages outside the app (target=_blank) open beside it: in the iOS app, platform/native.ts sends them to the
    // in-app Safari view
    if (a.getAttribute('target') === '_blank') continue
    const to = new URL(a.getAttribute('href')!, pageUrl(d)).href
    const name = (Object.keys(DOCS) as DocName[]).find((k) => pageUrl(k).href === to)
    a.setAttribute('href', name ? `#/doc/${name}` : '#/settings')
  }
  return main.innerHTML
}

export function Doc({ name }: { name: DocName }) {
  const doc = DOCS[name]
  const [res, setRes] = useState<{ name: DocName; html: string | null }>({ name, html: null })
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    setFailed(false)
    load(name).then(
      (html) => live && setRes({ name, html }),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [name, attempt])
  const html = res.name === name ? res.html : null

  return (
    <>
      <header className="top">
        <IconButton label="뒤로" href={doc.back} icon={<Icon name="back" />} />
        <h1 className="grow" lang={doc.lang}>
          {doc.title}
        </h1>
      </header>
      {failed ? (
        <div className="load-error" role="alert">
          <p>페이지를 열지 못했어요.</p>
          <Button label="다시 시도" onClick={() => setAttempt((n) => n + 1)} />
        </div>
      ) : html === null ? (
        <div className="doc-loading" aria-busy="true" aria-label="불러오는 중">
          <Skeleton width={240} height={20} />
          <Skeleton width={300} height={20} />
        </div>
      ) : (
        // the app's own bundled file (same origin, generated from docs/store/ by scripts/build-pages.mjs), not user input
        <article className="doc" lang={doc.lang} dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </>
  )
}
