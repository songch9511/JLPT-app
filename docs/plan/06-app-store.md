# 06. Apple App Store 등록 절차

> 확인일: 2026-11-13. 외부 사실은 Apple 공식 문서를 먼저 봤고, 각 항목 끝에 출처 번호([A1] 등)를 달았습니다. 출처 목록은 문서 끝에 있습니다. 이 세션에서는 capacitorjs.com, webkit.org, jlpt.jp, codemagic.io, docs.github.com에 직접 접속할 수 없어서 이 사이트들의 내용은 검색 결과 요약으로만 확인했습니다. 그런 항목에는 "(검색 요약)"을 붙였습니다.

## 0. 결론

1. **경로: Capacitor로 감싸고, 네이티브 기능 다섯 가지를 실제로 붙여서 냅니다.** 지금 코드(React + Vite, 해시 라우터, 정적 JSON 데이터)를 거의 그대로 쓸 수 있습니다. 엔지니어링은 약 4~5주로 봅니다. React Native나 SwiftUI로 다시 짜면 3~6개월이 걸리고, 그만큼 심사에서 유리해지지도 않습니다.
2. **심사 통과 조건: "웹사이트를 포장한 앱"으로 보이지 않아야 합니다(가이드라인 4.2).** v1에 ① 복습 알림(그날 돌아온 복습 수), ② iOS 일본어 음성 발음(네이티브 TTS), ③ 답변 햅틱, ④ 비행기 모드에서도 전부 동작(데이터 번들 포함), ⑤ 홈 화면 위젯(오늘 남은 카드와 다루마)이 들어 있어야 합니다. ⑤는 1.1로 미뤄도 되지만, 넣으면 리젝 위험이 크게 줄어듭니다.
3. **AI 기능은 v1에서 빼거나 백엔드 프록시를 거쳐야 합니다.** 사용자가 자기 Anthropic 키를 넣는 지금 구조는 그대로 낼 수 없습니다. 제3자 AI로 데이터를 보낼 때는 명시적 동의도 받아야 합니다(5.1.2(i)) [A1].
4. **사업자등록 시점이 일정을 가릅니다.** 한국 거주 개인 개발자가 유료 앱 계약(Paid Apps Agreement)을 맺으려면 사업자등록번호(BRN)를 내야 하는 것으로 보입니다 [A5][A6]. 그래서 **v1은 무료(인앱결제 없음)로 먼저 승인받고, v1.1에서 사업자등록 후 인앱결제를 붙이는 순서**를 추천합니다. v1부터 유료로 가려면 사업자등록을 지금 바로 시작해야 합니다.
5. **첫 승인까지 약 6~8주, 현금 비용은 최소 약 15만 원**입니다(개발자 프로그램 연 USD 99에, 이미 Mac이 있거나 무료 빌드 분량 안에서 해결하는 경우). Mac을 새로 사면 100만 원 안팎이 추가됩니다(7절).
6. **가장 큰 심사 위험 세 가지**(6절): (1) 4.2 최소 기능(웹 래퍼 판정), (2) 이름의 "JLPT" 상표 문제(5.2.1)와 오해를 부르는 표현, (3) 2.1 완성도(크래시, 깨진 개인정보처리방침 링크, 오프라인 오류 화면).

## 1. PWA에서 App Store 앱으로 가는 경로

### 1.1 선택지 비교

| | Capacitor 래핑 | 얇은 WKWebView 셸(직접 작성) | React Native / Expo로 재작성 | SwiftUI로 재작성 |
| --- | --- | --- | --- | --- |
| 작업량 | **4~5주**(네이티브 기능 포함) | 3~5주, 다만 플러그인을 전부 직접 만들어야 함 | 3~4개월(화면 6개, 스타일, 상태 전부 이식) | 4~6개월, Swift 학습 포함 |
| 재사용 | `src/` 거의 전부 | `src/` 거의 전부 | `srs.ts`·`data.ts` 같은 순수 로직만 | 데이터 JSON만 |
| 4.2 위험 | 중간. 네이티브 기능을 붙이면 낮아짐 | 중간~높음. 붙일 수 있는 기능이 적음 | 낮음 | 가장 낮음 |
| StoreKit IAP | 플러그인(RevenueCat 등) | 직접 Swift로 작성 | 성숙한 라이브러리 | 기본 기능 |
| 로컬 알림·햅틱·TTS | 공식·커뮤니티 플러그인 | 직접 작성 | 라이브러리 | 기본 기능 |
| 위젯 | Swift로 WidgetKit 확장을 따로 작성, App Group으로 데이터 공유 | 같음 | 같음(Swift 확장 필요) | 기본 기능 |
| iCloud/동기화 | 플러그인, 또는 백엔드 동기화 | 직접 작성 | 라이브러리 | CloudKit 기본 |
| 웹 버전 유지 | **같은 코드로 계속 배포** | 같은 코드 | 별도 코드(Expo Web은 품질이 떨어짐) | 웹은 따로 유지 |
| 장기 유지보수 | Capacitor 메이저 업데이트가 1년에 1번쯤. 8은 2025-12 출시, 9는 개발 중 [C1] | Apple API 변화를 혼자 따라가야 함 | RN 업그레이드 부담이 큼 | Apple 플랫폼만 |

**추천: Capacitor.** 이 앱의 가치인 학습 엔진(FSRS)과 화면이 이미 웹 코드에 있고, 같은 코드로 웹·iOS·Android(8절)를 함께 낼 수 있으며, 4.2 심사 위험은 래핑 방식보다 "웹에 없는 앱다운 기능이 있느냐"로 갈리기 때문입니다.

반대로 Capacitor를 써도 네이티브 기능 없이 내면 리젝될 수 있습니다. 네이티브 기능 몇 개를 붙인 Capacitor 앱이 4.2로 리젝된 사례가 Apple 포럼에 있습니다 [A15].

얇은 셸을 직접 만들 이유는 없습니다. Capacitor가 바로 그 셸이고, 플러그인 생태계까지 딸려 있습니다.

### 1.2 Apple이 웹 래퍼 앱을 보는 방식

가이드라인 4.2 원문은 이렇습니다: "앱에는 재포장된 웹사이트(repackaged website) 이상의 기능·콘텐츠·UI가 있어야 한다. 특별히 유용하거나 독특하거나 '앱다운' 것이 아니면 App Store에 둘 곳이 없다." 4.2.2는 웹 클리핑과 링크 모음을 금지합니다 [A1]. 심사팀 안내 페이지도 흔한 리젝 사유로 "Web clippings, content aggregators, or collections of links"와 "Not enough lasting value"를 꼽습니다 [A11].

4.7은 HTML5 미니앱을 허용하지만, 이는 앱 안에서 제3자 미니앱을 제공하는 경우의 규정이라 이 앱과는 관계가 없습니다 [A1].

