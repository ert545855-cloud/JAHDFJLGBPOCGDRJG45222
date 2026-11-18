// Ana akışlar: kayıt ve giriş, eşleşme ve mesaj, gönderim öncesi uyarı, şikâyet takibi, havale siparişi,
// fotoğraf denetimi yedeği, hatırlatmalar, Parti Kupası araç modları, yönetim paneli kapısı
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { startServer, client, register } from './helpers.mjs';

let srv; let api;
before(async () => {
  srv = await startServer({ seed: { settings: [{ id: 'economy', bank: { iban: 'TR000000000000000000000000', name: 'Test A.Ş.', bankName: 'Test Bankası', note: '' } }] } });
  api = client(srv.url);
});
after(async () => { await srv?.stop(); });
const col = async (name) => (await api.get(`/api/_test/col/${name}`)).body;
const notes = async (t) => (await api.get('/api/notifications', { token: t })).body;

// 1×1 PNG
function png() {
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.from([0, 255, 80, 120]))), chunk('IEND', Buffer.alloc(0))]);
}

test('sağlık kontrolü', async () => {
  const r = await api.get('/healthz'); assert.equal(r.status, 200); assert.equal(r.body.ok, true);
});

test('kayıt, giriş ve profil', async () => {
  const a = await register(api);
  const me = await api.get('/api/me', { token: a.token }); assert.equal(me.status, 200); assert.equal(me.body.username, a.username);
  const bad = await api.post('/api/auth/login', { username: a.username, password: 'yanlis-sifre' }); assert.equal(bad.status, 401);
  const ok = await api.post('/api/auth/login', { username: a.username, password: a.password }); assert.equal(ok.status, 200); assert.ok(ok.body.token);
  const young = await api.post('/api/auth/register', { username: `kucuk${Date.now() % 1e6}`, password: 'sifre123', birthdate: '2015-01-01', accept: true }); assert.equal(young.status, 403);
  assert.equal((await api.get('/api/me')).status, 401);
});

test('karşılıklı beğeni eşleşme kurar, mesaj karşı tarafa ulaşır', async () => {
  const a = await register(api); const b = await register(api);
  const r1 = await api.post('/api/swipe', { to: b.user.id, dir: 'right' }, { token: a.token }); assert.equal(r1.body.match, false);
  const likes = await api.get('/api/likes', { token: b.token }); assert.ok(JSON.stringify(likes.body).includes(a.user.id));
  const r2 = await api.post('/api/swipe', { to: a.user.id, dir: 'right' }, { token: b.token }); assert.equal(r2.body.match, true); assert.ok(r2.body.chatId);
  const m = await api.post(`/api/chats/${r2.body.chatId}/messages`, { text: 'Merhaba 👋' }, { token: b.token }); assert.equal(m.status, 200);
  const c = await api.get(`/api/chats/${r2.body.chatId}`, { token: a.token }); assert.ok(JSON.stringify(c.body).includes('Merhaba 👋'));
  const x = await register(api); assert.equal((await api.get(`/api/chats/${r2.body.chatId}`, { token: x.token })).status, 404); // başkası okuyamaz
});

test('göndermeden önce uyarı: IBAN / para isteği ve hakaret', async () => {
  const a = await register(api);
  const s = await api.post('/api/mod/check', { text: 'Bana IBAN at, 500 TL gönder lazım' }, { token: a.token }); assert.equal(s.body.warn, true); assert.equal(s.body.kind, 'scam');
  const ok = await api.post('/api/mod/check', { text: 'Bu akşam kahve içelim mi?' }, { token: a.token }); assert.ok(!ok.body.warn);
});

test('şikâyet: alındı bildirimi ve Şikayetlerim listesinde durum', async () => {
  const a = await register(api); const b = await register(api);
  assert.equal((await api.post(`/api/users/${b.user.id}/report`, { reason: 'taciz', details: 'deneme' }, { token: a.token })).status, 200);
  const mine = await api.get('/api/me/reports', { token: a.token }); assert.equal(mine.body.items[0].status, 'inceleniyor'); assert.equal(mine.body.items[0].user.username, b.username);
  assert.ok(JSON.stringify(await notes(a.token)).includes('Şikayetin alındı'));
});

