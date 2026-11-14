# 10. iOS 앱 빌드 (Capacitor)

> 작성·확인일: 2026-11-13. 작업 환경은 Linux라서 **Xcode·시뮬레이터·Apple 계정 없이** 만들었습니다. 이 문서의 "확인함"은 이 환경에서 실제로 실행한 것만 뜻합니다. 계획과 심사 요건은 [`06-app-store.md`](06-app-store.md), 데이터 유실 위험은 [`07-security-operations.md`](07-security-operations.md), iOS 위험 목록은 [`04-qa-report.md`](04-qa-report.md) 5절을 따릅니다.

## 0. 결론

1. **iOS 프로젝트와 네이티브 기능 v1 범위가 코드로 모두 들어갔습니다.** Capacitor 8.6.0(SPM), `ios/` Xcode 프로젝트, 플랫폼 레이어(`src/platform/`), 내구 저장, 복습 알림, 일본어 음성, 햅틱, 공유 시트 내보내기·파일 선택 가져오기, 상태 표시줄, 외부 링크, 홈 화면 위젯(WidgetKit 확장), 개인정보 매니페스트, 아이콘·런치 화면, CI 두 개.
2. **웹 앱은 그대로입니다.** 웹 빌드에는 네이티브 코드가 한 줄도 들어가지 않고(빌드 시점에 제거), 번들은 **+785 B(gzip +315 B, +0.3%)** 늘었습니다. 기존 테스트는 모두 통과하고, 웹 경로가 그대로임을 보이는 E2E를 더했습니다.
3. **아직 아무도 이 앱을 iOS에서 빌드하거나 실행하지 않았습니다.** Swift 코드, Xcode 프로젝트 수정, 위젯 확장의 **첫 컴파일은 PR에서 도는 `ios.yml`(macOS 러너, 서명 없음)** 이고, 실제 동작(알림 도착, 음성, 위젯 표시, WKWebView 저장)은 **기기 테스트(5절)** 에서 처음 확인됩니다.
4. **소유자가 할 일 순서**: 결정 1~4(끝 절) → Apple Developer 가입 → `npm run ios:set-id` → App Store Connect 앱 레코드·API 키 → GitHub 비밀값 → TestFlight 워크플로 실행 → 기기 체크리스트(4절).

## 1. 무엇이 있나

| 항목 | 파일 | 상태 |
| --- | --- | --- |
| Capacitor 설정(앱 ID·이름은 **자리표시자**) | `capacitor.config.ts` (`com.example.jlptruma`, `JLPT 루마`) | Linux에서 `cap add/sync ios` 실행됨 |
| iOS 프로젝트 | `ios/App/` (SPM, `CapApp-SPM/Package.swift`) | 생성됨, 컴파일은 CI에서 처음 |
| 빌드 두 개 | `vite build`(웹, PWA) / `vite build --mode native`(앱, `dist-native/`, 서비스 워커 없음) | 둘 다 빌드됨 |
| 플랫폼 레이어 | `src/platform/{index,types,web,native}.ts` | 단위·E2E 테스트 |
| 내구 저장 | `src/platform/durable.ts`, `store.ts`의 `rev`·`hydrate`·`setStoreHooks` | 단위·E2E 테스트 |
| 복습 알림 계획 | `src/platform/reminders.ts`(순수 함수), 적용은 `native.ts` | 단위·E2E 테스트(가짜 플러그인) |
| 기기 설정 화면·알림 제안 | `src/platform/NativeSettings.tsx`, `ReminderOffer.tsx` | E2E(가짜 브리지) |
| 위젯 | `ios/App/RumaWidget/`, `ios/App/App/WidgetBridgePlugin.swift`, `src/platform/widget.ts` | JS 쪽 테스트, Swift는 CI에서 처음 컴파일 |
| 개인정보 매니페스트 | `ios/App/App/PrivacyInfo.xcprivacy`, `ios/App/RumaWidget/PrivacyInfo.xcprivacy` | plist 문법 확인 |
| 아이콘·런치 화면 | `npm run ios:assets` → `Assets.xcassets` (1024 아이콘, 라이트/다크 런치) | Linux에서 생성·눈으로 확인 |
| 번들 ID 일괄 변경 | `npm run ios:set-id -- <id> [--name "<이름>"]` | 왕복(바꿨다 되돌리기) 확인 |
| CI | `.github/workflows/ios.yml`(서명 없는 컴파일), `ios-testflight.yml`(수동, 꺼져 있음), `ci.yml`에 `ios:sync` 추가 | YAML 문법만 확인, **실행은 안 됨** |