**심사자가 확인한다고 알려진 것**(커뮤니티·업체 글이라 공식 기준은 아님 [C2][C3]): Safari에서 같은 URL을 열 때와 무엇이 다른가, 오프라인에서 브라우저 오류 화면이 뜨는가, 외부 링크나 웹 내비게이션 흔적이 있는가.

**v1에 반드시 있어야 하는 "웹에 없는 가치"** (심사 메모에 그대로 적을 목록):

| # | 기능 | 구현 | 심사 메모에 쓸 문장(예) |
| --- | --- | --- | --- |
| 1 | 복습 알림 | `@capacitor/local-notifications`, 매일 사용자가 정한 시각에 "오늘 복습 34장" 예약 | 오늘 복습할 카드 수를 담은 로컬 알림 |
| 2 | 네이티브 일본어 발음 | AVSpeechSynthesizer 플러그인(예: `@capacitor-community/text-to-speech`), 오프라인 | iOS 일본어 음성으로 단어 읽기 |
| 3 | 햅틱 | `@capacitor/haptics`, 답 버튼과 도장 획득 | 답변·도장 획득 시 햅틱 |
| 4 | 완전 오프라인 | `public/data/*.json`(약 530KB)을 앱 번들에 포함 | 네트워크 없이 8,130단어 전부 학습 |
| 5 | 위젯(권장) | Swift WidgetKit 확장 + App Group UserDefaults | 홈 화면에서 오늘 남은 카드·다루마 |

차별화 기능 자체의 우선순위는 `02-differentiation.md`를 따릅니다.

## 2. 이 저장소에서 바꿔야 할 것

### 2.1 구조와 빌드

- **`ios/` 추가**: `npx cap add ios`로 Xcode 프로젝트를 만듭니다.
  - `capacitor.config.ts`에 `webDir: 'dist'`, appId(예: `kr.<도메인>.luma`, 4절 참고)를 넣습니다.
  - Capacitor 8은 Xcode 26 이상과 Swift Package Manager를 기본으로 씁니다(검색 요약) [C1].
  - CocoaPods trunk는 2026-12-02에 읽기 전용이 되므로 처음부터 SPM으로 만듭니다(검색 요약) [C1].
- **빌드 모드 분리**: `vite build --mode native`일 때는 다음을 바꿉니다.
  - VitePWA 플러그인을 끕니다(아래 2.2).
  - `import.meta.env.VITE_TARGET`으로 웹/네이티브를 가릅니다.
  - 기능 분기는 `Capacitor.isNativePlatform()` 한 곳에 모읍니다(`src/platform.ts` 신설: 저장, 발음, 알림, 햅틱, 파일 내보내기를 인터페이스로 묶고, 웹 구현과 네이티브 구현을 따로 둠).
- **스크립트**: `npm run build:ios` = `tsc --noEmit && vite build --mode native && npx cap sync ios`.
- **CI**: 지금의 `.github/workflows/deploy.yml`(Pages)은 그대로 둡니다. iOS 빌드는 다음 중 하나로 합니다.
  - (가) 소유자의 Mac에서 Xcode로 아카이브 → 업로드
  - (나) 클라우드 Mac CI(Codemagic 또는 GitHub Actions macOS)에서 App Store Connect API 키로 서명·업로드(3.5절)
- **SDK 요건**: 2026-04-28부터 App Store Connect 업로드는 Xcode 26 이상, iOS 26 SDK로 빌드해야 합니다 [A16].
- **최소 iOS**: 16.4(결정 2026-11-14, 10 문서 결정 3). 스토어의 "호환성"에 iOS 16.4 이상으로 표시됩니다. 화면 CSS가 16.4 기능에 기대기 때문입니다(`docs/design-system.md` 8장).

### 2.2 브라우저에서 WKWebView로 옮길 때 깨지는 것

| 항목 | 지금 | WKWebView(Capacitor)에서 | 조치 |
| --- | --- | --- | --- |
| 서비스 워커·오프라인 캐시 | `vite-plugin-pwa`(workbox) | `capacitor://` 스킴에서는 서비스 워커가 정상 동작하지 않음. App-Bound Domains 설정이 필요하다는 보고가 많음(검색 요약) [C4] | 네이티브 빌드에서는 SW를 등록하지 않음. 어차피 모든 자산이 번들 안에 있으니 SW가 필요 없음 |
| `localStorage` 영속성 | `kasane.state.v2` 한 키(2026-11-14부터 `kasane.state.v4`, 08 §7) | Capacitor 문서는 "기기 저장 공간이 부족하면 OS가 WebView의 localStorage를 회수할 수 있으니 일시 데이터로 취급하라"고 함. iOS의 IndexedDB도 같음(검색 요약) [C5] | 네이티브에서는 `@capacitor/preferences`(iOS UserDefaults) 또는 SQLite 파일에 저장. `store.ts`의 `load`/`update` 안 `localStorage` 호출 두 곳을 `platform.storage`로 바꿈. 상태가 커지면(카드 8,130장 × 필드 10개) SQLite나 Filesystem JSON 파일로 |
| `speechSynthesis` | `util.ts`의 `speak()` | WKWebView에서도 대체로 동작하지만, 일본어 음성 유무·무음 스위치·첫 호출 지연이 기기마다 다름(미확인) | 네이티브에서는 AVSpeechSynthesizer 플러그인으로 바꿈. 일본어 음성이 없으면 "설정 › 손쉬운 사용 › 음성 콘텐츠"로 안내 |
| 해시 라우터 | `location.hash` | `capacitor://localhost/#/...`로 그대로 동작. `base: './'`도 그대로 | 변경 없음. 다만 위젯이나 알림에서 특정 화면으로 들어가는 딥링크(`#/study`)는 알림 탭 핸들러에서 `location.hash`를 설정 |
| 데이터 로딩 | `fetch(BASE_URL + 'data/n5.json')` | 번들 안의 상대 경로라 동작 | 변경 없음 |
| 세이프 에어리어 | `viewport-fit=cover`와 `env(safe-area-inset-*)`를 이미 사용(`styles.css` 111·321·332·353·361·430행) | 동작. 상태 표시줄 색은 따로 설정 | `@capacitor/status-bar`로 라이트·다크 테마에 맞춤. 스플래시는 `@capacitor/splash-screen` |
| 데이터 내보내기 | `Blob` + `<a download>`(`Settings.tsx`) | WKWebView에서는 다운로드가 기본으로 동작하지 않음(미확인, 기기에서 확인 필요) | 네이티브에서는 Filesystem에 쓰고 `@capacitor/share` 공유 시트로 내보냄. 가져오기(`<input type=file>`)는 동작 |
| 외부 링크 | 거의 없음 | 앱 안에서 웹으로 빠지면 "웹 래퍼" 인상 | 개인정보처리방침·문의 링크는 `@capacitor/browser`(SFSafariViewController)로 엶 |
| Anthropic 직접 호출 | `ai-client.ts`가 사용자 키로 브라우저에서 호출(`dangerouslyAllowBrowser`) | 기술적으로는 동작하지만 스토어 제품으로는 부적합 | 아래 2.3 |
| 바운스·텍스트 선택·확대 | 브라우저 기본값 | 웹 느낌을 줌 | `user-select: none`(카드 외), `overscroll-behavior: none`, 길게 누르기 메뉴 끄기 |

