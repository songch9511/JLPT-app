# App 개인정보 보호(App Privacy) 답안과 필수 사유 API

작성 2026-11-14. 1장은 지금 빌드(1.0), 2장은 루마 플러스 빌드, 3·4장은 개인정보 매니페스트, 5장은 처리방침과 이 답안의 근거로 코드에서 확인한 내용입니다.

## 0. Apple 정의 (2026-11-14, [App privacy details](https://developer.apple.com/app-store/app-privacy-details/) 직접 확인)

- **수집(collect)**: "데이터를 기기 밖으로 보내, 실시간으로 요청을 처리하는 데 필요한 시간보다 오래 개발자나 제3자 파트너가 접근할 수 있게 하는 것." 기기 안에서만 처리하면 수집이 아닙니다. 제3자 SDK가 수집하는 것도 개발자가 신고합니다.
- **사용자에게 연결됨(linked)**: 계정·기기·기타 정보로 사용자 신원과 연결되는 경우. 직접 식별자를 수집 전에 제거하고 다시 연결하지 않는 등의 조치가 없으면 대개 연결된 것으로 봅니다. 관련 법에서 말하는 "개인정보"는 연결된 것으로 간주합니다.
- **추적(tracking)**: 앱에서 모은 사용자·기기 데이터를 광고 목적으로 제3자 데이터와 연결하거나 데이터 브로커와 공유하는 것.
- **앱 기능(App Functionality) 목적**: 인증, 기능 제공, 사기 방지, 보안, 서버 가동, 충돌 최소화, 성능, 고객 지원 등.
- **신고하지 않아도 되는 경우**는 네 조건(추적·광고 목적 아님, 드물고 주 기능이 아니며 선택적, 사용자가 화면에서 직접 제출하고 매번 선택 …)을 **모두** 만족할 때뿐입니다. 이 앱의 구매·이야기 기능은 주 기능의 일부라 해당하지 않는다고 봅니다.

## 1. 지금 빌드(1.0): "데이터를 수집하지 않음"

App Store Connect › 앱 개인정보 보호 › "이 앱에서 데이터를 수집합니까?" → **아니요, 이 앱에서 데이터를 수집하지 않습니다.**

| Apple 데이터 유형 | 답 | 이유 |
| --- | --- | --- |
| 연락처 정보(이름·이메일·전화·주소 등) | 수집 안 함 | 입력란 자체가 없음 |
| 건강·피트니스, 금융 정보, 위치, 민감 정보, 연락처(주소록) | 수집 안 함 | 해당 API를 쓰지 않음 |
| 사용자 콘텐츠(사진·영상·오디오·고객 지원·기타) | 수집 안 함 | 백업 파일은 사용자가 공유 시트로 직접 보내는 곳을 고르며 개발자에게 오지 않음. 가져오기는 기기 안에서만 읽음 |
| 검색 기록 | 수집 안 함 | 단어장 검색은 기기 안 필터링(네트워크 없음) |
| 식별자(사용자 ID·기기 ID) | 수집 안 함 | IDFA·IDFV를 읽는 코드 없음, 계정 없음 |
| 구입 항목 | 수집 안 함 | 1.0은 인앱 구매 없음 |
| 사용 데이터(제품 상호작용·광고·기타) | 수집 안 함 | 학습 기록은 기기에만. 분석 SDK 없음 |
| 진단(충돌·성능·기타) | 수집 안 함 | 오류 추적 도구 없음. (Apple이 기기 설정에 따라 받는 충돌 보고는 개발자 수집으로 신고하지 않음) |
| 추적 | 아니요 | `NSPrivacyTracking = false`, ATT 요청 없음 |

주의: 위 답은 **이 앱이 운영자 서버나 제3자 서버와 통신하지 않는다**는 사실에 기대고 있습니다(5장). 1.0 출시 전에 오류 보고(Sentry 등)나 사용 측정(02 결정 8 "F0 익명 사용 측정")을 넣으면 이 답을 바꿔야 합니다.

## 2. 루마 플러스 빌드(RevenueCat + Cloudflare Worker + 이야기)

설계: `docs/plan/01-business-model.md` 5.4, `server/README.md` 5장. 아직 앱 쪽 코드는 없으므로 실제 구현을 보고 다시 맞춥니다. **보수적으로(신고하는 쪽으로)** 잡았습니다.

