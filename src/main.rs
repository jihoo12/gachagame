mod db;
mod error;
mod gacha;
mod handlers;
mod models;
mod session;

use axum::{
    http::Method,
    routing::{get, patch, post},
    Router,
};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::{fs, str::FromStr, time::Duration};
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use tower_sessions::{MemoryStore, SessionManagerLayer};
use models::Character;

// ── 공유 상태 ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct AppState {
    pub db:         sqlx::SqlitePool,
    pub characters: Vec<Character>,
    pub admin_key:  String,
}

// ── 진입점 ───────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "gacha_server=info,tower_http=info".into()),
        )
        .init();

    // ── character.json 로드 ──────────────────────────────────────────────────
    let characters: Vec<Character> = fs::read_to_string("character.json")
        .map_err(|e| format!("character.json 읽기 실패: {e}"))
        .and_then(|s| serde_json::from_str(&s).map_err(|e| format!("JSON 파싱 실패: {e}")))
        .unwrap_or_else(|e| {
            tracing::warn!("{e} — 빈 캐릭터 풀로 시작합니다.");
            vec![]
        });
    tracing::info!("캐릭터 {}명 로드 완료", characters.len());

    // ── SQLite 연결 풀 ───────────────────────────────────────────────────────
    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "sqlite://gacha.db".into());

    let opts = SqliteConnectOptions::from_str(&db_url)
        .expect("DATABASE_URL 파싱 실패")
        .create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .connect_with(opts)
        .await
        .expect("SQLite 연결 실패");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("마이그레이션 실패");
    tracing::info!("DB 마이그레이션 완료");

    // ── 관리자 키 ────────────────────────────────────────────────────────────
    let admin_key = std::env::var("ADMIN_KEY").unwrap_or_else(|_| {
        tracing::warn!("ADMIN_KEY 환경변수가 없습니다. 기본값 'change-me' 사용");
        "change-me".into()
    });

    // ── 세션 레이어 ──────────────────────────────────────────────────────────
    let session_store = MemoryStore::default();
    let session_layer = SessionManagerLayer::new(session_store)
        .with_secure(false)
        .with_http_only(true)
        .with_expiry(tower_sessions::Expiry::OnInactivity(
            Duration::from_secs(60 * 60 * 24 * 30).try_into().unwrap(),
        ));

    // ── CORS ────────────────────────────────────────────────────────────────
    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE])
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::COOKIE,
            axum::http::header::AUTHORIZATION,
        ])
        .allow_origin(tower_http::cors::AllowOrigin::predicate(|origin, _| {
            let bytes = origin.as_bytes();
            bytes.starts_with(b"http://localhost") || bytes.starts_with(b"http://127.0.0.1")
        }))
        .allow_credentials(true);

    let state = AppState { db: pool, characters, admin_key };

    // ── 라우터 ──────────────────────────────────────────────────────────────
    let app = Router::new()
        .route("/health",           get(handlers::health))
        // ── 인증 ────────────────────────────────────────────────────────────
        .route("/register",         post(handlers::register))
        .route("/login",            post(handlers::login))
        .route("/logout",           post(handlers::logout))
        // ── 유저 ────────────────────────────────────────────────────────────
        .route("/me",               get(handlers::get_me).patch(handlers::patch_me))
        .route("/archive",          get(handlers::archive))
        .route("/gacha/pull",       post(handlers::gacha_pull))
        // ── 관리자 ──────────────────────────────────────────────────────────
        .route("/admin/give-gold",  post(handlers::admin_give_gold))
        .route("/admin/users",      get(handlers::admin_list_users))
        // ── 정적 파일 ────────────────────────────────────────────────────────
        .fallback_service(ServeDir::new("frontend"))
        .layer(session_layer)
        .layer(cors)
        .with_state(state);

    let addr = "0.0.0.0:3000";
    tracing::info!("🚀 Gacha 서버 시작 → http://{addr}");
    tracing::info!("   POST        /register");
    tracing::info!("   POST        /login");
    tracing::info!("   POST        /logout");
    tracing::info!("   GET | PATCH /me");
    tracing::info!("   GET         /archive");
    tracing::info!("   POST        /gacha/pull");
    tracing::info!("   POST        /admin/give-gold");
    tracing::info!("   GET         /admin/users");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}