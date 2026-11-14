import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { shouldNudge, useMeta } from './backup'
import { Icon, type IconName } from './components/Icon'
import { SaveWarning } from './components/Notices'
import { useLevels, type Level } from './data'
import { Doc, isDoc, type DocName } from './screens/Doc'
import { Home } from './screens/Home'
import { LevelScreen } from './screens/Level'
import { Settings } from './screens/Settings'
import { Stats } from './screens/Stats'
import { Study } from './screens/Study'
import { Words } from './screens/Words'
import { studyLevels } from './srs'
import { getLoadError, useStore } from './store'

type Route =
  | { name: 'home' | 'study' | 'stats' | 'settings' }
  | { name: 'words'; tab?: 'weak' }
  | { name: 'level'; level: Level }
  | { name: 'doc'; doc: DocName }

function parse(hash: string): Route {
  const [, a, b] = hash.split('/')
  if (a === 'level' && ['1', '2', '3', '4', '5'].includes(b)) return { name: 'level', level: Number(b) as Level }
  if (a === 'doc' && isDoc(b)) return { name: 'doc', doc: b }
  if (a === 'words') return b === 'weak' ? { name: 'words', tab: 'weak' } : { name: 'words' }
  if (a === 'study' || a === 'stats' || a === 'settings') return { name: a }
  return { name: 'home' }
}

export const go = (path: string) => {
  location.hash = path
}

/**
 * The browser's own chrome (Safari's status bar and toolbar tint, the PWA title bar) follows the page's ground: the
 * body colour, which is Ruma's sky on Home (styles.css `:root[data-sky] body`).
 */
export function syncThemeColor() {
  const bg = getComputedStyle(document.body).backgroundColor
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
}

/** The tab bar's height as `--tabbar-h` (it grows with the reader's text size), so pages keep clear of it. */
function useTabbarHeight() {
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const set = () => document.documentElement.style.setProperty('--tabbar-h', `${Math.ceil(el.getBoundingClientRect().height)}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return ref
}

const TABS: { path: string; name: Route['name']; label: string; icon: IconName }[] = [
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
  // the studied levels' data in the background: today's counts (new words, reading cards) follow its order. Also
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

  // There is no onboarding page: a new learner starts on Home, where Ruma asks the level
  // (screens/HomeGuide.tsx). Until it is answered there is nothing to study, so the study route shows Home.
  if (route.name === 'study' && onboarded)
    return (
      <>
        <SaveWarning />
        <Study />
      </>
    )

  // a level's word list belongs to the 단어장 tab, where the level rows are; the privacy and support pages to 설정
  const tab = route.name === 'level' ? 'words' : route.name === 'doc' ? 'settings' : route.name === 'study' ? 'home' : route.name
  return (
    <div className={`app ${tab === 'home' ? 'at-home' : ''}`}>
      <SaveWarning />
      <main className={`page ${tab === 'home' ? 'home' : ''}`}>
        {(route.name === 'home' || route.name === 'study') && <Home />}
        {route.name === 'level' && <LevelScreen level={route.level} />}
        {route.name === 'words' && <Words key={route.tab ?? 'search'} initialTab={route.tab} />}
        {route.name === 'stats' && <Stats />}
        {route.name === 'settings' && <Settings />}
        {route.name === 'doc' && <Doc name={route.doc} />}
      </main>
      <nav className="tabbar" ref={tabbar}>
        {TABS.map((t) => (
          <a
            key={t.name}
            href={`#${t.path}`}
            className={tab === t.name ? 'on' : ''}
            aria-current={tab === t.name ? 'page' : undefined}
            aria-label={t.name === 'settings' && nudge ? `${t.label}, 백업 권유 있음` : undefined}
          >
            <span className="tab-icon">
              <Icon name={t.icon} size={22} strokeWidth={tab === t.name ? 2.4 : 2} />
              {t.name === 'settings' && nudge && <i className="tab-dot" />}
            </span>
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
    </div>
  )
}
