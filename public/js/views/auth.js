import { api, setSession, esc, logo, state, toast } from '../core.js';
import { icon } from '../icons.js';
import { legalSheet } from './legal.js';
import { pendingRef } from '../extras.js';
import { googleButton, appleCredential, oauthCfg } from '../oauth.js';
import { LANGS, getLang, setLang } from '../i18n.js';

// Kayıtta onay ve bilgilendirme (KVKK): koşullar kabul edilir; aydınlatma metni yalnızca bilgilendirir (onay istenmez);
// zorunlu olmayan işlemeler ayrı, önceden işaretlenmemiş kutularla sorulur.
const consentHtml = () => `<label class="consent"><input type="checkbox" name="accept"><span><a class="link" data-doc="kosullar">Kullanım Koşulları</a>’nı okudum ve kabul ediyorum; 18 yaşından büyük olduğumu beyan ederim.</span></label>
  <p class="muted consent-info">Kişisel verilerinin nasıl işlendiğini <a class="link" data-doc="kvkk">KVKK Aydınlatma Metni</a>’nde ve <a class="link" data-doc="gizlilik">Gizlilik Politikası</a>’nda bulabilirsin.</p>
  <fieldset class="opt-cons"><legend>İsteğe bağlı izinler · <a class="link" data-doc="riza">açık rıza metni</a></legend>
    <label class="consent"><input type="checkbox" name="c_marketing"><span>Kampanya, etkinlik ve yeniliklerle ilgili uygulama içi ve anlık bildirim almak istiyorum.</span></label>
    <label class="consent"><input type="checkbox" name="c_mail"><span>Kampanya ve yeniliklerle ilgili e-posta almak istiyorum (ticari elektronik ileti onayı; İYS’ye kaydedilir).</span></label>
    <label class="consent"><input type="checkbox" name="c_location"><span>Yakınımdaki kişileri gösterebilmek için yaklaşık konumumun işlenmesine açık rıza veriyorum.</span></label>
    <p class="muted">Bunları vermesen de SwipeUp’ı kullanabilirsin; istediğin zaman Ayarlar → İzinlerim’den değiştirebilirsin.</p></fieldset>`;
const readConsents = (f) => ({ marketing: !!f.c_marketing?.checked, marketingEmail: !!f.c_mail?.checked, location: !!f.c_location?.checked });
const wireDocs = (root) => root.querySelectorAll('[data-doc]').forEach((a) => { a.onclick = (e) => { e.preventDefault(); legalSheet(a.dataset.doc); }; });
const goHome = (created) => { if (location.search) history.replaceState(null, '', '/' + (created ? '#/edit' : '#/')); location.hash = created ? '#/edit' : '#/'; location.reload(); };

