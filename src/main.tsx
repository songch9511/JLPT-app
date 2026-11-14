import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
// docs/design-system.md: reset → Astryx's token defaults → the ruma theme → the app's own styles, in that layer order.
// The styles of the Astryx overlays (dialogs, sheets) load with them, lazily (src/components/overlays.tsx).
import '@astryxdesign/core/reset.css'
import './themes/ruma/astryx-tokens.css'
import './themes/ruma/ruma.css'
import './styles.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { preloadOverlays } from './components/ui'
import { startPlatform } from './platform'
import { useStore } from './store'
import { syncTextSize, useThemeMode } from './themeRoot'

/**
 * The launch screen (index.html #launch) goes as soon as the first screen is drawn: no minimum time, a short fade
 * (none with reduced motion). It never takes taps (pointer-events: none), so nothing waits for it.
 */
function hideLaunch() {
  const el = document.getElementById('launch')
  if (!el) return
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return el.remove()
  requestAnimationFrame(() => {
    el.classList.add('out')
    setTimeout(() => el.remove(), 300)
  })
}

/** The root: `data-theme` on <html> (system / light / dark from settings) and the reader's text size. */
function Root() {
  useThemeMode(useStore((s) => s.settings.theme))
  useEffect(() => syncTextSize(), [])
  useEffect(hideLaunch, [])
  // the dialogs and sheets are a separate chunk, kept out of the first load; fetch it once the app is idle, so the
  // first sheet opens as quickly as later ones (measured at 4× CPU throttle: ~540 ms cold vs ~120 ms loaded)
  useEffect(() => {
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(preloadOverlays, { timeout: 4000 })
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(preloadOverlays, 2000)
    return () => clearTimeout(id)
  }, [])
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}

const render = () =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  )

// The iOS app first restores its durable copy of the study state (src/platform/durable.ts); the web renders at once.
if (import.meta.env.MODE === 'native') void startPlatform().finally(render)
else render()