| 데이터 유형 | 수집 | 목적 | 사용자에게 연결 | 추적 | 이유 |
| --- | --- | --- | --- | --- | --- |
| **구입 항목(Purchase History)** | 예 | 앱 기능 | 예 | 아니요 | RevenueCat이 거래 정보를 보관하고, 서버 D1 `entitlements`에 권한 상태를 앱 사용자 ID 해시와 함께 저장 |
| **식별자 › 사용자 ID(User ID)** | 예 | 앱 기능 | 예 | 아니요 | RevenueCat 익명 앱 사용자 ID(`$RCAnonymousID:…`)는 Apple 정의의 "assigned user ID". 서버는 HMAC 해시만 저장하지만 페퍼로 다시 계산할 수 있으므로 연결된 것으로 봄 |
| **사용 데이터 › 제품 상호작용(Product Interaction)** | 예 | 앱 기능 | 예 | 아니요 | 사용자 해시별 하루 이야기 사용·시도 횟수를 35일 저장(`story_usage`) — 할당량 적용 목적 |
| **사용 데이터 › 기타 사용 데이터(Other Usage Data)** | 예(아래 조건) | 앱 기능 | 예(보수적) | 아니요 | 이야기 요청의 단어 목록이 Anthropic으로 감. 서버는 저장·기록하지 않지만, Anthropic API가 입력을 얼마 동안 보관하는지에 따라 "실시간 처리보다 오래 접근 가능"이 될 수 있음. 함께 가는 `metadata.user_id`(해시 앞 32자) 때문에 연결된 것으로 봄. Anthropic의 API 데이터 보관 정책을 확인해 "보관하지 않음"이면 신고에서 뺄 수 있음 |
| 식별자 › 기기 ID | **확인 필요** | 앱 기능 | — | 아니요 | RevenueCat iOS SDK가 IDFV 등 기기 식별자를 보내는지 이 작업에서 확인하지 못함(SDK가 아직 의존성에 없음). RevenueCat의 "Apple App Privacy" 안내 문서로 확인 |
| 진단 | 아니요(오류 추적을 넣지 않는 경우) | — | — | — | 서버 로그에는 경로·상태·지연·토큰 수만. 클라이언트 오류 추적을 넣으면 "충돌 데이터"를 추가 |
| 연락처·이메일 | 아니요 | — | — | — | 계정 없음(3단계 Sign in with Apple을 만들면 추가) |
| 추적 | 아니요 | — | — | — | IDFA 미사용, 광고 없음 |

추가로 해야 할 것: 3자 SDK(RevenueCat)의 개인정보 매니페스트가 앱에 함께 들어가는지 Xcode의 "Generate Privacy Report"로 확인하고, 그 보고서와 이 표를 맞춥니다.

## 3. 필수 사유 API(required reason API) 선언 확인

### 3.1 Apple의 현재 목록 (2026-11-14 확인)

`https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api`는 본문이 스크립트로 그려져 WebFetch로 읽히지 않아, 같은 문서의 JSON 원본(`/tutorials/data/documentation/bundleresources/…/nsprivacyaccessedapitype.json`)을 직접 받아 읽었습니다. 범주는 다섯 개입니다: 파일 타임스탬프, 시스템 부팅 시각, 디스크 공간, 활성 키보드, UserDefaults. 이 앱에 관계되는 사유 코드의 정의:

| 범주 | 코드 | Apple 정의(요약) |
| --- | --- | --- |
| 파일 타임스탬프 (`creationDate`, `modificationDate`, `fileModificationDate`, `contentModificationDateKey`, `creationDateKey`, `getattrlist`, `getattrlistbulk`, `fgetattrlist`, `stat`, `fstat`, `fstatat`, `lstat`, `getattrlistat`) | DDA9.1 | 사용자에게 파일 시각을 보여 주기 위해. 기기 밖 전송 금지 |
| | **C617.1** | 앱 컨테이너·App Group 컨테이너·앱의 CloudKit 컨테이너 **안의** 파일 메타데이터 접근 |
| | **3B52.1** | 사용자가 문서 선택기 등으로 **직접 접근을 허락한** 파일·폴더의 메타데이터 접근 |
| | 0A2A.1 | 3자 SDK가 앱을 위한 래퍼 함수를 제공할 때(3자 SDK만) |
| UserDefaults | CA92.1 | 앱 자신만 접근하는 정보 읽기·쓰기 |
| | **1C8F.1** | 같은 **App Group**의 앱·확장만 접근하는 정보 읽기·쓰기 |
| | C56D.1 | 3자 SDK 래퍼(3자 SDK만) |
| | AC6B.1 | MDM 관리 설정 키 |

### 3.2 앱이 실제로 쓰는 것 (코드에서 확인)

`ios/App/CapApp-SPM/Package.swift`가 묶는 패키지와 앱 자체 Swift 코드를 `grep`으로 찾았습니다(찾은 패턴: 위 표의 API 이름 전부, `UserDefaults`, `systemUptime`, `mach_absolute_time`, `statfs`, `statvfs`, `volumeAvailableCapacity*`, `systemFreeSize`, `activeInputModes`).

