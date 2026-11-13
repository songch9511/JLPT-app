# JLPT 루마 디자인 시스템

작성 2026-11-13 · Astryx `@astryxdesign/core` **0.7.15** (베타, 정확한 버전으로 고정) · 테마 `ruma`

이 앱의 화면은 Meta의 오픈소스 디자인 시스템 [Astryx](https://github.com/meta/astryx)(MIT) 위에, 일본 전통색으로 만든 테마 `ruma`를 얹어 그립니다. 테마가 색·글자·간격·모서리·깊이·움직임의 **유일한 출처**이고, 앱의 CSS(`src/styles.css`)는 같은 토큰만 씁니다.

## 1. 구조

| 파일 | 내용 |
| --- | --- |
| `src/themes/ruma/rumaTheme.ts` | 테마 원본(`defineTheme`). 팔레트, 토큰, 컴포넌트 재정의. **값은 여기서만 바꿉니다.** |
| `src/themes/ruma/icons.ts` | Astryx가 쓰는 아이콘 이름(close, info, search …)을 Lucide로 그린 목록 |
| `src/themes/ruma/ruma.css`, `ruma.js` | `npm run theme`이 만드는 빌드 결과(손으로 고치지 않음, 커밋함) |
| `scripts/build-theme.mjs` | `astryx theme build` 실행 후 `@scope`를 펼쳐 iOS 16.4~17.3에서도 동작하게 함(8장) |
| `src/main.tsx` | CSS 순서(reset → astryx.css → ruma.css → styles.css)와 루트 `<Theme>` |
| `src/components/ui.tsx` | 화면마다 같은 일에 같은 컨트롤을 쓰도록 묶은 것: `Choice`, `ChipGroup`, `MessageDialog`, `Empty` |
| `src/styles.css` | 앱 고유 부품의 스타일. 모든 값이 테마 토큰 |

CSS 층(@layer): `reset` → `astryx-base`(Astryx 컴포넌트) → `astryx-theme`(ruma) → `app`(앱). 요소 선택자(`body`, `h1`, `a` …)는 `reset`에, 클래스 규칙은 `app`에 둡니다. 층 밖(unlayered)에 규칙을 쓰면 Astryx 컴포넌트를 덮어쓰니 쓰지 않습니다(예외: 마스코트 CSS 원본, `native.css`용 옛 이름 별칭).

테마 모드: 설정의 시스템/라이트/다크가 `<Theme mode>`로 들어가고, Theme이 `<html data-theme>`를 맞춥니다. 라이트/다크 값은 토큰마다 `[라이트, 다크]` 한 쌍입니다. 루트 Theme은 iOS의 글자 크기(Dynamic Type)를 읽어 `--font-size-*`를 함께 키웁니다.

## 2. 토큰

### 색 (전통색 → Astryx 역할)

| 토큰 | 라이트 / 다크 | 전통색 | 쓰임 |
| --- | --- | --- | --- |
| `--color-background-body` | `#fbfaf5` / `#1b1a18` | 生成り / 墨 | 화면 바탕, 탭바 |
| `--color-background-surface`, `-card` | `#fffefb` / `#252321` | 胡粉 | 카드, 시트, 대화상자, 버튼 면 |
| `--color-background-muted`, `--color-track` | `#f1ede3` / `#32302c` | 白練 | 세그먼트 바탕, 말풍선, 태그, 막대 빈 곳 |
| `--color-border` | `#e3ded2` / `#403c36` | 灰白 | 카드 테두리(1px), 구분선 |
| `--color-border-emphasized` | `#938f86` / `#716c63` | 灰白→利休鼠 | 입력칸·꺼진 스위치 경계(3:1) |
| `--color-text-primary` | `#2d2a26` / `#ece7db` | 墨 | 본문, 숫자 |
| `--color-text-secondary` | `#6b665d` / `#a39d90` | 利休鼠 | 보조 문장, 라벨, 고스트 아이콘 |
| `--color-accent`(`-muted`, `--color-text-accent`) | `#165e83` / `#86aecf` (`#e1ecf1` / `#24323f`) | 藍 (白藍) | 프라이머리, 현재 위치, 진행 막대, 초점 링, 읽기 |
| `--ruma-edge-accent` | `#0f3f5c` / `#5c86aa` | 紺 | 프라이머리 버튼의 눌림 가장자리 |
| `--color-success`(`-muted`, `--color-text-success`) | `#47885e` (`#e3eee3`, `#2f6b48`) | 緑青 (白緑, 常磐) | 맞은 답, 장기 기억 |
| `--color-error`(`-muted`, `--color-text-error`) | `#c4553b` (`#f6e4dc`, `#9c3b26`) | 朱 (桜, 弁柄) | 틀림, 잊음, 경고, 도장 |
| `--color-warning`(`-muted`, `--color-text-warning`) | `#c89932` (`#f6ecd0`, `#866415`) | 山吹茶 (鳥の子, 黄土) | XP, 익히는 중 |
| `--ruma-stage-mature / -young / -learning` | 緑青 / 浅葱 `#4d9aa6` / 山吹茶 | | 학습 단계 표시에만(막대, 범례, 태그 점) |
| `--ruma-gold-icon` | `#866415` / `#d9b45a` | 黄土 | 켜진 북마크·XP 아이콘에만 |
| `--ruma-flame` | `#d9743f` / `#e08a55` | 柿 | 연속 학습 불꽃에만 |
| `--color-*-blue/red/green/…` | 위 색들로 연결 | | Badge·Token의 색 이름(blue=藍, red=朱, green=緑青, yellow=山吹茶, cyan·teal=浅葱, orange=柿) |

**대비(WCAG AA, 측정값)**: 본문 13.7/14.1:1, 보조 글자 4.9~6.5:1, 藍 글자 5.6~7.4:1, 프라이머리 라벨 7.1/7.7:1, 입력 경계 3.08~3.34:1. `tests/unit/theme.test.ts`가 라이트·다크 22쌍씩 검사합니다. 이번에 바꾼 값 두 개(색상은 그대로, 명도만 낮춤):
- 黄土 `#8a6716` → `#866415`(3% 어둡게): 鳥の子 위 4.42 → 4.63:1(익히는 중 배지).
- 입력 경계 `#a7a298` → `#938f86`(12% 어둡게): 胡粉 위 2.52 → 3.20:1, 生成り 위 2.43 → 3.08:1(검색칸·날짜칸·꺼진 스위치). 05 문서의 "약 3:1"은 실제로 2.5였습니다.

### 글자

| 토큰 | 크기 | 쓰임 |
| --- | --- | --- |
| `--font-size-sm` | 12 | 칩·태그·단위·보조 숫자 |
| `--font-size-base` (`--text-supporting-size`, `--text-label-size`) | 14 | 보조 문장, 라벨, 링크형 버튼 |
| `--font-size-lg` (`--text-body-size`) | 16 | 본문, 버튼 라벨, 카드 제목 |
| `--font-size-xl` (`--text-heading-2-size`) | 20 | 뜻, 읽기, 큰 개수 |
| `--font-size-2xl` (`--text-heading-1-size`) | 24 | 화면 제목, 큰 숫자, 학습 카드의 뜻 |
| `--font-size-3xl` | 32 | 준비도 숫자, 완료 제목 |
| `--font-size-4xl` | 44 | 단어 시트의 표제어 |

예외는 학습 카드 표제어 하나(`clamp(44px, 16vw, 76px)`)와 탭 라벨(`--font-size-xs` 11)입니다. 굵기는 **500(기본)과 700(강조·숫자·버튼)** 두 단계, 긴 도움말만 400. Astryx의 semibold도 700으로 맞췄습니다. 줄간격 본문 1.5, 제목 1.3, 숫자 1.1.
- **한국어**: 본문 글꼴 `--font-family-body`(SF Pro Rounded는 라틴 숫자에만, 한글은 SD Gothic Neo/Pretendard). `word-break: keep-all` — 단어 사이에서만 줄바꿈.
- **일본어**: 읽기·보기는 `--ruma-font-ja`(히라기노 각고딕), 표제어는 `--ruma-font-ja-serif`(히라기노 명조, 600). `[lang='ja']`를 꼭 붙입니다(줄바꿈은 일본어 규칙).
- 웹 글꼴은 받지 않습니다(오프라인 우선). 모두 기기 글꼴입니다.

### 간격 · 모서리 · 크기 · 깊이 · 움직임

- 간격은 Astryx의 4px 단계 그대로: 화면 좌우 `--spacing-4`(16, 안전 영역보다 작지 않게), 카드 안 `--spacing-4`, 카드 사이 `--spacing-3`, 섹션 사이 `--spacing-6`.
- 모서리: `--radius-inner` 8(칩 안쪽·히트맵) · `--radius-element` 12(버튼·입력·세그먼트) · `--radius-container` 16(카드) · `--radius-page` 24(학습 카드·시트 위) · `--radius-full`(알약).
- 컨트롤 높이: `--size-element-sm/md/lg` = 36 / **44** / 52. 누르는 것은 모두 44 이상, 평가 버튼만 60.
- 깊이: **누를 수 있는 것에만** 얕은 가장자리 `--ruma-depth`(3px, 급수 행은 2px). 카드는 1px 선, 그림자 없음. 그림자(`--shadow-med/high`)는 떠 있는 층(시트·대화상자·저장 실패 배너)에만.
- 움직임: `--duration-fast/medium/slow` 120/200/400ms, 곡선 하나 `cubic-bezier(0.2, 0, 0, 1)`. 상태가 바뀔 때만 움직이고, 반복 애니메이션은 화면당 하나(마스코트). **동작 줄이기**를 켜면 CSS 애니메이션·전환은 모두 꺼지고(`styles.css` 끝의 전역 규칙), Astryx의 스크립트 움직임(시트·스위치)은 자체 규칙대로 짧은 페이드로 바뀝니다.

## 3. 쓰는 Astryx 컴포넌트

| 컴포넌트 | 어디에 |
| --- | --- |
| `Theme` | 앱 루트. 모드(data-theme), Dynamic Type, 아이콘 |
| `Button` | 모든 글자 버튼. 학습 평가 버튼(`Grade`, 60px), 오늘의 학습 시작, 백업, 대화상자 |
| `IconButton` | 닫기·발음·북마크(`aria-pressed`)·되돌리기·뒤로(링크) |
| `Card` | 홈의 준비도·계획·이번 주, 기록 카드, 설정 묶음, 급수 요약 |
| `SegmentedControl` (`Choice`) | 목표 급수·하루 새 단어·시험날 목표·테마, 단어장 탭(검색/북마크/약한 단어) — 라디오 그룹 |
| `ToggleButton` (`ChipGroup`) | 시험일, 단어 유형 필터, 기억 단계 필터 — `aria-pressed` 칩 |
| `Switch` | 아래 급수 함께, 한자어 빠른 통과, 발음 자동 재생 |
| `TextInput` | 단어 검색(지우기 버튼, 검색 키) |
| `ProgressBar` | 학습 진행 막대, 준비도 막대(목표 = mark) |
| `Badge` | 새 단어, 다시 나와요, 읽기, 급수, 목표 |
| `BottomSheet` | 단어 시트, "이 숫자는 무엇인가요?" — 손잡이, 아래로 밀어 닫기, Esc, 초점 가둠·복귀 |
| `AlertDialog` | 모든 기록 초기화, 백업으로 바꾸기(브라우저 `confirm()` 대체) |
| `Dialog` (`MessageDialog`) | "가져오지 못했어요"(브라우저 `alert()` 대체) |
| `Banner` | 저장 실패 경고(error, 떠 있음), 가져오기 되돌리기(success) |
| `EmptyState` (`Empty`) | 검색 결과 없음, 북마크·약한 단어 없음, 필터 결과 없음 — 화면 낭독기에 알림 |
| `Skeleton` | 단어를 불러오는 동안의 학습 카드 |

## 4. 규칙

**강조 단계** — 한 화면, 한 버튼 묶음에서 위에서부터 하나씩만:
1. `primary`(藍 면, 紺 가장자리): 묶음마다 **하나**. 오늘의 학습 시작, 정답 보기, 알아요, 홈으로.
2. `secondary`(胡粉 면, 1px 선, 灰白 가장자리): 나머지 선택지. 모르겠어요, 쉬워요, 백업 내보내기.
3. `destructive`(桜 면, 弁柄 글자): 지우는 동작. 프라이머리 색을 쓰지 않습니다. 반드시 한 번 묻습니다(AlertDialog. 오류 화면만 화면 안에서 묻습니다: 앱이 망가진 상태에서도 동작해야 해서).
4. `ghost`: 아이콘 버튼(利休鼠), 되돌리기 칩. 글자 행동은 `ghost` + `text-action`(藍 글자, 상자 없음): 바꾸기 ›, 되돌리기, 백업하기.

**표면** — 정적인 묶음은 `Card`(1px 선, 그림자 없음). 카드 안에 카드를 넣지 않고 `--color-background-muted` 상자(말풍선, 계획 메모, 고지문)로 구분합니다. 잠깐 보는 상세는 `BottomSheet`, 결정을 묻는 것은 `AlertDialog`, 한 줄 결과는 화면 안 `role="status"` 문장, 지속되는 문제는 `Banner`.

**상태** — hover/누름은 Astryx가 오버레이로, 누름은 가장자리가 가라앉는 것으로 보입니다. 초점은 3px 藍 링(`--focus-outline-*`). 비활성은 `isDisabled`(aria-disabled: 초점은 받고 동작하지 않음). 진행 중은 `isLoading`/`clickAction`.

**색 쓰임** — 藍은 행동·현재 위치·진행에만. 朱은 틀림·경고·도장. 단계 색은 단계 표시에만. 金·柿은 아이콘에만. 색만으로 뜻을 전하지 않습니다(단계 태그에 글자, 정답·오답 보기에 ✓/✕).

**접근성** — 누르는 영역 44px 이상(칩은 40px + Astryx의 터치 여백), 겹 대화상자는 Esc로 닫히고 연 버튼으로 초점이 돌아갑니다. 상태 변화는 `aria-live`/`role="status"`로 알립니다. 안전 영역: 페이지·학습 화면·탭바·시트·온보딩 버튼은 `env(safe-area-inset-*)`.

## 5. 새 화면을 만들 때

1. 화면 루트는 `.page` 안(탭이 있는 화면) 또는 `.study`/`.onboard`(전체 화면). 맨 위는 `header.top > h1`.
2. 묶음은 `<Card role="region" aria-labelledby>` + `h2.card-title`. 카드 사이 간격은 `.page`의 `gap`이 맡습니다.
3. 선택지 2~5개는 `Choice`, 많거나 길면 `ChipGroup`, 켜고 끄기는 `Switch`, 행동은 `Button`(프라이머리 하나), 아이콘만이면 `IconButton`(라벨 필수).
4. 묻기는 `AlertDialog`, 알림은 `MessageDialog`, 상세는 `BottomSheet`(닫힌 뒤에도 마운트해 두고 `isOpen`만 바꿈 — 닫힘 움직임과 초점 복귀).
5. 비어 있을 때는 `Empty`(무엇이 비었는지 + 어떻게 채워지는지).
6. 새 CSS는 `@layer app` 안에, 값은 토큰만. 새 색이 필요하면 `rumaTheme.ts`에 토큰을 더하고 `npm run theme`, 대비 쌍을 `tests/unit/theme.test.ts`에 추가.
7. 390·320px, 라이트·다크, 동작 줄이기로 확인합니다.

## 6. 직접 만든 것(그대로 둔 것)과 이유

| 부품 | 이유 |
| --- | --- |
| 학습 카드(`.flash`)·평가 버튼 줄 | 제품의 핵심 동작(두 단계 답, 60px 고정, 엄지 위치). 버튼만 Astryx `Button` |
| 읽기 4지선다(`.choice`) | 정답/오답 표시 상태가 제품 고유. 버튼과 같은 면·가장자리 규칙을 토큰으로 따름 |
| 준비도 카드·오늘의 계획·이번 주(요일 점)·도장 여정·복습 예보·히트맵·급수 단계 막대 | 데이터 시각화. Astryx 차트는 아직 정식 배포 전(canary) |
| 단어 행(`.word-row`)·급수 행 | 명조 표제어 + 읽기 + 뜻 + 태그의 2줄 배치, 200행 목록의 가벼움. `List`는 아래 참고 |
| 하단 탭바 | Astryx에 하단 탭바가 없음(`MobileNav`는 서랍 메뉴). Lucide 아이콘 유지 |
| 단어 유형 메모(가짜 친구, 한자음 대응) | 내용이 제품 고유 |
| 마스코트 루마 | 컴포넌트와 CSS 그대로(토큰 이름 하나만 테마 이름으로) |
| iOS 앱 전용 설정·알림 제안(`src/platform/`) | 플랫폼 층은 손대지 않음. 같은 모양이 되도록 `.card/.switch/.btn` 등 옛 클래스를 토큰으로 스타일 |

## 7. 쓰지 않은 것과 이유

- **`List`/`ListItem`**: 홈의 링크 두 줄에 23KB(gzip)가 들어(밀어서 동작 등) 비율이 나쁩니다. 단어 행에도 쓰지 않습니다.
- **`DateInput`**: 달력 팝오버가 앵커 위치 지정(iOS 26 이상)에 기대고, iOS의 기본 날짜 휠이 더 낫습니다. 기본 `<input type="date">`를 토큰으로 스타일.
- **`Toast`**: 되돌리기는 엄지 근처에 머물러야 해서 화면 안 칩으로 둡니다(Toast는 떠서 버튼을 가릴 수 있음).
- **`Tooltip`, `Text maxLines`**: 앵커 위치 지정이 필요하고 휴대폰에는 hover가 없습니다.
- **`MobileNav`, `AppShell`, `Layout`**: 서랍·데스크톱 구조라 이 앱의 하단 탭에 맞지 않습니다.
- **소스 빌드(`@astryxdesign/build`, StyleX)**: CSS를 328→211KB(gzip 51→34KB)로 줄이지만, 그 CSS는 Vite를 거치지 않아 `light-dark()`가 남고(iOS 17.5 미만에서 색이 깨짐) 빌드가 1초→9초가 됩니다. 미리 빌드된 `astryx.css`를 씁니다.
- **기성 테마 패키지(`theme-*`)와 웹 글꼴**: 기성 테마의 글꼴은 Google Fonts에서 받아 오프라인과 맞지 않습니다.

## 8. 브라우저 · iOS

- Astryx가 기대는 기능: `@layer`(iOS 15.4), `<dialog>`(15.4), `:has()`(15.4), 생성자 스타일시트·`@property`(16.4), `light-dark()`(17.5), `@scope`(17.4), Popover API(17), 앵커 위치 지정(26).
- 이 앱의 처리: `light-dark()`는 Vite의 CSS 최소화기(Lightning CSS, 대상 safari16.4)가 변수 전환으로 바꿉니다. `@scope`는 `npm run theme`이 펼칩니다. 팝오버·앵커가 필요한 컴포넌트(툴팁·메뉴·DateInput)는 쓰지 않습니다. 준비도 목표 표시의 툴팁만 앵커를 쓰고, 없으면 위치만 어긋납니다.
- **결론: 최소 iOS는 16.4.** 15.0~15.3은 `@layer`를 몰라 스타일 전체가 빠집니다(Vite의 기본 빌드 대상도 이미 safari16.4). `ios/`의 배포 대상(지금 15.0)은 10 문서 결정 3의 추천대로 16.4로 올려야 합니다(소유자 결정).

## 9. 무게 (웹 빌드, gzip -9)

| | 이전 | Astryx 기본(테마만) | 지금 |
| --- | --- | --- | --- |
| JS | 326.6KB / **102.3KB** | 411.9KB / 129.4KB | 981.8KB / **313.2KB** (+ 지연 청크 2KB) |
| CSS | 30.4KB / **6.8KB** | 308.2KB / 49.2KB | 329.5KB / **51.2KB** |
| PWA 사전 캐시 | 20개 1,474.9KiB | 20개 1,829.5KiB | 22개 **2,409.0KiB** |
| 홈까지(CPU 4배 감속, 중앙값) | 669ms | | 1,092ms |

JS 증가분의 대부분(약 150KB gzip)은 어떤 대화형 컴포넌트를 쓰든 따라오는 공통 기반(테마 런타임, 층·움직임·제스처·국제화)입니다. 개별로 큰 것은 `BottomSheet` 27KB, `Dialog`류 13KB, `SegmentedControl` 13KB입니다. JS는 컴포넌트별 경로(`@astryxdesign/core/Button`)로 가져와 트리 셰이킹되지만, CSS는 전체 컴포넌트 스타일이 한 파일입니다.

## 10. Astryx 업그레이드

베타라서 **정확한 버전**으로 고정합니다(`package.json`: `@astryxdesign/core`, `@astryxdesign/cli`, `@stylexjs/stylex` 범위 없이).

1. 변경 기록 확인: `node_modules/@astryxdesign/core/CHANGELOG.md`, `npx astryx blog`.
2. 올리기: `npm i -E @astryxdesign/core@<새 버전> @astryxdesign/cli@<새 버전>` (StyleX 피어 버전도 맞춤).
3. 코드모드 미리보기 → 적용: `npx astryx upgrade --from 0.7.15` → `npx astryx upgrade --from 0.7.15 --apply` (`--list`로 목록).
4. 테마 다시 빌드: `npm run theme` — 오래된 빌드 테마는 런타임이 고쳐 주지 않습니다. `npx astryx theme targets --json`으로 재정의 대상이 아직 있는지 확인.
5. 확인: `npx tsc --noEmit`, `npm test`(대비·호환 검사 포함), `npm run test:e2e`, `npm run build`·`build:native`, 출력 CSS에 `light-dark(`·`@scope (`가 없는지, 390/320 라이트·다크 스크린숏.
6. 아래 알려진 문제가 고쳐졌는지 보고, 고쳐졌으면 우회 코드를 지웁니다.

## 11. 알려진 문제 · 우회

- 0.7.15 `theme build`가 `isPressed` 같은 낙타 표기 상태를 `[data-is-pressed="isPressed"]`로 써서 맞지 않음 → 칩 스타일을 `styles.css`에서 `aria-pressed`로 지정.
- `ToggleButton`은 `ghost` 버튼으로 그려져 버튼 재정의가 먼저 적용됨 → 같은 곳에서 처리.
- `IconButton`은 아이콘을 16px로 줄임 → Lucide의 `width` 속성(16·18·20·22)대로 되돌림.
- 테마 대상에 `:active`가 없어 "눌리는 가장자리"는 `styles.css`의 `.astryx-button:active`로 지정.
