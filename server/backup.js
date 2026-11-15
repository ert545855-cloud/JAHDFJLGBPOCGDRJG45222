// Gece otomatik yedek: her gece 03:30'da (Türkiye saati) bütün kayıtlar sıkıştırılıp medya deposuna yazılır
// (Supabase Storage açıksa orada, değilse veritabanında). Son 14 yedek tutulur; yönetimden indirilir ya da elle alınır.
// Fotoğraf ve videolar zaten ayrı depoda durduğu için yedeğe girmez.
const zlib = require('zlib');
const KEEP = 14;

module.exports = function backup(app, ctx) {
  const { store } = ctx;
  const now = () => Date.now();
  const trDate = (t = now()) => new Date(t + 3 * 3600000).toISOString().slice(0, 10);
  let running = false;

  async function run(by = 'otomatik') {
    if (running) return null; running = true;
    try {
      const data = { exportedAt: new Date().toISOString(), kind: store.kind, collections: {} };
      const counts = {};
      for (const [name, m] of store.cols) if (m.size && name !== 'backups') { data.collections[name] = [...m.values()]; counts[name] = m.size; }
      const buf = zlib.gzipSync(Buffer.from(JSON.stringify(data)), { level: 9 });
      const id = `bk-${trDate().replace(/-/g, '')}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const where = await store.saveMedia(id, 'application/gzip', buf);
      const doc = store.put('backups', { id, at: now(), size: buf.length, docs: Object.values(counts).reduce((a, b) => a + b, 0), where, by });
      // eskileri sil
      const all = store.all('backups').sort((a, b) => b.at - a.at);
      for (const old of all.slice(KEEP)) { await store.deleteMedia(old.id).catch(() => {}); store.del('backups', old.id); }
      console.log(`[yedek] ${id} · ${(buf.length / 1024).toFixed(0)} KB · ${doc.docs} kayıt · ${where}`);
      return doc;
    } catch (e) {
      console.error('[yedek] alınamadı:', e.message);
      store.put('settings', { id: 'backup_error', at: now(), message: e.message });
      return null;
    } finally { running = false; }
  }
  // Her 10 dakikada bak: bugün 03:30'dan sonra yedek alınmadıysa al
  const tick = () => {
    const t = new Date(now() + 3 * 3600000); const mins = t.getUTCHours() * 60 + t.getUTCMinutes();
    const today = trDate(); const last = store.all('backups').filter((b) => b.by === 'otomatik').sort((a, b) => b.at - a.at)[0];
    if (mins >= 210 && (!last || trDate(last.at) !== today)) run();
  };
  setInterval(tick, 10 * 60000).unref?.();
  setTimeout(tick, 90000).unref?.();

  const A = ctx.admin; if (!A?.adminAuth) return;
  app.get('/api/admin/backups', A.adminAuth, A.owner, (req, res) => {
    const err = store.get('settings', 'backup_error');
    res.json({ list: store.all('backups').sort((a, b) => b.at - a.at), keep: KEEP, lastError: err && (!store.all('backups').some((b) => b.at > err.at)) ? err : null });
  });
  app.post('/api/admin/backups', A.adminAuth, A.owner, async (req, res) => {
    const d = await run(req.admin?.username || 'yönetici');
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
