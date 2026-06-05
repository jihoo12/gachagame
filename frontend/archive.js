/**
 * archive.js — 학술 도감 페이지 스크립트
 * API: GET /me, GET /archive
 */

// ── 상태 ────────────────────────────────────────────────────────────────────
let allEntries  = [];
let activeGrade = "ALL";
let searchQuery = "";
let showLocked  = false;

// ── 진입점 ───────────────────────────────────────────────────────────────────
async function init() {
    await Promise.all([fetchMe(), fetchArchive()]);
    setupSearch();
    setupFilters();
    setupLockFilter();
}

// ── /me ─────────────────────────────────────────────────────────────────────
async function fetchMe() {
    try {
        const res = await fetch(`${API_BASE}/me`, {
            credentials: "include",
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return;
        const me = await res.json();
        const el = document.getElementById("header-me");
        el.innerHTML =
            `<strong>${escHtml(me.nickname)}</strong>` +
            ` · 뽑기 ${me.total_draws}회` +
            ` · 획득 ${me.unlocked_count}종`;
    } catch {
        // 비로그인 상태에서는 조용히 무시
    }
}

// ── /archive ─────────────────────────────────────────────────────────────────
async function fetchArchive() {
    const grid = document.getElementById("card-grid");
    try {
        const res = await fetch(`${API_BASE}/archive`, {
            credentials: "include",
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`서버 오류 ${res.status}`);
        allEntries = await res.json();
        updateStats();
        renderGrid();
    } catch (err) {
        grid.innerHTML = `
            <div class="error-box">
                <strong>⚠️ 도감을 불러오지 못했습니다</strong>
                <code>${API_BASE}/archive</code> 서버가 실행 중인지 확인하세요.
                <small style="color:#64748b;display:block;margin-top:8px;">${escHtml(err.message)}</small>
            </div>`;
    }
}

// ── 통계 업데이트 ─────────────────────────────────────────────────────────────
function updateStats() {
    const count  = (g) => allEntries.filter((e) => e.grade === g).length;
    const locked   = allEntries.filter((e) => !e.unlocked).length;
    const unlocked = allEntries.length - locked;

    document.getElementById("stat-all").textContent    = allEntries.length;
    document.getElementById("stat-common").textContent = count("COMMON");
    document.getElementById("stat-rare").textContent   = count("RARE");
    document.getElementById("stat-ssr").textContent    = count("SSR");
    document.getElementById("stat-ur").textContent     = count("UR");
    document.getElementById("stat-unlocked-label").textContent =
        `(획득 ${unlocked} / 미획득 ${locked})`;
}

// ── 검색 설정 ─────────────────────────────────────────────────────────────────
function setupSearch() {
    const input = document.getElementById("search-input");
    let debounceTimer;

    input.addEventListener("input", (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            searchQuery = e.target.value.trim().toLowerCase();
            renderGrid();
        }, 120);
    });

    // 검색창 클리어 (Esc)
    input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            input.value = "";
            searchQuery = "";
            renderGrid();
            input.blur();
        }
    });
}

// ── 등급 필터 ──────────────────────────────────────────────────────────────────
function setupFilters() {
    document.querySelectorAll(".filter-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            activeGrade = btn.dataset.grade;
            renderGrid();
        });
    });
}

// ── 미획득 필터 ────────────────────────────────────────────────────────────────
function setupLockFilter() {
    const btn = document.getElementById("filter-lock-btn");
    btn.addEventListener("click", () => {
        showLocked = !showLocked;
        btn.classList.toggle("active", showLocked);
        renderGrid();
    });
}

