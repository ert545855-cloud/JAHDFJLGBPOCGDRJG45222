// Akıllı hatırlatmalar ve haftalık özet e-postası.
// Hatırlatma: "Seni 3 kişi beğendi", "eşleşmen seni bekliyor" gibi; kişi başına günde en çok bir tane, kişinin uygulamayı en çok
// açtığı saatte (bilinmiyorsa 20.00), uygulamayı son 3 saatte açmadıysa ve gece 23–09 arası değilse. Ayarlar › Bildirimler ›
// Hatırlatmalar'dan kapatılır. Haftalık özet: pazartesi 10.00'da, e-postası olan ve geçen hafta bir hareketi olan üyelere;
// yalnızca bilgilendirme (kampanya değil), her e-postada tek tıkla ayrılma bağlantısı var.
const crypto = require('crypto');
const express = require('express');
const mail = require('./mail');

const DAY = 86400000; const HOUR = 3600000;
const trNow = (t = Date.now()) => new Date(t + 3 * HOUR); // Türkiye saati (UTC+3)
const trHour = (t) => trNow(t).getUTCHours();
const weekKey = (t = Date.now()) => { const d = trNow(t); const day = (d.getUTCDay() + 6) % 7; return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10); };

module.exports = function nudge(app, ctx) {
  const { store, notify, isBlocked } = ctx; const now = () => Date.now();
  const human = (u) => u && !u.isBot && !u.deleted && !u.banned && !(u.bannedUntil > now()) && !['falci', 'official'].includes(u.role);
  const off = (u, g) => (u.notifyPrefs?.off || []).includes(g);

  // ---- Etkin saatler: her 15 dakikada son 15 dakikada açık olanların o saati sayılır ----
  function trackHours() {
    const h = trHour(); const since = now() - 15 * 60000;
    for (const u of store.filter('users', (x) => (x.lastSeen || 0) >= since && human(x))) {
      const a = Array.isArray(u.actH) && u.actH.length === 24 ? u.actH.slice() : new Array(24).fill(0);
      a[h] = Math.min(999, a[h] + 1); store.update('users', u.id, { actH: a });
    }
  }
  const bestHour = (u) => { const a = u.actH; if (!Array.isArray(a)) return 20; let b = 20; let m = 0; let sum = 0; a.forEach((v, i) => { sum += v; if (i >= 9 && i <= 22 && v > m) { m = v; b = i; } }); return sum >= 5 ? b : 20; };

  // ---- Bir kişi için en değerli hatırlatma ----
  function pick(u) {
    // 1) Mesajlaşılmamış eşleşme (en az 2 saatlik)
    for (const m of store.filter('matches', (x) => x.users?.includes(u.id) && now() - x.at > 2 * HOUR && now() - x.at < 14 * DAY).sort((a, b) => b.at - a.at)) {
      const o = store.get('users', m.users.find((x) => x !== u.id)); if (!human(o) || isBlocked(u.id, o.id)) continue;
      const c = store.get('chats', [u.id, o.id].sort().join('_')); if (!c || (c.lastAt || 0) - (c.createdAt || 0) > 1000) continue; // yazışma başlamış
      if ((u.nudged || {})[`m:${m.id}`]) continue;
      return { key: `m:${m.id}`, n: { type: 'nudge', text: `${o.name || o.username} ile eşleşmen seni bekliyor 💬 İlk mesajı sen at!`, url: `/#/chat/${c.id}`, tag: 'nudge' } };
    }
    // 2) Bakılmamış beğeniler (son hatırlatmadan bu yana arttıysa)
    const mine = new Set(store.filter('swipes', (s) => s.from === u.id).map((s) => s.to));
    const n = store.filter('swipes', (s) => s.to === u.id && s.dir !== 'left' && !mine.has(s.from) && now() - s.at < 30 * DAY && !isBlocked(u.id, s.from)).length;
    if (n > 0 && n > (u.nudgeLikes || 0)) return { key: 'likes', likes: n, n: { type: 'nudge', text: n === 1 ? 'Biri seni beğendi 💜 Kim olduğunu görmek için dokun.' : `Seni ${n} kişi beğendi 💜 Kim olduklarını görmek için dokun.`, url: '/#/likes', tag: 'nudge' } };
    return null;
  }
  function nudgeTick(force = false) { // force: yalnız testlerde (saat, son görülme ve bildirim aboneliği koşulları atlanır)
    const h = trHour(); if (!force && (h < 9 || h >= 23)) return;
    const subs = new Set(store.all('pushSubs').map((s) => s.userId));
    for (const u of store.filter('users', (x) => (force || subs.has(x.id)) && human(x))) {
      if (off(u, 'reminders') || now() - (u.nudgeAt || 0) < 20 * HOUR || (!force && (now() - (u.lastSeen || 0) < 3 * HOUR || bestHour(u) !== h))) continue;
      const p = pick(u); if (!p) continue;
      const done = { ...(u.nudged || {}) }; if (p.key !== 'likes') done[p.key] = now();
      Object.keys(done).forEach((k) => { if (now() - done[k] > 30 * DAY) delete done[k]; });
      store.update('users', u.id, { nudgeAt: now(), nudged: done, ...(p.likes ? { nudgeLikes: p.likes } : {}) });
      notify(u.id, p.n);
    }
  }

  // ---- Haftalık özet e-postası ----
  const key = () => crypto.createHash('sha256').update('ozet-ret:' + (store.get('meta', 'secrets')?.jwt || process.env.JWT_SECRET || '')).digest();
  const tok = (uid) => crypto.createHmac('sha256', key()).update(String(uid)).digest('base64url').slice(0, 32);
  const base = () => (process.env.CANONICAL_URL || process.env.RENDER_EXTERNAL_URL || 'https://swipeup.live').replace(/\/$/, '');
  function weekOf(u, from) {
    const views = new Set(store.filter('pviews', (v) => v.to === u.id && v.at >= from && v.from !== u.id).map((v) => v.from)).size;
    const likes = store.filter('swipes', (s) => s.to === u.id && s.dir !== 'left' && s.at >= from).length;
    const matches = store.filter('matches', (m) => m.users?.includes(u.id) && m.at >= from).length;
    const mine = new Set(store.filter('swipes', (s) => s.from === u.id).map((s) => s.to));
    const waiting = store.filter('swipes', (s) => s.to === u.id && s.dir !== 'left' && !mine.has(s.from) && now() - s.at < 30 * DAY).length;
    return { views, likes, matches, waiting };
  }
  function digestText(u, w, link) {
    const L = [];
    if (w.views) L.push(`• ${w.views} kişi profiline baktı`);
    if (w.likes) L.push(`• ${w.likes} kişi seni beğendi`);
    if (w.matches) L.push(`• ${w.matches} yeni eşleşmen oldu`);
    return `Merhaba ${u.name || u.username},\n\nSwipeUp’ta geçen hafta:\n${L.join('\n')}\n${w.waiting ? `\nSeni bekleyen ${w.waiting} beğeni var. Kim olduklarını görmek için: ${base()}/#/likes\n` : `\nUygulamayı aç: ${base()}/#/\n`}\n—\nBu e-posta, hesabındaki hareketleri haftada bir özetlemek için gönderildi; kampanya içermez.\nArtık almak istemiyorsan: ${link}\n(Ya da uygulamada Ayarlar › Bildirimler › Haftalık özet e-postası)`;
  }
  let running = false;
  async function digest(force = false) {
    if (running || !mail.enabled()) return 0; const wk = weekKey(); const meta = store.get('meta', 'digest') || { id: 'digest' };
    if (!force && meta.week === wk) return 0;
    const d = trNow(); if (!force && !(d.getUTCDay() === 1 && d.getUTCHours() >= 10 && d.getUTCHours() < 22)) return 0; // pazartesi 10.00–22.00
    running = true; store.put('meta', { ...meta, week: wk, startedAt: now() });
    let sent = 0; const from = now() - 7 * DAY;
    try {
      for (const u of store.filter('users', (x) => human(x) && x.email && !off(x, 'digest') && !x.digestBounce)) {
        const w = weekOf(u, from); if (!w.views && !w.likes && !w.matches) continue;
        const link = `${base()}/ozet-ret?u=${u.id}&t=${tok(u.id)}`;
        const subj = w.likes ? `Bu hafta ${w.likes} kişi seni beğendi 💜` : w.matches ? `Bu hafta ${w.matches} yeni eşleşmen var` : `Bu hafta ${w.views} kişi profiline baktı`;
        try { await mail.send(u.email, subj, digestText(u, w, link), { headers: { 'List-Unsubscribe': `<${link}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }); sent++; }
        catch (e) { if (/5\d\d|invalid|does not exist|unknown user/i.test(e.message)) store.update('users', u.id, { digestBounce: now() }); console.error('[özet e-postası]', e.message); }
        await new Promise((r) => setTimeout(r, 400));
      }
    } finally { running = false; store.put('meta', { ...(store.get('meta', 'digest') || {}), id: 'digest', week: wk, sent, doneAt: now() }); }
    console.log(`[özet e-postası] ${wk} haftası: ${sent} e-posta gönderildi`);
    return sent;
  }

  // ---- Ayrılma bağlantısı ----
  const page = (t, b) => `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${t} · SwipeUp</title><style>body{font:16px/1.55 system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:0 20px;color:#1d1b26}button{font:inherit;font-weight:650;padding:12px 18px;border:0;border-radius:12px;background:#ff3d6e;color:#fff;cursor:pointer}</style></head><body>${b}</body></html>`;
  const who = (q) => { const u = store.get('users', String(q.u || '').slice(0, 20)); return u && String(q.t || '') === tok(u.id) ? u : null; };
  const unsub = (u) => { const np = u.notifyPrefs || { off: [], quiet: false, quietFrom: 23, quietTo: 8 }; if (!(np.off || []).includes('digest')) store.update('users', u.id, { notifyPrefs: { ...np, off: [...(np.off || []), 'digest'] } }); };
  app.get('/ozet-ret', (req, res) => {
    res.set('X-Robots-Tag', 'noindex').set('Referrer-Policy', 'no-referrer'); const u = who(req.query);
    if (!u) return res.status(400).send(page('Bağlantı geçersiz', '<h1>Bu bağlantı geçersiz</h1><p>Haftalık özeti uygulamada Ayarlar › Bildirimler’den kapatabilirsin.</p>'));
    res.send(page('Haftalık özetten ayrıl', `<h1>Haftalık özet e-postasından ayrıl</h1><p>@${String(u.username).replace(/[<>&"]/g, '')} hesabına haftalık özet gönderilmez.</p><form method="post"><button>Ayrıl</button></form>`));
  });
  app.post('/ozet-ret', express.urlencoded({ extended: false, limit: '2kb' }), (req, res) => {
    const u = who(req.query); if (!u) return res.status(400).send(page('Bağlantı geçersiz', '<h1>Bu bağlantı geçersiz</h1>'));
    unsub(u); res.send(page('Ayrıldın', '<h1>Haftalık özetten ayrıldın</h1><p>Fikrini değiştirirsen uygulamada Ayarlar › Bildirimler’den yeniden açabilirsin.</p>'));
  });

  // Yönetim: özeti şimdi gönder (yalnız sahip) ve durum
  const A = ctx.admin || {};
  if (A.adminAuth) {
    app.get('/api/admin/nudge', A.adminAuth, (req, res) => res.json({ digest: store.get('meta', 'digest') || null, mail: mail.enabled(), reminders: store.filter('notifications', (n) => n.type === 'nudge' && now() - n.at < 7 * DAY).length }));
    app.post('/api/admin/nudge/digest', A.adminAuth, A.owner, ctx.wrap(async (req, res) => { if (!mail.enabled()) return res.status(400).json({ error: 'E-posta hesabı ayarlı değil.' }); digest(true).catch(() => {}); A.audit?.(req.admin, 'haftalık özet e-postasını elle başlattı'); res.json({ ok: true }); }));
  }

  const iv = setInterval(() => { try { trackHours(); nudgeTick(); } catch (e) { console.error('[hatırlatma]', e.message); } digest().catch((e) => console.error('[özet e-postası]', e.message)); }, 15 * 60000); iv.unref?.();
  ctx.nudge = { pick, bestHour, weekOf, digest, tick: (force) => { trackHours(); nudgeTick(force); } };
};
