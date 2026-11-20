// Sepet ve sepet kampanyaları (Yönetim → Sepet indirimleri).
// - Sepet: mağazadaki jeton paketleri ve SwipeUp+ süreleri; kullanıcının hesabında tutulur (her cihazda aynı sepet).
// - Kampanya: belirli haftanın günlerinde (isteğe bağlı tarih aralığında) sepette en az N ürün olunca %X.
// - Web (havale/EFT): indirim fiyata uygulanır. Sepetteki her ürün ayrı sipariş olur (her birinin kendi ön bilgilendirme
//   formu ve sözleşmesi saklanır) ama hepsi tek sepet koduyla, tek havaleyle ödenir.
// - Uygulama (App Store / Google Play): fiyatı mağaza belirler, değiştirilemez. Ürünler sırayla mağazadan alınır;
//   kampanya varsa indirim oranı kadar HEDİYE (ekstra jeton / ekstra SwipeUp+ günü) sunucuda doğrulanarak tanımlanır.
const { nanoid, customAlphabet } = require('nanoid');

const DAY = 86400000;
const MAX_ITEMS = 10;
const MAX_QTY = 5;
const BONUS_WINDOW = 3 * 3600000; // uygulamada sepetin ürünleri bu süre içinde alınmış olmalı
const cartCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
const DAYS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

