import { useRef } from 'react'
import { LEVELS } from '../data'
import { getState, replaceState, resetAll, update, useStore, type State } from '../store'
import { dayKey, formatDay, upcomingExams } from '../util'

export function Settings() {
  const st = useStore((s) => s.settings)
  const file = useRef<HTMLInputElement>(null)
  const exams = upcomingExams(new Date(), 4)
  const set = (patch: Partial<State['settings']>) => update((d) => void Object.assign(d.settings, patch))

  const exportData = () => {
    const { settings, ...rest } = getState()
    // The API key stays on this device.
    const blob = new Blob([JSON.stringify({ ...rest, settings: { ...settings, apiKey: '' } })], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `jlpt-ruma-backup-${dayKey()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importData = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as State
      if (data.v !== 2 || !data.cards || !data.settings) throw new Error()
      if (!confirm('지금 기록을 백업 파일의 내용으로 바꿀까요?')) return
      replaceState({ ...data, settings: { ...data.settings, apiKey: st.apiKey } })
    } catch {
      alert('JLPT 루마 백업 파일이 아니에요.')
    }
  }

  return (
    <>
      <header className="top">
        <h1>설정</h1>
      </header>

      <section className="card form">
        <h3>학습 목표</h3>
        <label>목표 급수</label>
        <div className="seg">
          {LEVELS.map((l) => (
            <button key={l} className={st.target === l ? 'on' : ''} onClick={() => set({ target: l })}>
              N{l}
            </button>
          ))}
        </div>
        <label>하루 새 단어</label>
        <div className="seg">
          {[5, 10, 20, 30, 50].map((n) => (
            <button key={n} className={st.dailyNew === n ? 'on' : ''} onClick={() => set({ dailyNew: n })}>
              {n}
            </button>
          ))}
        </div>
        <p className="muted small">
          지금 {st.dailyNew}개. 새 단어가 많을수록 며칠 뒤 복습도 늘어나요. 복습이 부담되면 줄이세요.
        </p>
        <label htmlFor="exam">시험일</label>
        <div className="chips">
          {exams.map((d) => (
            <button key={d} className={`chip-btn ${st.examDate === d ? 'on' : ''}`} onClick={() => set({ examDate: d })}>
              {formatDay(d)}
            </button>
          ))}
        </div>
        <input id="exam" type="date" value={st.examDate} onChange={(e) => e.target.value && set({ examDate: e.target.value })} />
      </section>

      <section className="card form">
        <h3>화면 · 소리</h3>
        <label>테마</label>
        <div className="seg">
          {(
            [
              ['system', '시스템'],
              ['light', '라이트'],
              ['dark', '다크'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} className={st.theme === k ? 'on' : ''} onClick={() => set({ theme: k })}>
              {label}
            </button>
          ))}
        </div>
        <label className="switch">
          <span>카드가 나올 때 발음 자동 재생</span>
          <input type="checkbox" checked={st.autoSpeak} onChange={(e) => set({ autoSpeak: e.target.checked })} />
        </label>
      </section>

      <section className="card form">
        <h3>AI</h3>
        <label htmlFor="key">Anthropic API 키</label>
        <input
          id="key"
          type="password"
          value={st.apiKey}
          onChange={(e) => set({ apiKey: e.target.value })}
          placeholder="sk-ant-…"
          autoComplete="off"
        />
        <p className="muted small">
          예문 · 한자 풀이 · 암기 팁과 약한 단어 이야기에 쓰여요. 키는 이 기기에만 저장되고, 요청은 이 브라우저에서
          Anthropic API로 바로 보내요. 한 번 받은 단어 설명은 저장해 두고 다시 요청하지 않아요.
        </p>
      </section>

      <section className="card form">
        <h3>데이터</h3>
        <p className="muted small">학습 기록은 이 기기의 브라우저에만 저장돼요. 기기를 바꾸기 전에 백업해 두세요.</p>
        <div className="row">
          <button className="btn ghost" onClick={exportData}>
            백업 내보내기
          </button>
          <button className="btn ghost" onClick={() => file.current?.click()}>
            백업 가져오기
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importData(f)
              e.target.value = ''
            }}
          />
        </div>
        <button
          className="btn danger"
          onClick={() => confirm('모든 학습 기록과 설정을 지울까요? 되돌릴 수 없어요.') && resetAll()}
        >
          모든 기록 초기화
        </button>
      </section>

      <p className="muted small center">
        복습 간격: FSRS (ts-fsrs, MIT) · 단어 목록: open-anki-jlpt-decks (MIT, tanos.co.uk 기반)
        <br />
        한국어 뜻은 N5 · N4 제공
      </p>
    </>
  )
}