| 코드 | 쓰는 API | 범주 · 맞는 사유 | 지금 매니페스트 |
| --- | --- | --- | --- |
| `ios/App/App/WidgetBridgePlugin.swift` | `UserDefaults(suiteName: <App Group>)` | UserDefaults · **1C8F.1** | 앱: 1C8F.1 ✔ |
| `ios/App/RumaWidget/RumaWidget.swift` | `UserDefaults(suiteName: Shared.appGroup)` | UserDefaults · **1C8F.1** | 위젯: 1C8F.1 ✔ |
| `@capacitor/filesystem` 8.1.5 → `IONFileStructures+Converters.swift` (`creationDate`, `modificationDate`) | 파일 타임스탬프 | 앱 컨테이너 안 파일 · **C617.1** | 앱: C617.1 ✔ |
| `ion-ios-filesystem` 2.0.1(위 플러그인의 SPM 의존성, GitHub에서 태그를 받아 확인) → `IONFILEManager.swift:165` `attributesOfItem(atPath:)` | 파일 타임스탬프(`stat` 메서드 경로에서만) | **C617.1** | 앱: C617.1 ✔ |
| `@capawesome/capacitor-file-picker` 8.1.1 → `FilePicker.swift:174` `attributesOfItem` + `.modificationDate` | 사용자가 고른 파일의 수정 시각 | **3B52.1** | 앱: 3B52.1 ✔ |
| `@capacitor/ios` 8.6.0(Capacitor·Cordova 런타임) | 해당 API 없음(소스 검색) | — | 패키지 자체 매니페스트: 수집 없음·API 없음·추적 없음 ✔ |
| `@capacitor/app`, `browser`, `haptics`, `local-notifications`, `share`, `status-bar`, `@capacitor-community/text-to-speech` | 해당 API 없음(소스 검색) | — | 해당 없음 |

결론: **지금의 `ios/App/App/PrivacyInfo.xcprivacy`(UserDefaults 1C8F.1, 파일 타임스탬프 C617.1·3B52.1)와 `ios/App/RumaWidget/PrivacyInfo.xcprivacy`(UserDefaults 1C8F.1)는 Apple의 현재 정의와 코드 사용에 맞습니다.** 10 문서 §3.6이 "기억에 의존(미확인)"이라고 적은 사유 코드 정의는 이번에 Apple 원문으로 확인됐습니다.

### 3.3 확인하지 못한 것

- **플러그인 자체 매니페스트**: `@capacitor/ios`의 두 개(`Capacitor/PrivacyInfo.xcprivacy`, `CapacitorCordova/PrivacyInfo.xcprivacy`, 둘 다 빈 선언)를 빼면, 다른 9개 플러그인과 `ion-ios-filesystem`에는 `.xcprivacy`가 **없습니다**. Apple은 "실행 파일이나 동적 라이브러리를 담은 번들마다" 매니페스트가 필요하다고 합니다. 이 플러그인들은 SPM 소스 패키지라 보통 앱 실행 파일에 정적으로 링크되고, 그러면 앱의 매니페스트가 덮습니다(위 결론의 전제). **실제로 정적 링크되는지는 Xcode 빌드에서만 확인됩니다** — 업로드 후 App Store Connect의 경고 메일(ITMS-91053 계열)이 없으면 맞는 것입니다.
- `capacitor-swift-pm` 8.6.0은 바이너리 xcframework로 받아지는데, 그 안의 매니페스트는 내려받아 보지 않았습니다. npm 패키지 `@capacitor/ios` 8.6.0의 소스 매니페스트(빈 선언)와 같다고 가정했습니다.
- Capacitor 런타임이 쓰는 WKWebView 내부(localStorage 등)는 Apple 시스템 프레임워크라 선언 대상이 아닙니다.
- "Generate Privacy Report"(Xcode › Archive › 오른쪽 클릭)를 돌려 보지 못했습니다. Mac에서 아카이브할 때 한 번 돌려 이 표와 비교하세요.

### 3.4 루마 플러스를 붙일 때

RevenueCat iOS SDK(Capacitor용 `@revenuecat/purchases-capacitor`가 쓰는 네이티브 SDK)는 자체 `PrivacyInfo.xcprivacy`를 갖고 있는 것으로 알려져 있지만, **이 저장소에 아직 없어서 확인하지 못했습니다**. 붙인 뒤 `node_modules`와 SPM 캐시에서 그 매니페스트를 열어 수집 유형(구입 항목·사용자 ID 등)과 필수 사유 API(UserDefaults CA92.1 등)를 확인하고, 2장 표와 맞춥니다.

## 4. 그 밖의 매니페스트·Info.plist 항목

