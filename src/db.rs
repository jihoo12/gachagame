use sqlx::SqlitePool;
use crate::models::{UserRow, AdminUserEntry};

const SESSION_KEY: &str = "user_id";

// ── 인증 ──────────────────────────────────────────────────────────────────────

/// 신규 계정 등록. username 중복 시 Err 반환.
/// 성공하면 새 UserRow 반환.
pub async fn create_user(
    pool:          &SqlitePool,
    username:      &str,
    nickname:      &str,
    password_hash: &str,
) -> sqlx::Result<UserRow> {
    // 고유 session_id 생성
    let sid = uuid::Uuid::new_v4().to_string();

    sqlx::query!(
        "INSERT INTO users (session_id, username, password_hash, nickname)
         VALUES (?, ?, ?, ?)",
        sid, username, password_hash, nickname
    )
    .execute(pool)
    .await?;

    let row = sqlx::query_as_unchecked!(
        UserRow,
        "SELECT id, session_id, username, password_hash, nickname, total_draws, gold
         FROM users WHERE session_id = ?",
        sid
    )
    .fetch_one(pool)
    .await?;

    Ok(row)
}

/// username 으로 유저를 조회합니다. 없으면 None.
pub async fn find_user_by_username(
    pool:     &SqlitePool,
    username: &str,
) -> sqlx::Result<Option<UserRow>> {
    sqlx::query_as_unchecked!(
        UserRow,
        "SELECT id, session_id, username, password_hash, nickname, total_draws, gold
         FROM users WHERE username = ?",
        username
    )
    .fetch_optional(pool)
    .await
}

/// session_id 로 유저를 조회합니다. 없으면 None.
pub async fn find_user_by_session_id(
    pool:       &SqlitePool,
    session_id: &str,
) -> sqlx::Result<Option<UserRow>> {
    sqlx::query_as_unchecked!(
        UserRow,
        "SELECT id, session_id, username, password_hash, nickname, total_draws, gold
         FROM users WHERE session_id = ?",
        session_id
    )
    .fetch_optional(pool)
    .await
}

// ── 레거시 호환 (세션 기반 자동생성) — 로그인 이후엔 아래 함수 사용 ──────────

pub async fn get_or_create_user(pool: &SqlitePool, session_id: &str) -> sqlx::Result<UserRow> {
    if let Some(row) = find_user_by_session_id(pool, session_id).await? {
        return Ok(row);
    }

    let sid = session_id.to_string();
    sqlx::query!(
        "INSERT INTO users (session_id) VALUES (?)",
        sid
    )
    .execute(pool)
    .await?;

    let row = sqlx::query_as_unchecked!(
        UserRow,
        "SELECT id, session_id, username, password_hash, nickname, total_draws, gold
         FROM users WHERE session_id = ?",
        sid
    )
    .fetch_one(pool)
    .await?;

    Ok(row)
}

// ── 세션 헬퍼 ─────────────────────────────────────────────────────────────────

/// tower_sessions 세션에서 로그인된 session_id 를 꺼냅니다.
/// 없으면 None (미로그인).
pub async fn get_logged_in_session_id(
    session: &tower_sessions::Session,
) -> Option<String> {
    session.get::<String>(SESSION_KEY).await.ok().flatten()
}

/// tower_sessions 세션에 session_id 를 저장합니다 (로그인 처리).
pub async fn set_session_id(
    session:    &tower_sessions::Session,
    session_id: &str,
) -> Result<(), crate::error::AppError> {
    session
        .insert(SESSION_KEY, session_id.to_string())
        .await
        .map_err(|e| crate::error::AppError::Session(e.to_string()))
}

// ── 가챠 기록 ──────────────────────────────────────────────────────────────────