// Google / Apple ile giriş: hesap varsa açılır; yoksa kısa bir formla (doğum tarihi, koşullar, izinler) yeni hesap açılır
async function oauthSignIn(view, provider, credential, err) {
  err.textContent = '';
  try {
    const r = await api('/auth/oauth', { body: { provider, credential, ref: pendingRef() } });
    if (r.needSignup) return oauthSignup(view, provider, credential, r);
    setSession(r.token, r.user);
    goHome(false);
  } catch (er) {
    if (er.status === 409 && er.data?.linkNeeded) return oauthLink(view, provider, credential, er.message);
    err.textContent = er.message;
  }
}
// Aynı e-postayla şifreli hesap var: şifre bir kez girilir, Google/Apple hesabı bağlanır ve giriş yapılır
function oauthLink(view, provider, credential, msg) {
  const P = provider === 'apple' ? 'Apple' : 'Google';
  view.innerHTML = `<section class="auth">
    <div class="wordmark">${logo()}</div>
    <h2 class="acc-add-h">${P} hesabını bağla</h2>
    <p class="tagline">${esc(msg)}</p>
    <form novalidate>
      <label class="ic-field">${icon('lock')}<input class="field" name="password" type="password" placeholder="SwipeUp şifren" autocomplete="current-password" required></label>
      <button class="btn primary block" style="margin-top:6px">Bağla ve giriş yap</button>
      <div class="err" role="alert"></div>
    </form>
    <div class="forgot"><a class="muted" href="#/forgot">Şifreni mi unuttun?</a></div>
    <div class="switch"><a class="link" href="#/login">Vazgeç</a></div>
  </section>`;
  const f = view.querySelector('form'); const err = f.querySelector('.err');
  f.password.focus();
  f.onsubmit = async (e) => {
    e.preventDefault(); err.textContent = '';
    const btn = f.querySelector('button'); btn.disabled = true;
    try {
      if (!f.password.value) throw new Error('Şifreni gir.');
      const r = await api('/auth/oauth', { body: { provider, credential, password: f.password.value, ref: pendingRef() } });
      setSession(r.token, r.user);
      toast(`${P} hesabın bağlandı. Bundan sonra tek dokunuşla girersin.`);
      goHome(false);
    } catch (er) { err.textContent = er.message; btn.disabled = false; if (/süresi dolmuş|geçersiz/i.test(er.message)) setTimeout(() => { location.hash = '#/login'; }, 1600); }
  };
}
function oauthSignup(view, provider, credential, info) {
  const P = provider === 'apple' ? 'Apple' : 'Google';
  view.innerHTML = `<section class="auth">
    <div class="wordmark">${logo()}</div>
    <h2 class="acc-add-h">${P} ile hesap aç</h2>
    <p class="tagline">${info.email ? `${esc(info.email)} · ` : ''}son birkaç bilgi</p>
    <form novalidate>
      <label class="ic-field">${icon('person')}<input class="field" name="name" placeholder="Adın" autocomplete="name" maxlength="40" value="${esc(info.name || '')}"></label>
      <label class="ic-field">${icon('at')}<input class="field" name="username" placeholder="Kullanıcı adı" autocapitalize="none" spellcheck="false" maxlength="24" value="${esc(info.username || '')}"></label>
      <label class="bd-field"><span>Doğum tarihin</span><input class="field" name="birthdate" type="date" max="${maxBirth()}" min="1920-01-01" required></label>
      <p class="muted" style="font-size:12.5px;margin:-4px 4px 0">SwipeUp 18 yaş ve üzeri içindir. Doğum tarihin profilinde gösterilmez, sadece yaşın görünür.</p>
      ${consentHtml()}
      <button class="btn primary block" style="margin-top:6px">Hesap oluştur</button>
      <div class="err" role="alert"></div>
    </form>
    <div class="switch"><a class="link" href="#/login">Vazgeç</a></div>
  </section>`;
  const f = view.querySelector('form'); const err = f.querySelector('.err');
  wireDocs(f);
  f.username.addEventListener('input', () => { f.username.value = f.username.value.toLowerCase().replace(/\s/g, ''); });
  f.onsubmit = async (e) => {
    e.preventDefault(); err.textContent = '';
    const btn = f.querySelector('button'); btn.disabled = true;
    try {
      if (!f.birthdate.value) throw new Error('Doğum tarihini gir.');
      if (!f.accept.checked) throw new Error('Devam etmek için Kullanım Koşulları’nı kabul etmelisin.');
      const r = await api('/auth/oauth', { body: { provider, credential, birthdate: f.birthdate.value, accept: true, name: f.name.value, username: f.username.value, consents: readConsents(f), ref: pendingRef() } });
      setSession(r.token, r.user);
      try { localStorage.removeItem('su_ref'); } catch { /* yok */ }
      if (r.recoveryCode) codeScreen(view, r.recoveryCode, () => goHome(true)); else goHome(true);
    } catch (er) { err.textContent = er.message; btn.disabled = false; if (/süresi dolmuş|geçersiz/i.test(er.message)) setTimeout(() => { location.hash = '#/login'; }, 1600); }
  };
}

// En geç bugünden 18 yıl önce doğmuş olmalı
export const maxBirth = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d.toISOString().slice(0, 10); };

