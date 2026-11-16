// 5651 sayılı Kanun m.5/3: yer sağlayıcı, yer sağladığı hizmetlere ilişkin trafik bilgilerini en az 1, en çok 2 yıl saklar;
// bilgilerin doğruluğunu, bütünlüğünü ve gizliliğini sağlar. Burada tutulanlar: hesap girişleri, içerik oluşturan / değiştiren
// istekler ve canlı bağlantıların açılıp kapanması (kim, hangi IP'den, ne zaman, hangi işlem, sonuç). İçeriğin kendisi tutulmaz.
// Bütünlük: her kayıt bir öncekinin özetini içerir (HMAC-SHA256 zinciri) ve her gün zincirin son halkası ayrıca mühürlenir;
// aradan kayıt silinir ya da değiştirilirse doğrulama bozulur. Kayıtlar 730 gün sonra kendiliğinden silinir.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEEP_DAYS = 730;
const DAY = 86400000;
// Etkileşim niteliğindeki sık istekler (kaydırma, beğeni, oyun hamlesi, görüntülenme) kayda girmez; içerik ve hesap işlemleri girer
const SKIP = /\/(swipe|move|view|visit|seen|ping|read|like|vote|react|score|typing|preview)(\/|$)|^\/api\/(client-errors|farm\/|mini\/|play\/|games\/|karaoke\/score|push)/;