npm 스크립트: `build:native`, `ios:sync`(= 네이티브 웹 빌드 + `cap sync ios`), `ios:assets`, `ios:set-id`.

**git에 넣는 것 / 생성되는 것**: `ios/` 프로젝트·Swift·plist·에셋·`CapApp-SPM/Package.swift`는 커밋합니다(Capacitor 관례). `ios/App/App/public/`(웹 산출물), `capacitor.config.json`, `config.xml`, `dist-native/`, `DerivedData`는 생성물이라 무시합니다(`ios/.gitignore`, `.gitignore`). 그래서 **클론 직후에는 `npm ci && npm run ios:sync`가 필요**합니다(CI도 그렇게 함).

## 2. 확인한 것과 확인하지 못한 것

| 이 환경에서 확인함 | CI(macOS)에서 처음 확인됨 | 실제 iPhone에서만 확인됨 |
| --- | --- | --- |
| `tsc`, 단위 테스트 219개(새로 56개), E2E(웹 + 가짜 Capacitor 브리지로 돌린 앱 빌드), 웹·앱 빌드, `cap sync ios`, 번들 크기 | Xcode 26.6으로 Swift 패키지 해석, 앱·플러그인·`WidgetBridgePlugin`·`MainViewController`·`RumaWidget` 컴파일, 위젯이 앱에 포함되는지, 매니페스트·데이터가 번들에 들어가는지 | WKWebView 안의 동작 전부, 알림 권한·도착, 음성, 햅틱, 위젯 표시, 공유 시트, 파일 선택기, App Group 공유, 서명·업로드 |
| `project.pbxproj` 수정은 독립 파서(`xcode` npm 3.0.1)로 읽고 다시 쓰기, 참조 ID 전수 검사 | | |

"가짜 브리지 E2E"(`tests/e2e/native-shell.spec.ts`)는 Capacitor의 실제 플러그인 프록시를 Chromium에서 돌리고 네이티브 쪽만 흉내 냅니다. JS 흐름이 맞다는 증거이지 **iOS에서 된다는 증거가 아닙니다.**

## 3. 구조와 결정

### 3.1 웹과 앱의 분리
- 기능 분기는 `src/platform/` 한 곳입니다. `platform.speak/haptic/saveFile/pickFile/clearDeviceData`를 화면이 부르고, 웹 구현(`web.ts`)은 예전 동작 그대로(speechSynthesis, `<a download>`)입니다.
- 앱 구현(`native.ts`)은 `import.meta.env.MODE === 'native'`일 때만 동적 import 되고, 실행 시에도 `window.Capacitor.isNativePlatform()`을 확인합니다. 웹 빌드에서는 이 조건이 상수 false라서 **청크조차 만들어지지 않습니다**(서비스 워커 사전 캐시 20개 그대로).
- 번들(웹, `dist/assets/index-*.js`): 이전 325,788 B / gzip -9 102,020 B → 이후 326,573 B / 102,335 B.

