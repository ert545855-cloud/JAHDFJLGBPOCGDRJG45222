// Mağaza iadesi: harcanmış jetonlar borç olur, borç kapanana kadar harcama yok, hediye alanlar incelemeye düşer
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
function setup() {
  const db = {}; const col = (c) => (db[c] ||= new Map());
  const store = { get: (c, id) => col(c).get(id) || null, put: (c, d) => { col(c).set(d.id, { ...d }); return { ...d }; }, update: (c, id, p) => { const x = { ...col(c).get(id), ...p }; col(c).set(id, x); return { ...x }; },
    filter: (c, f) => [...col(c).values()].filter(f), find: (c, f) => [...col(c).values()].find(f) || null, all: (c) => [...col(c).values()], del: (c, id) => col(c).delete(id) };
  const eco = require('../server/economy.js')(store);
  const routes = {}; const reg = (m) => (p, ...h) => { routes[`${m} ${p}`] = h[h.length - 1]; };
  const app = { get: reg('GET'), post: reg('POST'), put: reg('PUT'), delete: reg('DELETE') };
  const ok = (q, r, n) => n(); const notes = [];
  const ctx = { store, eco, auth: ok, notify: (u, n) => notes.push([u, n.text]), emitTo: () => {}, limited: () => false, wrap: (f) => f, admin: { adminAuth: ok, owner: ok, audit: () => {} } };
  require('../server/iap.js')(app, ctx);
  const call = (k, req) => { let code = 200; let body; const res = { status(s) { code = s; return res; }, json(j) { body = j; } }; routes[k]({ admin: { username: 'a' }, query: {}, ...req }, res); return { code, body }; };
  return { store, eco, ctx, call, notes };
}

test('iade: harcanmış jeton borç olur, yeni jeton önce borcu kapatır', () => {
  const { store, eco, ctx } = setup();
  store.put('users', { id: 'b', username: 'b' }); store.put('users', { id: 's', username: 's' });
  store.put('orders', { id: 'o1', code: 'GP-1', userId: 'b', kind: 'coins', coins: 100, amount: 100, title: '100 jeton', status: 'approved', channel: 'google', at: Date.now() - 1000 });
  eco.addCoins('b', 100, 'purchase', { ref: 'o1' });
  store.put('iap', { id: 'k1', userId: 'b', kind: 'coins', orderId: 'o1', channel: 'google', status: 'granted' });
  const pay = eco.spend('b', 60, 'gift', {}, { paidFirst: true }); eco.earn('s', pay.paid * 0.6, 'gift', { fromId: 'b' });
  assert.deepEqual(ctx.iapRefund(store.get('iap', 'k1'), 'Google Play'), { taken: 40, debt: 60 });
  assert.equal(store.get('users', 'b').coins, 0); assert.equal(store.get('users', 'b').coinDebt, 60);
  assert.equal(store.get('orders', 'o1').status, 'refunded');
  assert.equal(ctx.iapRefund(store.get('iap', 'k1'), 'Google Play'), null);
  assert.equal(eco.spend('b', 0, 'x') !== false, true); // sıfır harcama engellenmez
  eco.addCoins('b', 50, 'quest'); assert.equal(store.get('users', 'b').coins, 0); assert.equal(store.get('users', 'b').coinDebt, 10);
  assert.equal(eco.spend('b', 1, 'boost'), false);
  eco.addCoins('b', 30, 'purchase'); assert.equal(store.get('users', 'b').coins, 20); assert.equal(store.get('users', 'b').coinDebt, 0);
  assert.ok(eco.spend('b', 5, 'boost'));
});

test('iade incelemesi: hediyeyi alanın kazancından bir kez düşülür', () => {
  const { store, eco, ctx, call } = setup();
  store.put('users', { id: 'b', username: 'b' }); store.put('users', { id: 's', username: 's' });
  store.put('orders', { id: 'o1', userId: 'b', kind: 'coins', coins: 100, amount: 100, title: '100 jeton', status: 'approved', channel: 'apple', at: Date.now() - 1000 });
  eco.addCoins('b', 100, 'purchase'); store.put('iap', { id: 'k1', userId: 'b', kind: 'coins', orderId: 'o1', channel: 'apple', status: 'granted' });
  const pay = eco.spend('b', 100, 'gift', {}, { paidFirst: true }); eco.earn('s', pay.paid * 0.6, 'gift', { fromId: 'b' });
  ctx.iapRefund(store.get('iap', 'k1'), 'App Store');
  const list = call('GET /api/admin/refundreviews', {}).body; assert.equal(list.open, 1);
  const id = list.items[0].id; assert.equal(list.items[0].recipients[0].amount, 60);
  assert.equal(call('POST /api/admin/refundreviews/:id', { params: { id }, body: { action: 'deduct', userId: 's' } }).body.recipients[0].deducted, 60);
  assert.equal(store.get('users', 's').earnings, 0);
  assert.equal(call('POST /api/admin/refundreviews/:id', { params: { id }, body: { action: 'deduct', userId: 's' } }).code, 409);
  call('POST /api/admin/refundreviews/:id', { params: { id }, body: { action: 'forgive' } }); assert.equal(store.get('users', 'b').coinDebt, 0);
  assert.equal(call('POST /api/admin/refundreviews/:id', { params: { id }, body: { action: 'close' } }).body.status, 'closed');
});
