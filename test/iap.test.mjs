// Uygulama içi satın alma: Google Play ve App Store sunucuları taklit edilir; jeton/üyelik bir kez tanımlanmalı
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { startServer, client, register, freePort } from './helpers.mjs';

const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const seen = { consumed: [], appleAuth: 0 };
let mock; let base; let srv; let api;

function mockStores(port) {
  return http.createServer((req, res) => {
    const u = new URL(req.url, `http://x:${port}`); const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(obj ? JSON.stringify(obj) : ''); };
    if (u.pathname === '/token') return send(200, { access_token: 'gtok', expires_in: 3600 });
    const g = u.pathname.match(/^\/androidpublisher\/v3\/applications\/app\.swipeup\.twa\/purchases\/products\/([^/]+)\/tokens\/([^/:]+)(:consume)?$/);
    if (g) {
      if (req.headers.authorization !== 'Bearer gtok') return send(401, { error: { message: 'yetkisiz' } });
      const tok = decodeURIComponent(g[2]);
      if (g[3]) { seen.consumed.push(tok); return send(204); }
      if (tok.startsWith('good')) return send(200, { purchaseState: 0, consumptionState: 0, orderId: `GPA.${tok}`, ...(tok.includes('test') ? { purchaseType: 0 } : {}) });
      if (tok.startsWith('pending')) return send(200, { purchaseState: 2, consumptionState: 0 });
      return send(404, { error: { message: 'yok' } });
    }
    if (u.pathname.startsWith('/androidpublisher/v3/applications/app.swipeup.twa/purchases/voidedpurchases')) return send(200, { voidedPurchases: [] });
    const a = u.pathname.match(/^\/(prod|sbx)\/inApps\/v1\/transactions\/(\d+)$/);
    if (a) {
      const [h, p, s] = String(req.headers.authorization || '').replace('Bearer ', '').split('.');
      const ok = crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key: ec.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s || '', 'base64url'));
      if (!ok || JSON.parse(Buffer.from(p, 'base64url')).aud !== 'appstoreconnect-v1') return send(401, { errorMessage: 'imza' });
      seen.appleAuth++;
      const id = a[2]; const env = a[1];
      const tx = { '100000001': ['prod', 'app.swipeup.ios', 'swipeup.p30'], '200000002': ['sbx', 'app.swipeup.ios', 'swipeup.j100'], '300000003': ['prod', 'com.baska.uygulama', 'swipeup.j100'] }[id];
      if (!tx || tx[0] !== env) return send(404, { errorMessage: 'yok' });
      const jws = `e30.${Buffer.from(JSON.stringify({ transactionId: id, originalTransactionId: id, bundleId: tx[1], productId: tx[2] })).toString('base64url')}.sig`;
      return send(200, { signedTransactionInfo: jws });
    }
    send(404, {});
  });
}

before(async () => {
  const port = await freePort(); mock = mockStores(port); await new Promise((r) => mock.listen(port, r)); base = `http://127.0.0.1:${port}`;
  const seed = { meta: [{ id: 'secrets', iap: {
    google: { pkg: 'app.swipeup.twa', sa: { client_email: 'test@test.iam.gserviceaccount.com', private_key: rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: `${base}/token` } },
    apple: { keyId: 'ABCDEFGHIJ', issuerId: '12345678-1234-1234-1234-123456789012', key: ec.privateKey.export({ type: 'pkcs8', format: 'pem' }), bundleId: 'app.swipeup.ios' },
  } }] };
  srv = await startServer({ seed, env: { IAP_GOOGLE_BASE: base, IAP_APPLE_BASE: `${base}/prod`, IAP_APPLE_SANDBOX: `${base}/sbx` } });
  api = client(srv.url);
});
after(async () => { await srv?.stop(); mock?.close(); });

test('ürün kataloğu mağaza kimlikleriyle gelir', async () => {
  const a = await register(api);
  const r = await api.get('/api/iap/catalog', { token: a.token });
  assert.equal(r.status, 200); assert.ok(r.body.google && r.body.apple);
  assert.ok(r.body.items.some((i) => i.sku === 'swipeup.j100' && i.kind === 'coins'));
  assert.ok(r.body.items.some((i) => i.sku === 'swipeup.p30' && i.kind === 'plus'));
});

test('Google Play: jeton bir kez tanımlanır, satın alma tüketilir', async () => {
  const a = await register(api); const b = await register(api);
  const coins0 = (await api.get('/api/store', { token: a.token })).body.coins;
  const r1 = await api.post('/api/iap/google', { sku: 'swipeup.j100', token: 'good-abc-123' }, { token: a.token });
  assert.equal(r1.status, 200, JSON.stringify(r1.body)); assert.equal(r1.body.coins, coins0 + 100); assert.equal(r1.body.dup, false);
  const r2 = await api.post('/api/iap/google', { sku: 'swipeup.j100', token: 'good-abc-123' }, { token: a.token });
  assert.equal(r2.status, 200); assert.equal(r2.body.dup, true); assert.equal(r2.body.coins, coins0 + 100);
  const r3 = await api.post('/api/iap/google', { sku: 'swipeup.j100', token: 'good-abc-123' }, { token: b.token });
  assert.equal(r3.status, 409);
  await new Promise((r) => setTimeout(r, 300)); assert.ok(seen.consumed.includes('good-abc-123'));
  const st = await api.get('/api/store', { token: a.token });
  const o = st.body.orders.find((x) => x.channel === 'google'); assert.ok(o); assert.equal(o.status, 'approved'); assert.deepEqual(o.canRefund, []);
});

test('Google Play: bekleyen ya da sahte satın alma tanımlanmaz', async () => {
  const a = await register(api);
  assert.equal((await api.post('/api/iap/google', { sku: 'swipeup.j50', token: 'pending-xyz-1' }, { token: a.token })).status, 400);
  assert.equal((await api.post('/api/iap/google', { sku: 'swipeup.j50', token: 'fake-token-xx' }, { token: a.token })).status, 400);
  assert.equal((await api.post('/api/iap/google', { sku: 'swipeup.yok', token: 'good-zzz-999' }, { token: a.token })).status, 400);
  assert.equal((await api.get('/api/store', { token: a.token })).body.coins, 0);
});

test('App Store: üyelik tanımlanır, deneme ortamı da kabul edilir, başka uygulamanınki reddedilir', async () => {
  const a = await register(api);
  const r1 = await api.post('/api/iap/apple', { transactionId: '100000001' }, { token: a.token });
  assert.equal(r1.status, 200, JSON.stringify(r1.body)); assert.ok(r1.body.plusUntil > Date.now() + 29 * 86400000);
  const r2 = await api.post('/api/iap/apple', { transactionId: '200000002' }, { token: a.token });
  assert.equal(r2.status, 200); assert.equal(r2.body.coins, 100);
  const r3 = await api.post('/api/iap/apple', { transactionId: '300000003' }, { token: a.token });
  assert.equal(r3.status, 400);
  const r4 = await api.post('/api/iap/apple', { transactionId: '100000001' }, { token: a.token });
  assert.equal(r4.body.dup, true); assert.ok(seen.appleAuth >= 3);
});

test('giriş yapmadan satın alma doğrulanmaz', async () => {
  assert.equal((await api.post('/api/iap/google', { sku: 'swipeup.j100', token: 'good-anon-1' })).status, 401);
});