### 3.2 학습 기록의 내구 저장
- **문제**: iOS는 저장 공간이 부족하면 WebView의 localStorage를 지울 수 있고, 기록 전체가 그 키 하나입니다.
- **선택: Filesystem(앱 Library 폴더의 JSON 파일)**, Preferences(UserDefaults)가 아님. 상태는 텍스트 하나로 수백 KB~약 1.7 MB(04 QA 3절)까지 커지는데, UserDefaults는 작은 값용이고 실행 때 통째로 메모리에 올라갑니다. Library 폴더는 OS가 비우지 않고 기기 백업에 포함됩니다.
- **동작**: localStorage는 지금처럼 동기 작업 사본으로 두고(스토어 API 변경 없음), 저장할 때마다 파일에도 씁니다(400 ms 묶음, 백그라운드로 갈 때 즉시). 파일은 **두 슬롯을 번갈아** 써서 쓰다 끊겨도 직전 저장본이 남습니다.
- **실행 시**(첫 렌더 전, 앱에서만): `reconcile(localStorage, 슬롯들)`
  - 저장 카운터 `rev`(상태에 새로 더한 필드, 저장마다 +1)가 큰 쪽을 씁니다. **시계가 아니라 카운터**라서 기기 시계를 바꿔도 오래된 사본이 이기지 않습니다.
  - localStorage가 비었거나 깨졌거나 더 오래됨 → 파일에서 복원. 파일이 없거나 깨졌거나 뒤처짐 → localStorage를 파일로. 둘 다 없음 → 첫 실행.
  - `rev`는 백업 파일에는 넣지 않습니다.
- **초기화**: "모든 기록 초기화"와 오류 화면의 "모두 지우기"는 두 슬롯을 지우고, 예약된 알림 취소, 위젯 데이터 삭제, 기기 설정 초기화까지 합니다.

### 3.3 복습 알림 (v1의 핵심 네이티브 가치)
- 규칙(`reminders.ts`, 단위 테스트 13개): 꺼져 있으면 없음 · **하루 최대 하나**(ID = 날짜 yyyymmdd) · 정한 시각에 · 앞으로 7일 · **그날 복습할 카드가 있을 때만**(새 단어만 있는 날은 없음) · **이미 끝낸 날은 없음** · 쉬는 요일 제외 · 지난 시각 제외 · 문구에 실제 개수("복습할 단어 12개가 돌아왔어요", 새 단어 수).
- 상태가 바뀔 때(1.5초 묶음), 앱이 앞으로 올 때, 설정을 바꿀 때 **우리 알림을 모두 취소하고 다시 예약**합니다. 끄면 전부 취소.
- **권한은 첫 실행에 묻지 않습니다.** 하루 분량을 처음 끝낸 완료 화면에 설명 카드("복습할 때가 되면 알려 드릴까요?")를 보이고, "알림 받기"를 눌렀을 때만 iOS 권한 창을 띄웁니다. "나중에"도 기억합니다. 설정에서 언제든 켤 수 있습니다.
- 알림을 누르면 학습 화면(`#/study`)으로 갑니다. 설정 화면의 알림·진동·음성 절은 앱에서만 보입니다.

