/* ════════════════════════════════════════════════
   괴짜 학도와 신화의 세계 — Shared Utilities
   ════════════════════════════════════════════════ */

function escHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escAttr(s) { return escHtml(s); }

function imgFallback(imgEl, text = '[이미지 미준비]') {
    imgEl.style.display = 'none';
    const fb = document.createElement('div');
    fb.className = 'img-fallback';
    fb.textContent = text;
    imgEl.parentNode.appendChild(fb);
}