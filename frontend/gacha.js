/* ════════════════════════════════════════════════
   괴짜 학도와 신화의 세계 — 소환실 (gacha.js)
   버그 수정 목록:
     1. drawGacha() - unlocked_count UI 미갱신 수정
     2. setupNicknameEdit() - Enter 키로 PATCH 요청 중복 전송 수정
     3. buildSingleCard/GridCard() - 이미지 URL XSS 방지 (onclick 인라인 제거)
     4. drawGacha() - 버튼 비활성화 타이밍 개선 (isPulling 직후 즉시 disable)
     5. init() - 실패 시 버튼 영구 잠김 → 재시도 버튼 추가
   골드 시스템 추가:
     6. applyMe() - gold 필드 갱신
     7. drawGacha() - 뽑기 후 gold 잔액 갱신, 골드 부족 시 전용 에러 메시지
     8. 버튼 라벨에 비용(100G / 1000G) 표시
   ════════════════════════════════════════════════ */

let isPulling = false;

/* ── Init ─────────────────────────────────── */
async function init() {
    const btn1  = document.getElementById('btn-draw-1');
    const btn10 = document.getElementById('btn-draw-10');

    try {
        const res = await fetch(`${API_BASE}/me`, { credentials: 'include', signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`서버 응답 오류: ${res.status}`);

        applyMe(await res.json());

        btn1.textContent  = '1회 소환 (100G)';
        btn10.textContent = '10회 연속 소환 (1000G)';
        btn1.disabled = btn10.disabled = false;

        setResultHtml('<div class="loading-box" style="padding:50px">상단의 버튼을 눌러 소환을 시작하세요!</div>');
    } catch (err) {
        // [버그5 수정] 실패 시 재시도 버튼 제공, 버튼은 영구 잠김 상태 유지
        btn1.textContent  = '로딩 실패';
        btn10.textContent = '로딩 실패';

        setResultHtml(`
            <div class="error-box">
                <strong>⚠️ 서버에 연결할 수 없습니다</strong>
                <code>${API_BASE}</code> 에서 Axum 서버가 실행 중인지 확인하세요.<br>
                <small style="color:#94a3b8;margin-top:8px;display:block;">${escHtml(err.message)}</small>
                <button onclick="retryInit()" style="margin-top:14px;padding:8px 20px;cursor:pointer;">🔄 다시 연결</button>
            </div>`);
    }
}

/* [버그5 수정] 재시도 함수 — 버튼 상태를 초기화한 뒤 init() 재호출 */
function retryInit() {
    const btn1  = document.getElementById('btn-draw-1');
    const btn10 = document.getElementById('btn-draw-10');
    btn1.textContent  = '로딩 중...';
    btn10.textContent = '로딩 중...';
    btn1.disabled = btn10.disabled = true;
    setResultHtml('<div class="loading-box"><div class="spinner"></div>서버에 연결하는 중입니다...</div>');
    init();
}

function applyMe(me) {
    document.getElementById('nickname-display').textContent = me.nickname;
    document.getElementById('total-count').textContent      = me.total_draws;
    document.getElementById('unlocked-count').textContent   = me.unlocked_count;
    // [골드 추가] gold 잔액 갱신
    if (me.gold !== undefined) {
        document.getElementById('gold-count').textContent = me.gold.toLocaleString() + 'G';
    }
}

function setResultHtml(html) {
    document.getElementById('result-wrapper').innerHTML = html;
}

/* ── Nickname Edit ────────────────────────── */
function setupNicknameEdit() {
    const display = document.getElementById('nickname-display');
    const input   = document.getElementById('nickname-input');

    display.addEventListener('click', () => {
        input.value = display.textContent;
        display.classList.add('editing');
        input.classList.add('editing');
        input.focus();
    });

    // [버그2 수정] committed 플래그로 중복 실행 방지
    let committed = false;

    async function commitNickname() {
        if (committed) return;
        committed = true;

        const nick = input.value.trim();
        display.classList.remove('editing');
        input.classList.remove('editing');

        committed = false;

        if (!nick || nick === display.textContent) return;

        try {
            const res = await fetch(`${API_BASE}/me`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ nickname: nick }),
            });
            if (!res.ok) throw new Error(await res.text());
            applyMe(await res.json());
        } catch (err) {
            alert('닉네임 변경 실패: ' + err.message);
        }
    }

    input.addEventListener('blur', commitNickname);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            commitNickname();
        }
    });
}

