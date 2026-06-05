/* ── State ─────────────────────────────────────────────────────── */
let logs = [];

/* ── Nav ───────────────────────────────────────────────────────── */
function navigate(id) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.section === id));
  document.querySelectorAll('.section').forEach(el => el.classList.toggle('active', el.id === id));
}

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.section));
});

/* ── Helpers ───────────────────────────────────────────────────── */
function getKey() {
  return document.getElementById('admin-key').value.trim();
}

function fmt(n) {
  return Number(n).toLocaleString('ko-KR');
}

function now() {
  return new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function spin(id, on) {
  const el = document.getElementById(id);
  if (el) el.className = 'spinner' + (on ? ' show' : '');
}

function showAlert(id, type, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'alert alert-' + type + ' show';
  el.textContent = msg;
}

function hideAlert(id) {
  const el = document.getElementById(id);
  if (el) el.className = 'alert';
}

/* ── Log ───────────────────────────────────────────────────────── */
function addLog(type, msg) {
  logs.unshift({ type, msg, time: now() });
  if (logs.length > 100) logs.pop();
  renderLogs();
}

function renderLogs() {
  const list = document.getElementById('log-list');
  const count = document.getElementById('log-count');
  const empty = document.getElementById('log-empty');

  if (count) count.textContent = logs.length;

  if (!list) return;

  if (logs.length === 0) {
    list.innerHTML = '<li class="log-empty" id="log-empty">아직 작업 내역이 없습니다</li>';
    return;
  }

  const typeIcon = { s: '✓', e: '✕', i: '·' };
  list.innerHTML = logs.map(l =>
    `<li class="log-item ${l.type}">
      <span class="log-time">${l.time}</span>
      <span class="log-type">${typeIcon[l.type] || '·'}</span>
      <span class="log-msg">${l.msg}</span>
    </li>`
  ).join('');
}

/* ── Connection indicator ──────────────────────────────────────── */
function setConnStatus(status) {
  const dot  = document.getElementById('conn-dot');
  const text = document.getElementById('conn-text');
  if (!dot || !text) return;

  const map = {
    ok:      { cls: 'ok',   label: 'CONNECTED' },
    fail:    { cls: 'fail', label: 'ERROR' },
    idle:    { cls: '',     label: 'IDLE' },
  };

  const s = map[status] || map.idle;
  dot.className  = 'conn-dot ' + s.cls;
  text.textContent = s.label;
}

/* ── Auth / Verify ─────────────────────────────────────────────── */
document.getElementById('btn-verify').addEventListener('click', async () => {
  const key = getKey();
  if (!key) { showAlert('alert-auth', 'error', 'Admin key를 입력하세요.'); return; }

  spin('spinner-verify', true);
  hideAlert('alert-auth');
  setConnStatus('idle');

  try {
    const r = await fetch('/health');
    spin('spinner-verify', false);

    if (r.ok) {
      const d = await r.json();
      setConnStatus('ok');
      showAlert('alert-auth', 'success',
        `서버 연결 성공 — 캐릭터 ${d.character_count}명 | status: ${d.status}`);
      addLog('s', `서버 연결 확인 완료 (캐릭터 ${d.character_count}명)`);

      const hStatus = document.getElementById('h-status');
      const hChars  = document.getElementById('h-chars');
      if (hStatus) { hStatus.textContent = d.status; hStatus.className = 'value ok'; }
      if (hChars)  hChars.textContent = d.character_count;
    } else {
      setConnStatus('fail');
      showAlert('alert-auth', 'error', `서버 응답 오류: HTTP ${r.status}`);
      addLog('e', `서버 응답 오류: ${r.status}`);
    }
  } catch (e) {
    spin('spinner-verify', false);
    setConnStatus('fail');
    showAlert('alert-auth', 'error', '서버에 연결할 수 없습니다: ' + e.message);
    addLog('e', '서버 연결 실패: ' + e.message);
  }
});

document.getElementById('admin-key').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-verify').click();
});