module.exports = function cart(app, ctx) {
  const { store, auth, eco, notify, emitTo, limited, admin: A } = ctx;
  const now = () => Date.now();
  const tr = (t = now()) => new Date(t + 3 * 3600000); // Türkiye saati (UTC+3, yaz saati yok)
  const trYmd = (t) => tr(t).toISOString().slice(0, 10);
  const r2 = (n) => Math.round(n * 100) / 100;
  const str = (v, n) => String(v ?? '').trim().slice(0, n);

  // ---------- Kampanyalar ----------
  const list = () => (store.get('settings', 'cart_promo')?.list || []);
  const activeAt = (c, t = now()) => {
    if (!c.on) return false;
    const day = trYmd(t);
    if (c.from && day < c.from) return false;
    if (c.to && day > c.to) return false;
    return (c.days || []).includes(tr(t).getUTCDay());
  };
  const activeList = (t = now()) => list().filter((c) => activeAt(c, t));
  // n ürünlük sepete uygulanacak en iyi kampanya
  const best = (n, t = now()) => activeList(t).filter((c) => n >= c.minItems).sort((a, b) => b.pct - a.pct)[0] || null;
  const pub = (c) => (c ? { id: c.id, title: c.title, pct: c.pct, minItems: c.minItems, days: c.days, dayNames: c.days.map((d) => DAYS_TR[d]), to: c.to || null } : null);

  // ---------- Sepet ----------
  const itemsOf = (u) => (Array.isArray(u?.cart) ? u.cart : []).filter((x) => eco.product(x.id));
  const count = (items) => items.reduce((a, x) => a + x.qty, 0);
  function view(u) {
    const items = itemsOf(u).map((x) => { const p = eco.product(x.id); return { id: x.id, qty: x.qty, product: p, unit: p.price, line: r2(p.price * x.qty) }; });
    const n = count(items); const c = best(n);
    const subtotal = r2(items.reduce((a, x) => a + x.line, 0));
    const discount = c ? r2(items.reduce((a, x) => a + (x.unit - r2(x.unit * (1 - c.pct / 100))) * x.qty, 0)) : 0;
    // Kampanya bugün var ama sepet henüz yetmiyorsa: "1 ürün daha ekle" ipucu için
    const next = !c ? activeList().sort((a, b) => a.minItems - b.minItems || b.pct - a.pct)[0] || null : null;
    return { items, count: n, subtotal, discount, total: r2(subtotal - discount), promo: pub(c), next: pub(next), today: activeList().map(pub), max: MAX_ITEMS };
  }
  const save = (uid, items) => store.update('users', uid, { cart: items.map((x) => ({ id: x.id, qty: x.qty })) });

  app.get('/api/cart', auth, (req, res) => res.json(view(req.user)));
  app.post('/api/cart/items', auth, (req, res) => {
    const id = str(req.body?.id, 20); const p = eco.product(id);
    if (!p) return res.status(400).json({ error: 'Ürün bulunamadı.' });
    const items = itemsOf(req.user); const ex = items.find((x) => x.id === id);
    if (count(items) >= MAX_ITEMS) return res.status(400).json({ error: `Sepete en fazla ${MAX_ITEMS} ürün ekleyebilirsin.` });
    if (ex) { if (ex.qty >= MAX_QTY) return res.status(400).json({ error: `Aynı üründen en fazla ${MAX_QTY} adet.` }); ex.qty += 1; } else items.push({ id, qty: 1 });
    const u = save(req.user.id, items); res.json(view(u));
  });
  app.put('/api/cart/items/:id', auth, (req, res) => {
    const id = str(req.params.id, 20); const qty = Math.max(0, Math.min(MAX_QTY, parseInt(req.body?.qty, 10) || 0));
    let items = itemsOf(req.user);
    if (qty === 0) items = items.filter((x) => x.id !== id);
    else {
      const ex = items.find((x) => x.id === id); if (!ex) return res.status(404).json({ error: 'Ürün sepette yok.' });
      if (count(items) - ex.qty + qty > MAX_ITEMS) return res.status(400).json({ error: `Sepete en fazla ${MAX_ITEMS} ürün ekleyebilirsin.` });
      ex.qty = qty;
    }
    res.json(view(save(req.user.id, items)));
  });
  app.delete('/api/cart', auth, (req, res) => res.json(view(save(req.user.id, []))));

  // ---------- Web: havale/EFT ile sepet siparişi (indirim fiyata uygulanır) ----------
  const groupOut = (code, uid) => {
    const orders = store.filter('orders', (o) => o.cart === code && o.userId === uid).sort((a, b) => a.at - b.at);
    if (!orders.length) return null;
    const st = (s) => orders.every((o) => o.status === s);
    const status = st('pending') ? 'pending' : st('paid') ? 'paid' : st('approved') ? 'approved' : orders.some((o) => ['pending', 'paid'].includes(o.status)) ? 'mixed' : orders[0].status;
    const f = orders[0];
    return {
      code, status, at: f.at, pct: f.cartPct || 0, promo: f.cartPromo || null,
      subtotal: r2(orders.reduce((a, o) => a + (o.listPrice ?? o.amount), 0)), total: r2(orders.reduce((a, o) => a + o.amount, 0)),
      orders: orders.map((o) => ({ id: o.id, code: o.code, title: o.title, amount: o.amount, listPrice: o.listPrice ?? o.amount, status: o.status })),
      bank: eco.get().bank, expired: orders.some((o) => o.expired),
    };
  };
  app.post('/api/cart/checkout', auth, (req, res) => {
    const u = req.user; const s = eco.get();
    if (!s.bank.iban) return res.status(503).json({ error: 'Ödeme şu an kapalı. Lütfen daha sonra tekrar dene.' });
    const acc = req.body?.accept || {};
    if (acc.pre !== true || acc.waive !== true) return res.status(400).json({ error: 'Siparişi verebilmek için ön bilgilendirme formunu ve sözleşmeyi onaylaman, cayma hakkı bilgilendirmesini de ayrıca kabul etmen gerekiyor.', needAccept: true });
    const v = view(u); if (!v.count) return res.status(400).json({ error: 'Sepetin boş.' });
    if (store.find('orders', (o) => o.userId === u.id && o.cart && o.status === 'pending')) return res.status(429).json({ error: 'Ödemesi beklenen bir sepet siparişin var. Önce onu öde ya da iptal et.' });
    // İstemcinin gördüğü tutarla karşılaştır: arada fiyat / kampanya değiştiyse sipariş kurulmaz
    if (req.body?.total != null && Math.abs(+req.body.total - v.total) > 0.009) return res.status(409).json({ error: 'Sepetteki fiyatlar güncellendi. Yeni tutarı kontrol edip tekrar onayla.', cart: v });
    let code; do { code = 'SP-' + cartCode(); } while (store.find('orders', (o) => o.cart === code));
    const c = v.promo; const made = [];
    for (const it of v.items) {
      for (let i = 0; i < it.qty; i += 1) {
        const p = it.product; const amount = c ? r2(p.price * (1 - c.pct / 100)) : p.price;
        let oc; do { oc = 'SU-' + cartCode(); } while (store.find('orders', (o) => o.code === oc));
        const base = { id: nanoid(10), code: oc, userId: u.id, productId: p.id, kind: p.kind, title: p.title, amount, listPrice: p.price, ...(p.kind === 'coins' ? { coins: p.coins } : {}), status: 'pending', at: now(), cart: code, ...(c ? { cartPct: c.pct, cartPromo: c.title } : {}) };
        const d = ctx.orderDocs ? ctx.orderDocs(u, { ...p, price: amount, ...(c ? { cartDeal: { pct: c.pct, list: p.price, title: c.title, code } } : {}) }, base) : null;
        made.push(store.put('orders', { ...base, ...(d ? { docs: { pre: d.pre, contract: d.contract, waive: d.waive }, legal: { v: d.v, hash: d.hash, at: now(), ip: ctx.ipOf(req), pre: true, waive: true } } : {}) }));
      }
    }
    made.forEach((o) => ctx.orderMail?.(u, o));
    save(u.id, []);
    res.json(groupOut(code, u.id));
  });
  app.get('/api/cart/orders/:code', auth, (req, res) => { const g = groupOut(str(req.params.code, 12), req.user.id); if (!g) return res.status(404).json({ error: 'Sepet siparişi bulunamadı.' }); res.json(g); });
  app.post('/api/cart/orders/:code/paid', auth, (req, res) => {
    const code = str(req.params.code, 12); const sender = str(req.body?.sender, 60);
    if (sender.length < 3) return res.status(400).json({ error: 'Gönderen ad soyadını yaz.' });
    const list2 = store.filter('orders', (o) => o.cart === code && o.userId === req.user.id && o.status === 'pending');
    if (!list2.length) return res.status(404).json({ error: 'Ödemesi beklenen sipariş yok.' });
    list2.forEach((o) => store.update('orders', o.id, { status: 'paid', sender, paidAt: now() }));
    res.json(groupOut(code, req.user.id));
  });
  app.delete('/api/cart/orders/:code', auth, (req, res) => {
    const code = str(req.params.code, 12);
    const list2 = store.filter('orders', (o) => o.cart === code && o.userId === req.user.id && o.status === 'pending');
    if (!list2.length) return res.status(400).json({ error: 'Bu sipariş iptal edilemez.' });
    list2.forEach((o) => store.update('orders', o.id, { status: 'cancelled', closedAt: now() }));
    res.json(groupOut(code, req.user.id));
  });

  // ---------- Uygulama: mağazadan alınan sepet ürünlerine kampanya hediyesi ----------
  app.post('/api/cart/bonus', auth, (req, res) => {
    if (limited(`cartb:${req.user.id}`, 20, 600000)) return res.status(429).json({ error: 'Biraz yavaş.' });
    const ids = [...new Set((Array.isArray(req.body?.orderIds) ? req.body.orderIds : []).map((x) => str(x, 20)))].slice(0, MAX_ITEMS);
    const t = now();
    const orders = ids.map((id) => store.get('orders', id)).filter((o) => o && o.userId === req.user.id && o.channel && o.status === 'approved' && !o.cartBonus && t - o.at < BONUS_WINDOW);
    const units = orders.reduce((a, o) => a + (o.qty || 1), 0); // adetli satın almada her adet bir ürün sayılır
    const c = best(units);
    if (!c || orders.some((o) => !activeAt(c, o.at))) return res.json({ bonus: null });
    let coins = 0; let days = 0;
    for (const o of orders) {
      if (o.kind === 'coins') coins += Math.floor((o.coins || 0) * c.pct / 100);
      else { const p = eco.product(o.productId); days += Math.max(1, Math.round((o.days || (p?.days || 30) * (o.qty || 1)) * c.pct / 100)); }
    }
    const id = nanoid(10);
    orders.forEach((o) => store.update('orders', o.id, { cartBonus: id }));
    if (coins > 0) eco.addCoins(req.user.id, coins, 'cart_bonus', { ref: id });
    if (days > 0) eco.grantPlus(req.user.id, days);
    store.put('cart_bonus', { id, userId: req.user.id, orderIds: orders.map((o) => o.id), promoId: c.id, pct: c.pct, coins, days, channel: orders[0].channel, test: orders.some((o) => o.test), at: t });
    const parts = [coins ? `${coins} jeton` : '', days ? `${days} gün SwipeUp+` : ''].filter(Boolean).join(' + ');
    notify(req.user.id, { type: 'order', text: `🎁 Sepet kampanyası: ${parts} hediye hesabına eklendi.`, title: 'SwipeUp', url: '/#/store' });
    emitTo(req.user.id, 'wallet', {});
    res.json({ bonus: { coins, days, pct: c.pct, title: c.title } });
  });

  // ---------- Yönetim: Sepet indirimleri ----------
  const clean = (b, old = {}) => {
    const days = [...new Set((Array.isArray(b.days) ? b.days : []).map((d) => parseInt(d, 10)).filter((d) => d >= 0 && d <= 6))].sort();
    const ymd = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x || '')) ? String(x) : '');
    const c = { ...old, title: str(b.title, 60) || 'Sepet indirimi', days, minItems: Math.max(2, Math.min(MAX_ITEMS, parseInt(b.minItems, 10) || 2)), pct: Math.max(1, Math.min(70, Math.round(+b.pct || 0))), from: ymd(b.from), to: ymd(b.to), on: b.on !== false };
    if (!c.days.length) throw Object.assign(new Error('En az bir gün seç.'), { status: 400 });
    if (!(+b.pct >= 1 && +b.pct <= 70)) throw Object.assign(new Error('İndirim oranı %1 ile %70 arasında olmalı.'), { status: 400 });
    if (c.from && c.to && c.to < c.from) throw Object.assign(new Error('Bitiş tarihi başlangıçtan önce olamaz.'), { status: 400 });
    return c;
  };
  const putList = (l) => store.put('settings', { id: 'cart_promo', list: l });
  const stats = () => {
    const since = now() - 30 * DAY;
    const web = store.filter('orders', (o) => o.cart && o.cartPct && o.status === 'approved' && o.at > since);
    const bon = store.filter('cart_bonus', (b) => b.at > since && !b.test);
    return { webCarts: new Set(web.map((o) => o.cart)).size, webDiscount: r2(web.reduce((a, o) => a + ((o.listPrice || o.amount) - o.amount), 0)), appCarts: bon.length, bonusCoins: bon.reduce((a, b) => a + b.coins, 0), bonusDays: bon.reduce((a, b) => a + b.days, 0) };
  };
  const adminOut = () => ({ list: list().map((c) => ({ ...c, active: activeAt(c), dayNames: c.days.map((d) => DAYS_TR[d]) })), stats: stats(), todayName: DAYS_TR[tr().getUTCDay()] });
  const audit = (req, text, det) => A?.audit?.(req.admin, text, null, det);
  app.get('/api/admin/cartpromos', A.adminAuth, (req, res) => res.json(adminOut()));
  app.post('/api/admin/cartpromos', A.adminAuth, (req, res) => {
    try { const c = { id: nanoid(8), ...clean(req.body || {}), at: now(), by: req.admin.username }; putList([...list(), c]); audit(req, 'sepet indirimi ekledi', `${c.title} · %${c.pct}`); res.json(adminOut()); } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });
  app.put('/api/admin/cartpromos/:id', A.adminAuth, (req, res) => {
    const l = list(); const i = l.findIndex((c) => c.id === req.params.id); if (i < 0) return res.status(404).json({ error: 'Kampanya bulunamadı.' });
    try { l[i] = clean({ ...l[i], ...req.body }, l[i]); putList(l); audit(req, 'sepet indirimini güncelledi', `${l[i].title} · %${l[i].pct}${l[i].on ? '' : ' (kapalı)'}`); res.json(adminOut()); } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });
  app.delete('/api/admin/cartpromos/:id', A.adminAuth, (req, res) => {
    const c = list().find((x) => x.id === req.params.id); if (!c) return res.status(404).json({ error: 'Kampanya bulunamadı.' });
    putList(list().filter((x) => x.id !== c.id)); audit(req, 'sepet indirimini sildi', c.title); res.json(adminOut());
  });

  ctx.cart = { best, activeList, view };
};
