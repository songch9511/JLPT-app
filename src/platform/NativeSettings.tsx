// Settings that exist only in the iOS app: review reminders, haptics, the Japanese voice.
import { useEffect, useState } from 'react'
import { speak } from '../util'
import { enableReminders, japaneseVoices, reminderPermission, setReminderPrefs, type Permission } from './native'
import './native.css'
import { setPrefs, usePrefs } from './prefs'

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']
const pad = (n: number) => String(n).padStart(2, '0')

export default function NativeSettings() {
  const p = usePrefs()
  const r = p.reminders
  const [perm, setPerm] = useState<Permission | null>(null)
  const [voices, setVoices] = useState<Awaited<ReturnType<typeof japaneseVoices>> | null>(null)
  useEffect(() => {
    void reminderPermission().then(setPerm)
    void japaneseVoices().then(setVoices)
  }, [])

  return (
    <section className="card form" aria-labelledby="native-title">
      <h3 id="native-title">알림 · 진동 · 발음</h3>
      <label className="switch">
        <span>
          복습 알림
          <small className="muted">
            복습할 단어가 돌아온 날에만 정한 시각에 하루 한 번, 그날의 개수를 알려 드려요. 그날 학습을 끝냈으면 알리지 않아요.
          </small>
        </span>
        <input
          type="checkbox"
          checked={r.enabled}
          onChange={async (e) => {
            if (e.target.checked) setPerm(await enableReminders())
            else setReminderPrefs({ enabled: false })
          }}
        />
      </label>
      {perm === 'denied' && (
        <p className="note" role="status">
          알림이 꺼져 있어요. iPhone의 설정 › 알림 › JLPT 루마에서 알림을 허용하면 받을 수 있어요.
        </p>
      )}
      {r.enabled && (
        <>
          <label htmlFor="remind-time">알림 시각</label>
          <input
            id="remind-time"
            type="time"
            value={`${pad(r.hour)}:${pad(r.minute)}`}
            onChange={(e) => {
              const [h, m] = e.target.value.split(':').map(Number)
              if (Number.isInteger(h) && Number.isInteger(m)) setReminderPrefs({ hour: h, minute: m })
            }}
          />
          <label>쉬는 요일</label>
          <div className="chips">
            {DAY_NAMES.map((name, i) => {
              const quiet = r.quietDays.includes(i)
              return (
                <button
                  key={i}
                  className={`chip-btn ${quiet ? 'on' : ''}`}
                  aria-pressed={quiet}
                  onClick={() => setReminderPrefs({ quietDays: quiet ? r.quietDays.filter((d) => d !== i) : [...r.quietDays, i] })}
                >
                  {name}
                </button>
              )
            })}
          </div>
          <p className="muted small">고른 요일에는 알림을 보내지 않아요.</p>
        </>
      )}

      <label className="switch">
        <span>
          답할 때 진동
          <small className="muted">답을 고를 때와 하루 분량을 끝냈을 때 가볍게 울려요. 동작 줄이기를 켜 두면 울리지 않아요.</small>
        </span>
        <input type="checkbox" checked={p.haptics} onChange={(e) => setPrefs({ haptics: e.target.checked })} />
      </label>

      <label htmlFor="voice">일본어 음성</label>
      {voices && voices.length === 0 ? (
        <p className="muted small">
          이 기기에서 일본어 음성을 찾지 못했어요. iPhone의 설정 › 손쉬운 사용 › 읽기 및 말하기 › 음성에서 일본어 음성을 내려받을 수 있어요.
        </p>
      ) : (
        <select id="voice" value={p.voiceURI ?? ''} onChange={(e) => setPrefs({ voiceURI: e.target.value || null })}>
          <option value="">기본 음성</option>
          {voices?.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name}
            </option>
          ))}
        </select>
      )}
      <button className="btn ghost" onClick={() => speak('おはようございます')}>
        들어 보기
      </button>
    </section>
  )
}