/* ── Gacha Pull ───────────────────────────── */
async function drawGacha(times) {
    if (isPulling) return;
    isPulling = true;

    const btn1  = document.getElementById('btn-draw-1');
    const btn10 = document.getElementById('btn-draw-10');

    // [버그4 수정] isPulling = true 직후 즉시 버튼 비활성화
    btn1.disabled = btn10.disabled = true;

    setResultHtml('<div class="loading-box"><div class="spinner"></div>소환 중...</div>');

    try {
        const res = await fetch(`${API_BASE}/gacha/pull`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ times }),
            signal: AbortSignal.timeout(10000),
        });

        // [골드 추가] 400 응답 중 골드 부족 메시지를 별도 처리
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            const isGoldShortage = body.includes('골드가 부족합니다');
            if (isGoldShortage) {
                setResultHtml(`
                    <div class="error-box">
                        <strong>💰 골드가 부족합니다</strong>
                        ${escHtml(times)}회 소환에 <strong>${(times * 100).toLocaleString()}G</strong>가 필요합니다.<br>
                        관리자에게 골드 지급을 요청하세요.
                    </div>`);
                return; // finally 에서 버튼 복구
            }
            throw new Error(`서버 오류 ${res.status}: ${body}`);
        }

        const data = await res.json();

        // [버그1 수정] total_draws와 unlocked_count 둘 다 갱신
        if (data.total_draws !== undefined) {
            document.getElementById('total-count').textContent = data.total_draws;
        }
        if (data.unlocked_count !== undefined) {
            document.getElementById('unlocked-count').textContent = data.unlocked_count;
        }
        // [골드 추가] 뽑기 후 잔액 갱신
        if (data.gold !== undefined) {
            document.getElementById('gold-count').textContent = data.gold.toLocaleString() + 'G';
        }

        renderResults(data.results, times);

    } catch (err) {
        setResultHtml(`
            <div class="error-box">
                <strong>⚠️ 소환 실패</strong>
                <code>${escHtml(err.message)}</code>
            </div>`);
        console.error('Gacha Error:', err);
    } finally {
        isPulling = false;
        btn1.disabled = btn10.disabled = false;
    }
}

/* ── Render Results ───────────────────────── */
function renderResults(results, times) {
    const wrapper = document.getElementById('result-wrapper');
    wrapper.innerHTML = '';

    if (times === 1) {
        const card = buildSingleCard(results[0]);
        wrapper.appendChild(card);
        setTimeout(() => card.classList.add('show'), 50);
    } else {
        const grid = document.createElement('div');
        grid.className = 'grid-container';
        results.forEach((char, idx) => {
            const card = buildGridCard(char);
            grid.appendChild(card);
            setTimeout(() => card.classList.add('show'), idx * 100 + 50);
        });
        wrapper.appendChild(grid);
    }
}

// [버그3 수정] 공통 이미지 박스 생성 함수
function buildImageBox(char, fallbackText) {
    const box = document.createElement('div');
    box.className = 'card-image-box';
    box.title = '클릭하면 전체화면';

    const img = document.createElement('img');
    img.className = 'card-image';
    img.src = char.image_url;
    img.alt = char.name;
    img.addEventListener('error', () => {
        if (fallbackText) imgFallback(img, fallbackText);
        else imgFallback(img);
    });

    box.addEventListener('click', () => openImageModal(char.image_url));
    box.appendChild(img);
    return box;
}

function buildSingleCard(char) {
    const el = document.createElement('div');
    el.className = `single-display ${char.grade}`;

    const imageBox = buildImageBox(char);

    const info = document.createElement('div');
    info.className = 'card-info';
    info.innerHTML = `
        <div class="card-header">
            <span class="badge ${char.grade}">${char.grade}</span>
            <div class="card-name">${escHtml(char.name)}</div>
        </div>
        <div class="card-content">${escHtml(char.content)}</div>`;

    el.appendChild(imageBox);
    el.appendChild(info);
    return el;
}

function buildGridCard(char) {
    const el = document.createElement('div');
    el.className = `card ${char.grade}`;

    const imageBox = buildImageBox(char, '이미지 미준비');

    const info = document.createElement('div');
    info.className = 'card-info';
    info.innerHTML = `
        <div style="margin-bottom:6px"><span class="badge ${char.grade}">${char.grade}</span></div>
        <div class="card-name">${escHtml(char.name)}</div>
        <div class="card-content">${escHtml(char.content)}</div>`;

    el.appendChild(imageBox);
    el.appendChild(info);
    return el;
}

/* ── Image Modal ──────────────────────────── */
function openImageModal(src) {
    const modal = document.getElementById('image-modal');
    document.getElementById('modal-img').src = src;
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('open'), 10);
}

function closeImageModal() {
    const modal = document.getElementById('image-modal');
    modal.classList.remove('open');
    setTimeout(() => { modal.style.display = 'none'; }, 300);
}

/* ── Keyboard & Modal Close ───────────────── */
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeImageModal(); });

/* ── Boot ─────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-draw-1').addEventListener('click',  () => drawGacha(1));
    document.getElementById('btn-draw-10').addEventListener('click', () => drawGacha(10));

    const modal = document.getElementById('image-modal');
    const closeBtn = document.getElementById('modal-close-btn');
    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target === closeBtn) closeImageModal();
    });

    init();
    setupNicknameEdit();
});