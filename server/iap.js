// Uygulama içi satın alma: Google Play (Android uygulaması, Digital Goods API) ve App Store (iOS uygulaması).
// Telefon yalnızca satın alma kimliğini gönderir; sunucu ürünü doğrudan Google / Apple'a sorar, ancak onaylanırsa
// jeton ya da SwipeUp+ tanımlanır. Aynı satın alma iki kez tanımlanamaz. İade edilen Google satın almaları geri alınır.
// Ürün kimlikleri mağaza panellerinde aynen açılmalı: swipeup.<ürün> (ör. swipeup.j100, swipeup.p30). Hepsi tek seferlik
// (tüketilebilir) ürün; SwipeUp+ otomatik yenilenmez.
// Anahtarlar Yönetim → Siparişler → Mağaza içi satın alma bölümünden girilir (meta/secrets.iap), depoya yazılmaz.
const crypto = require('crypto');
const { nanoid } = require('nanoid');

const PFX = 'swipeup.';
const DAY = 86400000;

module.exports = function iap(app, ctx) {
  const { store, auth, eco, notify, emitTo, limited, admin: A } = ctx;
  const now = () => Date.now();
  const GB = process.env.IAP_GOOGLE_BASE || 'https://androidpublisher.googleapis.com';
  const AB = process.env.IAP_APPLE_BASE || 'https://api.storekit.itunes.apple.com';
  const ABS = process.env.IAP_APPLE_SANDBOX || 'https://api.storekit-sandbox.itunes.apple.com';
  const sec = () => store.get('meta', 'secrets')?.iap || {};
  const pkg = () => sec().google?.pkg || process.env.ANDROID_PACKAGE || 'app.swipeup.twa';
  const bundle = () => sec().apple?.bundleId || process.env.IOS_BUNDLE || 'app.swipeup.ios';
  const b64u = (x) => Buffer.from(x).toString('base64url');
  const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });

  // Satılan ürünler: mağazadaki jeton paketleri ve SwipeUp+ süreleri
  const catalog = () => { const s = eco.get(); return [...s.coinPacks.map((p) => ({ sku: PFX + p.id, id: p.id, kind: 'coins', title: `${p.coins} jeton` })), ...s.plusPlans.map((p) => ({ sku: PFX + p.id, id: p.id, kind: 'plus', title: `SwipeUp+ ${p.days} gün` }))]; };
  const bySku = (sku) => catalog().find((c) => c.sku === sku) || null;

  // ---- Google Play Developer API (hizmet hesabı ile) ----
  let gTok = null;
  async function googleToken(sa = sec().google?.sa) {
    if (!sa) throw fail('Google Play hizmet hesabı tanımlı değil.', 503);
    if (gTok && gTok.email === sa.client_email && gTok.exp > now() + 60000) return gTok.t;
    const iat = Math.floor(now() / 1000); const aud = sa.token_uri || 'https://oauth2.googleapis.com/token';
    const unsigned = `${b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud, iat, exp: iat + 3600 }))}`;
    const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), sa.private_key).toString('base64url');
    const r = await fetch(process.env.IAP_GOOGLE_TOKEN || aud, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw fail(`Google girişi başarısız: ${j.error_description || j.error || r.status}`, 502);
    gTok = { t: j.access_token, exp: now() + (j.expires_in || 3600) * 1000, email: sa.client_email }; return gTok.t;
  }
  async function gApi(p, method = 'GET') {
    const t = await googleToken();
    const r = await fetch(`${GB}/androidpublisher/v3/applications/${encodeURIComponent(pkg())}${p}`, { method, headers: { Authorization: `Bearer ${t}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: method === 'POST' ? '{}' : undefined });
    const txt = await r.text(); let j = {}; try { j = txt ? JSON.parse(txt) : {}; } catch { /* boş yanıt */ }
    if (!r.ok) throw fail(r.status === 404 || r.status === 410 ? 'Satın alma Google Play’de bulunamadı.' : `Google Play: ${j.error?.message || r.status}`, r.status === 404 || r.status === 410 ? 400 : 502);
    return j;
  }

  // ---- App Store Server API (uygulama içi satın alma anahtarı ile) ----
  function appleJwt(a = sec().apple) {
    if (!a?.keyId || !a?.issuerId || !a?.key) throw fail('App Store anahtarı tanımlı değil.', 503);
    const iat = Math.floor(now() / 1000);
    const unsigned = `${b64u(JSON.stringify({ alg: 'ES256', kid: a.keyId, typ: 'JWT' }))}.${b64u(JSON.stringify({ iss: a.issuerId, iat, exp: iat + 1800, aud: 'appstoreconnect-v1', bid: a.bundleId || bundle() }))}`;
    return `${unsigned}.${crypto.sign('sha256', Buffer.from(unsigned), { key: a.key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
  }
  async function appleTx(id) { // önce gerçek ortam, bulunamazsa deneme (sandbox) ortamı: Apple incelemesi deneme ortamında satın alır
    for (const base of [AB, ABS]) {
      const r = await fetch(`${base}/inApps/v1/transactions/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${appleJwt()}` } });
      if (r.status === 404) continue;
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw fail(`App Store: ${j.errorMessage || r.status}`, r.status === 401 ? 503 : 502);
      const payload = JSON.parse(Buffer.from(String(j.signedTransactionInfo || '').split('.')[1] || '', 'base64url').toString() || '{}'); // doğrudan Apple'dan (TLS) geldi
      return { ...payload, sandbox: base === ABS };
    }
    throw fail('Satın alma App Store’da bulunamadı.');
  }

  // ---- Tanımlama: aynı satın alma bir kez ----
  const locks = new Map();
  const once = (key, fn) => { if (locks.has(key)) return locks.get(key); const p = Promise.resolve().then(fn).finally(() => locks.delete(key)); locks.set(key, p); return p; };
  const keyOf = (channel, ref) => `${channel}:${crypto.createHash('sha256').update(String(ref)).digest('hex').slice(0, 40)}`;
  function grant(uid, item, channel, ref, extra = {}) {
    const id = keyOf(channel, ref); const ex = store.get('iap', id);
    if (ex) { if (ex.userId !== uid) throw fail('Bu satın alma başka bir hesaba tanımlı.', 409); return { dup: true, order: store.get('orders', ex.orderId) }; }
    const p = eco.product(item.id); if (!p) throw fail('Ürün artık satılmıyor.', 410);
    const by = channel === 'google' ? 'Google Play' : 'App Store';
    const o = store.put('orders', { id: nanoid(10), code: `${channel === 'google' ? 'GP' : 'AS'}-${nanoid(8).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`, userId: uid, productId: item.id, kind: item.kind, title: item.title, amount: p.price, ...(item.kind === 'coins' ? { coins: p.coins } : {}),
      status: 'approved', channel, test: !!extra.test, at: now(), approvedAt: now(), closedAt: now(), by });
    if (item.kind === 'coins') eco.addCoins(uid, p.coins, 'purchase', { ref: o.id, channel }); else eco.grantPlus(uid, p.days);
    if (!extra.test) {
      const d = new Date(now() + 3 * 3600000).toISOString().slice(0, 10);
      store.put('adm_ledger', { id: nanoid(10), type: 'gelir', amount: p.price, date: d, category: item.kind === 'plus' ? 'Abonelik' : 'Uygulama içi satış', note: `${o.code} · ${item.title} · ${by} · @${store.get('users', uid)?.username || '?'}`, currency: 'TRY', by, auto: true, orderId: o.id, createdAt: now() });
    }
    store.put('iap', { id, userId: uid, sku: item.sku, kind: item.kind, orderId: o.id, channel, test: !!extra.test, status: 'granted', at: now(), ...(extra.token ? { token: extra.token } : {}), ...(extra.storeOrder ? { storeOrder: extra.storeOrder } : {}) });
    notify(uid, { type: 'order', text: item.kind === 'plus' ? '✨ Satın alman tamamlandı! SwipeUp+ üyeliğin aktif.' : `🪙 Satın alman tamamlandı! ${item.title} hesabına eklendi.`, title: 'SwipeUp', url: '/#/store' });
    emitTo(uid, 'wallet', {});
    return { dup: false, order: o };
  }
  const out = (uid, r) => { const u = store.get('users', uid); return { ok: true, dup: r.dup, coins: u?.coins || 0, plusUntil: u?.plusUntil || null, title: r.order?.title || '', orderId: r.order?.id || null }; };

  // ---- Telefon uç noktaları ----
  app.get('/api/iap/catalog', auth, (req, res) => res.json({ items: catalog(), google: !!sec().google?.sa, apple: !!sec().apple?.key }));
  app.post('/api/iap/google', auth, ctx.wrap(async (req, res) => {
    if (limited(`iapg:${req.user.id}`, 30, 600000)) return res.status(429).json({ error: 'Biraz yavaş.' });
    const sku = String(req.body?.sku || ''); const token = String(req.body?.token || '').slice(0, 600);
    const item = bySku(sku); if (!item || token.length < 10) return res.status(400).json({ error: 'Satın alma bilgisi eksik.' });
    try {
      const r = await once(keyOf('google', token), async () => {
        const ex = store.get('iap', keyOf('google', token)); if (ex) return grant(req.user.id, item, 'google', token);
        const j = await gApi(`/purchases/products/${encodeURIComponent(sku)}/tokens/${encodeURIComponent(token)}`);
        if (j.purchaseState !== 0) throw fail(j.purchaseState === 2 ? 'Ödeme henüz tamamlanmadı. Tamamlanınca jetonların eklenecek.' : 'Bu satın alma iptal edilmiş.');
        if (j.consumptionState === 1) throw fail('Bu satın alma daha önce kullanılmış.', 409);
        const g = grant(req.user.id, item, 'google', token, { test: j.purchaseType === 0, token, storeOrder: j.orderId });
        gApi(`/purchases/products/${encodeURIComponent(sku)}/tokens/${encodeURIComponent(token)}:consume`, 'POST').catch((e) => console.error('[iap] tüketme', e.message)); // yeniden satın alınabilsin
        return g;
      });
      res.json(out(req.user.id, r));
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  }));
  app.post('/api/iap/apple', auth, ctx.wrap(async (req, res) => {
    if (limited(`iapa:${req.user.id}`, 30, 600000)) return res.status(429).json({ error: 'Biraz yavaş.' });
    const tid = String(req.body?.transactionId || '').replace(/[^\d]/g, '').slice(0, 40);
    if (tid.length < 5) return res.status(400).json({ error: 'Satın alma bilgisi eksik.' });
    try {
      const r = await once(keyOf('apple', tid), async () => {
        const ex = store.get('iap', keyOf('apple', tid)); if (ex) return grant(req.user.id, bySku(ex.sku) || { id: '', sku: ex.sku }, 'apple', tid);
        const t = await appleTx(tid);
        if (t.bundleId !== bundle()) throw fail('Bu satın alma SwipeUp’a ait değil.');
        if (t.revocationDate) throw fail('Bu satın alma iade edilmiş.');
        const item = bySku(t.productId); if (!item) throw fail('Ürün bulunamadı.');
        return grant(req.user.id, item, 'apple', tid, { test: !!t.sandbox, storeOrder: t.originalTransactionId });
      });
      res.json(out(req.user.id, r));
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  }));

  // ---- İade edilen Google satın almaları: jeton ya da üyelik geri alınır ----
  async function voided() {
    if (!sec().google?.sa) return;
    const s = store.get('meta', 'iap_void') || { id: 'iap_void', since: now() - 25 * DAY };
    const j = await gApi(`/purchases/voidedpurchases?startTime=${s.since}&maxResults=1000`);
    for (const v of j.voidedPurchases || []) {
      const doc = store.get('iap', keyOf('google', v.purchaseToken)); if (!doc || doc.status === 'refunded') continue;
      const o = store.get('orders', doc.orderId); const u = store.get('users', doc.userId); if (!u) continue;
      if (doc.kind === 'coins' && o?.coins) eco.addCoins(u.id, -Math.min(u.coins || 0, o.coins), 'refund', { ref: o.id, channel: 'google' });
      if (doc.kind === 'plus') { const p = eco.product(o?.productId); if (p?.days) store.update('users', u.id, { plusUntil: Math.max(now(), (u.plusUntil || 0) - p.days * DAY) }); }
      store.update('iap', doc.id, { status: 'refunded', refundedAt: now() }); if (o) store.update('orders', o.id, { status: 'refunded', note: 'Google Play iadesi' });
      notify(u.id, { type: 'order', text: `${o?.title || 'Satın alman'} Google Play üzerinden iade edildi; hesabından düşüldü.`, title: 'SwipeUp', url: '/#/store' });
    }
    store.put('meta', { ...s, since: now() - DAY, at: now() });
  }
  const tv = setInterval(() => voided().catch((e) => console.error('[iap] iade kontrolü', e.message)), 6 * 3600000); tv.unref?.();

  // ---- Yönetim (yalnız sahip) ----
  const gate = [A.adminAuth, A.owner];
  const audit = (req, text, det) => A.audit?.(req.admin, text, null, det);
  const status = () => { const g = sec().google; const a = sec().apple; const list = store.filter('iap', () => true).sort((x, y) => y.at - x.at);
    return { skus: catalog(), google: { on: !!g?.sa, pkg: pkg(), email: g?.sa?.client_email || null, at: g?.at || null }, apple: { on: !!a?.key, bundleId: bundle(), keyId: a?.keyId || null, issuerId: a?.issuerId || null, at: a?.at || null },
      count: list.length, recent: list.slice(0, 15).map((x) => ({ at: x.at, channel: x.channel, sku: x.sku, test: x.test, status: x.status, user: store.get('users', x.userId)?.username || '?' })) }; };
  app.get('/api/admin/iap', ...gate, (req, res) => res.json(status()));
  app.post('/api/admin/iap/google', ...gate, ctx.wrap(async (req, res) => {
    let sa; try { sa = JSON.parse(String(req.body?.json || '')); } catch { return res.status(400).json({ error: 'Hizmet hesabı dosyasının (JSON) içeriğini olduğu gibi yapıştır.' }); }
    if (sa.type !== 'service_account' || !sa.client_email || !sa.private_key) return res.status(400).json({ error: 'Bu bir Google hizmet hesabı anahtarı değil (type: service_account olmalı).' });
    const p = String(req.body?.pkg || pkg()).trim(); if (!/^[a-z][\w]*(\.[a-z][\w]*)+$/i.test(p)) return res.status(400).json({ error: 'Paket adı geçersiz (ör. app.swipeup.twa).' });
    try { gTok = null; await googleToken({ client_email: sa.client_email, private_key: sa.private_key, token_uri: sa.token_uri }); } catch (e) { return res.status(400).json({ error: e.message }); }
    store.update('meta', 'secrets', { iap: { ...sec(), google: { sa: { client_email: sa.client_email, private_key: sa.private_key, token_uri: sa.token_uri }, pkg: p, at: now() } } });
    audit(req, 'Google Play satın alma anahtarını kaydetti', sa.client_email); res.json(status());
  }));
  app.post('/api/admin/iap/apple', ...gate, (req, res) => {
    const b = req.body || {}; const a = { keyId: String(b.keyId || '').trim(), issuerId: String(b.issuerId || '').trim(), key: String(b.key || '').trim(), bundleId: String(b.bundleId || bundle()).trim() };
    if (!/^[A-Z0-9]{10}$/.test(a.keyId)) return res.status(400).json({ error: 'Anahtar kimliği (Key ID) 10 karakter olmalı.' });
    if (!/^[0-9a-f-]{36}$/i.test(a.issuerId)) return res.status(400).json({ error: 'Issuer ID geçersiz.' });
    try { crypto.createPrivateKey(a.key); appleJwt(a); } catch { return res.status(400).json({ error: '.p8 anahtar dosyasının içeriğini (BEGIN PRIVATE KEY satırlarıyla) yapıştır.' }); }
    store.update('meta', 'secrets', { iap: { ...sec(), apple: { ...a, at: now() } } });
    audit(req, 'App Store satın alma anahtarını kaydetti', a.keyId); res.json(status());
  });
  app.delete('/api/admin/iap/:kind', ...gate, (req, res) => {
    const k = req.params.kind === 'apple' ? 'apple' : 'google'; store.update('meta', 'secrets', { iap: { ...sec(), [k]: null } }); if (k === 'google') gTok = null;
    audit(req, `${k === 'google' ? 'Google Play' : 'App Store'} satın alma anahtarını kaldırdı`); res.json(status());
  });
  ctx.iap = { catalog, enabled: () => ({ google: !!sec().google?.sa, apple: !!sec().apple?.key }) };
};