function codeScreen(view, code, next) {
  view.innerHTML = `<section class="auth">
    <div class="wordmark">${logo()}</div>
    <h2 style="text-align:center;margin:16px 0 6px;font-size:24px">Kurtarma kodun</h2>
    <p class="tagline" style="margin-bottom:18px">Şifreni unutursan hesabına bu kodla dönebilirsin. Ekran görüntüsü al ya da bir yere not et; bir daha gösterilmeyecek.</p>
    <div class="code-box">${esc(code)}</div>
    <div style="display:grid;gap:10px;margin-top:18px">
      <button class="btn outline block cp">${icon('copy')} Kodu kopyala</button>
      <button class="btn primary block go">Kaydettim, devam et</button>
    </div></section>`;
  view.querySelector('.cp').onclick = async () => { await navigator.clipboard?.writeText(code); toast('Kod kopyalandı.'); };
  view.querySelector('.go').onclick = next;
}

// Şifre sıfırlama üç adımda: 1) hesabı yaz, 2) e-postadaki kodu (ya da kurtarma kodunu) gir, 3) yeni şifreyi belirle.
// Her adımda tek iş var; kod 2. adımda sunucuda doğrulanır, yanlışsa kullanıcı şifre yazmadan öğrenir.
function forgot(view) {
  const emailOn = !!state.config?.emailReset;
  const s = { step: 1, login: '', code: '', mode: emailOn ? 'email' : 'recovery', wait: 0 };
  let timer = null;
  const stop = () => { clearInterval(timer); timer = null; };
  const startWait = () => {
    s.wait = 60; stop();
    timer = setInterval(() => {
      s.wait -= 1;
      const b = view.querySelector('.resend');
      if (!b || !document.body.contains(b)) return stop();
      b.disabled = s.wait > 0; b.textContent = s.wait > 0 ? `Kodu tekrar gönder (${s.wait} sn)` : 'Kodu tekrar gönder';
      if (s.wait <= 0) stop();
    }, 1000);
  };
  const dots = () => `<ol class="rs-steps" aria-label="Adım ${s.step} / 3">${[1, 2, 3].map((n) => `<li class="${n < s.step ? 'done' : n === s.step ? 'on' : ''}"></li>`).join('')}</ol>`;
  const shell = (title, text, body, foot = '') => {
    view.innerHTML = `<section class="auth rs">
      <div class="wordmark">${logo()}</div>
      ${dots()}
      <h2 class="rs-title">${title}</h2>
      <p class="tagline">${text}</p>
      <form novalidate>${body}<div class="err" role="alert"></div></form>
      <div class="switch">${foot}<a class="link" href="#/login">Girişe dön</a></div></section>`;
    return { f: view.querySelector('form'), err: view.querySelector('.err') };
  };
  const busy = (f, on) => { const b = f.querySelector('button.primary'); if (b) { b.disabled = on; b.classList.toggle('loading', on); } };

  const sendCode = async (err) => {
    try { await api('/auth/forgot', { body: { login: s.login } }); startWait(); return true; } catch (e) { err.textContent = e.message; return false; }
  };

  function step1() {
    s.step = 1;
    const { f, err } = shell('Şifreni sıfırla',
      emailOn ? 'Kullanıcı adını ya da kayıtlı e-postanı yaz. E-postana 6 haneli bir kod göndereceğiz.' : 'Kullanıcı adını ya da e-postanı yaz. Sonraki adımda kurtarma kodunu gireceksin.',
      `<label class="ic-field">${icon('person')}<input class="field" name="login" placeholder="Kullanıcı adı veya e-posta" autocapitalize="none" autocomplete="username" spellcheck="false" value="${esc(s.login)}" required></label>
       <button class="btn primary block">${emailOn ? 'E-postama kod gönder' : 'Devam et'}</button>
       ${emailOn ? '<button type="button" class="btn outline block rec">Kurtarma kodum var</button>' : ''}`);
    f.login.focus();
    const take = () => { s.login = f.login.value.trim(); if (!s.login) { err.textContent = 'Kullanıcı adını ya da e-postanı yaz.'; f.login.focus(); return false; } return true; };
    f.querySelector('.rec')?.addEventListener('click', () => { if (take()) { s.mode = 'recovery'; step2(); } });
    f.onsubmit = async (e) => {
      e.preventDefault(); err.textContent = '';
      if (!take()) return;
      if (!emailOn) { s.mode = 'recovery'; return step2(); }
      busy(f, true);
      const ok = await sendCode(err);
      busy(f, false);
      if (ok) { s.mode = 'email'; step2(); }
    };
  }

  function step2() {
    s.step = 2; s.code = '';
    const email = s.mode === 'email';
    const { f, err } = shell(email ? 'E-postana gelen kodu gir' : 'Kurtarma kodunu gir',
      email ? 'Hesabında kayıtlı e-postaya 6 haneli bir kod gönderdik. Birkaç dakika içinde gelmezse gereksiz (spam) klasörüne bak. Kod 15 dakika geçerli.'
        : 'Kayıt olurken sana verilen 12 karakterlik kodu yaz (ör. ABCD-EFGH-JKLM).',
      `<input class="field rs-code${email ? '' : ' rec'}" name="code" ${email ? 'inputmode="numeric" maxlength="6" pattern="[0-9]*" placeholder="••••••"' : 'maxlength="14" placeholder="ABCD-EFGH-JKLM" autocapitalize="characters"'} autocomplete="one-time-code" spellcheck="false" aria-label="${email ? '6 haneli kod' : 'Kurtarma kodu'}">
       <button class="btn primary block">Devam et</button>
       ${email ? `<button type="button" class="btn outline block resend" ${s.wait > 0 ? 'disabled' : ''}>${s.wait > 0 ? `Kodu tekrar gönder (${s.wait} sn)` : 'Kodu tekrar gönder'}</button>` : ''}
       ${email ? '<p class="muted rs-hint">E-posta gelmiyorsa hesabında e-posta kayıtlı olmayabilir. O zaman <a class="link sw">kurtarma kodunu kullan</a>.</p>'
        : emailOn ? '<p class="muted rs-hint"><a class="link sw">Kurtarma kodum yok, e-postama kod gönder</a></p>' : '<p class="muted rs-hint">Kurtarma kodunu kaybettiysen <a class="link" href="mailto:info@swipeup.live">info@swipeup.live</a> adresine yaz.</p>'}`,
      '<a class="link back">Geri</a> · ');
    const inp = f.code; inp.focus();
    view.querySelector('.back').onclick = (e) => { e.preventDefault(); step1(); };
    f.querySelector('.sw')?.addEventListener('click', async (e) => {
      e.preventDefault();
      if (email) { s.mode = 'recovery'; return step2(); }
      err.textContent = '';
      if (await sendCode(err)) { s.mode = 'email'; step2(); }
    });
    f.querySelector('.resend')?.addEventListener('click', async (e) => {
      err.textContent = '';
      if (await sendCode(err)) { e.target.disabled = true; toast('Yeni kod gönderildi.'); inp.value = ''; inp.focus(); }
    });
    const submit = async () => {
      err.textContent = '';
      const v = inp.value.trim();
      if (email ? !/^\d{6}$/.test(v) : v.replace(/[^a-z0-9]/gi, '').length !== 12) { err.textContent = email ? 'Kod 6 haneli olmalı.' : 'Kurtarma kodu 12 karakter olmalı.'; return; }
      busy(f, true);
      try { await api('/auth/reset/check', { body: { login: s.login, code: v } }); s.code = v; step3(); } catch (er) { err.textContent = er.message; inp.select(); } finally { busy(f, false); }
    };
    inp.addEventListener('input', () => {
      if (email) { inp.value = inp.value.replace(/\D/g, '').slice(0, 6); if (inp.value.length === 6) submit(); }
    });
    f.onsubmit = (e) => { e.preventDefault(); submit(); };
  }

  function step3() {
    s.step = 3; stop();
    const { f, err } = shell('Yeni şifreni belirle', 'En az 6 karakter. Başka sitelerde kullanmadığın bir şifre seç.',
      `<label class="ic-field">${icon('lock')}<input class="field" name="password" type="password" placeholder="Yeni şifre" autocomplete="new-password"></label>
       <label class="ic-field">${icon('lock')}<input class="field" name="password2" type="password" placeholder="Yeni şifre (tekrar)" autocomplete="new-password"></label>
       <label class="switch-row rs-show"><input type="checkbox" name="show"> Şifreyi göster</label>
       <button class="btn primary block">Şifreyi değiştir</button>`);
    f.password.focus();
    f.show.onchange = () => { const t = f.show.checked ? 'text' : 'password'; f.password.type = t; f.password2.type = t; };
    f.onsubmit = async (e) => {
      e.preventDefault(); err.textContent = '';
      if (f.password.value.length < 6) { err.textContent = 'Yeni şifre en az 6 karakter olmalı.'; return; }
      if (f.password.value !== f.password2.value) { err.textContent = 'İki şifre aynı değil.'; f.password2.focus(); return; }
      busy(f, true);
      try {
        const r = await api('/auth/reset', { body: { login: s.login, code: s.code, password: f.password.value } });
        setSession(r.token, r.user);
        const done = () => { location.hash = '#/'; location.reload(); };
        if (r.recoveryCode) codeScreen(view, r.recoveryCode, done); else { toast('Şifren değişti.'); done(); }
      } catch (er) {
        busy(f, false);
        // Kod bu arada geçersiz olduysa (süre doldu) kod adımına dön
        if (/Kod|kod/.test(er.message)) { step2(); view.querySelector('.err').textContent = er.message; } else err.textContent = er.message;
      }
    };
  }

  step1();
}

