import { useEffect, useState } from 'react'
import { Icon, type IconName } from './components/Icon'
import { SaveWarning } from './components/Notices'
import { useLevels, type Level } from './data'
import { Home } from './screens/Home'
import { LevelScreen } from './screens/Level'
import { Onboarding } from './screens/Onboarding'
import { Settings } from './screens/Settings'
import { Stats } from './screens/Stats'
import { Study } from './screens/Study'
import { Words } from './screens/Words'
import { studyLevels } from './srs'
import { useStore } from './store'

type Route =
  | { name: 'home' | 'study' | 'stats' | 'settings' }
  | { name: 'words'; tab?: 'weak' }
  | { name: 'level'; level: Level }

function parse(hash: string): Route {
  const [, a, b] = hash.split('/')
  if (a === 'level' && ['1', '2', '3', '4', '5'].includes(b)) return { name: 'level', level: Number(b) as Level }
  if (a === 'words') return b === 'weak' ? { name: 'words', tab: 'weak' } : { name: 'words' }
  if (a === 'study' || a === 'stats' || a === 'settings') return { name: a }
  return { name: 'home' }
}

export const go = (path: string) => {
  location.hash = path
}

const TABS: { path: string; name: Route['name']; label: string; icon: IconName }[] = [
  { path: '/', name: 'home', label: '홈', icon: 'home' },
  { path: '/words', name: 'words', label: '단어장', icon: 'book' },
  { path: '/stats', name: 'stats', label: '기록', icon: 'chart' },
  { path: '/settings', name: 'settings', label: '설정', icon: 'gear' },
]

export default function App() {
  const [route, setRoute] = useState(() => parse(location.hash))
  const onboarded = useStore((s) => s.onboarded)
  const theme = useStore((s) => s.settings.theme)
  const target = useStore((s) => s.settings.target)
  const includeLower = useStore((s) => s.settings.includeLower)
  // the studied levels' data in the background: today's counts (new words, reading cards) follow its order
  useLevels(onboarded ? studyLevels({ target, includeLower }) : [])

  useEffect(() => {
    const on = () => {
      setRoute(parse(location.hash))
      window.scrollTo(0, 0)
    }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim()
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
  }, [theme])

  if (!onboarded)
    return (
      <>
        <SaveWarning />
        <Onboarding />
      </>
    )
  if (route.name === 'study')
    return (
      <>
        <SaveWarning />
        <Study />
      </>
    )

  // a level's word list belongs to the 단어장 tab, where the level rows are
  const tab = route.name === 'level' ? 'words' : route.name
  return (
    <div className="app">
      <SaveWarning />
      <main className="page">
        {route.name === 'home' && <Home />}
        {route.name === 'level' && <LevelScreen level={route.level} />}
        {route.name === 'words' && <Words key={route.tab ?? 'search'} initialTab={route.tab} />}
        {route.name === 'stats' && <Stats />}
        {route.name === 'settings' && <Settings />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <a key={t.name} href={`#${t.path}`} className={tab === t.name ? 'on' : ''} aria-current={tab === t.name ? 'page' : undefined}>
            <span className="tab-icon">
              <Icon name={t.icon} size={22} strokeWidth={tab === t.name ? 2.4 : 2} />
            </span>
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
    </div>
  )
}
