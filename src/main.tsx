import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Astryx (docs/design-system.md): reset → components → the ruma theme → the app's own styles, in that layer order
import '@astryxdesign/core/reset.css'
import '@astryxdesign/core/astryx.css'
import './themes/ruma/ruma.css'
import './styles.css'
import { Theme } from '@astryxdesign/core/theme'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { startPlatform } from './platform'
import { rumaTheme } from './themes/ruma/ruma'
import { useStore } from './store'

/** The one root Theme: it owns `data-theme` on <html> (system / light / dark from settings) and the reader's text size. */
function Root() {
  const mode = useStore((s) => s.settings.theme)
  return (
    <Theme theme={rumaTheme} mode={mode}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </Theme>
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