### 2.3 AI 호출을 백엔드 프록시로

- iOS 빌드에서는 **설정 화면의 API 키 입력란을 없앱니다.** 이유는 세 가지입니다.
  - 일반 사용자가 쓸 수 없습니다.
  - 키가 기기에 평문으로 남습니다.
  - 앱 바깥에서 산 키로 기능을 여는 구조가 3.1.1(인앱결제 외 방식으로 기능 잠금 해제 금지)과 충돌할 여지가 있습니다(해석 문제라 미확인).
- 대신 `ai-client.ts`의 `ask()`가 자체 프록시(예: Cloudflare Workers나 Vercel 함수)에 `{kind:'explain', wordId}`만 보내고, 서버가 Anthropic을 호출합니다.
  - 서버에서 할 일: 기기 식별(App Attest 또는 익명 설치 ID), 사용량 제한, 구매 상태 확인(인앱결제 영수증), 결과 캐시(같은 단어 설명은 한 번만 생성)
  - 구조·위협 모델은 `07-security-operations.md`, 원가와 무료/유료 경계는 `01-business-model.md`를 따릅니다.
- **동의 화면**: 5.1.2(i)는 "제3자 AI를 포함해 개인 데이터를 제3자와 공유하는 경우 명확히 알리고 명시적 허락을 받으라"고 요구합니다 [A1].
  - 보내는 것이 단어와 틀린 단어 목록뿐이어도, 첫 AI 사용 때 "단어 정보가 Anthropic으로 전송됩니다" 동의를 한 번 받습니다.
  - 개인정보처리방침에 수탁자로 적습니다.
- **v1 범위 추천**: 프록시까지 v1에 넣으면 일정이 2~3주 늘어납니다. v1은 AI 버튼을 숨기고 내고, v1.1에서 인앱결제와 함께 엽니다. 숨긴 기능을 승인 뒤 원격으로 켜는 것은 2.5.19(2026-10 신설, 심사 뒤 기능을 바꾸는 행위 금지) 위반이므로, AI는 **새 버전으로 심사를 받아서** 켭니다 [A17].

### 2.4 기존 PWA 사용자의 데이터 이전

PWA(`https://songch9511.github.io` 출처)와 앱(`capacitor://localhost`)은 출처가 달라서 저장소를 공유하지 않습니다. 앱을 설치해도 진도는 자동으로 넘어가지 않습니다.

- **v1**: 이미 있는 "데이터 내보내기/가져오기"(JSON 파일)를 이전 도구로 씁니다.
  - 웹에 "앱으로 옮기기" 안내(내보내기 → 파일 앱 → 앱에서 가져오기)를 넣습니다.
  - 앱 온보딩에 "웹에서 쓰던 기록 가져오기" 버튼을 둡니다.
  - 가져오기 때 `v` 필드로 스키마 버전을 확인합니다(지금은 `v: 2`).
- **추가안(선택)**: 웹에서 상태를 압축해 짧은 코드나 QR로 보여 주고 앱에서 읽는 방식. 서버 없이 가능하지만 상태가 수백 KB가 되면 QR 하나에 담기지 않습니다.
- **장기**: 계정과 동기화가 생기면 이전 문제는 사라집니다. 다만 계정을 만들면 앱 안 계정 삭제 기능이 의무입니다(5.1.1(v)) [A1]. 외부 로그인을 쓰면 4.8에 맞는 대체 로그인(사실상 Sign in with Apple)도 필요합니다 [A1]. iCloud 키-값 저장소(1MB 한도, 미확인)는 상태 크기 때문에 맞지 않을 수 있습니다.

### 2.5 웹 버전을 같은 코드로 계속 내기

- 웹 빌드는 지금처럼 `npm run build` → Pages입니다. 네이티브 전용 코드는 `platform.ts`의 네이티브 구현에만 둡니다.
  - 동적 `import('@capacitor/...')`를 써서 웹 번들 크기를 지킵니다.
  - Capacitor 플러그인은 대부분 웹 구현(no-op 또는 웹 API)이 있습니다.
- 웹에서 Apple 결제를 받을 수는 없으므로, 웹 결제 경로는 `01-business-model.md`의 결정을 따릅니다. 앱 안에서는 웹 결제 링크를 보여 주면 안 됩니다(5절).
- 앱 안에 GitHub Pages 주소나 "웹에서도 쓸 수 있어요" 같은 문구를 넣지 않습니다. 4.2 판단에 불리합니다.

## 3. 계정과 사전 준비(한국 거주 개인 기준)

### 3.1 Apple Developer Program 가입

1. **Apple 계정 준비**: 실명(법적 이름)으로 된 Apple 계정에 이중 인증을 켭니다. 별명을 쓰면 승인이 늦어집니다 [A3].
2. **개인 vs 조직**:
   - **개인**: D-U-N-S 번호가 필요 없습니다. **스토어의 판매자 이름이 본인 실명으로 표시됩니다** [A3][A4].
   - **조직**: D-U-N-S 번호(발급까지 최대 영업일 5일), 법인격, 조직 도메인 이메일, 공개 웹사이트가 필요합니다. 상호(DBA)나 개인사업자 상호는 받지 않습니다 [A3][A4].
   - 한국 개인사업자는 법인이 아니라서 사실상 **개인으로 가입**합니다. 나중에 법인을 세우면 조직으로 전환을 요청할 수 있다고 알려져 있습니다(미확인).
3. **가입**: Apple Developer 앱(iPhone)이나 웹에서 신청합니다. 실명, 주소(사서함 불가), 전화, 이메일을 확인합니다 [A3]. 신분증 촬영을 요구하는지는 Apple 페이지에 명시가 없습니다(미확인. Developer 앱으로 가입하면 신분증 확인 단계가 있다는 이용자 보고가 있음).
4. **비용**: 연 USD 99이고, 가입 화면에 현지 통화로 표시됩니다 [A3]. 원화 금액은 미확인입니다(가입 화면에서 확인).
5. **소요 시간**: 개인은 보통 1~2일로 알려져 있습니다(미확인). 조직은 D-U-N-S 때문에 1~2주가 걸립니다.

### 3.2 계약·세금·은행(유료 앱이나 인앱결제를 할 때만)

App Store Connect › 비즈니스(Business)에서 진행합니다.

