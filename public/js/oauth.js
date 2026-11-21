// Google / Apple ile giriş düğmeleri. Sağlayıcının kendi betiği yalnızca gerektiğinde yüklenir (güvenlik kuralında izinli adresler).
import { state, iosShell } from './core.js';
import { report } from './errlog.js';

const loaded = {};
function loadScript(src) {
  loaded[src] ||= new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = ok; s.onerror = () => { delete loaded[src]; no(new Error('Giriş penceresi yüklenemedi. İnternet bağlantını kontrol et.')); };
    document.head.append(s);
  });
  return loaded[src];
}
// iOS uygulamasında: Apple ile giriş uygulamanın yerel penceresiyle (AppleSignIn eklentisi); Google gömülü web görünümünde
// girişi engellediği için Google girişi Apple'ın güvenli giriş penceresinde (WebAuth eklentisi, Safari tabanlı) yapılır.
// Eski uygulama sürümünde WebAuth yoksa Google düğmesi gösterilmez.
const nativeApple = () => !!window.Capacitor?.Plugins?.AppleSignIn;
const nativeWeb = () => !!window.Capacitor?.Plugins?.WebAuth;
export const oauthCfg = () => {
  const c = state.config?.oauth || {};
  if (!iosShell()) return c;
  return { ...(nativeApple() ? { apple: { native: true } } : {}), ...(c.google && nativeWeb() ? { google: c.google } : {}) };
};
const G_LOGO = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
// iPhone uygulaması: Google girişi güvenli pencerede, dönüş kodu kimlik belgesine çevrilir
async function nativeGoogle() {
  let r;
  try { r = await window.Capacitor.Plugins.WebAuth.open({ url: `${location.origin}/auth/google.html`, scheme: 'swipeup' }); } catch (e) { if (/CANCELED/.test(String(e?.code || ''))) return null; throw new Error(e?.message || 'Google ile giriş açılamadı.'); }
  const u = new URL(r?.url || 'swipeup://google');
  const code = u.searchParams.get('g');
  if (!code) throw new Error('Google girişi tamamlanamadı. Tekrar dene.');
  const res = await fetch('/api/auth/google/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.credential) throw new Error(d.error || 'Google girişi tamamlanamadı. Tekrar dene.');
  return d.credential;
}

// Google girişi uygulama içi tarayıcılarda (Instagram, Facebook, TikTok, X, Snapchat, Android WebView) Google tarafından engellenir
export const inAppBrowser = () => /FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|BytedanceWebview|Twitter|Snapchat|LinkedInApp|; wv\)/i.test(navigator.userAgent || '');
// Ana ekrana eklenmiş iPhone uygulaması: açılır pencere uygulamaya geri dönemez → yönlendirmeli giriş
const iosApp = () => navigator.standalone === true;

// Google'ın "bu adres izinli değil" uyarısını yakala (konsola yazar, düğmede bir şey göstermez)
let originBad = false; const originWatch = new Set();
for (const k of ['error', 'warn', 'log']) {
  const f = console[k].bind(console);
  console[k] = (...a) => {
    if (!originBad && /GSI_LOGGER/.test(String(a[0])) && /origin is not allowed|origin_mismatch|not a valid origin/i.test(a.map(String).join(' '))) { originBad = true; originWatch.forEach((fn) => fn()); report({ kind: 'gsi', msg: `Google girişi: bu adres (${location.origin}) Google Cloud'da izinli değil (origin_mismatch)`, src: location.origin + '/' }); }
    f(...a);
  };
}
const note = (box, html) => {
  let n = box.parentElement?.querySelector('.g-note');
  if (!n) { n = document.createElement('div'); n.className = 'g-note'; n.setAttribute('role', 'alert'); box.after(n); }
  n.innerHTML = html; return n;
};

// Google'ın kendi düğmesini kutuya çizer; seçim yapılınca kimlik belgesi (credential) döner.
// purpose: 'login' (giriş/kayıt) ya da 'link' (Ayarlar'da hesaba bağlama) — yönlendirmeli girişte dönüşte hangisi olduğu bilinsin
export async function googleButton(box, onCred, text = 'continue_with', purpose = 'login') {
  const id = oauthCfg().google; if (!id || !box) return false;
  if (iosShell()) {
    box.innerHTML = `<button type="button" class="g-nat">${G_LOGO}<span>${text === 'signup_with' ? 'Google ile kaydol' : 'Google ile devam et'}</span></button>`;
    const b = box.querySelector('.g-nat');
    b.onclick = async () => {
      b.disabled = true;
      try { const c = await nativeGoogle(); if (c) onCred(c); } catch (e) { note(box, String(e.message || 'Google ile giriş tamamlanamadı.').replace(/[<>&]/g, '')); } finally { b.disabled = false; }
    };
    return true;
  }
  if (inAppBrowser()) {
    box.classList.add('g-off');
    const n = note(box, `Google ile giriş bu uygulamanın içindeki tarayıcıda çalışmaz. Sağ üstteki <b>⋯</b> menüsünden <b>Tarayıcıda aç</b>'a dokun ya da adresi kopyalayıp Safari / Chrome'da aç.<button type="button" class="btn sm outline g-copy">Adresi kopyala</button>`);
    n.querySelector('.g-copy').onclick = async () => { try { await navigator.clipboard.writeText(location.origin + '/'); n.querySelector('.g-copy').textContent = 'Kopyalandı'; } catch { /* yok */ } };
    return false;
  }
  await loadScript('https://accounts.google.com/gsi/client');
  const g = window.google?.accounts?.id; if (!g) throw new Error('Google ile giriş şu an açılamadı.');
  const redirect = iosApp();
  if (redirect) { try { sessionStorage.setItem('su_gp', purpose); } catch { /* yok */ } }
  g.initialize({
    client_id: id, auto_select: false, itp_support: true, cancel_on_tap_outside: true,
    ...(redirect ? { ux_mode: 'redirect', login_uri: location.origin + '/api/auth/google/cb' } : { ux_mode: 'popup', callback: (r) => r?.credential && onCred(r.credential) }),
  });
  const dark = document.documentElement.dataset.theme === 'dark' || matchMedia('(prefers-color-scheme: dark)').matches;
  g.renderButton(box, { theme: dark ? 'filled_black' : 'outline', size: 'large', text, shape: 'pill', locale: 'tr', logo_alignment: 'center', width: Math.min(400, Math.max(240, box.clientWidth || 320)) });
  const bad = () => { if (box.isConnected) note(box, 'Google girişi bu adreste henüz açık değil (site yöneticisi Google ayarlarına bu adresi eklemeli). Şimdilik kullanıcı adı ve şifrenle gir.'); };
  if (originBad) bad(); else { originWatch.add(bad); setTimeout(() => originWatch.delete(bad), 30000); }
  setTimeout(() => { if (box.isConnected && !box.querySelector('iframe, div[role=button]')) note(box, 'Google düğmesi yüklenemedi. Sayfayı yenileyip tekrar dene.'); }, 6000);
  return true;
}

