// session.rs — 레거시 session_id 발급 유틸 (기존 코드 호환용으로 유지)
// 인증 흐름에서는 db::get_logged_in_session_id / db::set_session_id 를 사용합니다.

use tower_sessions::Session;
use crate::error::AppError;

const SESSION_KEY: &str = "sid";

/// 세션에서 고유 식별자를 꺼내거나, 없으면 UUID를 새로 발급해 저장합니다.
#[allow(dead_code)]
pub async fn get_or_init_id(session: &Session) -> Result<String, AppError> {
    if let Ok(Some(id)) = session.get::<String>(SESSION_KEY).await {
        return Ok(id);
    }
    let id = uuid::Uuid::new_v4().to_string();
    session
        .insert(SESSION_KEY, id.clone())
        .await
        .map_err(|e| AppError::Session(e.to_string()))?;
    Ok(id)
}