1. **유료 앱 계약(Paid Apps Agreement)에 동의**합니다. 무료 앱만 낼 때는 필요 없습니다. 인앱결제 상품을 실제로 팔고, 샌드박스 외 환경에서 상품을 불러오려면 이 계약이 활성 상태여야 합니다(공식 문구는 미확인, 포럼 사례 [A6]).
2. **세금 양식**:
   - 미국 세금: 미국 외 개인은 W-8BEN입니다 [A7].
   - **대한민국 세금 양식**: 사업자등록번호(BRN)를 넣습니다.
   - 한국 개인 개발자가 BRN이나 NTS 등록번호 없이 계약을 활성화하지 못해 "Pending User Info"에 머문 사례가 2026-06 포럼에 있고, 답변은 없습니다 [A6].
   - Apple 한국 준수 페이지도 유료 앱 계약을 맺으면 한국 세금 양식의 BRN이 제품 페이지에 자동 표시된다고 적습니다 [A5].
   - → **유료 판매 전에 개인사업자 등록이 필요하다고 보고 준비합니다.** 업종 예: 응용 소프트웨어 개발 및 공급업. 업종 코드는 세무 상담에서 확인합니다(미확인).
3. **은행 계좌**: 원화 계좌로 대금을 받을 수 있습니다. 은행 정보(SWIFT 등) 입력 항목은 화면을 따릅니다(미확인).
4. **수수료**: App Store Small Business Program에 가입하면 연 수익 USD 100만 이하일 때 15%입니다. **가입 신청을 따로 해야 합니다** [A12]. 가격과 수익 계산은 `01-business-model.md`를 따릅니다.

### 3.3 한국에서 팔 때 Apple이 요구하는 것과 국내 법 의무

- **전자상거래법에 따른 판매자 정보 표시**: Apple은 「전자상거래 등에서의 소비자보호에 관한 법률」에 따라 한국 기반 개발자의 정보를 확인해 제품 페이지에 표시합니다 [A5].
  - **개인**: 이메일과 사업자등록번호
  - **조직**: 회사명, 이메일, 전화, BRN
  - 유료 콘텐츠가 없으면 BRN 표시는 선택 사항인 것으로 읽힙니다(무료 앱이 BRN 없이 통과하는지는 미확인).
  - 경로: 비즈니스 › 계약 › 규정 준수 › "대한민국 법률" → 전화·이메일 인증 → BRN 입력 [A5].
- **통신판매업 신고**: Apple 문서에는 언급이 없습니다. 국내 법상 인앱결제 판매가 통신판매업 신고 대상인지, 연간 거래 횟수나 금액에 따른 면제(커뮤니티에서는 연 50회 미만 등으로 언급)가 적용되는지는 **미확인**입니다 [K1]. 유료 판매 전에 세무사나 정부24·공정위 안내로 확인합니다.
- **연령 등급(한국)**:
  - 전 세계 공통 등급은 4+/9+/13+/16+/18+로 바뀌었습니다 [A9].
  - 한국 지역 등급(게임물관리위원회 기준)은 **기본 또는 보조 카테고리가 게임·엔터테인먼트이거나 사행성 시뮬레이션이 있을 때만** 표시됩니다 [A10].
  - → **카테고리를 교육(기본)·참고(보조)로 두면** 게임위 등급 분류 대상이 아닙니다. XP·레벨·퀘스트가 있어도 게임 카테고리로 내지 않습니다.
- **개인정보 보호법**: 백엔드·분석 도구·계정이 생기면 국내 개인정보처리방침 공개와 수탁자 고지가 필요합니다. 상세는 `07-security-operations.md`에 맡깁니다.
- **외부 결제**: 한국 스토어에는 제3자 결제 대행을 쓰는 "StoreKit External Purchase Entitlement(한국)"이 있습니다. 다만 이 경우에도 Apple 수수료가 26%이고, 별도 앱 바이너리와 월별 매출 보고가 필요합니다(2022 도입 당시 보도 기준, 현행 조건 미확인) [K2]. 개인 개발자에게는 실익이 없으므로 **쓰지 않습니다.**

### 3.4 Mac이 없을 때

Xcode는 macOS 전용입니다. 빌드·서명·업로드는 클라우드에서도 할 수 있지만, 시뮬레이터 디버깅과 위젯(Swift) 개발은 Mac이 있어야 훨씬 수월합니다.

| 방법 | 비용(확인일 기준) | 장단점 |
| --- | --- | --- |
| Mac mini 구입(Apple Silicon) | 국내가 약 90만 원대부터(미확인, Apple 스토어에서 확인) | 가장 편함. 디버깅·위젯·스크린샷 모두 가능. **추천** |
| Codemagic(클라우드 CI) | 개인 계정에 macOS M2 월 500분 무료, 초과분 분당 USD 0.095(검색 요약) [C6] | 빌드 1회 약 10~15분이라 무료 분량 안에서 충분. App Store Connect API 키로 자동 서명·업로드 가능. 디버깅은 불가 |
| GitHub Actions macOS 러너 | 표준 macOS 러너 분당 USD 0.062(검색 요약) [C7]. 공개 저장소 무료 여부는 미확인 | 저장소가 공개라 기존 워크플로와 묶기 쉬움. 서명 비밀 관리가 필요 |
| 원격 Mac 임대(MacinCloud 등) | 월 수만 원대(미확인) | Xcode GUI를 쓸 수 있지만 느림 |

**추천**: 엔지니어링을 맡는 사람이 Mac을 갖고 있으면 그 Mac으로 개발하고, 업로드는 Codemagic 무료 분량으로 자동화합니다. 아무도 Mac이 없으면 Mac mini를 사는 편이 시행착오 비용보다 쌉니다.

## 4. App Store Connect 제출 체크리스트

