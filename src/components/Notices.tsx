import { exportBackup, shouldNudge, snoozeNudge, useMeta } from '../backup'
import { dismissSaveWarning, useSaveStatus, useStore } from '../store'
import { Icon } from './Icon'

/** Shown when the last save did not reach storage; stays hidden after closing until a save works again. */
export function SaveWarning() {
  const st = useSaveStatus()
  if (!st.failed || st.dismissed) return null
  return (
    <div className="save-warning" role="alert">
      <p>
        <b>기록을 이 기기에 저장하지 못했어요.</b> 저장 공간이 부족하거나 브라우저가 막고 있어요. 앱을 닫기 전에 백업을 내보내
        두세요.
      </p>
      <div className="save-warning-actions">
        <button className="btn ghost" onClick={exportBackup}>
          백업 내보내기
        </button>
        <button className="icon-btn" onClick={dismissSaveWarning} aria-label="경고 닫기">
          <Icon name="close" size={20} />
        </button>
      </div>
    </div>
  )
}

/** One quiet line asking for a backup when there is real progress and no recent export. */
export function BackupNudge({ today }: { today: Date }) {
  const meta = useMeta()
  const s = useStore((x) => x)
  if (!shouldNudge(s, meta, today)) return null
  return (
    <p className="nudge">
      <span className="grow">
        {meta.lastExport ? '마지막 백업이 일주일 넘게 지났어요.' : '기록은 이 기기에만 있어요. 백업해 두세요.'}
      </span>
      <button className="link" onClick={exportBackup}>
        백업하기
      </button>
      <button className="icon-btn sm" onClick={() => snoozeNudge(today)} aria-label="백업 알림 닫기">
        <Icon name="close" size={16} />
      </button>
    </p>
  )
}
