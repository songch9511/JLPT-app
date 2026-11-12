# 카사네 (重ね) — JLPT 회독 단어장

겹겹이 쌓는 JLPT 단어 학습 PWA. 설치 없이 브라우저에서 열고, 홈 화면에 추가하면 앱처럼 오프라인으로 쓸 수 있습니다.

## 학습 방식

- 카드마다 **알아요 / 다시 볼게요** 둘 중 하나만 고릅니다.
- "다시 볼게요"한 단어는 "알아요"가 될 때까지 같은 장 안에서 계속 돌아옵니다.
- 각 장은 새 단어 50개 + 바로 앞 장의 단어 50개가 섞여 나옵니다.
- 급수의 모든 장을 끝내면 1회독이고, 다시 1장부터 다음 회독이 시작됩니다.

## 기능

- 목표 대시보드: 목표 급수 · 시험일 D-day · 필요한 페이스와 완료 예상일 · 연속 학습 · 학습 기록
- 학습 세션: 중간에 나가도 이어하기, 방금 선택 되돌리기, 발음 듣기, 북마크, 키보드(← → Space)
- 단어장: 전체 검색, 북마크, 자주 틀리는 약한 단어
- AI (Anthropic API 키 필요): 단어별 예문 · 한자 풀이 · 암기 팁, 약한 단어로 만든 짧은 이야기
- 라이트/다크 테마, 백업 내보내기/가져오기

학습 기록과 API 키는 브라우저(localStorage)에만 저장됩니다.

## 개발

```bash
npm install
npm run dev      # 개발 서버
npm run build    # 타입 검사 + 프로덕션 빌드 (dist/)
npm run data     # data/raw + data/ko → public/data 재생성
```

## 단어 데이터

- 단어 목록: [open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks) (MIT, tanos.co.uk 기반) — `data/raw/`
- 한국어 뜻: `data/ko/n{급수}-*.json` (`{ "<idx>": "뜻" }`). 현재 N5 · N4 제공, N3~N1은 영어 뜻으로 표시됩니다.
- 한국어 뜻을 추가하려면 `node scripts/make-chunks.mjs <급수>`로 번역용 TSV를 만들고, 결과를 `data/ko/`에 넣은 뒤
  `npm run data`를 실행하고 `src/data.ts`의 `KO_READY`를 갱신합니다.
