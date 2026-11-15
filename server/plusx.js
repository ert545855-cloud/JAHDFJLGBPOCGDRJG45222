// SwipeUp+ ve jeton ürünleri: süper beğeni paketleri (jetonla), profil teması (arka plan + renkli isim, SwipeUp+ özel)
const BG = [
  { id: 'aurora', name: 'Kutup ışığı' }, { id: 'gunbatimi', name: 'Gün batımı' }, { id: 'okyanus', name: 'Okyanus' },
  { id: 'lavanta', name: 'Lavanta' }, { id: 'gece', name: 'Gece' }, { id: 'altin', name: 'Altın' },
];
const NAME = [
  { id: 'altin', name: 'Altın' }, { id: 'gul', name: 'Gül' }, { id: 'mor', name: 'Mor' },
  { id: 'turkuaz', name: 'Turkuaz' }, { id: 'ates', name: 'Ateş' }, { id: 'gokkusagi', name: 'Gökkuşağı' },
];
module.exports = function plusx(app, ctx) {
  const { store, auth, eco, emitTo, limited } = ctx;
  const packs = () => eco.get().superPacks || [];

  app.get('/api/supers', auth, (req, res) => {
    const q = eco.quota(req.user);
    res.json({ packs: packs(), bank: req.user.superBank || 0, daily: q.supersDaily, coins: req.user.coins || 0, plus: q.plus });
  });
  app.post('/api/supers/buy', auth, (req, res) => {
    const p = packs().find((x) => x.id === req.body?.id);
    if (!p) return res.status(404).json({ error: 'Paket bulunamadı.' });
    if (limited('supbuy:' + req.user.id, 20, 3600000)) return res.status(429).json({ error: 'Biraz yavaş 🙂' });
    const pay = eco.spend(req.user.id, p.coins, 'super_pack', { ref: p.id, n: p.n });
    if (!pay) return res.status(402).json({ error: `${p.n} süper beğeni ${p.coins} jeton.`, needCoins: true });
    const cur = store.get('users', req.user.id);
    const u = store.update('users', req.user.id, { superBank: (cur.superBank || 0) + p.n });
    emitTo?.(req.user.id, 'wallet', {});
    res.json({ bank: u.superBank, coins: u.coins || 0 });
  });

  app.get('/api/ptheme', auth, (req, res) => res.json({ bgs: BG, names: NAME, cur: req.user.pTheme || {}, plus: eco.isPlus(req.user) }));
  app.post('/api/ptheme', auth, (req, res) => {
    if (!eco.isPlus(req.user)) return res.status(402).json({ error: 'Profil teması SwipeUp+ ayrıcalığıdır.', needPlus: true });
    const bg = BG.some((x) => x.id === req.body?.bg) ? req.body.bg : null;
    const name = NAME.some((x) => x.id === req.body?.name) ? req.body.name : null;
    store.update('users', req.user.id, { pTheme: bg || name ? { bg, name } : null });
    res.json({ pTheme: bg || name ? { bg, name } : null });
  });
};
module.exports.BG = BG; module.exports.NAME = NAME;
