import { Component, useState, type ReactNode } from 'react'
import { exportRaw } from '../backup'
import { platform } from '../platform'
import { LEGACY_KEY, STATE_KEY } from '../store'
import { Button } from './ui'

/**
 * The recovery screen. It reads and clears storage directly instead of going through the store,
 * because the stored state may be the thing that is broken.
 */
function Recovery({ error }: { error: Error }) {
  const [confirming, setConfirming] = useState(false)
  const raw = () => {
    try {
      // the copy from before stable ids when no migrated state was stored (e.g. the migration itself failed)
      return localStorage.getItem(STATE_KEY) ?? localStorage.getItem(LEGACY_KEY)
    } catch {
      return null
    }
  }
  return (
    <div className="recovery" role="alert">
      <h1>화면을 열지 못했어요</h1>
      <p>학습 기록은 이 기기에 그대로 있어요. 먼저 다시 불러와 보세요.</p>
      <p className="hint">이 화면이 계속 나오면 백업을 내보내 두세요.</p>
      <div className="recovery-actions">
        <Button label="다시 불러오기" variant="primary" size="lg" width="100%" onClick={() => location.reload()} />
        <Button label="백업 내보내기" size="lg" width="100%" onClick={() => exportRaw(raw())} />
      </div>

      <section className="recovery-danger" aria-labelledby="recovery-reset">
        <h2 id="recovery-reset">그래도 안 되면</h2>
        {confirming ? (
          <>
            <p className="small">
              이 기기의 학습 기록과 설정을 모두 지워요. <b>되돌릴 수 없어요.</b> 백업을 먼저 내보내 두세요.
            </p>
            <div className="row">
              <Button label="취소" onClick={() => setConfirming(false)} />
              <Button
                label="모두 지우기"
                variant="destructive"
                onClick={async () => {
                  // the iOS app's durable copy would otherwise bring the same state back at the next launch
                  await platform.clearDeviceData().catch(() => {})
                  try {
                    localStorage.removeItem(STATE_KEY)
                    localStorage.removeItem(LEGACY_KEY)
                  } catch {
                    /* nothing more we can do */
                  }
                  location.replace(location.pathname)
                }}
              />
            </div>
          </>
        ) : (
          <Button label="모든 기록 초기화" variant="destructive" onClick={() => setConfirming(true)} />
        )}
      </section>

      <details className="hint">
        <summary>오류 내용</summary>
        <code>{String(error?.message || error)}</code>
      </details>
    </div>
  )
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    return this.state.error ? <Recovery error={this.state.error} /> : this.props.children
  }
}
