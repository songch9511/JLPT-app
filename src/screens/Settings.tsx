import { lazy, Suspense, useRef, useState } from 'react'
import { exportBackup, readBackup, useMeta } from '../backup'
import { APP_VERSION, TITLE, UNOFFICIAL_NOTICE } from '../brand'
import { Banner, Button, Choice, ConfirmDialog, Field, Group, MessageDialog, RowLink, Switch } from '../components/ui'
import { BackupNudge } from '../components/Notices'
import { LEVELS } from '../data'
import { replayTips } from '../guide'
import { canUndoImport, importState, MAX_DAILY_NEW, orphanCount, resetAll, undoImport, update, useStore, type State } from '../store'
import { platform } from '../platform'
import { docHref, type DocName } from './Doc'
import { formatDay } from '../util'

// reminders, haptics and voice: only in the iOS app (not even in the web bundle, see src/platform/index.ts)
const NativeSettings = import.meta.env.MODE === 'native' ? lazy(() => import('../platform/NativeSettings')) : null

/**
 * The privacy policy and support pages (App Review 5.1.1(i)): on the web the site's own pages in a new window; in the
 * iOS app the same files from the app bundle, shown in place (screens/Doc.tsx) so they open offline.
 */
function DocLink({ doc, label }: { doc: DocName; label: string }) {
  return platform.native ? <RowLink href={`#/doc/${doc}`} label={label} /> : <RowLink href={docHref(doc)} label={label} newWindow />
}