| 항목 | 할 일 / 기준 | 출처 |
| --- | --- | --- |
| 번들 ID | 역도메인 형식, 한 번 정하면 바꿀 수 없음. 소유 도메인이 없으면 `io.github.songch9511.luma`처럼 GitHub Pages 도메인을 써도 됨 | Apple 일반 관행 |
| 서명 | Xcode 자동 서명(Mac) 또는 App Store Connect API 키 + CI 자동 서명. 배포 인증서와 프로비저닝 프로파일은 개발자 계정이 있어야 만듦 | — |
| 앱 레코드 | 이름, 기본 언어(한국어), 번들 ID, SKU, 사용자 접근 권한 | — |
| 이름 | **30자 이내**. 상표어·인기 앱 이름·가격 정보로 메타데이터를 채우지 말 것(2.3.7) | [A1] |
| 부제 | 30자(글자 수는 미확인, 화면에서 확인). 다른 앱 언급이나 검증할 수 없는 주장 금지(2.3.7) | [A1] |
| 카테고리 | 기본 **교육**, 보조 **참고**(게임·엔터테인먼트를 피해 한국 게임 등급을 피함) | [A10] |
| 스크린샷 | **iPhone: Dynamic Island 중형 디스플레이(1179×2556 또는 1206×2622) 최소 1장**, 크기별 최대 10장, PNG/JPEG, 투명도 불가. iPad 지원 시 13인치(2064×2752 등) 필수 → **v1은 iPhone 전용**으로 내서 iPad 스크린샷 부담을 없앰 | [A8] |
| 스크린샷 내용 | 실제 앱 화면. 할인 가격을 크리에이티브에 넣지 말 것(2026-10 신설 2.3.14, 검색 요약) | [A17][C8] |
| 개인정보처리방침 URL | **모든 앱에 필수**. 앱 안에서도 접근 가능해야 함. GitHub Pages에 한국어 정적 페이지로 둠 | [A2][A11] |
| 지원 URL | 필수. 깨진 링크는 흔한 리젝 사유 | [A11] |
| 개인정보 라벨(앱 개인정보 보호) | 아래 4.1 | [A2] |
| 수출 규정(암호화) | HTTPS(OS 제공 암호화)만 쓰면 보통 면제 대상이고 Info.plist에 `ITSAppUsesNonExemptEncryption = NO`를 넣으면 매번 묻지 않음. Apple 도움말은 키 이름은 링크로만 안내하고 "면제 판단 책임은 개발자"라고 함. 키 이름은 Apple 문서에서 다시 확인(미확인) | [A13] |
| 연령 등급 설문 | 해당 없음(UGC·채팅·광고·무제한 웹 접근 없음) → **4+** 예상. AI 생성 콘텐츠 전용 문항은 찾지 못함(미확인). 웹을 자유롭게 여는 브라우저가 있으면 16+이 되므로 외부 링크는 지정된 페이지만 | [A9] |
| 개인정보 매니페스트 | `PrivacyInfo.xcprivacy`에 필수 사유 API(UserDefaults 등) 사유 기재. Capacitor 템플릿과 플러그인의 매니페스트 포함 여부 확인(미확인) | — |
| 심사 메모 | 새 기능을 구체적으로 적어야 함(2.3.1(a), 일반적인 설명은 리젝). 1.2절의 네이티브 기능 목록과 확인 방법(알림 시각 바꾸기, 비행기 모드로 학습)을 적음 | [A1][A17] |
| 데모 계정 | 로그인이 없으면 불필요. 생기면 필수(2.1) | [A1] |

### 4.1 개인정보 라벨: 무엇을 신고하나

"수집"의 정의는 "실시간으로 요청을 처리하는 데 필요한 시간보다 오래, 개발자나 제3자가 접근할 수 있는 형태로 기기 밖에 보내는 것"입니다. 기기 안에서만 처리하는 데이터는 수집이 아닙니다. 제3자 SDK가 수집하는 것도 포함해서 신고합니다 [A2].

| 단계 | 신고 내용 |
| --- | --- |
| v1(백엔드·분석·결제 없음) | **"데이터를 수집하지 않음"**. 학습 기록은 기기에만 있음 |
| + AI 프록시 | 서버가 요청 로그나 결과 캐시에 기기 ID·단어 요청을 남기면 "식별자(기기 ID)", "사용 데이터(제품 상호작용)"가 해당되고 목적은 앱 기능. 로그를 남기지 않고 실시간 처리만 하면 신고 대상에서 빠질 수 있음 → 서버 로그 정책을 `07-security-operations.md`에서 정함 |
| + 인앱결제(RevenueCat 등) | "구매 내역", "식별자(사용자 ID)", 앱 기능 목적. 결제 정보는 Apple이 처리하므로 "금융 정보"는 아님 |
| + 분석 도구 | "사용 데이터", "진단"(크래시). 추적(ATT)에 쓰지 않는 도구를 고르기 |
| + 계정 | "연락처 정보(이메일)", 계정 삭제 기능 필수 |

### 4.2 이름에 "JLPT"를 쓰는 문제

- **가이드라인**:
  - 5.2.1: "허락 없이 상표 등 제3자 보호 자료를 쓰지 말고, 오해를 부르는 이름·메타데이터를 쓰지 말 것"
  - 4.1(c): 다른 개발자의 브랜드나 제품명을 앱 이름·아이콘에 쓰지 말 것
  - 2.3.7: 상표어로 메타데이터를 채우지 말 것 [A1]
- **JLPT 상표 등록 여부**: 일본국제교류기금과 일본국제교육지원협회가 시험을 공동 운영합니다. "JLPT" 문자 상표가 한국·미국·일본에 등록돼 있는지는 이번 검색으로 **확인하지 못했습니다(미확인)**. KIPRIS와 J-PlatPat에서 직접 확인해야 합니다. jlpt.jp 이용 정책은 사이트 저작물만 다룹니다(검색 요약) [K3].
- **비교 앱**: "Migii JLPT: JLPT test N5-N1", "JLPT Words: Vocabulary", "JLPT N5 ~ N1 Learn Japanese" 등 이름에 JLPT를 넣은 앱이 여럿 올라 있습니다 [K4]. 시험 이름을 **대상 시험을 설명하는 말로** 쓰는 것은 흔하다는 뜻입니다. 다만 이들이 허락을 받았는지는 알 수 없습니다.
- **추천**: 브랜드는 "루마"로 하고, JLPT는 설명어 위치에 둡니다.
  - 이름 예: **"루마 – JLPT 단어 N5~N1"**(30자 이내)
  - 부제·설명에 "본 앱은 일본국제교류기금 및 일본국제교육지원협회와 관련이 없으며 공식 앱이 아닙니다"라는 비공식 고지를 넣습니다.
  - 공식 로고, 시험지 디자인, "공식", "합격 보장" 같은 표현은 쓰지 않습니다.
  - 이렇게 하면 "오해를 부르는 이름"과 상표 남용 위험이 모두 줄어듭니다.
  - 리젝되면 이름에서 JLPT를 빼고 키워드 필드로 옮기면 됩니다(키워드에 상표어를 넣는 것도 2.3.7에 걸릴 수 있으니 최소한으로).

### 4.3 단어 데이터의 권리

- **open-anki-jlpt-decks**: MIT, Copyright (c) 2020 Jamie Sinclair. 저장소 LICENSE에서 직접 확인했습니다. 원 데이터는 chyyran/jlpt-anki-decks에서 왔고, 그 원본은 tanos.co.uk 덱이라고 README에 적혀 있습니다. 상업적 이용은 허용되며, 저작권 고지와 허가 문구를 함께 배포해야 합니다.
- **tanos.co.uk(Jonathan Waller)**: 여러 2차 출처가 **CC BY**라고 적고, 사이트는 현재 닫혔다고 합니다 [K5]. 원문 라이선스 문구와 버전은 **미확인**입니다. CC BY는 상업 이용을 허용하고 저작자 표시를 요구합니다. MIT 저장소가 CC BY 데이터를 다시 라이선스할 수 있는지는 불분명하므로, **두 출처 모두 표시**하는 것이 안전합니다.
- **영어 뜻(`en` 필드)**: tanos 목록의 영어 풀이가 JMdict/EDICT(CC BY-SA)에서 왔는지는 미확인입니다 [K5]. 앱은 한국어 뜻이 비어 있을 때 영어를 보여 줍니다. 한국어 뜻이 전부 채워졌다면 앱 번들에서 `en`을 빼는 방법도 있습니다. BY-SA가 적용되면 그 데이터를 같은 조건으로 공개해야 할 수 있기 때문입니다.
- **조치**: 설정 › "정보·라이선스" 화면에 MIT 전문, tanos CC BY 표시, 한국어 뜻은 기계 번역이라는 고지를 넣습니다. Apple이 이를 직접 묻지는 않지만, 5.2.1의 "권리를 가진 자가 제출"에 대한 근거가 됩니다.