### 3.4 그 밖의 네이티브 기능
- **음성**: `@capacitor-community/text-to-speech`(AVSpeechSynthesizer), `ja-JP`, 속도 0.9, 설정에서 일본어 음성 선택. 일본어 음성이 없거나 실패하면 WebView의 speechSynthesis로 대신합니다. "사용자 동작 전에는 말하지 않는다" 규칙은 호출하는 쪽(Study.tsx)이 그대로 지킵니다. 무음 스위치를 켜도 들리도록 `playback`으로 둡니다(결정 7).
- **햅틱**: 답할 때 가벼운 탭, 하루를 끝낼 때 성공 진동. 설정으로 끌 수 있고, "동작 줄이기"가 켜져 있으면 울리지 않습니다.
- **백업**: 내보내기는 캐시 폴더에 파일을 쓰고 공유 시트(파일 앱 저장·AirDrop)를 엽니다. 공유를 취소하면 "마지막 백업"이 갱신되지 않습니다. 가져오기는 문서 선택기(JSON만)입니다. 웹은 예전 그대로입니다.
- **수명 주기**: 앞으로 올 때 날짜를 넘기고(`useClock`이 듣는 `visibilitychange`를 발생시킴) 알림·위젯을 갱신합니다. Android 뒤로 버튼은 해시 라우터의 뒤로 가기로(iOS에는 없음, 화면 안의 닫기·뒤로 버튼으로 충분).
- **상태 표시줄**: 테마(시스템·라이트·다크)를 따라 글자색을 바꿉니다. 세이프 에어리어는 기존 CSS(`viewport-fit=cover`, `env(safe-area-inset-*)`, 탭바 하단 여백)에 `contentInset: 'never'`로 맞췄습니다.
- **외부 링크**: 라이선스 링크는 앱 안 Safari 뷰(`@capacitor/browser`, SFSafariViewController)로, 앱 안 파일(고지문)은 시트로 엽니다. WebView가 앱 밖 페이지로 넘어가지 않습니다.
- **서비스 워커**: 앱에서는 등록하지 않습니다. 모든 자산이 앱 번들(`capacitor://localhost`)에 있고 WKWebView는 이 스킴에서 서비스 워커를 돌리지 않습니다. 남아 있는 등록이 있으면 해제합니다. 웹은 그대로 등록합니다.
- **오프라인 첫 실행**: `public/data/words-n1~5.json`(8,130단어, 안정 ID 포함; 안정 ID 이전의 동결 파일 `n1~5.json`은 앱에 넣지 않음)과 고지문이 `ios/App/App/public/data/`에 복사되고, 앱은 상대 경로(`base: './'`)로 읽으므로 비행기 모드 첫 실행에서도 전부 동작해야 합니다(CI가 파일 존재를 검사, 실제 오프라인 실행은 기기 확인).
- **쓰지 않은 것**: `@capacitor/preferences`(위 3.2 이유), `@capacitor/splash-screen`(런치 화면 스토리보드로 충분, 플러그인 하나 줄임).

### 3.5 위젯
- **결과: 만들었습니다(소형·중형).** "오늘 복습할 단어 수 / 끝났으면 済"와 "시험날 기억할 단어(예상) / 전체, 목표"를 보입니다. 앱이 7일치 하루별 값을 App Group 공유 UserDefaults에 쓰고(`WidgetBridgePlugin`), 위젯 타임라인이 자정마다 다음 날 값으로 바꿉니다.
- Xcode 없이 확장 타깃을 넣으려고 `scripts/ios/patch-pbxproj.py`로 `project.pbxproj`를 수정했습니다(멱등, 수정 기록으로 보관). 독립 파서로 구조를 확인했지만 **실제 컴파일은 `ios.yml` 첫 실행이 처음**입니다.
- 실패하면: CI 로그(아티팩트 `xcodebuild-log`)를 보고 고치거나, v1에서 빼려면 Xcode에서 RumaWidget 타깃과 "Embed Foundation Extensions" 단계를 지우면 됩니다(앱 쪽 JS는 위젯이 없어도 오류 없이 무시).
- App Group ID는 빌드 설정 `RUMA_APP_GROUP`(= `group.<번들 ID>`) 하나에서 Info.plist와 entitlements로 들어갑니다.

### 3.6 심사 관련 준비
- **개인정보 매니페스트**: 추적 없음, 수집 없음. 필수 사유 API: UserDefaults `1C8F.1`(App Group, 앱·위젯), 파일 타임스탬프 `C617.1`(앱 컨테이너 안 파일, `@capacitor/filesystem`)·`3B52.1`(사용자가 문서 선택기로 고른 파일, `@capawesome/capacitor-file-picker`). 플러그인별 범주는 Ionic의 매니페스트 규칙[S3]과 소스 검색으로 확인했고, 사유 코드의 정의 문구도 2026-11-14 `docs/store/privacy-labels.md` §3에서 Apple의 현재 목록과 대조해 **확인했습니다**(세 코드 모두 코드 사용과 맞음). 남은 것은 빌드에 매니페스트가 실제로 들어가는지로, 업로드 후 App Store Connect 경고 메일로 확인합니다(같은 문서 §3.3).
- **Info.plist**: `ITSAppUsesNonExemptEncryption = NO`(HTTPS 외 암호화 없음), 세로 고정, 개발 언어 한국어. **사용 목적 문자열은 없습니다**: 로컬 알림·햅틱·음성·공유·문서 선택기는 Info.plist 문자열이 필요 없고, 카메라·사진·위치는 쓰지 않습니다(파일 선택기의 사진 선택 경로는 호출하지 않으며 권한 없이 동작하는 PHPicker 계열).
- **iPhone 전용**(`TARGETED_DEVICE_FAMILY = 1`, 06 결정 7 추천을 적용).
- 앱 안 데이터 전체 삭제(초기화), 비공식 고지(설정 › 정보), 웹 전용 문구 정리(저장 위치, 저장 실패 경고, "새로고침" 안내)를 앱에서 맞게 바꿨습니다.

