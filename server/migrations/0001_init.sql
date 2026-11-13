-- 루마 백엔드 초기 스키마.
-- 원칙: 원래 app user id, IP, 단어 목록, 이야기 내용은 저장하지 않는다.
-- user_hash = HMAC-SHA256(USER_ID_PEPPER, "user:" || app_user_id) (hex).

-- 마지막으로 알려진 루마 플러스 권한. RevenueCat REST 조회 또는 웹훅이 갱신한다.
-- RevenueCat이 응답하지 않을 때만 이 값을 대신 쓴다(진실의 원천은 RevenueCat).
CREATE TABLE IF NOT EXISTS entitlements (
  user_hash      TEXT PRIMARY KEY,
  state          TEXT NOT NULL CHECK (state IN ('active', 'inactive', 'stale')),
  source         TEXT NOT NULL CHECK (source IN ('api', 'webhook')),
  last_event_ms  INTEGER NOT NULL DEFAULT 0,  -- 마지막으로 반영한 웹훅 event_timestamp_ms (순서 역전 방지)
  updated_at     INTEGER NOT NULL             -- unix ms
);

-- 사용자별 하루 이야기 사용량. day는 DAY_OFFSET_MINUTES(기본 한국 시간) 기준 YYYY-MM-DD.
CREATE TABLE IF NOT EXISTS story_usage (
  user_hash  TEXT NOT NULL,
  day        TEXT NOT NULL,
  calls      INTEGER NOT NULL DEFAULT 0,  -- 성공했거나 진행 중인 생성 수 (일일 상한 대상)
  attempts   INTEGER NOT NULL DEFAULT 0,  -- 실패 포함 시도 수 (실패 재시도 남용 방지)
  PRIMARY KEY (user_hash, day)
);

-- 전체 하루 AI 지출. 금액은 마이크로달러(1e-6 USD) 정수.
CREATE TABLE IF NOT EXISTS spend_daily (
  day              TEXT PRIMARY KEY,
  reserved_micros  INTEGER NOT NULL DEFAULT 0,  -- 진행 중인 호출의 최악 비용 예약분
  spent_micros     INTEGER NOT NULL DEFAULT 0,  -- 응답의 usage로 계산한 실제 비용
  input_tokens     INTEGER NOT NULL DEFAULT 0,
  output_tokens    INTEGER NOT NULL DEFAULT 0,
  calls            INTEGER NOT NULL DEFAULT 0,
  failures         INTEGER NOT NULL DEFAULT 0
);

-- 웹훅 중복 처리 방지용 이벤트 id (RevenueCat 재시도는 같은 id를 다시 보냄). 30일 뒤 삭제.
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id     TEXT PRIMARY KEY,
  received_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS story_usage_day ON story_usage (day);
CREATE INDEX IF NOT EXISTS webhook_events_received ON webhook_events (received_at);
