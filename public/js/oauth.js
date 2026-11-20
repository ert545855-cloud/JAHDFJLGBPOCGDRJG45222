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
// iOS uygulamasında Google gömülü web görünümünde girişi engeller (orada Google düğmesi yok; Google ile kaydolan
// "Şifreni mi unuttun" ile şifre belirleyip girer). Apple ile giriş uygulamanın yerel penceresiyle yapılır (AppleSignIn eklentisi).
const nativeApple = () => !!window.Capacitor?.Plugins?.AppleSignIn;
export const oauthCfg = () => (iosShell() ? (nativeApple() ? { apple: { native: true } } : {}) : state.config?.oauth || {});

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
export async function takeGoogleReturn() {
  const q = new URLSearchParams(location.search);
  const code = q.get('g'); const err = q.get('gerr');
  if (!code && !err) return null;
  q.delete('g'); q.delete('gerr');
  history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  let purpose = 'login'; try { purpose = sessionStorage.getItem('su_gp') || 'login'; sessionStorage.removeItem('su_gp'); } catch { /* yok */ }
  if (err) return { purpose, error: 'Google girişi tamamlanamadı. Tekrar dene.' };
  try {
    const r = await fetch('/api/auth/google/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.credential) return { purpose, error: d.error || 'Google girişi tamamlanamadı. Tekrar dene.' };
    return { purpose, credential: d.credential };
  } catch { return { purpose, error: 'Bağlantı kurulamadı. Tekrar dene.' }; }
}

// Yerel Apple girişinin ek bilgileri (sunucuya kimlik belgesiyle birlikte gider): tek kullanımlık nonce ve ilk girişteki ad
let appleExtra = null;
export const oauthExtra = (provider, credential) => (provider === 'apple' && appleExtra?.token === credential ? { nonce: appleExtra.nonce, nameHint: appleExtra.name } : {});
const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, '0')).join('');

export async function appleCredential() {
  const a = oauthCfg().apple; if (!a) throw new Error('Apple ile giriş açık değil.');
  if (a.native) { // iOS uygulaması: Apple'ın yerel penceresi
    const nonce = rnd();
    let r; try { r = await window.Capacitor.Plugins.AppleSignIn.authorize({ nonce: await sha256(nonce) }); } catch (e) { if (/CANCELED/.test(String(e?.code || ''))) return null; throw new Error(e?.message || 'Apple ile giriş tamamlanmadı.'); }
    if (!r?.identityToken) return null;
    appleExtra = { token: r.identityToken, nonce, name: r.name || '' };
    return r.identityToken;
  }
  await loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/tr_TR/appleid.auth.js');
  window.AppleID.auth.init({ clientId: a.clientId, scope: 'name email', redirectURI: a.redirectURI, usePopup: true });
  const r = await window.AppleID.auth.signIn();
  return r?.authorization?.id_token || null;
}