/* ── Lookup User ───────────────────────────────────────────────── */
document.getElementById('btn-lookup').addEventListener('click', async () => {
  const sid = document.getElementById('lookup-sid').value.trim();
  if (!sid) { showAlert('alert-lookup', 'error', 'Session ID를 입력하세요.'); return; }

  spin('spinner-lookup', true);
  hideAlert('alert-lookup');
  document.getElementById('user-grid').className = 'user-grid';

  try {
    // amount:0 으로 존재 확인 (give-gold 엔드포인트 probe)
    const r = await fetch('/admin/give-gold', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + getKey(),
      },
      body: JSON.stringify({ session_id: sid, amount: 0 }),
    });
    spin('spinner-lookup', false);
    const d = await r.json();

    if (r.status === 400 && d.error && d.error.includes('찾을 수 없습니다')) {
      showAlert('alert-lookup', 'error', `유저를 찾을 수 없습니다: ${sid}`);
      addLog('e', `조회 실패 — 없는 session: ${sid.slice(0, 8)}...`);
      return;
    }

    if (r.status === 400 && d.error && d.error.includes('1 이상')) {
      // amount:0 validation hit — user exists, gold is in error msg? 
      // 유저 존재는 확인됨, /me 로 정보 보완 시도
      await fetchMeInfo(sid);
      return;
    }

    if (r.ok) {
      renderUserGrid({ gold: d.gold, session_id: sid });
      showAlert('alert-lookup', 'success', `유저 확인됨 — 현재 골드: ${fmt(d.gold)}G`);
      addLog('s', `유저 조회: ${sid.slice(0, 8)}... | 골드 ${fmt(d.gold)}G`);
      document.getElementById('give-sid').value = sid;
    } else {
      showAlert('alert-lookup', 'error', d.error || `HTTP ${r.status}`);
      addLog('e', `조회 오류: ${d.error || r.status}`);
    }
  } catch (e) {
    spin('spinner-lookup', false);
    showAlert('alert-lookup', 'error', '네트워크 오류: ' + e.message);
    addLog('e', '네트워크 오류: ' + e.message);
  }
});

async function fetchMeInfo(sid) {
  try {
    const r = await fetch('/me');
    if (r.ok) {
      const d = await r.json();
      renderUserGrid(d);
      showAlert('alert-lookup', 'success', `유저 확인됨 — ${d.nickname || '(닉네임 없음)'}`);
      addLog('s', `유저 조회: ${sid.slice(0, 8)}...`);
      document.getElementById('give-sid').value = sid;
    }
  } catch (_) { /* silent */ }
}

function renderUserGrid(data) {
  const grid = document.getElementById('user-grid');
  grid.className = 'user-grid show';

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? '—';
  };

  set('u-nick',     data.nickname     || '—');
  set('u-gold',     data.gold         != null ? fmt(data.gold) : '—');
  set('u-draws',    data.total_draws  != null ? fmt(data.total_draws) : '—');
  set('u-unlocked', data.unlocked_count != null ? fmt(data.unlocked_count) : '—');
}

document.getElementById('lookup-sid').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-lookup').click();
});

/* ── Give Gold ─────────────────────────────────────────────────── */
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.getElementById('give-amount').value = chip.dataset.amount;
  });
});

document.getElementById('btn-give').addEventListener('click', async () => {
  const sid    = document.getElementById('give-sid').value.trim();
  const amount = parseInt(document.getElementById('give-amount').value, 10);
  const key    = getKey();

  if (!key)           { showAlert('alert-give', 'error', 'Admin key를 먼저 입력하세요.'); return; }
  if (!sid)           { showAlert('alert-give', 'error', 'Session ID를 입력하세요.');      return; }
  if (!amount || amount < 1) { showAlert('alert-give', 'error', '1 이상의 골드량을 입력하세요.'); return; }

  spin('spinner-give', true);
  hideAlert('alert-give');

  try {
    const r = await fetch('/admin/give-gold', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + key,
      },
      body: JSON.stringify({ session_id: sid, amount }),
    });
    spin('spinner-give', false);
    const d = await r.json();

    if (r.ok) {
      showAlert('alert-give', 'success',
        `✓ 지급 완료 — +${fmt(amount)}G | 잔액: ${fmt(d.gold)}G`);
      addLog('s', `골드 지급: ${sid.slice(0, 8)}... +${fmt(amount)}G → 잔액 ${fmt(d.gold)}G`);

      // user grid 골드 업데이트
      const goldEl = document.getElementById('u-gold');
      if (goldEl && goldEl.textContent !== '—') goldEl.textContent = fmt(d.gold);
    } else {
      showAlert('alert-give', 'error', d.error || `HTTP ${r.status}`);
      addLog('e', `골드 지급 실패: ${d.error || r.status}`);
    }
  } catch (e) {
    spin('spinner-give', false);
    showAlert('alert-give', 'error', '네트워크 오류: ' + e.message);
    addLog('e', '네트워크 오류: ' + e.message);
  }
});

document.getElementById('give-amount').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-give').click();
});

/* ── Health Check ──────────────────────────────────────────────── */
document.getElementById('btn-health').addEventListener('click', async () => {
  spin('spinner-health', true);
  hideAlert('alert-health');

  try {
    const t0 = Date.now();
    const r  = await fetch('/health');
    const ms = Date.now() - t0;
    spin('spinner-health', false);

    if (r.ok) {
      const d = await r.json();
      document.getElementById('h-status').textContent  = d.status;
      document.getElementById('h-status').className    = 'value ok';
      document.getElementById('h-chars').textContent   = d.character_count;
      document.getElementById('h-latency').textContent = ms + 'ms';
      showAlert('alert-health', 'success', `응답 정상 (${ms}ms)`);
      addLog('s', `헬스 체크 — ${d.status} | ${ms}ms | 캐릭터 ${d.character_count}명`);
    } else {
      document.getElementById('h-status').textContent = 'error';
      document.getElementById('h-status').className   = 'value fail';
      showAlert('alert-health', 'error', `HTTP ${r.status}`);
      addLog('e', `헬스 체크 실패: HTTP ${r.status}`);
    }
  } catch (e) {
    spin('spinner-health', false);
    document.getElementById('h-status').textContent = 'offline';
    document.getElementById('h-status').className   = 'value fail';
    showAlert('alert-health', 'error', '연결 불가: ' + e.message);
    addLog('e', '헬스 체크 연결 불가: ' + e.message);
  }
});