export function Settings() {
  const st = useStore((s) => s.settings)
  const meta = useMeta()
  const orphans = useStore(orphanCount)
  const file = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<State['settings']>) => update((d) => void Object.assign(d.settings, patch))
  /** in-app dialogs instead of the browser's confirm()/alert() (05 batch 4) */
  const [confirmReset, setConfirmReset] = useState(false)
  const [pending, setPending] = useState<State | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const onboarded = useStore((s) => s.onboarded)
  const [replayed, setReplayed] = useState(false)

  const importData = async (f: File) => importText(await f.text())
  const importText = (text: string) => {
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
    const read = readBackup(data)
    if (!read.ok) {
      setProblem(
        read.reason === 'newer'
          ? platform.native
            ? '새 버전의 앱에서 만든 백업이에요. 앱을 업데이트한 뒤 가져와 주세요.'
            : '새 버전의 앱에서 만든 백업이에요. 앱을 새로고침한 뒤 가져와 주세요.'
          : 'JLPT 루마 백업 파일이 아니에요.',
      )
      return
    }
    setPending(read.state)
  }

  return (
    <>
      <header className="top">
        <h1>설정</h1>
      </header>

      {/* groups on the ground: a heading, then rows divided by hairlines (docs/design-system.md §4 "표면") */}
      <Group title="학습 계획" id="learn-title">
        <Field label="목표 급수">
          <Choice label="목표 급수" value={st.target} options={LEVELS.map((l) => [l, `N${l}`])} onChange={(target) => set({ target })} />
        </Field>
        {st.target < 5 && (
          <Switch
            label={`아래 급수 단어도 함께 (N${LEVELS.filter((l) => l > st.target).join('·N')})`}
            description="켜면 새 단어가 쉬운 급수부터 나와요."
            value={st.includeLower}
            onChange={(includeLower) => set({ includeLower })}
          />
        )}
        <Field label="하루 새 단어" description="새 단어가 많을수록 며칠 뒤 복습이 늘어나요.">
          <Choice label="하루 새 단어" value={st.dailyNew} options={[5, 10, 20, 30, MAX_DAILY_NEW].map((n) => [n, String(n)])} onChange={(dailyNew) => set({ dailyNew })} />
        </Field>
      </Group>

      <Group title="학습 방식" id="method-title">
        <Switch
          label="한자어 빠른 통과"
          description="뜻 같은 한자어(産業 = 산업)는 읽기만 물어요. 끄면 모든 단어를 뜻 카드로 배워요."
          value={st.fastTrack}
          onChange={(fastTrack) => set({ fastTrack })}
        />
        {onboarded && (
          <p className="replay-tips" role="status">
            {replayed ? (
              // the same inset as the text button it replaces, so the line does not jump left
              <span className="replay-done">루마의 안내를 다시 켰어요.</span>
            ) : (
              <Button
                label="루마의 안내 다시 보기"
                variant="ghost"
                className="text-action"
                onClick={() => {
                  replayTips()
                  setReplayed(true)
                }}
              />
            )}
          </p>
        )}
      </Group>

      <Group title="화면 · 소리" id="display-title">
        <Field label="테마">
          <Choice
            label="테마"
            value={st.theme}
            options={[
              ['system', '시스템'],
              ['light', '라이트'],
              ['dark', '다크'],
            ]}
            onChange={(theme) => set({ theme })}
          />
        </Field>
        <Switch
          label="발음 자동 재생"
          value={st.autoSpeak}
          onChange={(autoSpeak) => set({ autoSpeak })}
        />
      </Group>

      {NativeSettings && platform.native && (
        <Suspense fallback={null}>
          <NativeSettings />
        </Suspense>
      )}

      <Group title="데이터" id="data-title">
        <div className="data-facts">
          <p className="last-backup">{meta.lastExport ? `마지막 백업 ${formatDay(meta.lastExport)}` : '백업한 적이 없어요.'}</p>
          <p className="field-desc">
            {platform.native
              ? '학습 기록은 이 기기에만 저장돼요. 기기를 바꾸기 전에 백업해 두세요.'
              : '학습 기록은 이 브라우저에만 저장돼요. 기기를 바꾸기 전에 백업해 두세요.'}
          </p>
          {orphans > 0 && (
            // records whose words this version does not know (store.ts `orphans`): kept, exported, never shown
            <p className="field-desc orphans-note">이 버전에 없는 단어의 기록 {orphans.toLocaleString()}개도 보관하고 백업에 담아요.</p>
          )}
          {/* the backup reminder, moved off Home (the 설정 tab carries a dot while it is due, App.tsx) */}
          <BackupNudge today={new Date()} />
        </div>
        {canUndoImport() && (
          <div role="status">
            <Banner
              status="success"
              title="백업 파일의 기록으로 바꿨어요."
              action={<Button label="가져오기 되돌리기" variant="ghost" className="text-action" onClick={() => undoImport()} />}
            />
          </div>
        )}
        <div className="row data-actions">
          <Button label="백업 내보내기" onClick={exportBackup} />
          <Button
            label="백업 가져오기"
            onClick={() => (platform.pickFile ? void platform.pickFile().then((t) => t !== null && importText(t)) : file.current?.click())}
          />
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
        <div className="data-reset">
          <Button label="모든 기록 초기화" variant="destructive" onClick={() => setConfirmReset(true)} />
        </div>
      </Group>

      <Group title="정보" id="about-title" className="about">
        <p className="about-app">
          <b>{TITLE}</b> <span className="field-desc">버전 {APP_VERSION}</span>
        </p>
        <nav className="about-links" aria-label="개인정보 처리방침과 도움말">
          <DocLink doc="privacy" label="개인정보 처리방침" />
          <DocLink doc="support" label="도움말 · 문의" />
        </nav>
        <div className="about-notes">
        <p className="unofficial">{UNOFFICIAL_NOTICE}</p>
        <ul className="credits">
          <li>단어 목록: open-anki-jlpt-decks (MIT, tanos.co.uk 기반). JLPT는 공식 어휘 목록을 공개하지 않아 비공식 목록이에요.</li>
          <li>한국어 뜻은 기계 번역이라 틀린 곳이 있을 수 있어요.</li>
          <li>복습 간격: FSRS (ts-fsrs, MIT)</li>
          <li>
            디자인 시스템:{' '}
            <a href="https://github.com/meta/astryx" target="_blank" rel="noreferrer">
              Astryx
            </a>{' '}
            (Meta, MIT) · 아이콘: Lucide (ISC)
          </li>
          <li>
            단어 빈도·소개 순서:{' '}
            <a href="https://github.com/rspeer/wordfreq" target="_blank" rel="noreferrer">
              wordfreq
            </a>{' '}
            (Robyn Speer, CC BY-SA 4.0. OpenSubtitles 2018, Wikipedia 등의 자료 포함)
          </li>
          <li>
            사전 데이터:{' '}
            <a href="https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project" target="_blank" rel="noreferrer">
              JMdict
            </a>
            ·
            <a href="https://www.edrdg.org/wiki/index.php/KANJIDIC_Project" target="_blank" rel="noreferrer">
              KANJIDIC2
            </a>{' '}
            © Electronic Dictionary Research and Development Group (
            <a href="https://www.edrdg.org/edrdg/licence.html" target="_blank" rel="noreferrer">
              CC BY-SA
            </a>
            )
          </li>
          <li>
            한국 한자음:{' '}
            <a href="https://www.unicode.org/reports/tr38/" target="_blank" rel="noreferrer">
              Unicode Unihan
            </a>{' '}
            (Unicode License v3)
          </li>
          <li>
            이 자료로 만든 단어 빈도·순서·유형 데이터는{' '}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.ko" target="_blank" rel="noreferrer">
              CC BY-SA 4.0
            </a>
            으로 배포해요(
            <a href={`${import.meta.env.BASE_URL}data/NOTICE.txt`} target="_blank" rel="noreferrer">
              고지문
            </a>
            ).
          </li>
        </ul>
        </div>
      </Group>

      <ConfirmDialog
        isOpen={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="모든 기록을 지울까요?"
        description="이 기기의 학습 기록과 설정을 모두 지워요. 되돌릴 수 없어요."
        actionLabel="모두 지우기"
        onAction={() => {
          setConfirmReset(false)
          resetAll()
        }}
      />
      <ConfirmDialog
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        title="백업으로 바꿀까요?"
        description="지금 기록이 백업 파일의 기록으로 바뀌어요. 바꾼 뒤 이 화면에서 되돌릴 수 있어요."
        actionLabel="백업으로 바꾸기"
        actionVariant="primary"
        onAction={() => {
          if (pending) importState(pending)
          setPending(null)
        }}
      />
      <MessageDialog title="가져오지 못했어요" message={problem} onClose={() => setProblem(null)} />
    </>
  )
}
