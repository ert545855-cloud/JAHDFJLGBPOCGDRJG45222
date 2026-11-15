// Yeni üyelere SwipeUp+ denemesi: kayıtta otomatik başlar (süre yönetimden: Ekonomi → plusTrialDays, 0 = kapalı).
// Kötüye kullanıma karşı: aynı cihazdan 90 günde bir, aynı ağdan günde en çok 3 deneme.
const DAY = 86400000;
module.exports = function trial(app, ctx) {
  const { store, eco, notify } = ctx;
  const now = () => Date.now();
  const days = () => Math.max(0, Math.min(30, +(eco.get().plusTrialDays ?? 3) || 0));

  function start(u, req) {
    const d = days(); if (!d || !u || u.isBot) return;
    const fresh = store.get('users', u.id) || u;
    if ((fresh.plusUntil || 0) > now() || fresh.plusTrial) return;
    const dev = fresh.regDevice || null; const ip = fresh.regIp || (ctx.ipOf ? ctx.ipOf(req) : null);
    if (dev && store.find('plus_trials', (t) => t.device === dev && t.at > now() - 90 * DAY)) return;
    if (ip && store.filter('plus_trials', (t) => t.ip === ip && t.at > now() - DAY).length >= 3) return;
    eco.grantPlus(u.id, d);
    const until = store.get('users', u.id).plusUntil;
    store.update('users', u.id, { plusTrial: { at: now(), until, days: d } });
    store.put('plus_trials', { id: u.id, device: dev, ip, at: now(), days: d });
    setTimeout(() => notify?.(u.id, { type: 'system', text: `Hoş geldin! ${d} gün boyunca SwipeUp+ senin: sınırsız beğeni, seni beğenenleri görme, Altın Seri çıkartmalar ve daha fazlası.`, url: '/#/store' }), 4000);
  }
  const prev = ctx.onRegister;
  ctx.onRegister = (u, req) => { try { prev?.(u, req); } finally { try { start(u, req); } catch (e) { console.error('[deneme]', e.message); } } };

  // Bitmeden bir gün önce hatırlat, bitince haber ver (kendisi satın aldıysa sessiz)
  const tick = () => {
    const t = now();
    for (const u of store.filter('users', (x) => x.plusTrial && !x.plusTrial.done)) {
      const tr = u.plusTrial; const bought = (u.plusUntil || 0) > tr.until + 60000;
      if (bought) { store.update('users', u.id, { plusTrial: { ...tr, done: true, bought: true } }); continue; }
      if (!tr.warned && tr.until - t < DAY && tr.until > t) {
        store.update('users', u.id, { plusTrial: { ...tr, warned: true } });
        notify?.(u.id, { type: 'system', text: 'SwipeUp+ denemen yarın bitiyor. Ayrıcalıkların devam etsin istersen Mağaza’ya göz at.', url: '/#/store' });
      } else if (tr.until <= t) {
        store.update('users', u.id, { plusTrial: { ...tr, done: true } });
        notify?.(u.id, { type: 'system', text: 'SwipeUp+ denemen bitti. Beğendiysen üyeliğini Mağaza’dan başlatabilirsin.', url: '/#/store' });
      }
    }
  };
  ctx.trialTick = tick;
  setInterval(tick, 30 * 60000).unref?.();
  setTimeout(tick, 20000).unref?.();

  app.get('/api/plus/trial', ctx.auth, (req, res) => {
    const tr = req.user.plusTrial;
    res.json({ days: days(), trial: tr ? { until: tr.until, days: tr.days, active: tr.until > now() && !tr.bought } : null });
  });
  ctx.trialStats = () => {
    const all = store.all('plus_trials'); const t = now();
    return { total: all.length, last30: all.filter((x) => x.at > t - 30 * DAY).length, converted: store.filter('users', (u) => u.plusTrial?.bought).length };
  };
};
