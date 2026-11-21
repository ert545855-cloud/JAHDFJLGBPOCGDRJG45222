// Aşağı çekip yenileme: sayfa en baştayken parmakla aşağı çekilince üstte bir yenileme simgesi belirir, bırakınca sayfa yenilenir.
// Yalnız listelerin olduğu sayfalarda açıktır (app.js karar verir); açık pencere, klavye, yatay kaydırma ve iç kaydırma
// kutuları (yorumlar, listeler) varken devreye girmez.
const NEED = 64;   // bu kadar çekilince bırakınca yenilenir (px, sönümlenmiş mesafe)
const MAX = 96;

export function initPtr({ enabled, refresh }) {
  const ind = document.createElement('div');
  ind.className = 'ptr'; ind.setAttribute('aria-hidden', 'true');
  ind.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>';
  document.body.appendChild(ind);

  let sy = 0; let sx = 0; let pull = 0; let on = false; let busy = false; let decided = false;
  const paint = (d, spin) => {
    ind.style.transform = `translate(-50%, ${Math.round(d - 56)}px) rotate(${Math.round(d * 3)}deg)`;
    ind.style.opacity = String(Math.min(1, d / NEED));
    ind.classList.toggle('ready', d >= NEED); ind.classList.toggle('spin', !!spin);
  };
  const reset = () => { ind.classList.add('back'); paint(0); setTimeout(() => ind.classList.remove('back'), 260); };

  // Dokunuş, kendisi aşağı kaydırılmış bir iç kutunun içindeyse (ör. yorum listesi) sayfayı değil o kutuyu ilgilendirir
  const innerScrolled = (t) => { for (let el = t; el && el !== document.body; el = el.parentElement) { if (el.scrollTop > 0) return true; } return false; };

  document.addEventListener('touchstart', (e) => {
    on = false; decided = false; pull = 0;
    if (busy || e.touches.length !== 1 || window.scrollY > 0 || !enabled()) return;
    if (document.querySelector('#sheet-root .sheet, .ann-modal, .match-modal, .pv')) return;
    const ae = document.activeElement; if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
    if (innerScrolled(e.target)) return;
    sy = e.touches[0].clientY; sx = e.touches[0].clientX; on = true;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!on) return;
    const dy = e.touches[0].clientY - sy; const dx = e.touches[0].clientX - sx;
    if (!decided) {
      if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
      decided = true;
      if (dy <= 0 || Math.abs(dx) > dy || window.scrollY > 0) { on = false; return; } // yukarı ya da yana hareket: normal kaydırma
    }
    pull = Math.min(MAX, Math.max(0, dy) * 0.5);
    if (e.cancelable && pull > 0) e.preventDefault(); // iPhone'un sayfayı esnetmesini durdur
    paint(pull);
  }, { passive: false });

  const end = async () => {
    if (!on) return; on = false;
    if (pull < NEED) { reset(); return; }
    busy = true; navigator.vibrate?.(10);
    ind.classList.add('back'); paint(NEED, true);
    try { await Promise.all([refresh(), new Promise((r) => setTimeout(r, 450))]); } catch { /* sayfa kendi hatasını gösterir */ }
    busy = false; reset();
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', () => { if (on) { on = false; reset(); } }, { passive: true });
}
