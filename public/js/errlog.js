// Tarayıcıdaki hataları toplayıp sunucuya yollar (yönetim → Hatalar). Bağımlılığı yok: her modülden önce çalışır.
const Q = []; let timer = null; const seen = new Map(); let sent = 0;
const VER = () => window.__suVer || '';
const route = () => (location.hash || '#/').slice(1).split('?')[0];
const ours = (src) => !src || src.startsWith(location.origin) || src.startsWith('/');
const NOISE = /ResizeObserver loop|Script error\.?$|Non-Error promise rejection|AbortError|The operation was aborted|Load failed$|NotAllowedError: play\(\)|The play\(\) request was interrupted|cancelled|chrome-extension|moz-extension|safari-extension/i;

function flush() {
  timer = null; if (!Q.length) return;
  const errors = Q.splice(0, 10);
  let token = null; try { token = localStorage.getItem('su_token'); } catch { /* yok */ }
  try {
    fetch('/api/client-errors', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ errors }) }).catch(() => {});
  } catch { /* yok */ }
  if (Q.length) timer = setTimeout(flush, 3000);
}
export function report(e) {
  try {
    if (!e?.msg || NOISE.test(e.msg) || !ours(e.src)) return;
    const k = `${e.kind}|${e.msg}|${e.src || ''}|${e.line || ''}`;
    const n = (seen.get(k) || 0) + 1; seen.set(k, n);
    if (n > 3 || sent >= 40) return; // aynı hata oturumda en çok 3 kez, toplam 40
    sent++;
    Q.push({ ...e, msg: String(e.msg).slice(0, 400), stack: String(e.stack || '').slice(0, 2500), route: route(), ver: VER() });
    if (!timer) timer = setTimeout(flush, 2500);
  } catch { /* hata kaydı asla uygulamayı bozmasın */ }
}
window.addEventListener('error', (ev) => {
  const t = ev.target;
  if (t && t !== window && (t.src || t.href)) { // yüklenemeyen betik / stil (görseller çok sık ve zararsız, alınmaz)
    if (t.tagName === 'SCRIPT' || (t.tagName === 'LINK' && t.rel === 'stylesheet')) report({ kind: 'resource', msg: `${t.tagName.toLowerCase()} yüklenemedi`, src: t.src || t.href });
    return;
  }
  report({ kind: 'js', msg: ev.message, src: ev.filename, line: ev.lineno, col: ev.colno, stack: ev.error?.stack });
}, true);
window.addEventListener('unhandledrejection', (ev) => {
  const r = ev.reason;
  if (r?.status && r.status < 500) return; // kullanıcı hatası (doğrulama, yetki) — gerçek hata değil
  const frame = String(r?.stack || '').split('\n').find((l) => l.includes(location.origin)) || '';
  const m = /(https?:\/\/[^\s)]+?):(\d+):(\d+)/.exec(frame) || [];
  report({ kind: 'promise', msg: String(r?.message || r || 'bilinmeyen'), src: m[1] || '', line: m[2], col: m[3], stack: r?.stack });
});