### 4.4 AI 생성 콘텐츠

- 생성 AI만 다루는 별도 가이드라인은 없습니다. 관련 조항은 다음과 같습니다 [A1][A17].
  - 5.1.2(i): 제3자 AI로 데이터를 보낼 때 고지하고 동의를 받음
  - 1.2: "AI content creation apps"를 사용자 생성 콘텐츠 규정 범위에 언급. 2026-10에는 AI 생성 비동의 성적 이미지 조항 추가
  - 2.5.19: 심사 뒤 기능 변경 금지
- 이 앱의 AI 출력은 본인에게만 보이는 학습 설명이라 1.2의 UGC 요건(신고·차단)이 그대로 적용된다고 보기 어렵습니다. 그래도 **AI 결과 화면에 "AI가 만든 내용이라 틀릴 수 있어요"와 "신고" 버튼**을 두면 심사와 품질 모두에 유리합니다.

## 5. 인앱결제: 심사 관점

가격과 모델은 `01-business-model.md`를 따릅니다. 여기서는 심사 요건만 다룹니다.

- **맞는 상품 유형**:
  - 평생 이용권 → **비소모성**(non-consumable). 복원 필수
  - 구독 → **자동 갱신 구독**. 기간이 최소 7일이어야 하고 사용자의 모든 기기에서 쓸 수 있어야 함(3.1.2(a)) [A1]
  - AI 사용량 충전 → **소모성**. 구매한 크레딧은 만료되면 안 됨(3.1.1) [A1]
- **심사자가 보는 것**:
  1. **구매 복원 버튼**. 페이월과 설정에 둡니다(3.1.1, 구독 페이지) [A1][A14].
  2. **페이월 표시 요건**(구독) [A14]:
     - 구독 이름과 기간, 받는 것
     - **실제 청구 금액이 가장 눈에 띄는 가격 요소**일 것. 연간 상품의 "월 환산가"는 그보다 작게
     - 무료 체험이면 기간과 체험 후 청구 금액
     - 복원·로그인 방법
     - 이용약관(EULA)과 개인정보처리방침 링크를 **앱 안과 스토어 메타데이터 양쪽에** 둘 것. Apple 표준 EULA를 쓰면 설명란에 그 링크를 넣는 관행이 있음(미확인)
  3. 구독 관리: `showManageSubscriptions` 시트로 해지 경로를 쉽게 둡니다 [A14].
  4. 2.1(b): 설정한 인앱결제 상품이 모두 앱에서 보이고 동작해야 합니다. 상품을 심사에 함께 제출합니다 [A1].
  5. **외부 결제 링크 금지**: 3.1.1(a)에 따라 미국 스토어를 뺀 모든 스토어에서는 인앱결제 외 구매로 이끄는 버튼·링크·문구를 넣을 수 없습니다(별도 권한을 받은 경우 제외) [A1]. 한국 스토어에는 이 예외가 없습니다. → **앱과 메타데이터에서 웹 결제를 언급하지 않습니다.**
- **테스트 절차**:
  1. Xcode StoreKit 구성 파일로 로컬 테스트를 합니다. App Store Connect 상품이 없어도 가능합니다 [A18].
  2. App Store Connect에 상품을 만들고 샌드박스 테스터 계정을 만듭니다(스토어 지역 지정 가능) [A18].
  3. 개발 빌드를 기기에 설치하고(개발자 모드 켜기) 샌드박스 계정으로 구매·복원·갱신·해지를 시험합니다. 갱신 주기는 짧게 가속됩니다 [A18].
  4. TestFlight 빌드로 같은 시나리오를 반복합니다(TestFlight 구매는 샌드박스로 처리되어 과금되지 않는 것으로 알려짐, 미확인).
  5. 서버가 영수증을 확인한다면 App Store Server Notifications 샌드박스 수신을 확인합니다 [A18].

## 6. 심사 과정

- **TestFlight** [A19]:
  - **내부 테스터**: App Store Connect 사용자 최대 100명, 심사 없음
  - **외부 테스터**: 최대 10,000명, 이메일 초대나 공개 링크. **그룹에 처음 올린 빌드는 베타 심사를 받음**(이후 빌드는 보통 간소화)
  - 빌드는 90일 뒤 만료
  - 추천: 외부 테스트로 지인 10~20명을 1~2주 돌립니다. 베타 심사에서 4.2 같은 문제를 미리 들을 수 있습니다.
- **소요 시간**: Apple은 "제출의 50% 이상을 24시간 안에, 90%를 48시간 안에 심사한다"고 밝힙니다 [A11]. 첫 제출은 리젝이 한 번 나온다고 보고 1주를 더 잡습니다.
- **이 앱에서 흔할 리젝 사유와 미리 막는 법**:

| 사유 | 이 앱에서 생길 지점 | 예방 |
| --- | --- | --- |
| 4.2 최소 기능 / 웹 클리핑 | Capacitor 래핑만 하고 냄 | 1.2절의 다섯 가지 + 심사 메모에 확인 방법 적기. 웹 느낌 제거(2.2절) |
| 2.1 완성도(리젝의 40% 이상) | 첫 실행 시 데이터 로딩 실패, 내보내기 버튼 무반응, 크래시 | 실기기 + 비행기 모드 테스트, 내보내기를 공유 시트로 교체, TestFlight 1~2주 [A11] |
| 깨진 링크·개인정보처리방침 | 방침 URL 미준비, 앱 안 링크 없음 | Pages에 방침·지원 페이지를 먼저 올림 [A11] |
| 5.2.1 / 2.3.7 상표·오해 | 이름의 "JLPT", "합격" 같은 표현 | 4.2절 이름안과 비공식 고지 |
| 2.3 부정확한 스크린샷 | 목업이나 없는 기능(AI) 표시 | v1에 있는 화면만 캡처 |
| 3.1.1 / 3.1.2 결제 | 복원 버튼 없음, 월 환산가를 크게 표시 | 5절 요건 |
| 5.1.1 / 5.1.2 개인정보 | AI 전송 동의 없음, 라벨과 실제가 다름 | 동의 화면, 라벨 갱신 |
| 2.5.19 미끼 상술 | 승인 뒤 원격 플래그로 AI나 유료 기능을 켬 | 기능 변경은 항상 새 버전 심사 [A17] |

