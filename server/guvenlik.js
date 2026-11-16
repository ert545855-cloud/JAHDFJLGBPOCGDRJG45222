// Güvenlik merkezi (sunucu):
// - Giriş geçmişi ve yeni cihaz uyarısı: tanınmayan cihazdan girişte bildirim + e-posta; "Bu ben değilim" tüm oturumları kapatır,
//   şifreyle girişi şifre sıfırlanana kadar durdurur. E-postadaki bağlantı oturum açmadan çalışır (tek kullanımlık, 14 gün).
// - Buluşmayı paylaş: sohbetten bağımsız paylaşım, "Yardım lazım" ve iptal (sayfa: server/social.js /guvende/:token).
const crypto = require('crypto');
const express = require('express');
const { nanoid } = require('nanoid');
const mail = require('./mail');

const DAY = 86400000;
const now = () => Date.now();
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const str = (v, n = 200) => (typeof v === 'string' ? v : '').trim().slice(0, n);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const trTime = (t) => new Date(t).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', weekday: 'long', hour: '2-digit', minute: '2-digit' });
const safeEq = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function uaLabel(ua) {
  ua = String(ua || '');
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iOS/i.test(ua) ? 'iPhone / iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac OS X|Macintosh/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Bilinmeyen sistem';
  const br = /SwipeUpApp|wv\)/i.test(ua) ? 'SwipeUp uygulaması' : /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Tarayıcı';
  return `${br} · ${os}`;
}
const page = (title, body) => `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} · SwipeUp</title><link rel="stylesheet" href="/fonts/fonts.css"><style>
:root{color-scheme:light;--t:#1d1320;--m:#6b5f70;--l:#eadfe9;--b:#ff4f6d}*{box-sizing:border-box}body{margin:0;font:16px/1.55 "Bricolage Grotesque",system-ui,sans-serif;color:var(--t);background:#fff7f5}
main{max-width:520px;margin:0 auto;padding:28px 20px 40px}h1{font-size:26px;line-height:1.2;margin:10px 0 14px}.lg{display:flex;align-items:center;gap:8px;font-weight:800;font-size:20px;color:var(--t);text-decoration:none}.lg img{width:30px;height:30px;border-radius:8px}
.card{background:#fff;border:1px solid var(--l);border-radius:18px;padding:16px 18px;margin:14px 0}.row{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--l)}.row:last-child{border:0}.row b{min-width:96px;color:var(--m);font-weight:600}
.st{display:inline-block;padding:4px 10px;border-radius:999px;font-weight:700;font-size:14px}.ok{background:#dcf5e7;color:#0b7a3f}.wait{background:#fff0d6;color:#8a5a00}.bad{background:#ffe0e4;color:#b0102c}
button,.btn{display:block;width:100%;height:50px;border:0;border-radius:14px;background:var(--b);color:#fff;font:700 16px inherit;font-family:inherit;cursor:pointer;text-align:center;line-height:50px;text-decoration:none;margin-top:10px}.btn.sec{background:#fff;color:var(--t);border:1.5px solid var(--l)}
small,.m{color:var(--m)}a{color:#c2185b}ul{padding-left:20px}</style></head><body><main><a class="lg" href="/"><img src="/icons/mark.png" alt="">swipeup</a>${body}</main></body></html>`;

