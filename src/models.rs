use serde::{Deserialize, Serialize};

// ── 등급 ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "UPPERCASE")]
#[sqlx(rename_all = "UPPERCASE")]
pub enum Grade {
    Common,
    Rare,
    Ssr,
    Ur,
}

impl Grade {
    pub fn order(&self) -> u8 {
        match self {
            Grade::Ur     => 0,
            Grade::Ssr    => 1,
            Grade::Rare   => 2,
            Grade::Common => 3,
        }
    }
}

// ── 캐릭터 ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Character {
    pub name:      String,
    pub grade:     Grade,
    pub image_url: String,
    pub content:   String,
}

// ── DB 로우 ──────────────────────────────────────────────────────────────────

#[derive(Debug, sqlx::FromRow)]
pub struct UserRow {
    pub id:            i64,
    pub session_id:    String,
    pub username:      Option<String>,
    pub password_hash: Option<String>,
    pub nickname:      String,
    pub total_draws:   i64,
    pub gold:          i64,
}

// ── API DTO ──────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub nickname: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct PullRequest {
    pub times: u32,
}

#[derive(Debug, Serialize)]
pub struct PullResponse {
    pub total_draws: i64,
    pub gold:        i64,
    pub results:     Vec<Character>,
}

#[derive(Debug, Serialize)]
pub struct ArchiveEntry {
    #[serde(flatten)]
    pub character: Character,
    pub unlocked:  bool,
}

#[derive(Debug, Serialize)]
pub struct MeResponse {
    pub session_id:     String,
    pub nickname:       String,
    pub total_draws:    i64,
    pub unlocked_count: i64,
    pub gold:           i64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMeRequest {
    pub nickname: String,
}

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status:          &'static str,
    pub character_count: usize,
}

#[derive(Debug, Deserialize)]
pub struct GiveGoldRequest {
    pub session_id: String,
    pub amount:     i64,
}

#[derive(Debug, Serialize)]
pub struct GiveGoldResponse {
    pub session_id: String,
    pub gold:       i64,
}

#[derive(Debug, Serialize)]
pub struct AdminUserEntry {
    pub id:             i64,
    pub session_id:     String,
    pub nickname:       String,
    pub total_draws:    i64,
    pub gold:           i64,
    pub unlocked_count: i64,
}

#[derive(Debug, Deserialize)]
pub struct AdminListUsersQuery {
    pub nickname: Option<String>,
    pub limit:    Option<i64>,
    pub offset:   Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct AdminListUsersResponse {
    pub total:  i64,
    pub limit:  i64,
    pub offset: i64,
    pub users:  Vec<AdminUserEntry>,
}