## 4. 소유자 경로: 가입부터 TestFlight까지

| 단계 | 할 일 | 값이 들어가는 곳 |
| --- | --- | --- |
| 1 | 끝 절의 결정 1~4 | — |
| 2 | Apple 계정 이중 인증 → [Apple Developer Program](https://developer.apple.com/programs/enroll/) 개인 가입(연 USD 99) | — |
| 3 | developer.apple.com › Membership details의 **Team ID** 확인 | GitHub 비밀값 `APPLE_TEAM_ID` |
| 4 | 저장소에서 `npm run ios:set-id -- io.github.<owner>.jlptruma --name "JLPT 루마"` → 커밋·PR → `ios.yml` 통과 확인 | `capacitor.config.ts`, Xcode 프로젝트(앱·위젯 번들 ID, App Group) |
| 5 | App Store Connect › 앱 › 새로운 앱: 플랫폼 iOS, 이름(결정 2), 기본 언어 한국어, 번들 ID(4번 값, 자동 서명이 등록하지 않았으면 Identifiers에서 앱 ID 2개 `<id>`, `<id>.widget`과 App Group `group.<id>`를 만들고 둘 다 App Groups 기능 켜기), SKU 아무 값 | App Store Connect |
| 6 | App Store Connect › 사용자 및 액세스 › 통합 › App Store Connect API › 팀 키 생성(역할 **관리자**; 앱 관리자로 충분한지는 미확인) → **Issuer ID**, **Key ID**, `.p8` 파일(한 번만 받을 수 있음) | `ASC_ISSUER_ID`, `ASC_KEY_ID`, `ASC_KEY_P8`(파일 내용 전체) |
| 7 | GitHub › Settings › Environments › `testflight` 만들기(필수 검토자: 본인) → 위 4개 비밀값 넣기. Settings › Secrets and variables › Actions › Variables에 `IOS_RELEASE_ENABLED` = `true` | GitHub |
| 8 | Actions › "iOS TestFlight upload (signed, manual)" › Run workflow(버전 `1.0.0`). 빌드 번호는 실행 번호 | — |
| 9 | App Store Connect › TestFlight: 처리 완료(보통 수십 분) → 내부 테스트 그룹에 본인 추가 → iPhone의 TestFlight 앱으로 설치 | — |
| 10 | 5절 체크리스트 → 문제 수정 → 외부 테스트(06 6절) → 심사 제출(6절 메모) | — |

워크플로는 API 키로 Xcode 자동 서명(`-allowProvisioningUpdates -authenticationKey*`)을 써서 인증서·프로파일을 저장소에 두지 않고, 아카이브 → `.ipa` 내보내기 → `xcrun altool --upload-app`으로 올립니다. API 키로 `exportArchive`의 `upload` 대상이 동작하지 않았다는 포럼 보고[S5]가 있어 내보내기와 업로드를 나눴습니다. **이 워크플로는 한 번도 실행되지 않았고 첫 실행이 첫 시험입니다.** 실패하면 로그 아티팩트 `testflight-logs`를 보고, 소유자 Mac이 있으면 Xcode › Product › Archive로 대신 올릴 수 있습니다.

## 5. 기기 테스트 체크리스트 (TestFlight 빌드, 실제 iPhone)

설치·오프라인
- [ ] 비행기 모드에서 **첫 실행** → 시작 화면(라이트·다크 모두 바탕색이 웹 첫 화면과 이어지는지) → 홈에서 루마의 질문 → 첫 학습 → 단어장에서 N1 단어 검색까지 모두 동작
- [ ] 첫 실행에 알림 권한 창이 뜨지 않음
- [ ] 런치 화면: 라이트·다크 모드 모두 루마가 가운데, 흰 화면 깜박임이 짧음

저장(07 문서의 데이터 유실 위험)
- [ ] 몇 장 학습 → 앱 전환기에서 강제 종료 → 다시 열면 그대로
- [ ] 학습 직후 바로 홈으로 나가 종료해도 마지막 답이 남음(백그라운드 즉시 저장)
- [ ] localStorage 유실 흉내: Mac Safari › 개발자 메뉴 › 기기 › 앱 WebView 콘솔에서 `localStorage.clear()` → 앱 종료 후 재실행 → 기록 복원
- [ ] TestFlight로 새 빌드를 설치해도 기록 유지

백업
- [ ] 내보내기 → 공유 시트 → "파일에 저장" → 파일 앱에 JSON. "마지막 백업" 날짜 갱신. 공유 취소 시 갱신 안 됨
- [ ] 가져오기 → 파일 앱에서 고름 → 확인 → 기록 교체 → "가져오기 되돌리기"
- [ ] **웹(PWA)에서 내보낸 파일**을 앱에서 가져오기(웹 → 앱 이전 경로)

발음(04 QA 5절 위험)
- [ ] 단어 카드·단어 시트의 발음 버튼, 일본어 음성으로 읽음, **무음 스위치를 켠 상태**에서도 들림
- [ ] "카드가 나올 때 자동 재생"을 켜고 학습 시작 → **첫 카드부터** 소리(웹에서 생기던 첫 카드 무음 문제)
- [ ] 설정 › 일본어 음성 바꾸기·들어 보기. 일본어 음성이 없는 기기에서 안내 문구

햅틱
- [ ] 답할 때 가벼운 진동, 하루 끝에 성공 진동. 설정에서 끄면 없음. 손쉬운 사용 › 동작 › 동작 줄이기 켜면 없음

알림
- [ ] 처음 하루를 끝내면 설명 카드 → "알림 받기" → iOS 권한 창 → 허용 → 안내 문구
- [ ] 설정에서 알림 시각을 2~3분 뒤로 → 일부 카드에 "모르겠어요"로 답하고 하루를 다 끝내지 않은 채 대기 → 알림 도착, 문구의 개수가 홈 화면과 같음
- [ ] 알림을 누르면 학습 화면이 열림
- [ ] 그날 분량을 끝내면 그날 알림이 오지 않음, 쉬는 요일에는 오지 않음
- [ ] 알림 끄기 → 이후 알림 없음. 권한 거부 → 설정 화면에 안내

위젯
- [ ] 홈 화면 편집 › 위젯 › "오늘의 복습" 소형·중형 추가 → 숫자가 앱 홈과 같음
- [ ] 학습 후 앱을 나오면 바로 갱신, 끝내면 "済". 자정이 지나면 다음 날 값
- [ ] "모든 기록 초기화" 뒤 위젯이 비고, 예약 알림 없음, 재실행해도 옛 기록이 돌아오지 않음

화면·수명 주기
- [ ] 앱을 켜 둔 채 자정을 넘긴 뒤 복귀 → 홈이 새 날짜(04 B9)
- [ ] 테마 시스템·라이트·다크 전환 → 상태 표시줄 글자색이 배경과 대비
- [ ] Dynamic Island 기기, 홈 버튼 기기(iPhone SE 375pt)에서 탭바·학습 하단 버튼이 홈 인디케이터에 가리지 않음
- [ ] 단어장 검색창에 키보드가 올라올 때 레이아웃, 더블 탭 확대 여부(04 5절)
- [ ] 라이선스 링크 → 앱 안 Safari 뷰, 닫으면 같은 화면. "고지문"은 시트
- [ ] 세로 고정, 가로로 돌려도 그대로
- [ ] 최소 버전인 iOS 16.4 기기(또는 시뮬레이터)에서: 색·다크 모드(`light-dark()`를 변수로 바꾼 CSS), 카드·버튼 모양(`@layer`), 확인 대화상자와 시트(17.5 미만에서는 `@starting-style`이 없어 나타나는 움직임이 짧거나 없을 수 있음, 동작은 같아야 함), Dynamic Type 크게에서 글자 크기

## 6. 심사 메모(App Review Information › Notes에 그대로)

```
JLPT Ruma is a Korean-language vocabulary trainer for the Japanese-Language Proficiency Test.
It uses spaced repetition (FSRS). No account, no network access needed, no data collected:
all 8,130 words are bundled and study records stay on the device.

Features of the iOS app (not offered by a website):
1. Review reminders (local notifications). After the first finished daily session the app explains
   reminders and only then asks for permission. At most one notification a day, at the learner's
   chosen time, only on days with reviews due, stating the count ("복습할 단어 12개가 돌아왔어요").
   To test: Settings (설정) > 알림 · 진동 · 발음 > turn on 복습 알림, set the time 2 minutes ahead,
   then start today's session (오늘의 학습 시작), answer "모르겠어요" on two cards and leave the app.
2. Home Screen widget "오늘의 복습": today's reviews and the predicted number of words remembered
   on the exam day.
3. Japanese pronunciation with the iOS speech voices (AVSpeechSynthesizer), voice choice in Settings.
4. Haptic feedback when answering and when the day is finished (respects Reduce Motion).
5. Backup export through the share sheet / Files, import through the document picker.
6. Works fully offline, including the first launch (try Airplane Mode).

This app is not affiliated with or endorsed by the Japan Foundation or JEES, which administer the
JLPT; the notice is in Settings > 정보.
```

## 7. 위험과 미확인

- CI 이미지 변경: `ios.yml`은 `macos-26` + `/Applications/Xcode_26.6.app`(2026-11-02 이미지 기준[S1])에 고정. 이미지에서 이 Xcode가 빠지면 경로만 바꾸면 됩니다.
- Capacitor 8.6.2/8.6.1이 어제(11-12) 나왔지만 2주 넘은 **8.6.0**에 고정했습니다(공급망 주의). 플러그인도 정확한 버전으로 고정.
- `UIRequiredDeviceCapabilities = armv7`(Capacitor 템플릿 그대로)는 업로드 검증에서 문제 된 보고를 찾지 못했지만 미확인입니다. 경고가 나오면 `arm64`로 바꿉니다.
- 알림은 상태가 바뀔 때와 앱을 열 때만 다시 계획됩니다. 앱을 열지 않는 동안에는 마지막 계획대로 나가고, 개수는 "그때까지 아무것도 하지 않았을 때" 기준이라 그대로 맞습니다. 7일 넘게 열지 않으면 알림이 멈춥니다(계속 무시되는 알림을 보내지 않으려는 의도, 결정이 필요하면 `HORIZON_DAYS`).
- `@capacitor/browser`는 SFSafariViewController(앱 안 Safari)입니다. Safari 앱으로 완전히 내보내려면 `@capacitor/app-launcher`가 필요합니다.
- 사진 관련: 파일 선택기 플러그인 바이너리에 PHPicker·UIImagePickerController 코드가 들어 있습니다. 업로드 때 ITMS-90683(목적 문자열 없음) 경고가 오면 `NSPhotoLibraryUsageDescription`을 추가합니다(미확인).

## 결정이 필요한 것

1. **번들 ID**(한 번 정하면 못 바꿈). → **추천: `io.github.songch9511.jlptruma`**(도메인을 사면 `kr.<도메인>.ruma`). `npm run ios:set-id`로 한 번에 바꿉니다. App Group은 `group.<번들 ID>`로 따라갑니다.
2. **스토어 이름과 홈 화면 이름**(JLPT 상표 우려, 06 4.2절). → **추천: 스토어 이름 "루마 – JLPT 단어 N5~N1", 홈 화면 아이콘 아래 이름은 "JLPT 루마"(지금 값)**. 리젝되면 스토어 이름에서 JLPT를 빼고, 아이콘 이름은 "루마"로 바꿉니다(`--name`).
3. **최소 iOS 버전 — 결정됨(2026-11-14): 16.4.** Capacitor 8의 기본값은 15.0이지만, 화면 CSS가 `@layer`(15.4)·`color-mix`(16.2)·`@property`(16.4)에 기대고 Vite의 빌드 대상도 safari16.4입니다(`docs/design-system.md` 8장). `project.pbxproj`의 `IPHONEOS_DEPLOYMENT_TARGET` 6곳(프로젝트·앱·위젯 × Debug/Release)을 16.4로 올렸고, `npm run ios:sync`가 이 값을 읽어 `CapApp-SPM/Package.swift`를 `.iOS(.v16)`로 다시 씁니다(이 파일은 손으로 고치지 않음, SPM 플랫폼은 주 버전만 받음). 새로 만든 Xcode 프로젝트에는 `scripts/ios/patch-pbxproj.py`가 같은 값을 넣습니다. CI(`ios.yml`, `ios-testflight.yml`)는 `generic/platform=iOS…` 대상이라 따로 바꿀 것이 없습니다.
4. **위젯을 v1에 넣을지**. → **추천: 넣기.** 코드는 준비됐고 4.2 위험을 줄입니다. 조건: `ios.yml`이 통과하고 5절 위젯 항목이 기기에서 맞을 것. 아니면 3.5절대로 타깃을 빼고 1.1에서 넣습니다.
5. **기기 범위**: iPhone 전용으로 설정해 두었습니다(06 추천). iPad를 넣으려면 13인치 스크린샷과 레이아웃 확인이 더 필요합니다.
6. **알림 기본 시각**: 20:00으로 두었습니다. 학습 패턴 데이터가 없어서 정한 값입니다.
7. **무음 스위치에서의 발음**: 지금은 들리게(`playback`) 했습니다. 수업·대중교통에서 원치 않는 소리가 문제라면 `ambient`(무음 스위치 따름)로 바꿉니다.

## 출처 (2026-11-13 확인)

- [S1] GitHub Actions macOS 26 arm64 이미지(Xcode 26.0.1~26.6, 기본 26.6, 이미지 20261102) — https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md
- [S2] npm 레지스트리: `@capacitor/core` 8.6.0(2026-10-28), 8.6.2(2026-11-12), 9.0.0-rc.0; 각 플러그인 버전과 게시일 — `npm view <pkg> time`
- [S3] Capacitor 문서 Privacy Manifest(GitHub 원문) — https://github.com/ionic-team/capacitor-docs/blob/main/docs/main/ios/privacy-manifest.md ; Ionic VS Code 매니페스트 규칙 — https://github.com/ionic-team/vscode-ionic/blob/main/src/privacy-manifest.ts
- [S4] Capacitor 8 요건(Xcode 26, iOS 15, SPM 권장, 검색 요약) — https://capacitorjs.com/docs/next/getting-started/environment-setup , https://capawesome.io/blog/how-to-upgrade-your-capacitor-app-to-capacitor-8/ (capacitorjs.com은 이 환경에서 직접 접속 불가)
- [S5] API 키와 `exportArchive` 업로드 대상 문제(Xcode 15 시점 포럼) — https://developer.apple.com/forums/thread/682091 ; API 키 기반 CI 업로드 안내(제3자) — https://docs.devin.ai/onboard-devin/environment/testflight
- [S6] Apple 필수 사유 API 문서(이 문서를 쓸 때는 본문 미표시. 사유 코드 문구는 2026-11-14 `docs/store/privacy-labels.md` §3.1에서 확인) — https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api