module.exports = function guvenlik(app, ctx) {
  const { store, auth, notify, ipOf, trafik } = ctx;
  const user = (id) => store.get('users', id);
  const base = (req) => (process.env.CANONICAL_URL || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const form = express.urlencoded({ extended: false, limit: '4kb' });

  // ================= Giriş geçmişi ve yeni cihaz =================
  ctx.onSignIn = (req, u, via, fresh) => {
    const raw = String(req.headers['x-device'] || '').slice(0, 64);
    const ua = String(req.headers['user-agent'] || '');
    const dev = sha(`${u.id}:${raw || ua}`).slice(0, 20);
    const list = Array.isArray(u.devices) ? u.devices : [];
    const known = list.find((d) => d.id === dev);
    const label = uaLabel(ua); const ip = ipOf(req);
    const isNew = !known && list.length > 0 && !fresh; // ilk kayıtlı cihaz ve yeni hesap uyarı üretmez
    const token = isNew ? crypto.randomBytes(24).toString('base64url') : null;
    const ev = store.put('login_events', { id: nanoid(12), userId: u.id, at: now(), ip, label, dev, via, newDevice: isNew, ...(token ? { tokenHash: sha(token), tokenExp: now() + 14 * DAY } : {}) });
    const devices = [{ id: dev, label, first: known?.first || now(), last: now(), ip }, ...list.filter((d) => d.id !== dev)].slice(0, 10);
    store.update('users', u.id, { devices });
    if (!isNew) return;
    const when = trTime(ev.at);
    notify(u.id, { type: 'security', text: `🔐 Hesabına yeni bir cihazdan giriş yapıldı: ${label} · ${when}. Sen değilsen hemen “Bu ben değilim”e dokun.`, url: `/#/guvenlik/giris/${ev.id}`, tag: `giris-${ev.id}` });
    if (u.email && mail.enabled()) {
      const link = `${base(req)}/guvenlik/bu-ben-degilim?e=${ev.id}&t=${token}`;
      mail.send(u.email, 'SwipeUp hesabına yeni bir cihazdan giriş yapıldı', `Merhaba ${u.name || u.username},\n\nHesabına yeni bir cihazdan giriş yapıldı.\n\nCihaz: ${label}\nZaman: ${when}\nIP adresi: ${ip}\n\nBu sen idiysen bir şey yapmana gerek yok.\n\nSen değilsen bu bağlantıyı aç; tüm oturumların kapatılır ve şifreni sıfırlayana kadar şifreyle giriş durdurulur:\n${link}\n\nSwipeUp`).catch(() => {});
    }
  };

  function secure(u, ev, via, req) {
    ctx.bumpTokens(u.id); ctx.disconnectUser(u.id);
    const lock = !u.noPass; // şifresi olan hesapta şifreyle giriş, sıfırlanana kadar kapalı
    store.update('users', u.id, { notMe: { at: now(), ev: ev?.id || null, via }, ...(lock ? { passResetRequired: true } : {}), devices: (u.devices || []).filter((d) => d.id !== ev?.dev) });
    if (ev) store.update('login_events', ev.id, { notMe: now(), tokenHash: null });
    trafik?.log('guvenlik', { req, uid: u.id, path: `bu ben değilim (${via})` });
    notify(u.id, { type: 'security', text: '🔐 Tüm oturumların kapatıldı. Güvenliğin için yeni bir şifre belirle; şüpheli bir şey görürsen Destek’e yaz.', url: '/#/guvenlik', tag: 'bu-ben-degilim' });
    return lock;
  }

  app.get('/api/security/logins', auth, (req, res) => {
    const evs = store.filter('login_events', (e) => e.userId === req.user.id).sort((a, b) => b.at - a.at).slice(0, 20)
      .map((e) => ({ id: e.id, at: e.at, ip: e.ip, label: e.label, via: e.via, newDevice: !!e.newDevice, notMe: e.notMe || null, mine: e.dev === sha(`${req.user.id}:${String(req.headers['x-device'] || '').slice(0, 64) || String(req.headers['user-agent'] || '')}`).slice(0, 20) }));
    res.json({ events: evs, devices: (req.user.devices || []).map((d) => ({ label: d.label, first: d.first, last: d.last })), resetRequired: !!req.user.passResetRequired, hasPass: !req.user.noPass });
  });
  app.post('/api/security/not-me', auth, (req, res) => {
    if (ctx.limited('notme:' + req.user.id, 10, 3600000)) return res.status(429).json({ error: 'Biraz sonra tekrar dene.' });
    const ev = req.body?.eventId ? store.get('login_events', String(req.body.eventId)) : null;
    if (ev && ev.userId !== req.user.id) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    const lock = secure(req.user, ev, 'uygulama', req);
    res.json({ ok: true, token: ctx.sign(store.get('users', req.user.id)), needPassword: lock }); // bu cihaz açık kalır
  });
  app.post('/api/security/its-me', auth, (req, res) => {
    const ev = store.get('login_events', String(req.body?.eventId || ''));
    if (!ev || ev.userId !== req.user.id) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    store.update('login_events', ev.id, { confirmed: now(), tokenHash: null }); res.json({ ok: true });
  });
  // E-postadaki bağlantı: önce onay sayfası (bağlantı önizleyiciler tek başına işlem yaptırmasın), sonra form gönderimi
  const findEv = (q) => { const ev = store.get('login_events', str(q.e, 20)); return ev && ev.tokenHash && ev.tokenExp > now() && safeEq(ev.tokenHash, sha(str(q.t, 80))) ? ev : null; };
  app.get('/guvenlik/bu-ben-degilim', (req, res) => {
    const ev = findEv(req.query);
    if (!ev) return res.status(410).send(page('Bağlantı geçersiz', '<h1>Bu bağlantı artık geçerli değil</h1><p>Bağlantı kullanılmış ya da süresi dolmuş olabilir. Hesabında şüpheli bir şey görürsen uygulamada <b>Giriş › Şifreni mi unuttun?</b> adımıyla şifreni yenile ve Destek’e yaz.</p>'));
    res.send(page('Bu ben değilim', `<h1>Bu giriş sen değil miydin?</h1><div class="card"><div class="row"><b>Cihaz</b><span>${esc(ev.label)}</span></div><div class="row"><b>Zaman</b><span>${esc(trTime(ev.at))}</span></div><div class="row"><b>IP adresi</b><span>${esc(ev.ip)}</span></div></div>
      <p>Onaylarsan hesabındaki <b>tüm oturumlar kapatılır</b> ve şifreni sıfırlayana kadar şifreyle giriş yapılamaz. Sonra uygulamada <b>Giriş › Şifreni mi unuttun?</b> adımından e-postana gelen kodla yeni şifre belirlersin.</p>
      <form method="post" action="/guvenlik/bu-ben-degilim"><input type="hidden" name="e" value="${esc(ev.id)}"><input type="hidden" name="t" value="${esc(str(req.query.t, 80))}"><button>Bu ben değilim, hesabımı koru</button></form>
      <a class="btn sec" href="/">Bu bendim, vazgeç</a>`));
  });
  app.post('/guvenlik/bu-ben-degilim', form, (req, res) => {
    if (ctx.limited('notme-ip:' + ipOf(req), 20, 3600000)) return res.status(429).send(page('Çok fazla deneme', '<h1>Çok fazla deneme</h1><p>Bir saat sonra tekrar dene.</p>'));
    const ev = findEv(req.body || {}); const u = ev && user(ev.userId);
    if (!u) return res.status(410).send(page('Bağlantı geçersiz', '<h1>Bu bağlantı artık geçerli değil</h1><p>Bağlantı kullanılmış ya da süresi dolmuş olabilir.</p>'));
    const lock = secure(u, ev, 'e-posta bağlantısı', req);
    res.send(page('Hesabın korundu', `<h1>Hesabın korundu</h1><p>Tüm oturumlar kapatıldı.${lock ? ' Şifreyle giriş, şifreni sıfırlayana kadar durduruldu.' : ''}</p><div class="card"><b>Şimdi ne yapmalısın?</b><ul>${lock ? '<li>Uygulamada <b>Giriş › Şifreni mi unuttun?</b> adımından e-postana gelen kodla yeni bir şifre belirle.</li>' : '<li>Google ya da Apple hesabının şifresini değiştir ve iki adımlı doğrulamayı aç.</li>'}<li>Aynı şifreyi başka yerlerde kullanıyorsan oralarda da değiştir.</li><li>Hesabında tanımadığın bir değişiklik görürsen Destek’e yaz.</li></ul></div><a class="btn" href="/#/login">SwipeUp’a git</a>`));
  });

  // ================= Buluşmayı paylaş =================
  // Sohbetteki buluşma planından paylaşım zaten var (server/social.js, /guvende/:token). Burada aynı kayda (safety) sohbetten
  // bağımsız paylaşım, "Yardım lazım" ve iptal eklenir; kayıtlar buluşmadan 7 gün sonra periyodik imhayla silinir.
  const mine = (s) => ({ id: s.id, place: s.place, when: s.when, with: s.with, status: s.status, okAt: s.okAt || null, helpAt: s.helpAt || null, url: `/guvende/${s.id}`, fromChat: !!s.msgId });
  app.get('/api/safety/mine', auth, (req, res) => res.json({ items: store.filter('safety', (s) => s.userId === req.user.id && s.status !== 'cancelled' && s.when > now() - 2 * DAY).sort((a, b) => a.when - b.when).map(mine) }));
  app.post('/api/safety', auth, (req, res) => {
    if (ctx.limited('safety:' + req.user.id, 12, DAY)) return res.status(429).json({ error: 'Bugün çok fazla paylaşım oluşturdun.' });
    const place = str(req.body?.place, 120); const when = +new Date(req.body?.when);
    if (place.length < 2) return res.status(400).json({ error: 'Buluşma yerini yaz.' });
    if (!(when > now() - 3600000 && when < now() + 60 * DAY)) return res.status(400).json({ error: 'Buluşma tarihini ve saatini seç.' });
    let withInfo = null;
    const un = str(req.body?.withUsername, 40).replace(/^@/, '').toLowerCase();
    const o = un ? store.find('users', (x) => x.username === un) : null;
    if (o && !ctx.isBlocked(req.user.id, o.id)) withInfo = { name: o.name, username: o.username, avatar: o.avatar, verified: !!o.verified };
    else if (str(req.body?.withName, 60)) withInfo = { name: str(req.body.withName, 60) };
    const s = store.put('safety', { id: nanoid(16), msgId: null, chatId: null, userId: req.user.id, when, place, me: { name: String(req.user.name || req.user.username).split(' ')[0] }, with: withInfo, status: 'planned', at: now() });
    res.json(mine(s));
  });
  const act = (kind) => (req, res) => {
    const s = store.get('safety', req.params.token);
    if (!s || s.userId !== req.user.id) return res.status(404).json({ error: 'Bulunamadı.' });
    const y = store.update('safety', s.id, kind === 'help' ? { status: 'help', helpAt: now() } : { status: 'cancelled', cancelledAt: now() });
    res.json(mine(y));
  };
  app.post('/api/safety/:token/help', auth, act('help'));
  app.post('/api/safety/:token/cancel', auth, act('cancel'));
};
module.exports.uaLabel = uaLabel;