// ── 그리드 렌더링 ──────────────────────────────────────────────────────────────
function renderGrid() {
    const grid = document.getElementById("card-grid");
    let list = allEntries;

    if (activeGrade !== "ALL") list = list.filter((e) => e.grade === activeGrade);
    if (showLocked)            list = list.filter((e) => !e.unlocked);
    if (searchQuery) {
        list = list.filter(
            (e) =>
                e.name.toLowerCase().includes(searchQuery) ||
                e.content.toLowerCase().includes(searchQuery)
        );
    }

    if (list.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <span class="big-icon">🔍</span>
                <p>조건에 맞는 캐릭터가 없습니다.</p>
            </div>`;
        return;
    }

    // DocumentFragment로 한 번에 삽입 (리플로우 최소화)
    const frag = document.createDocumentFragment();
    list.forEach((entry, idx) => {
        frag.appendChild(createCard(entry, idx));
    });
    grid.innerHTML = "";
    grid.appendChild(frag);
}

// ── 카드 DOM 생성 ──────────────────────────────────────────────────────────────
function createCard(entry, idx) {
    const card = document.createElement("div");
    card.className = `archive-card${entry.unlocked ? "" : " locked"}`;
    card.dataset.grade = entry.grade;
    card.style.animationDelay = `${Math.min(idx * 20, 300)}ms`;

    // 이미지 영역
    let imgHTML;
    if (entry.image_url) {
        imgHTML = `
            <img class="card-thumb"
                 src="${escAttr(entry.image_url)}"
                 alt="${escAttr(entry.name)}"
                 loading="lazy"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
            <div class="thumb-placeholder" style="display:none">❓</div>`;
    } else {
        imgHTML = `<div class="thumb-placeholder">❓</div>`;
    }

    card.innerHTML = `
        ${imgHTML}
        ${!entry.unlocked ? '<div class="lock-icon">🔒</div>' : ""}
        <div class="card-footer">
            <span class="card-footer-name">${entry.unlocked ? escHtml(entry.name) : "???"}</span>
            <span class="grade-pip ${entry.grade}"></span>
        </div>`;

    if (entry.unlocked) {
        card.addEventListener("click", () => openDetail(entry));
    }

    return card;
}

// ── 상세 모달 열기 ─────────────────────────────────────────────────────────────
function openDetail(entry) {
    const img = document.getElementById("detail-img");
    img.src = entry.image_url || "";
    img.alt = entry.name;

    document.getElementById("detail-name").textContent    = entry.name;
    document.getElementById("detail-content").textContent = entry.content;

    const badge = document.getElementById("detail-badge");
    badge.textContent = entry.grade;
    badge.className   = `detail-badge ${entry.grade}`;

    document.getElementById("detail-grade-bar").className = `detail-grade-bar ${entry.grade}`;

    // 획득일 표시
    const drawnEl = document.getElementById("detail-drawn-at");
    drawnEl.textContent = entry.drawn_at
        ? `📅 획득일: ${new Date(entry.drawn_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}`
        : "";

    // 모달 열기 애니메이션
    const overlay = document.getElementById("detail-overlay");
    overlay.style.display = "flex";
    requestAnimationFrame(() => {
        overlay.classList.add("open");
        requestAnimationFrame(() => overlay.classList.add("visible"));
    });

    // body 스크롤 잠금
    document.body.style.overflow = "hidden";
}

// ── 상세 모달 닫기 ─────────────────────────────────────────────────────────────
function closeDetail() {
    const overlay = document.getElementById("detail-overlay");
    overlay.classList.remove("visible");
    setTimeout(() => {
        overlay.classList.remove("open");
        overlay.style.display = "none";
    }, 280);
    document.body.style.overflow = "";
}

function handleOverlayClick(e) {
    if (e.target === document.getElementById("detail-overlay")) closeDetail();
}

// ── 라이트박스 (전체화면 이미지 뷰어) ─────────────────────────────────────────
function openLightbox() {
    const src = document.getElementById("detail-img").src;
    const alt = document.getElementById("detail-img").alt;
    if (!src) return;

    const lb      = document.getElementById("lightbox-overlay");
    const lbImg   = document.getElementById("lightbox-img");
    const caption = document.getElementById("lightbox-caption");

    lbImg.src       = src;
    lbImg.alt       = alt;
    caption.textContent = alt;

    lb.style.display = "flex";
    requestAnimationFrame(() => {
        lb.classList.add("open");
        requestAnimationFrame(() => lb.classList.add("visible"));
    });

    // body 스크롤 이미 잠긴 상태 유지
}

function closeLightbox() {
    const lb = document.getElementById("lightbox-overlay");
    lb.classList.remove("visible");
    setTimeout(() => {
        lb.classList.remove("open");
        lb.style.display = "none";
        document.getElementById("lightbox-img").src = "";
    }, 240);
}

function handleLightboxClick(e) {
    // 이미지 자체 클릭은 무시, 배경 클릭만 닫기
    if (e.target === document.getElementById("lightbox-overlay") ||
        e.target === document.querySelector(".lightbox-img-wrap")) {
        closeLightbox();
    }
}

// ── 키보드 단축키 ──────────────────────────────────────────────────────────────
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        // 라이트박스가 열려 있으면 먼저 닫기
        const lb = document.getElementById("lightbox-overlay");
        if (lb.classList.contains("open")) {
            closeLightbox();
        } else {
            closeDetail();
        }
    }

    // '/' 키로 검색창 포커스
    if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        document.getElementById("search-input").focus();
    }
});
// ── 시작 ────────────────────────────────────────────────────────────────────
init();