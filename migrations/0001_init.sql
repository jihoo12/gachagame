-- migrations/0001_init.sql
-- sqlx migrate run 으로 실행됩니다.

-- 유저 테이블
-- session_id 는 tower-sessions 가 발급한 쿠키값과 매핑됩니다.
CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT    NOT NULL UNIQUE,
    nickname   TEXT    NOT NULL DEFAULT '소환사',
    total_draws INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 소환 히스토리 (뽑은 순서 전체 기록)
CREATE TABLE IF NOT EXISTS draw_history (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_name TEXT    NOT NULL,
    grade          TEXT    NOT NULL,  -- 'COMMON' | 'RARE' | 'SSR' | 'UR'
    drawn_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 획득 도감 (중복 없이 캐릭터 이름만 저장)
CREATE TABLE IF NOT EXISTS unlocked (
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_name TEXT    NOT NULL,
    first_drawn_at TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, character_name)
);

CREATE INDEX IF NOT EXISTS idx_draw_history_user ON draw_history(user_id);
CREATE INDEX IF NOT EXISTS idx_unlocked_user     ON unlocked(user_id);