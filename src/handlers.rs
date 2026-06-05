use axum::{extract::{Query, State}, http::StatusCode, response::Json};
use tower_sessions::Session;

use crate::{
    db,
    error::AppError,
    gacha,
    models::*,
    AppState,
};

// ── 인증 헬퍼 ─────────────────────────────────────────────────────────────────

/// 세션에서 로그인된 UserRow 를 꺼냅니다. 미로그인이면 Unauthorized 반환.
async fn require_user(
    session: &Session,
    state:   &AppState,
) -> Result<crate::models::UserRow, AppError> {
    let sid = db::get_logged_in_session_id(session)
        .await
        .ok_or(AppError::Unauthorized)?;

    db::find_user_by_session_id(&state.db, &sid)
        .await?
        .ok_or(AppError::Unauthorized)
}

// ── GET /health ───────────────────────────────────────────────────────────────

pub async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        character_count: state.characters.len(),
    })
}

// ── POST /register ────────────────────────────────────────────────────────────

pub async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<MeResponse>), AppError> {
    // ── 유효성 검사 ──────────────────────────────────────────────────────────
    let username = body.username.trim().to_string();
    let nickname = body.nickname.trim().to_string();
    let password = body.password.clone();

    if !username.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
        || username.len() < 4
        || username.len() > 20
    {
        return Err(AppError::BadRequest(
            "아이디는 4~20자 영문·숫자·_만 사용 가능합니다.".into(),
        ));
    }
    if nickname.is_empty() || nickname.chars().count() > 20 {
        return Err(AppError::BadRequest(
            "닉네임은 1~20자 이내여야 합니다.".into(),
        ));
    }
    if password.len() < 6 {
        return Err(AppError::BadRequest(
            "비밀번호는 6자 이상이어야 합니다.".into(),
        ));
    }

    // ── 중복 체크 ──────────────────────────────────────────────────────────
    if db::find_user_by_username(&state.db, &username).await?.is_some() {
        return Err(AppError::BadRequest(
            "이미 사용 중인 아이디입니다.".into(),
        ));
    }

    // ── 비밀번호 해시 ──────────────────────────────────────────────────────
    let hash = bcrypt::hash(&password, bcrypt::DEFAULT_COST)
        .map_err(|e| AppError::Unavailable(format!("해시 오류: {e}")))?;

    // ── DB 저장 ────────────────────────────────────────────────────────────
    let user = db::create_user(&state.db, &username, &nickname, &hash).await?;

    Ok((StatusCode::CREATED, Json(MeResponse {
        session_id:     user.session_id,
        nickname:       user.nickname,
        total_draws:    user.total_draws,
        unlocked_count: 0,
        gold:           user.gold,
    })))
}

// ── POST /login ───────────────────────────────────────────────────────────────