// Yönlendirmeli girişten dönüş (?g=kod): kodu kimlik belgesiyle değiştirir
// Apple yönlendirmeli girişinden dönüş de aynı yoldan gelir (?a=kod / ?aerr=1). Dönen: { provider, purpose, credential | error }
export async function takeGoogleReturn() {
  const q = new URLSearchParams(location.search);
  const apple = q.has('a') || q.has('aerr');
  const code = q.get(apple ? 'a' : 'g'); const err = q.get(apple ? 'aerr' : 'gerr');
  if (!code && !err) return null;
  ['g', 'gerr', 'a', 'aerr'].forEach((k) => q.delete(k));
  history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  const provider = apple ? 'apple' : 'google'; const P = apple ? 'Apple' : 'Google';
  let purpose = 'login'; const pk = apple ? 'su_ap' : 'su_gp';
  try { purpose = sessionStorage.getItem(pk) || 'login'; sessionStorage.removeItem(pk); } catch { /* yok */ }
  if (err) return { provider, purpose, error: `${P} girişi tamamlanamadı. Tekrar dene.` };
  try {
    const r = await fetch('/api/auth/google/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.credential) return { provider, purpose, error: d.error || `${P} girişi tamamlanamadı. Tekrar dene.` };
    if (apple) appleExtra = { token: d.credential, name: d.name || '' };
    return { provider, purpose, credential: d.credential };
  } catch { return { provider, purpose, error: 'Bağlantı kurulamadı. Tekrar dene.' }; }
}

// Yerel Apple girişinin ek bilgileri (sunucuya kimlik belgesiyle birlikte gider): tek kullanımlık nonce ve ilk girişteki ad
let appleExtra = null;
export const oauthExtra = (provider, credential) => (provider === 'apple' && appleExtra?.token === credential ? { ...(appleExtra.nonce ? { nonce: appleExtra.nonce } : {}), nameHint: appleExtra.name } : {});
const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, '0')).join('');

// purpose: 'login' ya da 'link' (Ayarlar'da bağlama): telefonlarda yönlendirmeli girişten dönünce hangisi olduğu bilinsin
export async function appleCredential(purpose = 'login') {
  const a = oauthCfg().apple; if (!a) throw new Error('Apple ile giriş açık değil.');
  if (a.native) { // iOS uygulaması: Apple'ın yerel penceresi
    const nonce = rnd();
    let r; try { r = await window.Capacitor.Plugins.AppleSignIn.authorize({ nonce: await sha256(nonce) }); } catch (e) { if (/CANCELED/.test(String(e?.code || ''))) return null; throw new Error(e?.message || 'Apple ile giriş tamamlanmadı.'); }
    if (!r?.identityToken) return null;
    appleExtra = { token: r.identityToken, nonce, name: r.name || '' };
    return r.identityToken;
  }
  await loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/tr_TR/appleid.auth.js');
  // Telefonlarda (Android uygulaması, ana ekran uygulaması, mobil tarayıcı) açılır pencere güvenilir çalışmaz: sayfa Apple'a
  // gider, dönüşte sunucu (/api/auth/apple/cb) tek kullanımlık kodla geri yollar. Durum değeri çerezde, başkasının belgesi kabul edilmez.
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || matchMedia('(display-mode: standalone)').matches;
  if (mobile) {
    const st = rnd();
    document.cookie = `su_ast=${st}; Max-Age=600; Path=/; Secure; SameSite=None`;
    try { sessionStorage.setItem('su_ap', purpose); } catch { /* yok */ }
    window.AppleID.auth.init({ clientId: a.clientId, scope: 'name email', redirectURI: a.redirectURI, usePopup: false, state: st });
    window.AppleID.auth.signIn();
    return new Promise(() => {}); // sayfa Apple'a gidiyor
  }
  window.AppleID.auth.init({ clientId: a.clientId, scope: 'name email', redirectURI: a.redirectURI, usePopup: true });
  const r = await window.AppleID.auth.signIn();
  return r?.authorization?.id_token || null;
}
