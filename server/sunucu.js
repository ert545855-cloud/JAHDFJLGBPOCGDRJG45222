// Yönetim → Sunucu: uygulamanın çalıştığı VDS'yi (Yöncü) ve alan adını (Hostinger) tek yerden yönetmek.
// Sunucu durumu içeriden okunur (işlemci, bellek, disk, servisler, sertifika, yedekler, kayıtlar);
// güncelleme / yeniden başlatma / yedek, kurulumda tanımlanan sabit systemd birimleriyle sudo üzerinden tetiklenir
// (scripts/vds/panel-yetki.sh: swipeup kullanıcısına yalnız bu komutlar için izin verir).
// Hostinger: HOSTINGER_API_TOKEN ile DNS kayıtları, DNS anlık görüntüleri ve alan adı bitiş tarihi.
// Hepsi yalnız Sahip (owner) yetkisiyle açılır ve her işlem işlem kaydına yazılır.
const os = require('os');
const fs = require('fs');
const path = require('path');
const tls = require('tls');
const { execFile } = require('child_process');

const BK_DIR = '/var/backups/swipeup';
const SYSTEMCTL = '/usr/bin/systemctl';
const HAPI = 'https://developers.hostinger.com';
const UNITS = { swipeup: 'Uygulama', caddy: 'HTTPS (Caddy)', 'swipeup-guncelle.timer': 'Otomatik güncelleme', 'swipeup-yedek.timer': 'Gece yedeği' };
const LOG_UNITS = { swipeup: 'swipeup', caddy: 'caddy', guncelle: 'swipeup-guncelle', yedek: 'swipeup-yedek' };
const TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'CAA', 'NS', 'SRV', 'ALIAS'];

const run = (cmd, args, { timeout = 15000, input } = {}) => new Promise((resolve) => {
  const p = execFile(cmd, args, { timeout, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, LANG: 'C.UTF-8', SYSTEMD_COLORS: '0', SYSTEMD_PAGER: '' } }, (err, stdout, stderr) => {
    resolve({ ok: !err, code: err ? (err.code ?? 1) : 0, out: String(stdout || ''), err: String(stderr || (err && err.message) || '') });
  });
  if (input != null) { p.stdin.end(input); }
});
const sudo = (args) => run('/usr/bin/sudo', ['-n', SYSTEMCTL, ...args]);

const isVds = () => fs.existsSync('/usr/local/bin/swipeup-guncelle');
const domainOf = () => { try { return new URL(process.env.CANONICAL_URL || '').hostname; } catch { return ''; } };
const publicIps = () => Object.values(os.networkInterfaces()).flat().filter((n) => n && !n.internal && n.family === 'IPv4' && !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(n.address)).map((n) => n.address);