| 항목 | 지금 값 | 판단 |
| --- | --- | --- |
| `NSPrivacyTracking` | false | 맞음 |
| `NSPrivacyTrackingDomains` | 빈 배열 | 맞음 |
| `NSPrivacyCollectedDataTypes` | 빈 배열 | 1.0에는 맞음. 플러스 빌드에서는 2장의 유형을 추가(구입 항목·사용자 ID·제품 상호작용 등) |
| `ITSAppUsesNonExemptEncryption` | false | HTTPS만 쓰면 면제(06 §4). 1.0은 네트워크 자체를 쓰지 않음 |
| 사용 목적 문자열(`NS…UsageDescription`) | 없음 | 로컬 알림·햅틱·음성·공유·문서 선택기는 필요 없음(10 §3.6). 사진 관련 경고(ITMS-90683)가 오면 추가(10 §7) |

## 5. 처리방침의 사실 확인 내역

`origin/main`(65e0e02) 기준으로 확인했습니다. 다른 작업이 작업 트리에서 단어 ID를 바꾸는 중이라, 네트워크 관련 사항만 작업 트리에서도 다시 찾았고 결과는 같았습니다.

| 주장 | 확인 방법 | 결과 |
| --- | --- | --- |
| 앱 코드가 외부로 요청하지 않음 | `src/` 전체에서 `fetch(`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, `https?://` 검색 | `fetch`는 두 곳: `src/data.ts`(같은 출처의 `data/n{1..5}.json`), `src/platform/native.ts`(앱 번들의 고지문 파일). 나머지 `https://`는 설정 › 정보의 라이선스 링크(`<a href>`) 7개뿐 |
| 분석·광고·오류 추적 없음 | `src/`에서 `analytics`, `sentry`, `gtag`, `anthropic` 검색, `package.json` 의존성 확인 | 없음. 의존성은 React, ts-fsrs, Astryx, StyleX, Lucide, Capacitor 플러그인 10개뿐 |
| 빌드 결과물에 외부 호스트 없음 | `dist/`, `dist-native/`에서 `https?://호스트` 추출 | w3.org(SVG 네임스페이스), react.dev(오류 메시지 문자열), bit.ly(workbox 경고 문자열), 라이선스 링크 호스트들뿐. 불러오는 스크립트·글꼴·CDN 없음 |
| `index.html`에 외부 자원 없음 | 파일 확인 | 자체 아이콘·번들만 |
| 네이티브 코드가 네트워크를 쓰지 않음 | 앱 Swift(`ios/App/App`, `ios/App/RumaWidget`)와 플러그인 Swift에서 `URLSession`, `URLRequest`, `NWConnection`, `http` 검색 | 앱 코드 0건. `@capacitor/filesystem`의 `downloadFile`만 `URLSession`을 쓰는데 앱은 이 메서드를 부르지 않음(`src/`에 `downloadFile` 없음) |
| Capacitor가 원격 서버를 열지 않음 | `capacitor.config.ts` | `server.url` 없음 → 앱 번들(`capacitor://localhost`)에서 실행 |
| 발음은 기기 안 | `src/platform/native.ts` | `@capacitor-community/text-to-speech`(AVSpeechSynthesizer), 웹은 `speechSynthesis`. 웹 브라우저의 온라인 음성 가능성은 처리방침에 적음 |
| 알림은 로컬 | `src/platform/native.ts`, `reminders.ts` | `@capacitor/local-notifications`만, 푸시 등록 코드 없음 |
| 백업은 사용자 동작으로만 | `src/backup.ts`, `native.ts` | 내보내기 버튼 → 캐시 폴더에 파일 → 공유 시트, 공유 후 파일 삭제. 가져오기는 문서 선택기(JSON) |
| 기기 저장 위치 | `src/store.ts`, `src/backup.ts`, `src/platform/durable.ts`, `widget.ts` | localStorage 키 `kasane.state.v2`, `kasane.state.prev`, `kasane.meta`; 앱 Library 폴더의 JSON 두 슬롯; App Group UserDefaults의 위젯 요약 |
| 초기화가 알림·위젯·파일까지 지움 | `docs/plan/10-ios-build.md` §3.2와 `native.ts`의 `clearDeviceData` | 예 |
| API 키 입력 기능 제거 | `src/store.ts` `normalize`/`load` | 예전 `apiKey`를 저장소에서 지우는 코드만 남음. `src/content.ts`는 설명·이야기 기능을 "준비 중"으로만 둠 |
| 서버(2부) 저장 항목 | `server/README.md` 5장 | 해시·권한·사용 횟수·지출·웹훅 ID만, 단어 목록·이야기·IP·원래 ID는 저장·기록 안 함(서버 테스트가 확인한다고 적혀 있음, 이 작업에서 테스트를 다시 돌리지는 않음) |
