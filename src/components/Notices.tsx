import { exportBackup, shouldNudge, snoozeNudge, useMeta } from '../backup'
import { platform } from '../platform'
import { dismissSaveWarning, useSaveStatus, useStore } from '../store'
import { Icon } from './Icon'
import { Banner, Button, IconButton } from './ui'

/** Shown when the last save did not reach storage; stays hidden after closing until a save works again. */
export function SaveWarning() {
  const st = useSaveStatus()
  if (!st.failed || st.dismissed) return null
  return (
    <div className="save-warning" role="alert">
      <Banner
        status="error"
        title="기록을 이 기기에 저장하지 못했어요."
        description={`${platform.native ? '기기의 저장 공간이 부족한 것 같아요.' : '저장 공간이 부족하거나 브라우저가 막고 있어요.'} 앱을 닫기 전에 백업을 내보내 두세요.`}
        dismissLabel="경고 닫기"
        onDismiss={dismissSaveWarning}
        action={<Button label="백업 내보내기" onClick={exportBackup} />}
      />
    </div>
  )
}

/** One quiet line asking for a backup when there is real progress and no recent export. */
export function BackupNudge({ today }: { today: Date }) {
  const meta = useMeta()
  const s = useStore((x) => x)
  if (!shouldNudge(s, meta, today)) return null
  return (
    <div className="nudge" role="note">
      <p className="grow">{meta.lastExport ? '마지막 백업이 일주일 넘게 지났어요.' : '기록은 이 기기에만 있어요. 백업해 두세요.'}</p>
      <Button label="백업하기" variant="ghost" className="text-action" onClick={exportBackup} />
      <IconButton label="백업 알림 닫기" icon={<Icon name="close" size={16} />} onClick={() => snoozeNudge(today)} />
    </div>
  )
}
