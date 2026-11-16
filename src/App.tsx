import { useCallback, useEffect, useRef, useState } from 'react'
import { shouldNudge, useMeta } from './backup'
import { Icon, type IconName } from './components/Icon'
import { SaveWarning } from './components/Notices'
import { useLevels, type Level } from './data'
import { Doc, isDoc, type DocName } from './screens/Doc'
import { Home } from './screens/Home'
import { Intro } from './screens/Intro'
import { Chapter, KanjiLevel, LevelScreen } from './screens/Level'
import { Practice, type PracticeSet } from './screens/Practice'
import { Settings } from './screens/Settings'
import { Stats } from './screens/Stats'
import { Study } from './screens/Study'
import { Marks, Search, Weak, Words, type Kind } from './screens/Words'
import { chapterCount } from './data'
import { studyLevels, type StudyMode } from './srs'
import { getLoadError, useStore } from './store'

type Route =
  | { name: 'home' | 'stats' | 'settings' | 'intro' }
  // `#/study/review`, `#/study/new` and `#/study/kanji` are Home's three sessions; plain `#/study` is the whole day in
  // one queue (the reminder notification, the widget and older links open it)
  | { name: 'study'; mode: StudyMode }
  | { name: 'practice'; set: PracticeSet }
  | { name: 'words' | 'search' | 'marks' | 'weak'; kind: Kind }
  | { name: 'level'; level: Level }
  | { name: 'chapter'; level: Level; n: number }
  | { name: 'kanji'; level: Level }
  | { name: 'doc'; doc: DocName }

const LEVEL = /^[1-5]$/
const lv = (x: string) => Number(x) as Level

function parse(hash: string): Route {
  const [, a, b, c, d] = hash.split('/')
  if (a === 'level' && LEVEL.test(b ?? '')) {
    const n = Number(c)
    if (c !== undefined && Number.isInteger(n) && n >= 1 && n <= chapterCount(lv(b))) return { name: 'chapter', level: lv(b), n }
    return { name: 'level', level: lv(b) }
  }
  if (a === 'kanji' && LEVEL.test(b ?? '')) return { name: 'kanji', level: lv(b) }
  if (a === 'doc' && isDoc(b)) return { name: 'doc', doc: b }
  if (a === 'words' || a === 'search' || a === 'marks' || a === 'weak') return { name: a, kind: b === 'kanji' ? 'kanji' : 'word' }
  if (a === 'study') return { name: 'study', mode: b === 'review' || b === 'new' || b === 'kanji' ? b : 'all' }
  if (a === 'practice') {
    if (b === 'weak') return { name: 'practice', set: { kind: 'weak' } }
    if (b === 'weak-kanji') return { name: 'practice', set: { kind: 'weak-kanji' } }
    if (b === 'chapter' && LEVEL.test(c ?? '') && Number(d) >= 1 && Number(d) <= chapterCount(lv(c))) return { name: 'practice', set: { kind: 'chapter', level: lv(c), n: Number(d) } }
  }
  if (a === 'stats' || a === 'settings' || a === 'intro') return { name: a }
  return { name: 'home' }
}

export const go = (path: string) => {
  location.hash = path
}

/** The browser's own chrome (Safari's status bar and toolbar tint, the PWA title bar) follows the page's ground. */
function syncThemeColor() {
  const bg = getComputedStyle(document.body).backgroundColor
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
}

/**
 * The tab bar's height as `--tabbar-h` (it grows with the reader's text size), so pages keep clear of it. The bar is
 * not there on the study screen: it is measured again each time it comes back (a ref callback), and a bar that has
 * left the page is never measured.
 */
function useTabbarHeight() {
  const observer = useRef<ResizeObserver | null>(null)
  return useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!el) return
    const set = () => {
      const h = Math.ceil(el.getBoundingClientRect().height)
      if (h > 0) document.documentElement.style.setProperty('--tabbar-h', `${h}px`)
    }
    set()
    if (typeof ResizeObserver === 'undefined') return
    observer.current = new ResizeObserver(set)
    observer.current.observe(el)
  }, [])
}

