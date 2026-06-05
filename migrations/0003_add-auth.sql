-- 1. UNIQUE 키워드를 제거하고 컬럼만 추가합니다.
ALTER TABLE users ADD COLUMN username      TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;

-- 2. 이미 작성하신 인덱스가 UNIQUE 제약 조건 역할을 대신 수행합니다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
    ON users (username) WHERE username IS NOT NULL;