- **리젝됐을 때**:
  1. App Store Connect의 앱 › App Review 메시지에서 지적된 가이드라인 번호와 문장을 읽습니다.
  2. 고칠 수 있으면 고치고, 답장에 **무엇을 어디서 바꿨는지 구체적으로** 적은 뒤 새 빌드를 제출합니다.
  3. 오해라면 같은 스레드에서 확인 절차(어느 화면, 어떤 동작)를 설명합니다. 필요하면 화면 녹화를 첨부합니다.
  4. 그래도 안 되면 App Review Board에 이의를 제기합니다. 제출 한 건당 한 번이고, 먼저 추가 정보 요청에 답해야 합니다 [A11].
  5. 출시 일정이 걸린 치명적 버그 수정은 신속 심사를 요청할 수 있습니다 [A11].

## 7. 일정과 비용

### 7.1 첫 승인까지의 체크리스트(의존 순서)

주 단위는 오늘(2026-11-13) 시작 기준입니다. 결정이 빨리 나면 앞당겨집니다.

**소유자만 할 수 있는 일**(계정 소유자 본인 확인, 계약, 법적 책임):

- [ ] O1. (1주차) "결정이 필요한 것" 1~4 결정: 앱 이름, 개인/조직, v1 무료 여부, 출시 국가
- [ ] O2. (1주차) Apple 계정 실명 확인과 이중 인증 → Developer Program 개인 가입·결제(USD 99)
- [ ] O3. (1주차) 번들 ID에 쓸 도메인 결정(없으면 GitHub Pages 도메인 사용)
- [ ] O4. (2주차, 유료를 v1에 넣을 때만 필수) 홈택스에서 개인사업자 등록. 통신판매업 신고 필요 여부는 세무사 확인
- [ ] O5. (O2 뒤) App Store Connect 사용자 초대: 엔지니어를 "앱 관리자" 또는 "개발자"로. App Store Connect API 키 발급(CI 업로드용)
- [ ] O6. (O2 뒤) 비즈니스 › 대한민국 법률 준수 정보 입력(이메일·전화 인증, BRN이 있으면 입력)
- [ ] O7. (유료 시) 유료 앱 계약 동의, W-8BEN, 한국 세금 양식(BRN), 은행 계좌. Small Business Program 신청
- [ ] O8. (4주차) 개인정보처리방침·지원 페이지 내용 승인(본인 이름과 연락처가 들어감)
- [ ] O9. (6주차) 최종 메타데이터 확인 → "심사에 제출" → 리젝 대응 승인 → 출시 버튼

**엔지니어링**:

- [ ] E1. (1~2주차) `platform.ts` 추상화, 네이티브 빌드 모드(SW 끔), Capacitor iOS 프로젝트(SPM), 시뮬레이터 실행
- [ ] E2. (2주차) 저장소를 Preferences/SQLite로 이전 + 첫 실행 시 기존 localStorage에서 옮겨 오기(앱 안 WebView 데이터)
- [ ] E3. (2~3주차) 로컬 알림, 네이티브 TTS, 햅틱, 상태 표시줄·스플래시·아이콘, 공유 시트 내보내기
- [ ] E4. (3~4주차) 위젯(Swift, App Group). 일정이 빠듯하면 1.1로 미룸
- [ ] E5. (3주차) 웹의 "앱으로 옮기기" 안내 + 앱 온보딩의 "기록 가져오기"
- [ ] E6. (3주차) 정보·라이선스 화면, 개인정보처리방침·지원 페이지(Pages), `PrivacyInfo.xcprivacy`, `ITSAppUsesNonExemptEncryption`
- [ ] E7. (O5 뒤, 4주차) 서명과 CI 업로드(Codemagic 또는 Mac) → TestFlight 내부 테스트
- [ ] E8. (4~5주차) 외부 TestFlight(베타 심사) 1~2주, 실기기·오프라인·다크 모드·작은 화면 QA(`04-qa-report.md`의 체크리스트 재사용)
- [ ] E9. (5주차) 스크린샷(1206×2622, 5~6장), 설명, 키워드, 심사 메모 작성
- [ ] E10. (v1.1) AI 프록시 + 동의 화면 + 인앱결제(RevenueCat 등) + 샌드박스 테스트 → 새 버전 심사

**예상**: 제출은 5~6주차, 첫 승인은 **6~8주차(2026년 12월 말~2027년 1월 초)**입니다. 연말에는 Apple이 App Store Connect 제출을 며칠 받지 않는 기간을 두기도 하니(올해 일정은 미확인) 12월 중순 전에 제출하는 것을 목표로 합니다.

### 7.2 비용

| 항목 | 일회성 | 반복 | 비고 |
| --- | --- | --- | --- |
| Apple Developer Program | — | USD 99/년 | 원화 금액은 가입 화면에서(미확인) [A3] |
| Mac | 0원(보유) 또는 약 90만 원대부터(미확인) | — | 3.4절 |
| 클라우드 빌드(Codemagic) | — | 월 500분까지 0원, 초과분 USD 0.095/분 | 검색 요약 [C6] |
| 테스트용 iPhone | 0원(보유 가정) | — | 실기기 테스트 필수 |
| 개인사업자 등록 | 0원(일반적으로 수수료 없음, 미확인) | 부가세·종합소득세 신고 부담 | 유료 판매 시 |
| 통신판매업 신고 | 미확인(등록면허세 연 수만 원 수준으로 알려짐) | 매년 | 필요 여부 미확인 |
| 개인정보처리방침·지원 페이지 호스팅 | 0원(GitHub Pages) | 0원 | — |
| 도메인(선택) | — | 연 1~3만 원(미확인) | 번들 ID·이메일·브랜드용 |
| AI 프록시·서버 | — | `01-business-model.md`, `07-security-operations.md` 참고 | v1.1 |
| Apple 수수료 | — | 매출의 15%(Small Business Program) | [A12] |
| Google Play(선택) | USD 25(1회, 검색 요약) | — | 8절 |

## 8. Google Play는 무엇이 다른가

- **코드**: Capacitor라면 `npx cap add android`로 같은 웹 코드를 씁니다. 위젯만 Kotlin으로 따로 만듭니다.
- **계정**: 등록비는 1회 USD 25입니다(검색 요약) [K6]. **2023-11-13 이후 만든 개인 계정은 비공개 테스트에 테스터 12명을 14일 연속 참여시켜야** 프로덕션 출시 권한을 받습니다. 조직 계정은 면제입니다(검색 요약) [K6]. 개인 개발자에게는 이 조건이 Apple 심사보다 더 큰 일정 부담입니다.
- **심사**: 웹 래퍼에 대한 최소 기능 기준이 Apple보다 느슨하다고 알려져 있습니다(미확인). 결제는 Google Play 결제가 기본이고, 한국에는 제3자 결제(사용자 선택 결제)가 있습니다(조건 미확인).
- **판단**: iOS v1 승인 직후 Android를 시작하는 것을 추천합니다. TestFlight 외부 테스터를 그대로 Android 비공개 테스터 12명으로 모으면 14일 조건을 iOS 출시 기간과 겹쳐서 채울 수 있습니다.

## 결정이 필요한 것