const TABS: { path: string; name: 'home' | 'words' | 'stats' | 'settings'; label: string; icon: IconName }[] = [
  { path: '/', name: 'home', label: '홈', icon: 'home' },
  { path: '/words', name: 'words', label: '단어장', icon: 'book' },
  { path: '/stats', name: 'stats', label: '기록', icon: 'chart' },
  { path: '/settings', name: 'settings', label: '설정', icon: 'gear' },
]

export default function App() {
  // a saved state this version could not migrate: the recovery screen (export, reload), never a fresh start
  const loadError = getLoadError()
  if (loadError) throw loadError
  const [route, setRoute] = useState(() => parse(location.hash))
  const onboarded = useStore((s) => s.onboarded)
  const theme = useStore((s) => s.settings.theme)
  const target = useStore((s) => s.settings.target)
  const includeLower = useStore((s) => s.settings.includeLower)
  // the studied levels' data in the background: today's new words follow its order. Also
  // before the first-run question is answered: Home shows the default level's counts as soon as one is chosen.
  useLevels(studyLevels({ target, includeLower }))

  useEffect(() => {
    const on = () => {
      setRoute(parse(location.hash))
      window.scrollTo(0, 0)
    }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])

  // Root in main.tsx sets data-theme; the browser chrome (status bar, PWA title bar) follows the ground colour
  useEffect(syncThemeColor, [theme])
  const tabbar = useTabbarHeight()
  // the backup reminder lives in 설정 (screens/Settings.tsx); while it is due, a small dot on the 설정 tab
  const meta = useMeta()
  const nudge = useStore((s) => shouldNudge(s, meta, new Date()))

  // Until the first run is through there is nothing to study, so the study routes show Home (which asks the level).
  if ((route.name === 'study' || route.name === 'practice') && onboarded)
    return (
      <>
        <SaveWarning />
        {/* a session is one opening of the study screen in one mode: another mode is another session */}
        {route.name === 'study' ? <Study key={route.mode} mode={route.mode} /> : <Practice key={JSON.stringify(route.set)} set={route.set} />}
      </>
    )
  // the intro pages again (설정 › 처음 안내 다시 보기): a page of their own, without the tab bar
  if (route.name === 'intro' && onboarded)
    return (
      <div className="app">
        <main className="page first-page">
          <Intro again />
        </main>
      </div>
    )

  const tab: (typeof TABS)[number]['name'] =
    route.name === 'doc' ? 'settings' : route.name === 'stats' || route.name === 'settings' ? route.name : route.name === 'home' || route.name === 'study' || route.name === 'practice' || route.name === 'intro' ? 'home' : 'words'
  const firstRun = !onboarded && tab === 'home'
  return (
    <div className="app">
      <SaveWarning />
      <main className={`page ${tab === 'home' ? 'home' : ''} ${firstRun ? 'first-page' : ''}`}>
        {tab === 'home' && <Home />}
        {route.name === 'words' && <Words kind={route.kind} />}
        {route.name === 'search' && <Search key={route.kind} kind={route.kind} />}
        {route.name === 'marks' && <Marks kind={route.kind} />}
        {route.name === 'weak' && <Weak kind={route.kind} />}
        {route.name === 'level' && <LevelScreen level={route.level} />}
        {route.name === 'chapter' && <Chapter level={route.level} n={route.n} />}
        {route.name === 'kanji' && <KanjiLevel level={route.level} />}
        {route.name === 'stats' && <Stats />}
        {route.name === 'settings' && <Settings />}
        {route.name === 'doc' && <Doc name={route.doc} />}
      </main>
      {!firstRun && (
      <nav className="tabbar" ref={tabbar} aria-label="탭">
        {TABS.map((t) => (
          <a
            key={t.name}
            href={`#${t.path}`}
            className={tab === t.name ? 'on' : ''}
            aria-current={tab === t.name ? 'page' : undefined}
            aria-label={t.name === 'settings' && nudge ? `${t.label}, 백업 권유 있음` : undefined}
          >
            <span className="tab-icon">
              <Icon name={t.icon} size={24} strokeWidth={2.2} fill={tab === t.name} />
              {t.name === 'settings' && nudge && <i className="tab-dot" />}
            </span>
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
      )}
    </div>
  )
}