pub async fn login(
    session: Session,
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<Json<MeResponse>, AppError> {
    let username = body.username.trim().to_string();

    // ── 유저 조회 ──────────────────────────────────────────────────────────
    let user = db::find_user_by_username(&state.db, &username)
        .await?
        .ok_or_else(|| AppError::BadRequest("아이디 또는 비밀번호가 올바르지 않습니다.".into()))?;

    // ── 비밀번호 검증 ──────────────────────────────────────────────────────
    let hash = user.password_hash.as_deref().unwrap_or("");
    let ok = bcrypt::verify(&body.password, hash)
        .map_err(|e| AppError::Unavailable(format!("해시 검증 오류: {e}")))?;

    if !ok {
        return Err(AppError::BadRequest(
            "아이디 또는 비밀번호가 올바르지 않습니다.".into(),
        ));
    }

    // ── 세션에 session_id 저장 ─────────────────────────────────────────────
    db::set_session_id(&session, &user.session_id).await?;

    let unlocked_count = db::get_unlocked_count(&state.db, user.id).await?;

    Ok(Json(MeResponse {
        session_id:     user.session_id,
        nickname:       user.nickname,
        total_draws:    user.total_draws,
        unlocked_count,
        gold:           user.gold,
    }))
}

// ── POST /logout ──────────────────────────────────────────────────────────────

pub async fn logout(session: Session) -> Result<StatusCode, AppError> {
    session
        .flush()
        .await
        .map_err(|e| AppError::Session(e.to_string()))?;
    Ok(StatusCode::NO_CONTENT)
}

// ── GET /me ───────────────────────────────────────────────────────────────────

pub async fn get_me(
    session: Session,
    State(state): State<AppState>,
) -> Result<Json<MeResponse>, AppError> {
    let user = require_user(&session, &state).await?;
    let unlocked_count = db::get_unlocked_count(&state.db, user.id).await?;

    Ok(Json(MeResponse {
        session_id:     user.session_id,
        nickname:       user.nickname,
        total_draws:    user.total_draws,
        unlocked_count,
        gold:           user.gold,
    }))
}

// ── PATCH /me ─────────────────────────────────────────────────────────────────

pub async fn patch_me(
    session: Session,
    State(state): State<AppState>,
    Json(body): Json<UpdateMeRequest>,
) -> Result<Json<MeResponse>, AppError> {
    let nick = body.nickname.trim().to_string();
    if nick.is_empty() || nick.chars().count() > 20 {
        return Err(AppError::BadRequest(
            "닉네임은 1~20자 이내여야 합니다.".into(),
        ));
    }

    let user = require_user(&session, &state).await?;
    db::update_nickname(&state.db, user.id, &nick).await?;

    let unlocked_count = db::get_unlocked_count(&state.db, user.id).await?;
    Ok(Json(MeResponse {
        session_id:     user.session_id,
        nickname:       nick,
        total_draws:    user.total_draws,
        unlocked_count,
        gold:           user.gold,
    }))
}

// ── GET /archive ──────────────────────────────────────────────────────────────

pub async fn archive(
    session: Session,
    State(state): State<AppState>,
) -> Result<Json<Vec<ArchiveEntry>>, AppError> {
    let user = require_user(&session, &state).await?;
    let unlocked_names = db::get_unlocked_names(&state.db, user.id).await?;

    let mut list = state.characters.clone();
    list.sort_by_key(|c| c.grade.order());

    let entries = list
        .into_iter()
        .map(|c| {
            let unlocked = unlocked_names.contains(&c.name);
            ArchiveEntry { character: c, unlocked }
        })
        .collect();

    Ok(Json(entries))
}

// ── POST /gacha/pull ──────────────────────────────────────────────────────────

pub async fn gacha_pull(
    session: Session,
    State(state): State<AppState>,
    Json(body): Json<PullRequest>,
) -> Result<Json<PullResponse>, AppError> {
    if state.characters.is_empty() {
        return Err(AppError::Unavailable(
            "캐릭터 데이터가 없습니다. character.json 을 확인하세요.".into(),
        ));
    }

    let user  = require_user(&session, &state).await?;
    let times = body.times.clamp(1, 10) as usize;

    let results = gacha::draw(&state.characters, times);

    let draw_pairs: Vec<(String, String)> = results
        .iter()
        .map(|c| {
            let grade_str = serde_json::to_value(&c.grade)
                .ok()
                .and_then(|v| v.as_str().map(String::from))
                .unwrap_or_default();
            (c.name.clone(), grade_str)
        })
        .collect();

    let (total_draws, gold) = db::record_draws(&state.db, user.id, &draw_pairs)
        .await
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("골드가 부족합니다") {
                AppError::BadRequest(msg)
            } else {
                AppError::Db(e)
            }
        })?;

    Ok(Json(PullResponse { total_draws, gold, results }))
}

// ── POST /admin/give-gold ─────────────────────────────────────────────────────

pub async fn admin_give_gold(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<GiveGoldRequest>,
) -> Result<Json<GiveGoldResponse>, AppError> {
    verify_admin_key(&headers, &state.admin_key)?;

    if body.amount <= 0 {
        return Err(AppError::BadRequest("amount 는 1 이상이어야 합니다.".into()));
    }

    let gold = db::give_gold(&state.db, &body.session_id, body.amount)
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => AppError::BadRequest(
                format!("session_id '{}' 를 찾을 수 없습니다.", body.session_id)
            ),
            other => AppError::Db(other),
        })?;

    Ok(Json(GiveGoldResponse { session_id: body.session_id, gold }))
}

// ── GET /admin/users ──────────────────────────────────────────────────────────

pub async fn admin_list_users(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Query(query): Query<AdminListUsersQuery>,
) -> Result<Json<AdminListUsersResponse>, AppError> {
    verify_admin_key(&headers, &state.admin_key)?;

    let limit  = query.limit.unwrap_or(50).clamp(1, 200);
    let offset = query.offset.unwrap_or(0).max(0);
    let nick   = query.nickname.as_deref();

    let total = db::count_users(&state.db, nick).await?;
    let users = db::list_users(&state.db, nick, limit, offset).await?;

    Ok(Json(AdminListUsersResponse { total, limit, offset, users }))
}

// ── 관리자 키 검증 헬퍼 ───────────────────────────────────────────────────────

fn verify_admin_key(
    headers:   &axum::http::HeaderMap,
    admin_key: &str,
) -> Result<(), AppError> {
    let provided = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .unwrap_or("");

    if provided != admin_key {
        Err(AppError::BadRequest("인증 실패: 유효하지 않은 관리자 키입니다.".into()))
    } else {
        Ok(())
    }
}