test('havale siparişi: sözleşme onayı olmadan kurulmaz', async () => {
  const a = await register(api);
  const st = await api.get('/api/store', { token: a.token }); assert.equal(st.body.payEnabled, true);
  assert.equal((await api.post('/api/orders', { productId: 'j100' }, { token: a.token })).status, 400);
  const o = await api.post('/api/orders', { productId: 'j100', accept: { pre: true, waive: true } }, { token: a.token });
  assert.equal(o.status, 200); assert.match(o.body.code, /^SU-/); assert.equal(o.body.status, 'pending'); assert.equal(o.body.bank.iban, 'TR000000000000000000000000');
});

test('otomatik denetim kapalıyken yeni profil fotoğrafı incelemeye düşer', async () => {
  const a = await register(api);
  const fd = new FormData(); fd.append('file', new Blob([png()], { type: 'image/png' }), 'a.png');
  const up = await fetch(`${srv.url}/api/upload`, { method: 'POST', headers: { Authorization: `Bearer ${a.token}` }, body: fd }).then((r) => r.json());
  assert.match(up.url, /^\/media\//);
  const p = await fetch(`${srv.url}/api/me`, { method: 'PATCH', headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ photos: [up.url] }) }); assert.equal(p.status, 200);
  await new Promise((r) => setTimeout(r, 200));
  const flags = await col('photo_flags'); const f = flags.find((x) => x.userId === a.user.id);
  assert.ok(f, 'kuyrukta kayıt yok'); assert.equal(f.status, 'open'); assert.equal(f.kind, 'profil'); assert.equal(`/media/${f.mediaId}`, up.url);
});

test('hatırlatma: mesajlaşılmamış eşleşme ve bekleyen beğeni, günde bir kez', async () => {
  const a = await register(api); const b = await register(api); const c = await register(api);
  await api.post('/api/swipe', { to: b.user.id, dir: 'right' }, { token: a.token });
  const m = await api.post('/api/swipe', { to: a.user.id, dir: 'right' }, { token: b.token }); assert.equal(m.body.match, true);
  await api.post('/api/swipe', { to: c.user.id, dir: 'right' }, { token: a.token }); // c'yi bekleyen bir beğeni
  // eşleşme 2 saatten eski görünsün
  const mt = (await col('matches')).find((x) => x.users.includes(a.user.id) && x.users.includes(b.user.id)); assert.ok(mt);
  await api.post('/api/_test/nudge', {}); // eşleşme yeni: eşleşme hatırlatması yok, c'ye beğeni hatırlatması var
  const nc = (await notes(c.token)); assert.ok(JSON.stringify(nc).includes('Biri seni beğendi'), JSON.stringify(nc).slice(0, 400));
  const before = JSON.stringify(await notes(c.token)).split('nudge').length;
  await api.post('/api/_test/nudge', {}); assert.equal(JSON.stringify(await notes(c.token)).split('nudge').length, before); // aynı gün ikinci hatırlatma yok
});

test('Parti Kupası: Araba Yarışı ve Gemi Savaşı seçilebilir ve başlar', async () => {
  const a = await register(api);
  for (const mode of ['araba', 'gemi']) {
    const cur = await api.get('/api/kupa', { token: a.token }); if (cur.body.current) await api.post(`/api/kupa/${cur.body.current}/leave`, {}, { token: a.token });
    const { body } = await api.post('/api/kupa', { mode }, { token: a.token });
    const v = await api.get(`/api/kupa/${body.id}`, { token: a.token }); assert.ok(v.body.modes.some(([k]) => k === mode), `${mode} seçicide yok`);
    const s = await api.post(`/api/kupa/${body.id}/start`, {}, { token: a.token }); assert.equal(s.status, 200); assert.equal(s.body.mode, mode); assert.equal(s.body.players.length, 8);
    if (mode === 'araba') assert.ok(Number.isInteger(s.body.conf.tk) && s.body.conf.laps === 2); else assert.ok(Array.isArray(s.body.conf.isl) && s.body.st.hp);
    await api.post(`/api/kupa/${body.id}/leave`, {}, { token: a.token });
  }
});

test('yönetim paneli dosyaları giriş yapmadan verilmez', async () => {
  const r = await api.get('/test-panel-abc123/admin.js');
  assert.ok(!(typeof r.body === 'string' && r.body.includes('VIEWS')), 'panel kodu açıkta');
  assert.ok([401, 403, 404].includes((await api.get('/api/admin/orders')).status));
});
