import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { startPlatform } from './platform'
import './styles.css'

const render = () =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )

// The iOS app first restores its durable copy of the study state (src/platform/durable.ts); the web renders at once.
if (import.meta.env.MODE === 'native') void startPlatform().finally(render)
else render()
