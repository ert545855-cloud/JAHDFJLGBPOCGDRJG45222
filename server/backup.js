// Otomatik yedek: 5 dakikada bir, kayıtlarda değişiklik varsa bütün kayıtlar sıkıştırılıp iki yere yazılır:
//  1) Yönetim yedekleri (Supabase veritabanı; sunucu dışında duran kopya) → Yönetim → Veritabanı'ndan indirilir.
//     Son 1 saatin 5 dakikalık yedekleri + son 14 günün her günü için bir yedek tutulur.
//  2) Sunucu diski (BACKUP_DIR, ör. /var/backups/swipeup/anlik) → Yönetim → Sunucu'dan indirilir.
//     Son 24 saat 5 dakikalık, son 7 gün saatlik, son 30 gün günlük yedek tutulur.
// Kimse panele girmese de çalışır. Fotoğraf ve videolar kayıt yedeğine girmez: sunucu diskinde ayrıca yedeklenir (MEDIA_BACKUP_DIR).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const EVERY = 5 * 60000;
const REMOTE_RECENT = 12; // son 1 saat (5 dakikada bir)
const REMOTE_DAYS = 14;

module.exports = function backup(app, ctx) {
  const { store } = ctx;
  const now = () => Date.now();
  const tr = (t = now()) => new Date(t + 3 * 3600000).toISOString(); // Türkiye saati
  const trDate = (t) => tr(t).slice(0, 10);
  const DIR = process.env.BACKUP_DIR || '';
  let running = false; let lastHash = null; let lastLocal = null;

  function snapshot() {
    const data = { exportedAt: new Date().toISOString(), kind: store.kind, collections: {} };
    const counts = {};
    for (const [name, m] of store.cols) if (m.size && name !== 'backups') { data.collections[name] = [...m.values()]; counts[name] = m.size; }
    const json = JSON.stringify(data.collections);
    return { data, counts, hash: crypto.createHash('sha1').update(json).digest('hex') };
  }

  // Sunucu diskindeki yedekler: 24 saat hepsi, 7 gün saatte bir, 30 gün günde bir
  function pruneLocal() {
    if (!DIR) return;
    const list = localList();
    const keep = new Set(); const seenH = new Set(); const seenD = new Set();
    for (const b of [...list].reverse()) { // eskiden yeniye: her saatin / günün ilki kalır
      const age = now() - b.at;
      const h = b.name.slice(8, 19); const d = b.name.slice(8, 16);
      if (age < 86400000) keep.add(b.name);
      else if (age < 7 * 86400000) { if (!seenH.has(h)) { seenH.add(h); keep.add(b.name); } }
      else if (age < 30 * 86400000) { if (!seenD.has(d)) { seenD.add(d); keep.add(b.name); } }
    }
    for (const b of list) if (!keep.has(b.name)) fs.rmSync(path.join(DIR, b.name), { force: true });
  }
  function localList() {
    try {
      return fs.readdirSync(DIR).filter((f) => /^swipeup-\d{8}-\d{4}\.json\.gz$/.test(f))
        .map((f) => { const s = fs.statSync(path.join(DIR, f)); return { name: f, size: s.size, at: s.mtimeMs }; }).sort((a, b) => b.at - a.at);
    } catch { return []; }
  }
  // Yönetim yedekleri: son 12 (1 saat) + son 14 günün her günü için en yenisi
  async function pruneRemote() {
    const all = store.all('backups').sort((a, b) => b.at - a.at);
    const keep = new Set(all.slice(0, REMOTE_RECENT).map((b) => b.id));
    const days = new Set();
    for (const b of all) {
      if (now() - b.at > REMOTE_DAYS * 86400000) continue;
      const d = trDate(b.at); if (!days.has(d)) { days.add(d); keep.add(b.id); }
    }
    for (const old of all) if (!keep.has(old.id)) { await store.deleteMedia(old.id).catch(() => {}); store.del('backups', old.id); }
  }

  async function run(by = 'otomatik', force = false) {
    if (running) return null; running = true;
    try {
      const { data, counts, hash } = snapshot();
      if (!force && hash === lastHash) return null; // değişiklik yok
      const buf = zlib.gzipSync(Buffer.from(JSON.stringify(data)), { level: 9 });
      const docs = Object.values(counts).reduce((a, b) => a + b, 0);
      // 1) sunucu diski
      if (DIR) {
        try {
          fs.mkdirSync(DIR, { recursive: true });
          const name = `swipeup-${tr().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}.json.gz`;
          const tmp = path.join(DIR, `.${name}.tmp`);
          fs.writeFileSync(tmp, buf); fs.renameSync(tmp, path.join(DIR, name));
          lastLocal = { name, at: now(), size: buf.length };
          pruneLocal();
        } catch (e) { console.error('[yedek] sunucu diski:', e.message); store.put('settings', { id: 'backup_error', at: now(), message: `Sunucu diski: ${e.message}` }); }
      }
      // 2) sunucu dışı (veritabanı)
      const id = `bk-${trDate().replace(/-/g, '')}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const where = await store.saveMedia(id, 'application/gzip', buf, { remote: true });
      const doc = store.put('backups', { id, at: now(), size: buf.length, docs, where, by });
      await pruneRemote();
      lastHash = hash;
      if (by !== 'otomatik' || !run.quiet) console.log(`[yedek] ${id} · ${(buf.length / 1024).toFixed(0)} KB · ${docs} kayıt · ${where}${DIR ? ' + sunucu diski' : ''}`);
      run.quiet = true; // 5 dakikalık yedekleri kayıtlara tek tek yazma
      return doc;
    } catch (e) {
      console.error('[yedek] alınamadı:', e.message);
      store.put('settings', { id: 'backup_error', at: now(), message: e.message });
      return null;
    } finally { running = false; }
  }
  // Açılışta son yedeğin özetini al (gereksiz ilk yedeği önlemez; ilk turda bir yedek alınır)
  const tick = () => { run().catch(() => {}); if (new Date(now() + 3 * 3600000).getUTCHours() === 4) store.pruneMediaBackup?.(); };
  setInterval(tick, EVERY).unref?.();
  setTimeout(tick, 60000).unref?.();

  ctx.localBackups = () => ({ dir: DIR || null, list: DIR ? localList() : [], last: lastLocal });

  const A = ctx.admin; if (!A?.adminAuth) return;
  app.get('/api/admin/backups', A.adminAuth, A.owner, (req, res) => {
    const err = store.get('settings', 'backup_error');
    res.json({ list: store.all('backups').sort((a, b) => b.at - a.at), keep: REMOTE_RECENT, days: REMOTE_DAYS, everyMin: EVERY / 60000, local: DIR ? { count: localList().length } : null, lastError: err && (!store.all('backups').some((b) => b.at > err.at)) ? err : null });
  });
  app.post('/api/admin/backups', A.adminAuth, A.owner, async (req, res) => {
    const d = await run(req.admin?.username || 'yönetici', true);
    if (!d) return res.status(500).json({ error: 'Yedek alınamadı. Ayrıntı için tekrar dene ya da Hatalar bölümüne bak.' });
    A.audit?.(req.admin, 'elle yedek aldı', null, d.id);
    res.json(d);
  });
  app.get('/api/admin/backups/:id', A.adminAuth, A.owner, async (req, res) => {
    const b = store.get('backups', req.params.id); if (!b) return res.status(404).json({ error: 'Yedek bulunamadı.' });
    const m = await store.loadMedia(b.id); if (!m) return res.status(404).json({ error: 'Yedek dosyası bulunamadı.' });
    A.audit?.(req.admin, 'yedek indirdi', null, b.id);
    res.setHeader('Content-Disposition', `attachment; filename="swipeup-${b.id}.json.gz"`);
    res.type('application/gzip').send(Buffer.from(m.data));
  });
};