export default function auth(view, mode) {
  if (mode === 'forgot') return forgot(view);
  const reg = mode === 'register';
  let adding = false; try { adding = !!sessionStorage.getItem('su_add') && !!state.token; } catch { /* yok */ } // giriş yapmışken başka hesap ekleniyor
  view.innerHTML = `<section class="auth">
    <div class="wordmark">${logo()}</div>
    ${adding ? `<h2 class="acc-add-h">${reg ? 'Yeni hesap aç' : 'Hesap ekle'}</h2><p class="tagline">Şu anki hesabın kayıtlı kalır; aralarında Profil’den tek dokunuşla geçebilirsin.</p>` : `<p class="tagline">${reg ? 'Kaydır, eşleş, vitrine göz at, canlı yayında buluş.' : 'Kaydırmaya kaldığın yerden devam et.'}</p>`}
    <form novalidate>
      ${reg ? `<label class="ic-field">${icon('person')}<input class="field" name="name" placeholder="Adın" autocomplete="name" maxlength="40"></label>` : ''}
      <label class="ic-field">${icon('person')}<input class="field" name="username" placeholder="${reg ? 'Kullanıcı adı' : 'Kullanıcı adı veya e-posta'}" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
      ${reg ? `<label class="ic-field">${icon('mail')}<input class="field" name="email" type="email" placeholder="E-posta (şifre sıfırlama için, isteğe bağlı)" autocomplete="email"></label>` : ''}
      <label class="ic-field">${icon('lock')}<input class="field" name="password" type="password" placeholder="Şifre" autocomplete="${reg ? 'new-password' : 'current-password'}" required></label>
      ${reg ? `<label class="ic-field">${icon('gift')}<input class="field" name="ref" placeholder="Davet kodu (varsa)" value="${esc(pendingRef())}" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="6"></label>` : ''}
      ${reg ? `<label class="bd-field"><span>Doğum tarihin</span><input class="field" name="birthdate" type="date" max="${maxBirth()}" min="1920-01-01" required></label>
      <p class="muted" style="font-size:12.5px;margin:-4px 4px 0">SwipeUp 18 yaş ve üzeri içindir. Doğum tarihin profilinde gösterilmez, sadece yaşın görünür.</p>
      ${consentHtml()}` : ''}
      <button class="btn primary block" style="margin-top:6px">${reg ? 'Hesap oluştur' : 'Giriş yap'}</button>
      <div class="err" role="alert"></div>
    </form>
    ${oauthCfg().google || oauthCfg().apple ? `<div class="oauth"><div class="or"><span>ya da</span></div>${oauthCfg().google ? '<div class="g-btn"></div>' : ''}${oauthCfg().apple ? '<button type="button" class="btn block ap-btn">Apple ile devam et</button>' : ''}</div>` : ''}
    ${reg ? '' : '<div class="forgot"><a class="muted" href="#/forgot">Şifreni mi unuttun?</a></div>'}
    ${reg ? '' : `<a class="ins-cta" href="#/install"><img src="/icons/icon-192.png" alt=""><span><b>Uygulamayı telefona yükle</b><small>iPhone ve Android · ücretsiz</small></span>${icon('download')}</a>`}
    ${reg ? '' : `<div class="legal-links"><a href="/tanitim">SwipeUp nedir?</a> · <a href="#/legal/gizlilik">Gizlilik</a> · <a href="#/legal/kosullar">Koşullar</a> · <a href="#/legal/kvkk">KVKK</a> · <a href="#/legal/cerez">Çerezler</a> · <a href="#/legal/kunye">Künye</a></div>`}
    <div class="lang-pick" data-noi18n>${LANGS.map(([k, n]) => `<button type="button" data-l="${k}" class="${getLang() === k ? 'on' : ''}">${n}</button>`).join('<span>·</span>')}</div>
    <div class="switch">${reg ? 'Hesabın var mı? <a class="link" href="#/login">Giriş yap</a>' : 'Yeni misin? <a class="link" href="#/register">Hesap oluştur</a>'}</div>
    ${adding ? '<div class="switch"><a class="link acc-cancel" href="#/me">Vazgeç, hesabıma dön</a></div>' : ''}
  </section>`;
  const f = view.querySelector('form');
  const err = view.querySelector('.err');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button');
    btn.disabled = true; err.textContent = '';
    try {
      if (reg && !f.birthdate.value) throw new Error('Doğum tarihini gir.');
      if (reg && !f.accept.checked) throw new Error('Devam etmek için Kullanım Koşulları’nı kabul etmelisin.');
      const body = { username: f.username.value, password: f.password.value, ...(reg ? { name: f.name.value, email: f.email.value, birthdate: f.birthdate.value, accept: f.accept.checked, consents: readConsents(f), ref: (f.ref?.value || pendingRef()).trim().toUpperCase() } : {}) };
      const r = await api(reg ? '/auth/register' : '/auth/login', { body });
      setSession(r.token, r.user);
      if (reg) { try { localStorage.removeItem('su_ref'); } catch {} }
      const go = () => { if (location.search) history.replaceState(null, '', '/' + (reg ? '#/edit' : '#/')); location.hash = reg ? '#/edit' : '#/'; location.reload(); };
      if (r.recoveryCode) codeScreen(view, r.recoveryCode, go); else go();
    } catch (er) {
      err.textContent = er.message;
      btn.disabled = false;
    }
  };
  view.querySelector('.lang-pick')?.addEventListener('click', (e) => { const b = e.target.closest('[data-l]'); if (b && b.dataset.l !== getLang()) setLang(b.dataset.l); });
  view.querySelector('.acc-cancel')?.addEventListener('click', () => { try { sessionStorage.removeItem('su_add'); } catch { /* yok */ } });
  wireDocs(f);
  const gb = view.querySelector('.g-btn');
  if (gb) googleButton(gb, (c) => oauthSignIn(view, 'google', c, err), reg ? 'signup_with' : 'continue_with').catch((er) => { gb.textContent = er.message; gb.classList.add('muted'); });
  // Yönlendirmeli Google girişinden dönüldüyse (ana ekran iPhone uygulaması) kaldığı yerden devam et
  const gr = state.googleReturn; state.googleReturn = null;
  if (gr?.error) err.textContent = gr.error; else if (gr?.credential) oauthSignIn(view, 'google', gr.credential, err);
  view.querySelector('.ap-btn')?.addEventListener('click', async () => { try { const c = await appleCredential(); if (c) oauthSignIn(view, 'apple', c, err); } catch (er) { if (er?.error !== 'popup_closed_by_user') err.textContent = er.message || 'Apple ile giriş tamamlanmadı.'; } });
  f.username.addEventListener('input', () => { if (reg) f.username.value = f.username.value.toLowerCase().replace(/\s/g, ''); });
  return null;
}
