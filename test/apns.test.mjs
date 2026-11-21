// iPhone uygulaması bildirimleri (APNs): JWT imzası, istek başlıkları, geçersiz jeton, cihaz jetonu kaydı
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
test('APNs: imzalı istek gider, geçersiz jeton 410 olarak döner, jeton kaydedilir', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const got = [];
  const srv = http2.createServer();
  srv.on('stream', (st, h) => {
    let b = ''; st.on('data', (d) => { b += d; });
    st.on('end', () => {
      const [hd, pl, sig] = h.authorization.replace('bearer ', '').split('.');
      got.push({ ok: crypto.verify('sha256', Buffer.from(`${hd}.${pl}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')), path: h[':path'], topic: h['apns-topic'], body: JSON.parse(b) });
      if (h[':path'].includes('dead')) { st.respond({ ':status': 400 }); st.end(JSON.stringify({ reason: 'BadDeviceToken' })); } else { st.respond({ ':status': 200 }); st.end(); }
    });
  });
  await new Promise((r) => srv.listen(0, r));
  process.env.APNS_HOST = `http://127.0.0.1:${srv.address().port}`;
  const db = {}; const col = (c) => (db[c] ||= new Map());
  const store = { get: (c, id) => col(c).get(id) || null, put: (c, d) => { col(c).set(d.id, { ...d }); return d; }, filter: (c, f) => [...col(c).values()].filter(f), del: (c, id) => col(c).delete(id) };
  const L = require('../server/apns.js'); const A = L.create(store);
  assert.equal(A.ready(), false);
  store.put('meta', { id: 'secrets', apns: { keyId: 'ABC123DEFG', teamId: 'TEAM123456', key: privateKey.export({ type: 'pkcs8', format: 'pem' }), bundle: 'app.swipeup.ios' } });
  await A.send({ token: 'aabbcc', env: 'sandbox' }, { title: 'Ayşe', body: 'Merhaba', url: '/#/chat/1', tag: 'u1:message' });
  assert.ok(got[0].ok); assert.equal(got[0].topic, 'app.swipeup.ios'); assert.equal(got[0].path, '/3/device/aabbcc');
  assert.deepEqual(got[0].body.aps.alert, { title: 'Ayşe', body: 'Merhaba' }); assert.equal(got[0].body.url, '/#/chat/1');
  await assert.rejects(() => A.send({ token: 'dead', env: 'production' }, { title: 'x' }), (e) => e.statusCode === 410);
  const routes = {}; const reg = (m) => (p, ...h) => { routes[`${m} ${p}`] = h[h.length - 1]; };
  const ok = (q, r, n) => n(); L.routes({ get: reg('GET'), post: reg('POST'), delete: reg('DELETE') }, { store, auth: ok, admin: { adminAuth: ok, owner: ok }, apns: A, limited: () => false });
  let code = 200; const res = { status(c) { code = c; return res; }, json() {} };
  routes['POST /api/push/apns']({ user: { id: 'u1' }, body: { token: 'AABBCCDDEEFF00112233445566778899', env: 'sandbox' } }, res);
  assert.equal(code, 200); assert.equal(store.filter('pushSubs', (s) => s.apns?.token === 'aabbccddeeff00112233445566778899').length, 1);
  A.reset(); srv.close();
});
