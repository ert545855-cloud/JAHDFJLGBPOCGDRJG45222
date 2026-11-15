// Büyüme: aylık davet sıralaması (ay sonunda ilk üçe jeton), yönetim için kayıt hunisi, tanıtım sayfası (robots / sitemap)
const DAY = 86400000;
// Türkiye saatiyle ay anahtarı (YYYY-AA)
const trMonth = (t = Date.now()) => new Date(t + 3 * 3600000).toISOString().slice(0, 7);
const monthStart = (key) => Date.parse(`${key}-01T00:00:00+03:00`);
const nextMonth = (key) => { const [y, m] = key.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
const prevMonth = (key) => { const [y, m] = key.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };

module.exports = function growth2(app, ctx) {
  const { store, auth, eco, notify, brief, emitTo } = ctx;
  const now = () => Date.now();
  const prizes = () => { const p = eco.get().invitePrizes; return Array.isArray(p) && p.length ? p : [300, 150, 75]; };

  // Ay içinde ödüllü (profil fotoğrafını eklemiş) davetler: davet edenin sayısı
  function board(key) {
    const a = monthStart(key); const b = monthStart(nextMonth(key));
    const n = new Map();
    for (const u of store.filter('users', (x) => x.invitedBy && x.inviteRewarded && x.inviteRewarded >= a && x.inviteRewarded < b)) n.set(u.invitedBy, (n.get(u.invitedBy) || 0) + 1);
    return [...n.entries()].map(([id, count]) => ({ id, count, first: Math.min(...store.filter('users', (x) => x.invitedBy === id && x.inviteRewarded >= a && x.inviteRewarded < b).map((x) => x.inviteRewarded)) }))
      .filter((r) => store.get('users', r.id) && !store.get('users', r.id).isBot)
      .sort((x, y) => y.count - x.count || x.first - y.first); // eşitlikte önce ulaşan önde
  }
  app.get('/api/invite/leaders', auth, (req, res) => {
    const key = trMonth(); const list = board(key);
    const me = list.findIndex((r) => r.id === req.user.id);
    const last = store.get('settings', `invite_month_${prevMonth(key)}`);
    res.json({
      month: key, endsAt: monthStart(nextMonth(key)), prizes: prizes(),
      top: list.slice(0, 10).map((r, i) => ({ rank: i + 1, count: r.count, user: brief(store.get('users', r.id)) })),
      me: me >= 0 ? { rank: me + 1, count: list[me].count } : { rank: null, count: 0 },
      lastWinners: (last?.winners || []).map((w) => ({ ...w, user: brief(store.get('users', w.id)) })).filter((w) => w.user),
    });
  });
  // Ay bitince geçen ayın ilk üçüne ödül (bir kez)
  function payout() {
    const key = prevMonth(trMonth()); const sid = `invite_month_${key}`;
    if (store.get('settings', sid)) return;
    const list = board(key).slice(0, prizes().length);
    const winners = list.map((r, i) => ({ id: r.id, count: r.count, coins: prizes()[i] }));
    store.put('settings', { id: sid, at: now(), winners });
    for (const w of winners) {
      eco.addCoins(w.id, w.coins, 'invite_prize', { ref: key });
      notify(w.id, { type: 'order', text: `🏆 Geçen ayın davet sıralamasında ${winners.indexOf(w) + 1}. oldun! ${w.coins} jeton hesabına eklendi.`, url: '/#/davet' });
      emitTo?.(w.id, 'wallet', {});
    }
    if (winners.length) console.log(`[davet] ${key} ödülleri verildi: ${winners.map((w) => `${w.id}:${w.coins}`).join(', ')}`);
  }
  setTimeout(payout, 30000).unref?.();
  setInterval(payout, 3600000).unref?.();

  // ---------- Yönetim: kayıt hunisi ----------
  const A = ctx.admin;
  if (A?.adminAuth) {
    app.get('/api/admin/funnel', A.adminAuth, (req, res) => {
      const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30));
      const from = now() - days * DAY;
      const users = store.filter('users', (u) => !u.isBot && !['falci', 'official'].includes(u.role) && (u.createdAt || 0) >= from);
      const ids = new Set(users.map((u) => u.id));
      const hasPhoto = (u) => (u.photos || []).length > 0 || /^\/media\//.test(u.avatar || '');
      const matched = new Set(); const messaged = new Set(); const firstMatch = new Map();
      for (const c of store.filter('chats', (c) => !c.isGroup && (c.members || []).some((m) => ids.has(m)))) {
        for (const m of c.members) if (ids.has(m)) { matched.add(m); if (!firstMatch.has(m) || c.createdAt < firstMatch.get(m)) firstMatch.set(m, c.createdAt || 0); }
      }
      for (const m of store.filter('messages', (m) => ids.has(m.from) && !m.system)) messaged.add(m.from);
      const steps = [
        ['Kayıt oldu', users.length],
        ['Profil fotoğrafı ekledi', users.filter(hasPhoto).length],
        ['İlk eşleşme / sohbet', users.filter((u) => matched.has(u.id)).length],
        ['İlk mesajı yazdı', users.filter((u) => messaged.has(u.id)).length],
      ];
      // Haftalık dilimler: her hafta kaydolanların adım oranları
      const weeks = [];
      for (let t = from; t < now(); t += 7 * DAY) {
        const w = users.filter((u) => u.createdAt >= t && u.createdAt < t + 7 * DAY);
        weeks.push({ from: t, n: w.length, photo: w.filter(hasPhoto).length, match: w.filter((u) => matched.has(u.id)).length, msg: w.filter((u) => messaged.has(u.id)).length });
      }
      const med = (arr) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
      const toMatch = users.filter((u) => firstMatch.has(u.id)).map((u) => Math.max(0, firstMatch.get(u.id) - u.createdAt));
      res.json({ days, steps: steps.map(([label, n], i) => ({ label, n, pct: users.length ? Math.round((n / users.length) * 100) : 0, drop: i ? Math.max(0, steps[i - 1][1] - n) : 0 })), weeks, medianHoursToMatch: toMatch.length ? Math.round(med(toMatch) / 3600000) : null });
    });
  }

  // ---------- Tanıtım sayfaları ----------
  const path = require('path');
  const page = (f) => (req, res) => { res.setHeader('Cache-Control', 'public, max-age=3600'); res.sendFile(path.join(__dirname, '..', 'public', f)); };
  app.get(['/tanitim', '/hakkinda', '/about'], page('tanitim.html'));
  app.get('/en', page('en.html'));
  // ---------- Arama motorları ----------
  const base = () => process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'https://swipeup.live';
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(`User-agent: *\nAllow: /$\nAllow: /tanitim\nAllow: /en\nDisallow: /api/\nDisallow: /media/\nSitemap: ${base()}/sitemap.xml\n`);
  });
  app.get('/sitemap.xml', (req, res) => {
    const d = new Date().toISOString().slice(0, 10);
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/tanitim', '/en', '/'].map((p) => `  <url><loc>${base()}${p}</loc><lastmod>${d}</lastmod><changefreq>weekly</changefreq></url>`).join('\n')}\n</urlset>\n`);
  });
};
module.exports.trMonth = trMonth;
