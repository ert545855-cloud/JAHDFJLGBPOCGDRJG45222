// Sepet ve sepet kampanyaları: web'de (havale) indirim fiyata uygulanır, uygulamada (mağaza satın alması) hediye olarak verilir
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { startServer, client, register, freePort } from './helpers.mjs';

const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
let mock; let srv; let api;
const dow = new Date(Date.now() + 3 * 3600000).getUTCDay(); // bugün (Türkiye saati)

before(async () => {
  const port = await freePort(); const base = `http://127.0.0.1:${port}`;
  mock = http.createServer((req, res) => { // Google Play taklidi: "good" ile başlayan her satın alma geçerli
    const send = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(o ? JSON.stringify(o) : ''); };
    if (req.url === '/token') return send(200, { access_token: 'gtok', expires_in: 3600 });
    const g = req.url.match(/\/purchases\/products\/[^/]+\/tokens\/([^/:]+)(:consume)?$/);
    if (g) return g[2] ? send(204) : g[1].startsWith('good') ? send(200, { purchaseState: 0, consumptionState: 0, orderId: `GPA.${g[1]}`, ...(g[1].includes('qty3') ? { quantity: 3 } : {}) }) : send(404, { error: { message: 'yok' } });
    if (req.url.includes('voidedpurchases')) return send(200, {});
    send(404, {});
  });
  await new Promise((r) => mock.listen(port, r));
  const seed = {
    settings: [{ id: 'economy', bank: { iban: 'TR000000000000000000000001', name: 'SwipeUp Test' } }, { id: 'cart_promo', list: [{ id: 'k1', title: 'Test kampanyası', days: [dow], minItems: 2, pct: 20, on: true }] }],
    meta: [{ id: 'secrets', iap: { google: { pkg: 'app.swipeup.twa', sa: { client_email: 't@t.iam.gserviceaccount.com', private_key: rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: `${base}/token` } } } }],
  };
  srv = await startServer({ seed, env: { IAP_GOOGLE_BASE: base } });
  api = client(srv.url);
});
after(async () => { await srv?.stop(); mock?.close(); });

test('sepet: ekle, adet değiştir, kampanya 2 üründen itibaren uygulanır', async () => {
  const a = await register(api);
  let r = await api.post('/api/cart/items', { id: 'j100' }, { token: a.token });
  assert.equal(r.status, 200); assert.equal(r.body.count, 1); assert.equal(r.body.promo, null); assert.equal(r.body.next.pct, 20);
  r = await api.post('/api/cart/items', { id: 'j100' }, { token: a.token });
  assert.equal(r.body.count, 2); assert.equal(r.body.promo.pct, 20); assert.equal(r.body.subtotal, 200); assert.equal(r.body.total, 160);
  assert.equal((await api.post('/api/cart/items', { id: 'yok' }, { token: a.token })).status, 400);
  r = await api.get('/api/cart', { token: a.token }); assert.equal(r.body.items[0].qty, 2);
});

test('web: sepet siparişi indirimli kurulur, tek kodla ödenir, sözleşmede kampanya yazar', async () => {
  const a = await register(api);
  await api.post('/api/cart/items', { id: 'j100' }, { token: a.token });
  await api.post('/api/cart/items', { id: 'p30' }, { token: a.token });
  assert.equal((await api.post('/api/cart/checkout', {}, { token: a.token })).status, 400); // onaysız olmaz
  const r = await api.post('/api/cart/checkout', { accept: { pre: true, waive: true } }, { token: a.token });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.match(r.body.code, /^SP-/);
  assert.equal(r.body.orders.length, 2); assert.equal(r.body.total, 160); assert.ok(r.body.bank.iban);
  const d = await api.get(`/api/orders/${r.body.orders[0].id}/docs`, { token: a.token });
  assert.ok(d.body.pre.includes('sepet kampanyası'));
  assert.equal((await api.get('/api/cart', { token: a.token })).body.count, 0);
  const p = await api.post(`/api/cart/orders/${r.body.code}/paid`, { sender: 'Deneme Kişi' }, { token: a.token });
  assert.equal(p.body.status, 'paid');
  const b = await register(api);
  assert.equal((await api.get(`/api/cart/orders/${r.body.code}`, { token: b.token })).status, 404);
});

test('uygulama: mağazadan alınan 2 ürüne hediye bir kez verilir', async () => {
  const a = await register(api);
  const g1 = await api.post('/api/iap/google', { sku: 'swipeup.j100', token: 'good-cart-1' }, { token: a.token });
  const g2 = await api.post('/api/iap/google', { sku: 'swipeup.j50', token: 'good-cart-2' }, { token: a.token });
  assert.equal(g1.status, 200, JSON.stringify(g1.body)); assert.ok(g1.body.orderId && g2.body.orderId);
  const c0 = g2.body.coins;
  const one = await api.post('/api/cart/bonus', { orderIds: [g1.body.orderId] }, { token: a.token });
  assert.equal(one.body.bonus, null);
  const r = await api.post('/api/cart/bonus', { orderIds: [g1.body.orderId, g2.body.orderId] }, { token: a.token });
  assert.equal(r.status, 200); assert.equal(r.body.bonus.coins, 30); // %20 × (100 + 50)
  assert.equal((await api.get('/api/store', { token: a.token })).body.coins, c0 + 30);
  const again = await api.post('/api/cart/bonus', { orderIds: [g1.body.orderId, g2.body.orderId] }, { token: a.token });
  assert.equal(again.body.bonus, null);
  const b = await register(api);
  assert.equal((await api.post('/api/cart/bonus', { orderIds: [g1.body.orderId, g2.body.orderId] }, { token: b.token })).body.bonus, null);
});

test('uygulama: adetli satın alma tek seferde tanımlanır ve kampanyada adet sayılır', async () => {
  const a = await register(api);
  const r = await api.post('/api/iap/google', { sku: 'swipeup.j100', token: 'good-qty3-1' }, { token: a.token });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.qty, 3); assert.equal(r.body.coins, 300);
  const st = await api.get('/api/store', { token: a.token });
  const o = st.body.orders.find((x) => x.id === r.body.orderId); assert.equal(o.amount, 300); assert.match(o.title, /× 3/);
  const b = await api.post('/api/cart/bonus', { orderIds: [r.body.orderId] }, { token: a.token });
  assert.equal(b.body.bonus.coins, 60); // tek sipariş ama 3 adet: %20 × 300
});