pub async fn record_draws(
    pool:    &SqlitePool,
    user_id: i64,
    draws:   &[(String, String)],
) -> sqlx::Result<(i64, i64)> {
    let cost = draws.len() as i64 * 100;

    let mut tx = pool.begin().await?;

    let gold: i64 = sqlx::query_scalar_unchecked!(
        "SELECT gold FROM users WHERE id = ?",
        user_id
    )
    .fetch_one(&mut *tx)
    .await?;

    if gold < cost {
        return Err(sqlx::Error::Protocol(
            format!("골드가 부족합니다. (보유: {gold}, 필요: {cost})")
        ));
    }

    for (name, grade) in draws {
        sqlx::query!(
            "INSERT INTO draw_history (user_id, character_name, grade) VALUES (?, ?, ?)",
            user_id, name, grade
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query!(
            "INSERT OR IGNORE INTO unlocked (user_id, character_name) VALUES (?, ?)",
            user_id, name
        )
        .execute(&mut *tx)
        .await?;
    }

    let count = draws.len() as i64;
    sqlx::query!(
        "UPDATE users SET total_draws = total_draws + ?, gold = gold - ? WHERE id = ?",
        count, cost, user_id
    )
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let total_draws: i64 = sqlx::query_scalar_unchecked!(
        "SELECT total_draws FROM users WHERE id = ?",
        user_id
    )
    .fetch_one(pool)
    .await?;

    let remaining_gold: i64 = sqlx::query_scalar_unchecked!(
        "SELECT gold FROM users WHERE id = ?",
        user_id
    )
    .fetch_one(pool)
    .await?;

    Ok((total_draws, remaining_gold))
}

// ── 기타 조회/수정 ─────────────────────────────────────────────────────────────

pub async fn get_unlocked_names(
    pool:    &SqlitePool,
    user_id: i64,
) -> sqlx::Result<std::collections::HashSet<String>> {
    let rows = sqlx::query_scalar!(
        "SELECT character_name FROM unlocked WHERE user_id = ?",
        user_id
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().collect())
}

pub async fn update_nickname(
    pool:     &SqlitePool,
    user_id:  i64,
    nickname: &str,
) -> sqlx::Result<()> {
    sqlx::query!(
        "UPDATE users SET nickname = ? WHERE id = ?",
        nickname, user_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_unlocked_count(pool: &SqlitePool, user_id: i64) -> sqlx::Result<i64> {
    let count: i64 = sqlx::query_scalar_unchecked!(
        "SELECT COUNT(*) FROM unlocked WHERE user_id = ?",
        user_id
    )
    .fetch_one(pool)
    .await?;
    Ok(count)
}

// ── 관리자 ────────────────────────────────────────────────────────────────────

pub async fn list_users(
    pool:     &SqlitePool,
    nickname: Option<&str>,
    limit:    i64,
    offset:   i64,
) -> sqlx::Result<Vec<AdminUserEntry>> {
    let rows = sqlx::query_as_unchecked!(
        AdminUserEntry,
        r#"
        SELECT
            u.id,
            u.session_id,
            u.nickname,
            u.total_draws,
            u.gold,
            COUNT(ul.character_name) AS unlocked_count
        FROM users u
        LEFT JOIN unlocked ul ON ul.user_id = u.id
        WHERE (? IS NULL OR u.nickname LIKE '%' || ? || '%')
        GROUP BY u.id
        ORDER BY u.id DESC
        LIMIT ? OFFSET ?
        "#,
        nickname, nickname, limit, offset
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn count_users(
    pool:     &SqlitePool,
    nickname: Option<&str>,
) -> sqlx::Result<i64> {
    let count: i64 = sqlx::query_scalar_unchecked!(
        "SELECT COUNT(*) FROM users WHERE (? IS NULL OR nickname LIKE '%' || ? || '%')",
        nickname, nickname
    )
    .fetch_one(pool)
    .await?;
    Ok(count)
}

pub async fn give_gold(
    pool:       &SqlitePool,
    session_id: &str,
    amount:     i64,
) -> sqlx::Result<i64> {
    let affected = sqlx::query!(
        "UPDATE users SET gold = gold + ? WHERE session_id = ?",
        amount, session_id
    )
    .execute(pool)
    .await?
    .rows_affected();

    if affected == 0 {
        return Err(sqlx::Error::RowNotFound);
    }

    let gold: i64 = sqlx::query_scalar_unchecked!(
        "SELECT gold FROM users WHERE session_id = ?",
        session_id
    )
    .fetch_one(pool)
    .await?;

    Ok(gold)
}

// 미사용 상수 경고 억제
#[allow(dead_code)]
const _SESSION_KEY_USED: &str = SESSION_KEY;