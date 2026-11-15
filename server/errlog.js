// Hata izleme: tarayıcıdaki hatalar (JS, yakalanmamış söz, başarısız API, Google girişi) ve sunucu hataları
// parmak izine göre gruplanır; yönetim panelinde "Hatalar" bölümünde sayı, etkilenen kişi, sürüm ve sayfa ile görünür.
const crypto = require('crypto');
const DAY = 86400000;
const KINDS = ['js', 'promise', 'api', 'net', 'gsi', 'server', 'resource'];

module.exports = function errlog(app, ctx) {
  const { store, limited } = ctx;
  const now = () => Date.now();
  const clip = (s, n) => String(s ?? '').slice(0, n);
  // Parmak izi: sayılar, kimlikler ve adres sorguları atılır ki aynı hata tek satırda toplansın
  const norm = (s) => clip(s, 300).replace(/\?[^\s'")]*/g, '').replace(/\b[0-9a-f]{8,}\b/gi, '#').replace(/\d+/g, '0').replace(/\/(chat|u|p|live|club|post|story|reels?)\/[\w-]+/g, '/$1/:id');
  const srcPath = (s) => { try { const u = new URL(String(s || ''), 'https://x'); return u.pathname; } catch { return clip(s, 120); } };
  const fp = (e) => crypto.createHash('sha1').update(`${e.kind}|${norm(e.msg)}|${srcPath(e.src)}|${e.kind === 'api' ? '' : e.line || ''}`).digest('hex').slice(0, 16);
  const uaShort = (ua) => {
    ua = String(ua || '');
    const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Diğer';
    const br = /Instagram/.test(ua) ? 'Instagram' : /FBAN|FBAV/.test(ua) ? 'Facebook' : /CriOS|Chrome\//.test(ua) && !/Edg\//.test(ua) ? 'Chrome' : /Edg\//.test(ua) ? 'Edge' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Diğer';
    return `${os} · ${br}`;
  };

  // Yazmalar biriktirilip 20 saniyede bir kaydedilir (her hata bir veritabanı yazması olmasın)
  const dirty = new Set();
  const flush = () => { for (const id of dirty) { const d = mem.get(id); if (d) store.put('client_errors', d); } dirty.clear(); };
  const mem = new Map(store.all('client_errors').map((d) => [d.id, d]));
  setInterval(flush, 20000).unref?.();
  // Eski ve çözülmüş kayıtları temizle
  setInterval(() => { const t = now(); for (const d of mem.values()) if ((d.status === 'resolved' && t - d.last > 14 * DAY) || t - d.last > 45 * DAY) { mem.delete(d.id); store.del?.('client_errors', d.id); } }, 6 * 3600000).unref?.();

  function record(e, { userId = null, ua = '' } = {}) {
    const kind = KINDS.includes(e.kind) ? e.kind : 'js';
    const item = { kind, msg: clip(e.msg, 400) || '(mesaj yok)', src: clip(e.src, 300), line: +e.line || 0, col: +e.col || 0, stack: clip(e.stack, 2500), route: clip(e.route, 80).replace(/\/[\w-]{10,}/g, '/:id'), ver: clip(e.ver, 20), status: +e.status || 0 };
    const id = fp(item); const t = now();
    let d = mem.get(id);
    if (!d) { if (mem.size > 3000) return; d = { id, ...item, count: 0, first: t, last: t, users: [], userCount: 0, routes: {}, vers: {}, uas: {}, status: 'open', hours: {} }; mem.set(id, d); }
    if (d.status === 'resolved') { d.status = 'open'; d.regressed = true; d.reopenedAt = t; }
    d.count++; d.last = t; d.lastMsg = item.msg; if (item.stack) d.stack = item.stack;
    if (item.status) d.httpStatus = item.status;
    if (userId && !d.users.includes(userId)) { if (d.users.length < 50) d.users.push(userId); d.userCount++; }
    const bump = (o, k) => { if (!k) return; o[k] = (o[k] || 0) + 1; const ks = Object.keys(o); if (ks.length > 12) delete o[ks.sort((a, b) => o[a] - o[b])[0]]; };
    bump(d.routes, item.route); bump(d.vers, item.ver); bump(d.uas, uaShort(ua));
    const h = String(Math.floor(t / 3600000)); d.hours[h] = (d.hours[h] || 0) + 1;
    for (const k of Object.keys(d.hours)) if (+k < Math.floor(t / 3600000) - 48) delete d.hours[k];
    dirty.add(id);
  }

  // Oturum varsa kim olduğunu öğren, yoksa anonim kaydet
  const softUser = (req) => { let u = null; try { ctx.auth(req, { status: () => ({ json() {} }) }, () => { u = req.user; }); } catch { /* yok */ } return u; };
  app.post('/api/client-errors', (req, res) => {
    const ip = ctx.ipOf ? ctx.ipOf(req) : req.ip;
    if (limited('cerr:' + ip, 60, 600000)) return res.status(204).end();
    const list = (Array.isArray(req.body?.errors) ? req.body.errors : [req.body]).slice(0, 10);
    const u = req.headers.authorization ? softUser(req) : null;
    for (const e of list) if (e && typeof e === 'object' && e.msg) record(e, { userId: u?.id || null, ua: req.headers['user-agent'] });
    res.status(204).end();
  });
  ctx.serverError = (err, req) => {
    try {
      const frame = String(err?.stack || '').split('\n').find((l) => /\/server(\.js|\/)/.test(l)) || '';
      const m = /\((.*?):(\d+):\d+\)|at (.*?):(\d+):\d+/.exec(frame) || [];
      record({ kind: 'server', msg: `${err?.message || err}`, src: (m[1] || m[3] || '').replace(/.*\/(server(\.js|\/.*))/, '$1'), line: m[2] || m[4] || 0, stack: err?.stack, route: `${req?.method || ''} ${String(req?.route?.path || req?.path || '').slice(0, 60)}` }, { userId: req?.user?.id || null, ua: req?.headers?.['user-agent'] });
    } catch { /* hata kaydı asla sunucuyu düşürmesin */ }
  };
  ctx.errorsOpen = () => [...mem.values()].filter((d) => d.status === 'open').length;
  if (ctx.admin) ctx.admin.errorsOpen = ctx.errorsOpen;

  // ---------- Yönetim ----------
  const A = ctx.admin; if (!A?.adminAuth) return;
  const out = (d) => { const { users, hours, ...r } = d; const h = Math.floor(now() / 3600000); return { ...r, users: users.slice(0, 8).map((id) => ctx.brief?.(store.get('users', id))).filter(Boolean), spark: Array.from({ length: 24 }, (_, i) => hours[String(h - 23 + i)] || 0) }; };
  app.get('/api/admin/errors', A.adminAuth, (req, res) => {
    const st = ['open', 'resolved', 'all'].includes(req.query.status) ? req.query.status : 'open';
    const kind = KINDS.includes(req.query.kind) ? req.query.kind : null;
    const t = now(); const all = [...mem.values()];
    let list = all.filter((d) => (st === 'all' || d.status === st) && (!kind || d.kind === kind));
    list.sort((a, b) => b.last - a.last);
    const day = all.filter((d) => d.last > t - DAY);
    res.json({
      list: list.slice(0, 200).map(out),
      stats: { open: all.filter((d) => d.status === 'open').length, last24: day.reduce((n, d) => n + Object.entries(d.hours).filter(([k]) => +k >= Math.floor((t - DAY) / 3600000)).reduce((m, [, v]) => m + v, 0), 0), users24: new Set(day.flatMap((d) => d.users)).size, regressed: all.filter((d) => d.status === 'open' && d.regressed).length },
      kinds: Object.fromEntries(KINDS.map((k) => [k, all.filter((d) => d.kind === k && d.status === 'open').length])),
    });
  });
  app.post('/api/admin/errors/:id', A.adminAuth, (req, res) => {
    const d = mem.get(req.params.id); if (!d) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    const a = req.body?.action;
    if (a === 'delete') { mem.delete(d.id); dirty.delete(d.id); store.del?.('client_errors', d.id); return res.json({ ok: true }); }
    if (a === 'resolve') Object.assign(d, { status: 'resolved', resolvedAt: now(), resolvedBy: req.admin?.username || null, regressed: false });
    if (a === 'reopen') Object.assign(d, { status: 'open' });
    dirty.add(d.id); flush();
    A.audit?.(req.admin, a === 'resolve' ? 'hatayı çözüldü işaretledi' : 'hatayı yeniden açtı', null, d.msg.slice(0, 80));
    res.json(out(d));
  });
  app.post('/api/admin/errors-clear', A.adminAuth, (req, res) => {
    let n = 0; for (const d of [...mem.values()]) if (d.status === 'resolved') { mem.delete(d.id); store.del?.('client_errors', d.id); n++; }
    res.json({ removed: n });
  });
};