/* ── Log clear ─────────────────────────────────────────────────── */
document.getElementById('btn-clear-log').addEventListener('click', () => {
  logs = [];
  renderLogs();
});

/* ── Init ──────────────────────────────────────────────────────── */
renderLogs();

/* ── Users Table ───────────────────────────────────────────────── */
const PAGE_LIMIT = 50;
let usersState = { offset: 0, total: 0, nickname: '' };

async function loadUsers(offset = 0) {
  const nickname = document.getElementById('users-search').value.trim();
  usersState.nickname = nickname;
  usersState.offset   = offset;

  spin('spinner-users', true);
  hideAlert('alert-users');

  const params = new URLSearchParams({ limit: PAGE_LIMIT, offset });
  if (nickname) params.set('nickname', nickname);

  try {
    const r = await fetch('/admin/users?' + params.toString(), {
      headers: { 'Authorization': 'Bearer ' + getKey() },
    });
    spin('spinner-users', false);
    const d = await r.json();

    if (!r.ok) {
      showAlert('alert-users', 'error', d.error || `HTTP ${r.status}`);
      addLog('e', `유저 목록 조회 실패: ${d.error || r.status}`);
      return;
    }

    usersState.total = d.total;
    renderUsersTable(d.users);
    renderPagination(d.total, d.offset, d.limit);

    const badge = document.getElementById('users-total-badge');
    if (badge) badge.textContent = `전체 ${fmt(d.total)}명`;

    addLog('s', `유저 목록 조회 — ${fmt(d.total)}명 중 ${d.users.length}명 표시`);
  } catch (e) {
    spin('spinner-users', false);
    showAlert('alert-users', 'error', '네트워크 오류: ' + e.message);
    addLog('e', '유저 목록 네트워크 오류: ' + e.message);
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-tbody');

  if (!users || users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">유저가 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => {
    const short = u.session_id.slice(0, 8) + '…';
    return `
      <tr>
        <td class="mono" style="color:var(--text-3)">#${u.id}</td>
        <td><span class="nick-val">${escHtml(u.nickname) || '<span style="color:var(--text-3)">—</span>'}</span></td>
        <td>
          <div class="sid-cell">
            <span class="sid-text" title="${escHtml(u.session_id)}">${short}</span>
            <button class="copy-btn" onclick="copySid(this,'${escHtml(u.session_id)}')">copy</button>
          </div>
        </td>
        <td><span class="gold-val">${fmt(u.gold)}G</span></td>
        <td class="mono">${fmt(u.total_draws)}</td>
        <td class="mono">${fmt(u.unlocked_count)}</td>
        <td>
          <button class="give-btn" onclick="quickGive('${escHtml(u.session_id)}','${escHtml(u.nickname)}')">+ 골드</button>
        </td>
      </tr>`;
  }).join('');
}

function renderPagination(total, offset, limit) {
  const page    = Math.floor(offset / limit) + 1;
  const pages   = Math.ceil(total / limit) || 1;
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  const info = document.getElementById('page-info');
  const prev = document.getElementById('btn-page-prev');
  const next = document.getElementById('btn-page-next');

  if (info) info.textContent = `${page} / ${pages} 페이지`;
  if (prev) prev.disabled = !hasPrev;
  if (next) next.disabled = !hasNext;
}

function copySid(btn, sid) {
  navigator.clipboard.writeText(sid).then(() => {
    btn.textContent = 'ok!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'copy'; btn.classList.remove('copied'); }, 1500);
  });
}

function quickGive(sid, nick) {
  document.getElementById('give-sid').value = sid;
  navigate('sec-gold');
  showAlert('alert-give', 'success', `대상: ${nick || sid.slice(0, 8) + '…'}`);
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.getElementById('btn-users-load').addEventListener('click', () => loadUsers(0));
document.getElementById('btn-users-refresh').addEventListener('click', () => loadUsers(usersState.offset));
document.getElementById('users-search').addEventListener('keydown', e => {
  if (e.key === 'Enter') loadUsers(0);
});

document.getElementById('btn-page-prev').addEventListener('click', () => {
  loadUsers(Math.max(0, usersState.offset - PAGE_LIMIT));
});

document.getElementById('btn-page-next').addEventListener('click', () => {
  loadUsers(usersState.offset + PAGE_LIMIT);
});