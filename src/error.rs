use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("DB 오류: {0}")]
    Db(#[from] sqlx::Error),

    #[error("세션 오류: {0}")]
    Session(String),

    #[error("요청이 잘못됐습니다: {0}")]
    BadRequest(String),

    #[error("인증이 필요합니다.")]
    Unauthorized,

    #[error("서비스를 사용할 수 없습니다: {0}")]
    Unavailable(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, msg) = match &self {
            AppError::Db(_)          => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
            AppError::Session(_)     => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
            AppError::BadRequest(m)  => (StatusCode::BAD_REQUEST,           m.clone()),
            AppError::Unauthorized   => (StatusCode::UNAUTHORIZED,          self.to_string()),
            AppError::Unavailable(m) => (StatusCode::SERVICE_UNAVAILABLE,   m.clone()),
        };
        tracing::error!("{}", msg);
        (status, Json(json!({ "error": msg }))).into_response()
    }
}