/* ════════════════════════════════════════════════
   괴짜 학도와 신화의 세계 — auth.js
   공통 인증 유틸리티
   ════════════════════════════════════════════════ */

const API_BASE = 'http://localhost:3000';

/**
 * 현재 로그인 여부를 확인합니다.
 * /me 가 200 이면 로그인 상태, 401/403 이면 미로그인.
 * @returns {Promise<object|null>} me 객체 또는 null
 */
async function checkAuth() {
    try {
        const res = await fetch(`${API_BASE}/me`, {
            credentials: 'include',
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

/**
 * 로그인이 필요한 페이지에서 호출합니다.
 * 미로그인 상태이면 login.html 로 리다이렉트합니다.
 * @returns {Promise<object>} me 객체
 */
async function requireAuth() {
    const me = await checkAuth();
    if (!me) {
        location.href = 'login.html';
        // 리다이렉트 후 아래 코드가 실행되지 않도록 Promise 를 반환하지 않음
        return new Promise(() => {});
    }
    return me;
}

/**
 * 로그아웃 요청 후 login.html 로 이동합니다.
 */
async function logout() {
    try {
        await fetch(`${API_BASE}/logout`, {
            method: 'POST',
            credentials: 'include',
            signal: AbortSignal.timeout(5000),
        });
    } catch { /* 실패해도 클라이언트 측에서 이동 */ }
    location.href = 'login.html';
}