1. **앱 이름과 JLPT 표기**: "루마 – JLPT 단어 N5~N1"처럼 브랜드를 앞에 두고 JLPT는 설명어로 쓰며, 비공식 고지를 넣을지. → **추천: 그렇게 합니다.** 개명(카사네 → 루마)도 이 시점에 확정해야 번들 ID·아이콘·스크린샷을 한 번에 만듭니다.
2. **가입 형태**: 개인(판매자명이 실명으로 표시) vs 법인 설립 후 조직. → **추천: 개인으로 시작.** 법인이 생기면 전환을 요청합니다(전환 가능 여부·절차는 미확인).
3. **v1을 무료로 낼지**: v1 무료(AI 숨김, 인앱결제 없음) → v1.1 유료, 또는 v1부터 유료. → **추천: v1 무료.** 사업자등록·유료 앱 계약·백엔드 프록시를 첫 승인의 선행 조건에서 뺄 수 있어 2~3주 빨라집니다. 대신 매출 시작이 한 버전 늦어집니다.
4. **사업자등록 시점**: → **추천: 지금 시작.** v1 무료여도 v1.1(유료)의 선행 조건이고, 처리에 며칠이 걸립니다. 통신판매업 신고 필요 여부는 세무사에게 확인합니다.
5. **빌드 환경**: Mac 구입 vs Codemagic만 사용. → **추천:** 엔지니어에게 Mac이 있으면 그 Mac과 Codemagic 무료 분량을 쓰고, 없으면 Mac mini를 삽니다.
6. **출시 국가**: → **추천: v1은 한국 스토어만.** 한국어 전용 앱이라 다른 나라에서는 가치가 낮고, 국가별 법적 요건이 줄어듭니다. 재일 한국인 수요가 있으면 일본을 추가합니다.
7. **기기 범위**: → **추천: v1은 iPhone 전용.** iPad를 빼면 13인치 스크린샷과 레이아웃 QA가 필요 없습니다.
8. **위젯을 v1에 넣을지**: → **추천: 넣습니다.** 1주가 늘지만 4.2 리젝 한 번(약 1주)을 막는 보험이 되고, 학습 습관에도 직접 도움이 됩니다.
9. **AI 기능의 앱 내 제공 방식**: 사용자 키 입력을 iOS에서 완전히 없애고 자체 프록시 + 인앱결제로 제공할지. → **추천: 그렇게 합니다**(웹은 `01-business-model.md`의 결정을 따름).
10. **Google Play 동시 진행 여부**: → **추천: iOS 승인 뒤 바로 시작하고, 12명 테스트는 iOS 외부 테스트와 겹쳐서 모집합니다.**

## 출처 (모두 2026-11-13 확인)

- [A1] App Review Guidelines(Last Updated: October 16, 2026) — https://developer.apple.com/app-store/review/guidelines/
- [A2] App privacy details — https://developer.apple.com/app-store/app-privacy-details/
- [A3] Enrollment — https://developer.apple.com/programs/enroll/
- [A4] D-U-N-S Number — https://developer.apple.com/support/D-U-N-S/
- [A5] 대한민국 규정 준수 정보 관리 — https://developer.apple.com/kr/help/app-store-connect/manage-compliance-information/manage-korea-compliance-information/
- [A6] 포럼: Korean Individual Developer – Paid Apps Agreement requires BRN(2026-06, 무응답) — https://developer.apple.com/forums/thread/829386
- [A7] 세금 양식 개요 — https://developer.apple.com/kr/help/app-store-connect/provide-tax-information/tax-forms-overview/
- [A8] Screenshot specifications — https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
- [A9] Age ratings values and definitions — https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/
- [A10] 앱 연령 등급 설정(한국 지역 등급) — https://developer.apple.com/kr/help/app-store-connect/manage-app-information/set-an-app-age-rating/ , https://developer.apple.com/news/?id=7byvco78
- [A11] App Review(소요 시간, 흔한 리젝 사유, 이의 제기) — https://developer.apple.com/distribute/app-review/
- [A12] App Store Small Business Program — https://developer.apple.com/app-store/small-business-program/
- [A13] Overview of export compliance — https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/
- [A14] Auto-renewable subscriptions — https://developer.apple.com/app-store/subscriptions/
- [A15] 포럼: Capacitor 앱 4.2 리젝 사례 — https://developer.apple.com/forums/thread/812889
- [A16] SDK minimum requirements — https://developer.apple.com/news/upcoming-requirements/
- [A17] 가이드라인 개정(2026-10, 1.2·2.5.19·5절) — https://developer.apple.com/news?id=vvzx6cul
- [A18] Overview of testing in sandbox — https://developer.apple.com/help/app-store-connect/test-in-app-purchases/overview-of-testing-in-sandbox/
- [A19] Overview of TestFlight — https://developer.apple.com/help/app-store-connect/test-a-beta-version/overview-of-testflight/
- [C1] Capacitor 8 발표·9 일정(검색 요약) — https://ionic.io/blog/announcing-capacitor-8 , https://ionic.io/blog/capacitor-9-starts-here
- [C2] 4.2 웹 래퍼 리젝 경향(업체 글) — https://capgo.app/blog/how-to-pass-app-store-review-2026/ , https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper
- [C3] 오프라인 오류 화면과 4.2(업체 글) — https://www.superappp.com/blog/no-code-app-builder-app-store-approval
- [C4] WKWebView 서비스 워커와 App-Bound Domains(검색 요약) — https://bugs.webkit.org/show_bug.cgi?id=206741 , https://developer.apple.com/forums/thread/781744
- [C5] Capacitor Storage 가이드(검색 요약) — https://capacitorjs.com/docs/guides/storage
- [C6] Codemagic 가격(검색 요약) — https://docs.codemagic.io/billing/pricing/
- [C7] GitHub Actions 러너 가격(검색 요약) — https://docs.github.com/en/billing/reference/actions-runner-pricing
- [C8] 2.3.14 신설 보도(2차 출처) — https://ppc.land/apples-rule-2-3-14-bans-discount-prices-in-app-store-creative-assets/
- [K1] 통신판매업 신고 관련 커뮤니티 Q&A(비공식) — https://www.inflearn.com/community/questions/1553958
- [K2] 한국 StoreKit External Purchase Entitlement(2022 보도) — https://www.macrumors.com/2022/06/30/app-store-alternative-payments-south-korea/
- [K3] jlpt.jp 이용 정책(검색 요약) — https://jlpt.jp/e/policy.html
- [K4] 비교 앱: Migii JLPT https://apps.apple.com/app/id1463267540 , JLPT Words https://apps.apple.com/app/id6450907938 , JLPT N5 ~ N1 Learn Japanese https://apps.apple.com/us/app/-/id1425708389
- [K5] tanos 데이터 CC BY 표기(2차 출처) — https://github.com/Bluskyo/JLPT_Vocabulary , https://japandict.com/attributions , EDRDG 라이선스 https://www.edrdg.org/edrdg/license.html
- [K6] Google Play 개인 계정 테스트 요건(검색 요약) — https://support.google.com/googleplay/android-developer/answer/14151465
