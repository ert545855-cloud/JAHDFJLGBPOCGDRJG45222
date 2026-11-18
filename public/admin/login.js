// SwipeUp Yönetim — giriş sayfası. Panelin kendi dosyaları (admin.js, admin.css…) giriş yapılmadan verilmez;
// bu dosya yalnızca girişi yapar. Tam girişte sunucu HttpOnly bir oturum çerezi koyar, sayfa yenilenince panel açılır.
const BASE = location.pathname.split('/').slice(0, 2).join('/');
const S = { token: localStorage.getItem('su_admin') };
const root = document.getElementById('root');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstElementChild; };
function toast(t) {
  const x = el(`<div class="toast">${esc(t)}</div>`);
  document.getElementById('toasts').append(x);
  setTimeout(() => x.remove(), 3500);
}
async function api(path, opts = {}) {
  const r = await fetch(BASE + '/api' + path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.token ? { Authorization: 'Bearer ' + opts.token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || 'İşlem başarısız.'); e.status = r.status; throw e; }
  return data;
}

// ================= Giriş =================
// 1) şifre ya da Google / Apple  2) doğrulama uygulamasındaki 6 haneli kod. İlk girişte doğrulama uygulaması kurulur.
let CFG = null;
const getCfg = async () => (CFG ||= await fetch('/api/config').then((r) => r.json()).catch(() => ({})));
const loaded = {};
function loadScript(src) {
  loaded[src] ||= new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = src; sc.async = true; sc.onload = ok; sc.onerror = () => { delete loaded[src]; no(new Error('Giriş penceresi yüklenemedi. İnternet bağlantını kontrol et.')); }; document.head.append(sc); });
  return loaded[src];
}
// Google düğmesi (Google'ın kendi düğmesi, açılır pencereyle)
async function googleButton(box, onCred, text = 'signin_with') {
  const id = (await getCfg()).oauth?.google; if (!id || !box) return false;
  await loadScript('https://accounts.google.com/gsi/client');
  window.google.accounts.id.initialize({ client_id: id, callback: (r) => onCred(r.credential), ux_mode: 'popup', auto_select: false, itp_support: true });
  window.google.accounts.id.renderButton(box, { theme: 'outline', size: 'large', text, shape: 'pill', locale: 'tr', width: Math.min(320, box.clientWidth || 300) });
  return true;
}
async function appleCredential() {
  const a = (await getCfg()).oauth?.apple; if (!a) throw new Error('Apple ile giriş açık değil.');
  await loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/tr_TR/appleid.auth.js');
  window.AppleID.auth.init({ clientId: a.clientId, scope: 'name email', redirectURI: a.redirectURI, usePopup: true });
  const r = await window.AppleID.auth.signIn();
  return r?.authorization?.id_token;
}
const brandHtml = '<div class="brand"><img class="mark" src="/icons/mark.png" alt="">swipeup <small>yönetim</small></div>';
// Giriş tamam: sunucu panel çerezini koydu; sayfa yenilenince panelin kendisi açılır
function finishLogin(r) {
  S.token = r.token; localStorage.setItem('su_admin', r.token);
  if (r.recovery) return showRecovery(r.recovery, () => location.reload());
  if (r.recoveryLeft != null && r.recoveryLeft <= 2) sessionStorage.setItem('adm_rc_left', String(r.recoveryLeft));
  location.reload();
}
function afterFirst(r) {
  if (r.token) return finishLogin(r);
  if (r.need === 'totp') return twoFactor(r);
  if (r.need === 'setup') return setup2fa(r);
}
async function login(msg = '') {
  const cfg = await getCfg();
  root.innerHTML = `<div class="login"><form class="lg-f" autocomplete="on">${brandHtml}
    <p>Yönetici hesabınla giriş yap.</p>
    <input class="field" name="u" placeholder="Kullanıcı adı" autocomplete="username" autocapitalize="none" required>
    <input class="field" name="p" type="password" placeholder="Şifre" autocomplete="current-password" required>
    <button class="btn primary" style="height:42px">Devam</button><div class="err">${esc(msg)}</div>
    ${cfg.oauth?.google || cfg.oauth?.apple ? '<div class="lg-or"><span>ya da</span></div>' : ''}
    ${cfg.oauth?.google ? '<div class="lg-g"></div>' : ''}${cfg.oauth?.apple ? `<button type="button" class="btn lg-a">${''} Apple ile giriş yap</button>` : ''}
    <button type="button" class="link lg-fp">Şifremi unuttum</button>
    <p class="lg-note">Girişten sonra telefonundaki doğrulama uygulamasının kodu istenir.</p></form></div>`;
  const f = root.querySelector('form'); const err = f.querySelector('.err');
  f.onsubmit = async (e) => {
    e.preventDefault(); err.textContent = '';
    try { afterFirst(await api('/login', { body: { username: f.u.value, password: f.p.value } })); } catch (er) { err.textContent = er.message; }
  };
  const oauth = async (provider, credential) => { err.textContent = ''; try { afterFirst(await api('/login/oauth', { body: { provider, credential } })); } catch (er) { err.textContent = er.message; } };
  googleButton(f.querySelector('.lg-g'), (c) => oauth('google', c)).catch((er) => { err.textContent = er.message; });
  f.querySelector('.lg-a')?.addEventListener('click', async () => { try { const c = await appleCredential(); if (c) oauth('apple', c); } catch (er) { if (er?.error !== 'popup_closed_by_user') err.textContent = er.message || 'Apple ile giriş tamamlanmadı.'; } });
  f.querySelector('.lg-fp').onclick = forgot;
}
function twoFactor(r) {
  root.innerHTML = `<div class="login"><form class="lg-f">${brandHtml}
    <p><b>${esc(r.name || '')}</b>, doğrulama uygulamandaki 6 haneli kodu yaz.</p>
    <input class="field lg-code" name="c" inputmode="numeric" autocomplete="one-time-code" maxlength="14" placeholder="123 456" required>
    <button class="btn primary" style="height:42px">Giriş yap</button><div class="err"></div>
    <button type="button" class="link lg-rc">Telefonum yanımda değil, kurtarma kodu kullan</button>
    <button type="button" class="link lg-back">Geri</button></form></div>`;
  const f = root.querySelector('form'); const err = f.querySelector('.err');
  f.c.focus();
  f.querySelector('.lg-rc').onclick = () => { f.c.placeholder = 'XXXX-XXXX-XXXX'; f.c.removeAttribute('inputmode'); f.c.value = ''; f.c.focus(); f.querySelector('p').textContent = 'Kurtarma kodlarından birini yaz. Her kod bir kez kullanılır.'; };
  f.querySelector('.lg-back').onclick = () => login();
  f.onsubmit = async (e) => {
    e.preventDefault(); err.textContent = '';
    try { finishLogin(await api('/login/2fa', { body: { ticket: r.ticket, code: f.c.value } })); } catch (er) { err.textContent = er.message; if (/Baştan/.test(er.message)) setTimeout(() => login(er.message), 1200); }
  };
}
function setup2fa(r) {
  root.innerHTML = `<div class="login"><form class="lg-f lg-setup">${brandHtml}
    <h3>İki adımlı doğrulamayı kur</h3>
    <ol class="lg-steps"><li>Telefonuna <b>Google Authenticator</b> ya da <b>Microsoft Authenticator</b> uygulamasını kur.</li>
    <li>Uygulamada <b>+</b> → <b>QR kodu tara</b> ile aşağıdaki kodu okut.</li><li>Uygulamanın gösterdiği 6 haneli kodu yaz.</li></ol>
    <div class="lg-qr">${r.qr}</div>
    <details class="lg-man"><summary>QR okutamıyorum</summary><p>Uygulamada “Kurulum anahtarı gir”i seç ve şunu yaz:</p><code class="lg-key">${esc(r.secret)}</code></details>
    <input class="field lg-code" name="c" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123 456" required>
    <button class="btn primary" style="height:42px">Doğrula ve aç</button><div class="err"></div>
    <button type="button" class="link lg-back">Vazgeç</button></form></div>`;
  const f = root.querySelector('form'); const err = f.querySelector('.err');
  f.querySelector('.lg-back').onclick = () => login();
  f.onsubmit = async (e) => {
    e.preventDefault(); err.textContent = '';
    try { finishLogin(await api('/login/setup', { body: { ticket: r.ticket, code: f.c.value } })); } catch (er) { err.textContent = er.message; if (/Baştan/.test(er.message)) setTimeout(() => login(er.message), 1200); }
  };
}
function showRecovery(codes, done) {
  root.innerHTML = `<div class="login"><div class="lg-f lg-rcs">${brandHtml}
    <h3>Kurtarma kodların</h3>
    <p>Telefonunu kaybedersen ya da şifreni unutursan bu kodlarla girersin. Her kod bir kez çalışır. <b>Şimdi güvenli bir yere kaydet</b>; bir daha gösterilmez.</p>
    <div class="lg-codes">${codes.map((c) => `<code>${esc(c)}</code>`).join('')}</div>
    <div class="row" style="gap:8px;justify-content:center"><button type="button" class="btn sm cp">Kopyala</button><button type="button" class="btn sm dl">İndir (.txt)</button></div>
    <label class="lg-ok"><input type="checkbox" class="ok"> Kodları kaydettim</label>
    <button type="button" class="btn primary go" style="height:42px" disabled>Panele geç</button></div></div>`;
  const txt = `SwipeUp yönetim paneli kurtarma kodları (${new Date().toLocaleString('tr-TR')})\n\n${codes.join('\n')}\n`;
  root.querySelector('.cp').onclick = async () => { try { await navigator.clipboard.writeText(txt); toast('Kopyalandı.'); } catch { toast('Kopyalanamadı; kodları elle yaz.'); } };
  root.querySelector('.dl').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = 'swipeup-kurtarma-kodlari.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  root.querySelector('.ok').onchange = (e) => { root.querySelector('.go').disabled = !e.target.checked; };
  root.querySelector('.go').onclick = done;
}
function forgot() {
  root.innerHTML = `<div class="login"><form class="lg-f">${brandHtml}
    <h3>Şifremi unuttum</h3>
    <p>Yeni şifre için doğrulama uygulamandaki kod <b>ve</b> kurtarma kodlarından biri gerekir.</p>
    <input class="field" name="u" placeholder="Kullanıcı adı" autocomplete="username" autocapitalize="none" required>
    <input class="field" name="c" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="Uygulamadaki 6 haneli kod" required>
    <input class="field" name="r" placeholder="Kurtarma kodu (XXXX-XXXX-XXXX)" autocapitalize="characters" required>
    <input class="field" name="p" type="password" autocomplete="new-password" placeholder="Yeni şifre (en az 10 karakter)" required>
    <input class="field" name="p2" type="password" autocomplete="new-password" placeholder="Yeni şifre (tekrar)" required>
    <button class="btn primary" style="height:42px">Şifreyi yenile</button><div class="err"></div>
    <p class="lg-note">Telefonunu da kaybettiysen sahip yöneticiden doğrulamayı sıfırlamasını iste.</p>
    <button type="button" class="link lg-back">Girişe dön</button></form></div>`;
  const f = root.querySelector('form'); const err = f.querySelector('.err');
  f.querySelector('.lg-back').onclick = () => login();
  f.onsubmit = async (e) => {
    e.preventDefault(); err.textContent = '';
    if (f.p.value !== f.p2.value) { err.textContent = 'Yeni şifreler aynı değil.'; return; }
    try { const r = await api('/forgot', { body: { username: f.u.value, code: f.c.value, recovery: f.r.value, password: f.p.value } }); login(`Şifren yenilendi. Yeni şifrenle giriş yap.${r.recoveryLeft <= 2 ? ` (Kurtarma kodlarından ${r.recoveryLeft} tane kaldı.)` : ''}`); } catch (er) { err.textContent = er.message; }
  };
}


// Açılış: bu tarayıcıda geçerli bir panel oturumu varsa (eski sürümden kalma) çereze çevir ve paneli aç
(async () => {
  if (S.token) {
    const last = +sessionStorage.getItem('adm_session_try') || 0;
    if (Date.now() - last > 15000) {
      sessionStorage.setItem('adm_session_try', String(Date.now()));
      try { await api('/me/session', { body: {}, token: S.token }); location.reload(); return; }
      catch (e) { if (e.status === 401) { localStorage.removeItem('su_admin'); S.token = null; } }
    } else {
      return login('Oturum açılamadı. Tarayıcın çerezleri engelliyor olabilir; çerezlere izin verip tekrar dene.');
    }
  }
  login();
})();