module.exports = function trafik(store, { ipOf, secret }) {
  const buf = [];
  let prev = null; let ready = null; let seq = 0; let started = false; // started: veri deposu hazır olunca (server.js açılışı)
  const key = () => crypto.createHash('sha256').update('trafik:' + (secret() || 'x')).digest();
  const mac = (p, e) => crypto.createHmac('sha256', key()).update([p || '', e.at, e.uid || '', e.ip || '', e.ev, e.method || '', e.path || '', e.status ?? '', e.dev || ''].join('|')).digest('hex');
  const dir = () => path.join(store.dir || 'data', 'trafik');
  const fileOf = (t) => path.join(dir(), `${new Date(t).toISOString().slice(0, 7)}.jsonl`);

  async function init() {
    if (store.pg) {
      const T = store.T('trafik');
      await store.pg.query(`CREATE TABLE IF NOT EXISTS ${T} (id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL, uid TEXT, ip TEXT, ev TEXT NOT NULL, method TEXT, path TEXT, status INT, dev TEXT, ua TEXT, prev TEXT, hash TEXT NOT NULL)`);
      await store.pg.query(`CREATE INDEX IF NOT EXISTS trafik_at ON ${T} (at)`);
      await store.pg.query(`CREATE INDEX IF NOT EXISTS trafik_uid ON ${T} (uid, at)`);
      const { rows } = await store.pg.query(`SELECT hash FROM ${T} ORDER BY id DESC LIMIT 1`);
      prev = rows[0]?.hash || null;
    } else {
      fs.mkdirSync(dir(), { recursive: true });
      const files = fs.readdirSync(dir()).filter((f) => f.endsWith('.jsonl')).sort();
      const last = files.length ? fs.readFileSync(path.join(dir(), files[files.length - 1]), 'utf8').trim().split('\n').pop() : '';
      try { prev = last ? JSON.parse(last).hash : null; } catch { prev = null; }
    }
  }

  function log(ev, { req, uid, ip, method, path: p, status, dev, ua } = {}) {
    const e = {
      at: new Date().toISOString(), uid: uid || req?.user?.id || null, ip: ip || (req ? ipOf(req) : null), ev,
      method: method || req?.method || null, path: String(p || req?.originalUrl || '').split('?')[0].slice(0, 160) || null,
      status: status ?? null, dev: String(dev || req?.headers?.['x-device'] || '').slice(0, 40) || null, ua: String(ua || req?.headers?.['user-agent'] || '').slice(0, 200) || null,
    };
    buf.push(e); if (buf.length > 5000) buf.splice(0, buf.length - 5000);
  }

  let flushing = false;
  async function flush() {
    if (flushing || !buf.length || !started) return; flushing = true;
    try {
      try { ready ||= init(); await ready; } catch (er) { ready = null; throw er; } // bağlantı hatasında bir sonraki denemede yeniden kurulur
      const rows = buf.splice(0, 500);
      for (const e of rows) { e.prev = prev; e.hash = mac(prev, e); prev = e.hash; }
      if (store.pg) {
        const T = store.T('trafik'); const cols = ['at', 'uid', 'ip', 'ev', 'method', 'path', 'status', 'dev', 'ua', 'prev', 'hash'];
        await store.pg.query(`INSERT INTO ${T} (${cols.join(',')}) SELECT * FROM unnest($1::timestamptz[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::int[], $8::text[], $9::text[], $10::text[], $11::text[])`,
          cols.map((c) => rows.map((r) => r[c])));
      } else {
        for (const r of rows) fs.appendFileSync(fileOf(r.at), JSON.stringify({ id: ++seq + '-' + Date.now(), ...r }) + '\n');
      }
    } catch (er) { console.error('[trafik] yazılamadı:', er.message); } finally { flushing = false; }
  }
  setInterval(flush, 4000).unref();

  // Günlük mühür ve 2 yıldan eski kayıtların silinmesi
  async function daily() {
    if (!started) return;
    try { ready ||= init(); await ready; } catch (er) { ready = null; console.error('[trafik] tablo hazırlanamadı:', er.message); return; }
    await flush();
    const d = new Date(Date.now() - DAY).toISOString().slice(0, 10);
    if (prev && !store.get('trafik_seal', d)) store.put('trafik_seal', { id: d, hash: prev, at: Date.now() });
    const cut = Date.now() - KEEP_DAYS * DAY;
    try {
      if (store.pg) await store.pg.query(`DELETE FROM ${store.T('trafik')} WHERE at < $1`, [new Date(cut).toISOString()]);
      else if (fs.existsSync(dir())) for (const f of fs.readdirSync(dir())) { const m = /^(\d{4}-\d{2})\.jsonl$/.exec(f); if (m && new Date(m[1] + '-01').getTime() + 31 * DAY < cut) fs.unlinkSync(path.join(dir(), f)); }
    } catch (er) { console.error('[trafik] eski kayıtlar silinemedi:', er.message); }
    store.filter('trafik_seal', (s) => s.at < cut).forEach((s) => store.del('trafik_seal', s.id));
  }
  setTimeout(daily, 60000).unref(); setInterval(daily, 6 * 3600000).unref();

  // Sorgu: tarih aralığı ve isteğe bağlı kullanıcı (en çok 50.000 satır)
  async function query({ from, to, uid, limit = 50000 }) {
    await flush(); ready ||= init(); await ready;
    const f = new Date(from || 0).toISOString(); const t = new Date(to || Date.now()).toISOString();
    if (store.pg) {
      const { rows } = await store.pg.query(`SELECT id, at, uid, ip, ev, method, path, status, dev, ua, prev, hash FROM ${store.T('trafik')} WHERE at >= $1 AND at <= $2 ${uid ? 'AND uid = $4' : ''} ORDER BY id LIMIT $3`, uid ? [f, t, limit, uid] : [f, t, limit]);
      return rows.map((r) => ({ ...r, at: new Date(r.at).toISOString() }));
    }
    const out = [];
    if (!fs.existsSync(dir())) return out;
    for (const file of fs.readdirSync(dir()).filter((x) => x.endsWith('.jsonl')).sort()) {
      for (const line of fs.readFileSync(path.join(dir(), file), 'utf8').split('\n')) {
        if (!line) continue; let r; try { r = JSON.parse(line); } catch { continue; }
        if (r.at >= f && r.at <= t && (!uid || r.uid === uid)) { out.push(r); if (out.length >= limit) return out; }
      }
    }
    return out;
  }
  // Bütünlük doğrulaması: zincirdeki her halka yeniden hesaplanır
  async function verify({ from, to } = {}) {
    const rows = await query({ from, to, limit: 500000 });
    let p = rows[0]?.prev ?? null; let bad = null;
    for (const r of rows) {
      if (r.prev !== p || mac(r.prev, { ...r, status: r.status ?? null }) !== r.hash) { bad = r; break; }
      p = r.hash;
    }
    const seals = store.all('trafik_seal').length;
    return { ok: !bad, count: rows.length, first: rows[0]?.at || null, last: rows[rows.length - 1]?.at || null, brokenAt: bad ? { id: bad.id, at: bad.at } : null, seals };
  }
  async function stats() {
    await flush(); ready ||= init(); await ready;
    if (store.pg) {
      const { rows: [r] } = await store.pg.query(`SELECT count(*)::int AS n, min(at) AS oldest FROM ${store.T('trafik')}`);
      return { count: r.n, oldest: r.oldest ? new Date(r.oldest).toISOString() : null, keepDays: KEEP_DAYS, kind: 'postgres' };
    }
    const rows = await query({});
    return { count: rows.length, oldest: rows[0]?.at || null, keepDays: KEEP_DAYS, kind: 'dosya' };
  }

  // HTTP: içerik ve hesap işlemleri (GET hariç), yanıt bitince sonucu ile birlikte
  const middleware = (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS' && req.path.startsWith('/api/') && !SKIP.test(req.path)) {
      res.on('finish', () => log('http', { req, status: res.statusCode, path: req.originalUrl }));
    }
    next();
  };
  const start = () => { started = true; };
  return { log, middleware, query, verify, stats, flush, start, KEEP_DAYS };
};