function cpuPct() {
  // 300 ms aralıkla iki ölçüm: anlık işlemci kullanımı
  const snap = () => os.cpus().reduce((a, c) => { const t = Object.values(c.times).reduce((x, y) => x + y, 0); a.idle += c.times.idle; a.total += t; return a; }, { idle: 0, total: 0 });
  const a = snap();
  return new Promise((r) => setTimeout(() => { const b = snap(); const dt = b.total - a.total; r(dt ? Math.round((1 - (b.idle - a.idle) / dt) * 100) : 0); }, 300));
}
function memInfo() {
  // MemAvailable (önbellek hariç gerçek boş alan) /proc'tan; yoksa os.freemem
  try {
    const m = Object.fromEntries(fs.readFileSync('/proc/meminfo', 'utf8').split('\n').map((l) => l.match(/^(\w+):\s+(\d+)/)).filter(Boolean).map((x) => [x[1], +x[2] * 1024]));
    return { total: m.MemTotal, avail: m.MemAvailable ?? m.MemFree, swapTotal: m.SwapTotal || 0, swapFree: m.SwapFree || 0 };
  } catch { return { total: os.totalmem(), avail: os.freemem(), swapTotal: 0, swapFree: 0 }; }
}
function diskInfo(p = '/') {
  try { const s = fs.statfsSync(p); return { total: s.blocks * s.bsize, free: s.bavail * s.bsize }; } catch { return null; }
}
function certInfo(host) {
  return new Promise((resolve) => {
    if (!host) return resolve(null);
    const sock = tls.connect({ host: '127.0.0.1', port: 443, servername: host, rejectUnauthorized: false, timeout: 4000 }, () => {
      const c = sock.getPeerCertificate(); sock.end();
      resolve(c && c.valid_to ? { issuer: c.issuer?.O || c.issuer?.CN || '', validTo: new Date(c.valid_to).getTime(), subject: c.subject?.CN || '' } : null);
    });
    sock.on('error', () => resolve(null)); sock.on('timeout', () => { sock.destroy(); resolve(null); });
  });
}
async function unitStates() {
  const names = Object.keys(UNITS);
  const r = await run(SYSTEMCTL, ['show', ...names, '-p', 'Id,ActiveState,SubState,ActiveEnterTimestamp,NextElapseUSecRealtime,LastTriggerUSec', '--timestamp=unix']);
  if (!r.ok && !r.out) return [];
  return r.out.trim().split(/\n\n+/).map((blk) => {
    const o = Object.fromEntries(blk.split('\n').map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
    const ts = (v) => { const m = String(v || '').match(/@(\d+)/); return m ? +m[1] * 1000 : null; };
    return { id: o.Id, name: UNITS[o.Id] || o.Id, active: o.ActiveState, sub: o.SubState, since: ts(o.ActiveEnterTimestamp), next: ts(o.NextElapseUSecRealtime), last: ts(o.LastTriggerUSec) };
  }).filter((u) => u.id);
}
async function gitInfo(dir) {
  const r = await run('/usr/bin/git', ['-C', dir, 'log', '-1', '--format=%h%x09%ct%x09%s']);
  if (!r.ok) return null;
  const [hash, ct, subject] = r.out.trim().split('\t');
  return { hash, at: +ct * 1000, subject };
}
let updCache = null;
async function osUpdates() {
  // apt-check birkaç saniye sürer: sonucu 30 dakika sakla (yeniden başlatma bayrağı her seferinde taze)
  if (updCache && Date.now() - updCache.at < 30 * 60000) return { ...updCache.v, reboot: fs.existsSync('/var/run/reboot-required') };
  const out = { pending: null, security: null, reboot: fs.existsSync('/var/run/reboot-required') };
  if (fs.existsSync('/usr/lib/update-notifier/apt-check')) {
    const r = await run('/usr/lib/update-notifier/apt-check', [], { timeout: 20000 });
    const m = (r.err || r.out).trim().match(/^(\d+);(\d+)/);
    if (m) { out.pending = +m[1]; out.security = +m[2]; }
  }
  updCache = { at: Date.now(), v: out };
  return out;
}
function backups() {
  try {
    return fs.readdirSync(BK_DIR).filter((f) => /^swipeup-[\d-]+\.dump$/.test(f)).map((f) => { const s = fs.statSync(path.join(BK_DIR, f)); return { name: f, size: s.size, at: s.mtimeMs }; }).sort((a, b) => b.at - a.at);
  } catch (e) { return e.code === 'ENOENT' ? [] : null; }
}
// Kurulum betiğinin verdiği izinler var mı (sudo listesi ve günlük okuma)
async function perms() {
  const s = await run('/usr/bin/sudo', ['-n', '-l']);
  const j = await run('/usr/bin/journalctl', ['-u', 'swipeup', '-n', '1', '--no-pager', '-q']);
  return { sudo: s.ok && /swipeup-guncelle\.service/.test(s.out), journal: j.ok && !!j.out.trim() };
}

// ---------- Hostinger ----------
async function hapi(method, p, body) {
  const token = process.env.HOSTINGER_API_TOKEN;
  if (!token) { const e = new Error('Hostinger bağlı değil (HOSTINGER_API_TOKEN yok).'); e.status = 400; throw e; }
  const r = await fetch(HAPI + p, {
    method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
  });
  const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch { j = null; }
  if (!r.ok) {
    const msg = j?.message || j?.error || (r.status === 401 ? 'Hostinger API anahtarı geçersiz ya da süresi dolmuş.' : `Hostinger ${r.status}`);
    const det = j?.errors ? Object.values(j.errors).flat().join(' ') : '';
    const e = new Error(det ? `${msg} ${det}` : msg); e.status = r.status === 401 || r.status === 422 ? 400 : 502; e.http = r.status; throw e;
  }
  return j;
}
const cleanName = (n) => { const s = String(n || '').trim().toLowerCase().replace(/\.$/, ''); return !s || s === '@' ? '@' : s; };

module.exports = function sunucu(app, ctx) {
  const { store } = ctx;
  const A = ctx.admin || {};
  if (!A.adminAuth) return;
  const gate = [A.adminAuth, A.owner];
  const audit = (req, text, det) => A.audit?.(req.admin, text, null, det);
  const fail = (res, e) => res.status(e.status || 500).json({ error: e.message });
  const APP_DIR = path.join(__dirname, '..');

  // ================= Durum =================
  app.get('/api/admin/sunucu', ...gate, async (req, res) => {
    try {
      const host = domainOf();
      const [cpu, units, git, cert, upd, pm] = await Promise.all([cpuPct(), unitStates(), gitInfo(APP_DIR), certInfo(host), osUpdates(), isVds() ? perms() : null]);
      const mem = memInfo(); const disk = diskInfo('/');
      const pr = process.memoryUsage();
      res.json({
        vds: isVds(), host: os.hostname(), domain: host, ips: publicIps(),
        os: (() => { try { return fs.readFileSync('/etc/os-release', 'utf8').match(/PRETTY_NAME="([^"]+)"/)?.[1] || os.type(); } catch { return os.type(); } })(),
        kernel: os.release(), uptime: os.uptime() * 1000, load: os.loadavg().map((x) => Math.round(x * 100) / 100), cpus: os.cpus().length, cpu,
        mem, disk, node: process.version, proc: { uptime: process.uptime() * 1000, rss: pr.rss, heap: pr.heapUsed },
        git, cert, updates: upd, units, perms: pm, backups: backups(),
        hostinger: !!process.env.HOSTINGER_API_TOKEN,
        links: { yoncu: 'https://www.yoncu.com', hostinger: 'https://hpanel.hostinger.com' },
      });
    } catch (e) { fail(res, e); }
  });

  // ================= Kayıtlar (journalctl) =================
  app.get('/api/admin/sunucu/log', ...gate, async (req, res) => {
    const unit = LOG_UNITS[req.query.unit] || 'swipeup';
    const n = Math.min(500, Math.max(20, +req.query.n || 150));
    const args = ['-u', unit, '-n', String(n), '--no-pager', '-o', 'short-iso', '-q'];
    if (req.query.err === '1') args.push('-p', 'warning');
    const r = await run('/usr/bin/journalctl', args, { timeout: 10000 });
    if (!r.ok && !r.out) return res.status(400).json({ error: isVds() ? 'Kayıtlar okunamadı. Sunucuda panel izinleri kurulu değil (scripts/vds/panel-yetki.sh).' : 'Bu sunucuda kayıt okuma yok.' });
    const q = String(req.query.q || '').toLowerCase().slice(0, 60);
    const lines = r.out.split('\n').filter(Boolean).filter((l) => !q || l.toLowerCase().includes(q));
    res.json({ unit, lines });
  });

  // ================= İşlemler =================
  // Komutlar sabit: istekteki hiçbir metin komuta karışmaz
  const ACTS = {
    guncelle: { args: ['start', '--no-block', 'swipeup-guncelle.service'], text: 'sunucuyu GitHub’dan güncelledi', msg: 'Güncelleme başladı. Yeni sürüm varsa uygulama birkaç saniye içinde yeniden başlar.' },
    yedek: { args: ['start', '--no-block', 'swipeup-yedek.service'], text: 'sunucu yedeği aldırdı', msg: 'Yedek alınıyor. Bir dakika içinde listede görünür.' },
    'yeniden-baslat': { args: ['restart', '--no-block', 'swipeup.service'], text: 'uygulamayı yeniden başlattı', msg: 'Uygulama yeniden başlıyor. Panel birkaç saniye bağlantıyı kaybedebilir.', late: true },
    reboot: { args: ['reboot'], text: 'sunucuyu yeniden başlattı (reboot)', msg: 'Sunucu yeniden başlıyor. Site 1–2 dakika kapalı kalır.', late: true, confirm: 'YENIDEN BASLAT' },
  };
  app.post('/api/admin/sunucu/islem', ...gate, async (req, res) => {
    const a = ACTS[req.body?.act];
    if (!a) return res.status(400).json({ error: 'Bilinmeyen işlem.' });
    if (!isVds()) return res.status(400).json({ error: 'Bu işlemler yalnız kendi sunucumuzda (VDS) çalışır.' });
    if (a.confirm && req.body?.confirm !== a.confirm) return res.status(400).json({ error: `Onay için "${a.confirm}" yaz.` });
    audit(req, a.text);
    if (a.late) {
      // Yanıt gittikten sonra: yeniden başlatma bu süreci de durduracak
      res.json({ ok: true, message: a.msg });
      setTimeout(() => sudo(a.args).then((r) => { if (!r.ok) console.error('[sunucu]', a.text, r.err); }), 600);
      return;
    }
    const r = await sudo(a.args);
    if (!r.ok) return res.status(400).json({ error: /password|sudo/i.test(r.err) ? 'Sunucuda panel izinleri kurulu değil. Kurulum komutunu bir kez çalıştır (Sunucu sekmesindeki uyarıya bak).' : r.err.slice(0, 300) });
    res.json({ ok: true, message: a.msg });
  });

  // Yedek indir (pg_dump özel biçim; pg_restore ile geri yüklenir)
  app.get('/api/admin/sunucu/yedek/:name', ...gate, (req, res) => {
    const name = String(req.params.name || '');
    if (!/^swipeup-\d{4}-\d{2}-\d{2}\.dump$/.test(name)) return res.status(400).json({ error: 'Geçersiz dosya adı.' });
    const f = path.join(BK_DIR, name);
    if (!fs.existsSync(f)) return res.status(404).json({ error: 'Yedek bulunamadı.' });
    audit(req, 'sunucu yedeğini indirdi', name);
    res.setHeader('Cache-Control', 'no-store');
    res.download(f, name);
  });

  // ================= Hostinger: alan adı ve DNS =================
  const DOM = () => process.env.HOSTINGER_DOMAIN || domainOf();
  app.get('/api/admin/sunucu/dns', ...gate, async (req, res) => {
    try {
      const d = DOM(); if (!d) return res.status(400).json({ error: 'Alan adı bilinmiyor (CANONICAL_URL).' });
      const [zone, portfolio, snaps] = await Promise.all([
        hapi('GET', `/api/dns/v1/zones/${encodeURIComponent(d)}`),
        hapi('GET', '/api/domains/v1/portfolio').catch(() => null),
        hapi('GET', `/api/dns/v1/snapshots/${encodeURIComponent(d)}`).catch(() => null),
      ]);
      const dom = Array.isArray(portfolio) ? portfolio.find((x) => x.domain === d) : null;
      const records = (Array.isArray(zone) ? zone : []).map((z) => ({ name: z.name, type: z.type, ttl: z.ttl, records: (z.records || []).map((r) => ({ content: r.content, disabled: !!r.is_disabled })) }))
        .sort((a, b) => (a.name === '@' ? -1 : b.name === '@' ? 1 : a.name.localeCompare(b.name)) || a.type.localeCompare(b.type));
      res.json({
        domain: d, records, ips: publicIps(),
        info: dom ? { status: dom.status, expires: dom.expires_at ? Date.parse(dom.expires_at) : null, created: dom.created_at ? Date.parse(dom.created_at) : null } : null,
        snapshots: Array.isArray(snaps) ? snaps.slice(0, 15).map((s) => ({ id: s.id, reason: s.reason || '', at: s.created_at ? Date.parse(s.created_at) : null })) : [],
      });
    } catch (e) { fail(res, e); }
  });
  // Bir ad + tür için kayıtları ayarla (aynı ad ve türdeki eski kayıtların yerine geçer)
  app.put('/api/admin/sunucu/dns', ...gate, async (req, res) => {
    try {
      const d = DOM();
      const name = cleanName(req.body?.name); const type = String(req.body?.type || '').toUpperCase();
      const ttl = Math.min(86400, Math.max(60, +req.body?.ttl || 300));
      const vals = (Array.isArray(req.body?.records) ? req.body.records : [req.body?.content]).map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 20);
      if (!TYPES.includes(type)) return res.status(400).json({ error: 'Kayıt türü desteklenmiyor.' });
      if (!/^(@|[a-z0-9_*]([a-z0-9_.-]{0,200}[a-z0-9])?)$/.test(name)) return res.status(400).json({ error: 'Ad geçersiz. Ana alan adı için @ yaz.' });
      if (!vals.length) return res.status(400).json({ error: 'İçerik boş olamaz.' });
      if (type === 'A' && vals.some((v) => !/^(\d{1,3}\.){3}\d{1,3}$/.test(v))) return res.status(400).json({ error: 'A kaydı bir IPv4 adresi olmalı (ör. 185.114.21.168).' });
      const body = { overwrite: true, zone: [{ name, type, ttl, records: vals.map((content) => ({ content })) }] };
      // Önce Hostinger'a doğrulat: hatalı kayıt bölgeyi bozmadan reddedilsin
      await hapi('POST', `/api/dns/v1/zones/${encodeURIComponent(d)}/validate`, body).catch((e) => { if (![404, 405].includes(e.http)) throw e; });
      await hapi('PUT', `/api/dns/v1/zones/${encodeURIComponent(d)}`, body);
      audit(req, 'DNS kaydını değiştirdi', `${type} ${name} → ${vals.join(', ')}`);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });
  app.delete('/api/admin/sunucu/dns', ...gate, async (req, res) => {
    try {
      const d = DOM(); const name = cleanName(req.body?.name); const type = String(req.body?.type || '').toUpperCase();
      if (!TYPES.includes(type)) return res.status(400).json({ error: 'Kayıt türü desteklenmiyor.' });
      // Siteyi kapatacak silmeyi engelle: ana adın A kaydı
      if (name === '@' && type === 'A' && req.body?.confirm !== 'SIL') return res.status(400).json({ error: 'Bu kayıt siteyi sunucuya bağlıyor. Silersen site açılmaz. Yine de silmek için onaya SIL yaz.' });
      await hapi('DELETE', `/api/dns/v1/zones/${encodeURIComponent(d)}`, { filters: [{ name, type }] });
      audit(req, 'DNS kaydını sildi', `${type} ${name}`);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });
  app.post('/api/admin/sunucu/dns/geri/:id', ...gate, async (req, res) => {
    try {
      const id = String(req.params.id).replace(/\D/g, ''); if (!id) return res.status(400).json({ error: 'Geçersiz kayıt.' });
      await hapi('POST', `/api/dns/v1/snapshots/${encodeURIComponent(DOM())}/${id}/restore`);
      audit(req, 'DNS kayıtlarını eski hâline döndürdü', `anlık görüntü ${id}`);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  if (store && isVds()) console.log(`[sunucu] VDS paneli hazır${process.env.HOSTINGER_API_TOKEN ? ' · Hostinger bağlı' : ''}`);
};
