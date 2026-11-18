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
const UNITS = { 'swipeup.service': 'Uygulama', 'caddy.service': 'HTTPS (Caddy)', 'swipeup-guncelle.timer': 'Otomatik güncelleme', 'swipeup-yedek.timer': 'Gece yedeği', 'coturn.service': 'Görüntülü görüşme aktarıcısı (TURN)' };
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
    // "@1795000000" (unix) ya da "Wed 2026-11-18 04:10:00 +03" biçimi; boş / n/a → null
    const ts = (v) => {
      const t = String(v || '').trim(); const m = t.match(/@(\d+)/); if (m) return +m[1] * 1000;
      const d = t.match(/(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})?/);
      if (d) { const x = Date.parse(`${d[1]}T${d[2]}${d[3]}:${d[4] || '00'}`); return Number.isFinite(x) ? x : null; }
      return null;
    };
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
  // Depo yeniden adlandırıldı: sunucudaki kopyanın güncelleme adresi bir kez yeni ada çevrilir (eski ad yönlendirmeye kalmasın)
  if (isVds()) {
    const dir = path.join(__dirname, '..'); const NEW = 'https://github.com/ert545855-cloud/JAHDFJLGBPOCGDRJG45222.git';
    run('/usr/bin/git', ['-C', dir, 'remote', 'get-url', 'origin']).then((r) => { if (r.ok && /sweep-up2/.test(r.out)) return run('/usr/bin/git', ['-C', dir, 'remote', 'set-url', 'origin', NEW]).then((x) => console.log(x.ok ? '[sunucu] güncelleme adresi yeni depo adına çevrildi' : `[sunucu] güncelleme adresi değiştirilemedi: ${x.err.slice(0, 160)}`)); return null; }).catch(() => {});
  }
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
        snapshots: ctx.localBackups ? (({ dir, list }) => ({ dir, count: list.length, bytes: list.reduce((a, b) => a + b.size, 0), list: list.slice(0, 40) }))(ctx.localBackups()) : null,
        media: store.mediaDisk ? { ...store.diskMedia(), backupDir: store.mediaBak || null, move: store.get('meta', 'disk_move') || null } : null,
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
    const snapDir = ctx.localBackups?.().dir;
    let f = null;
    if (/^swipeup-\d{4}-\d{2}-\d{2}\.dump$/.test(name)) f = path.join(BK_DIR, name);
    else if (snapDir && /^swipeup-\d{8}-\d{4}\.json\.gz$/.test(name)) f = path.join(snapDir, name);
    if (!f) return res.status(400).json({ error: 'Geçersiz dosya adı.' });
    if (!fs.existsSync(f)) return res.status(404).json({ error: 'Yedek bulunamadı.' });
    audit(req, 'sunucu yedeğini indirdi', name);
    res.setHeader('Cache-Control', 'no-store');
    res.download(f, name);
  });

  // ================= E-posta: gönderim testi ve alan adı doğrulama kayıtları =================
  const mail = require('./mail');
  // Hostinger e-postasının varsayılan kayıtları (SPF + DKIM); DMARC yoksa izleme modunda eklenir
  const MAIL_DNS = [
    { name: 'hostingermail-a._domainkey', type: 'CNAME', content: 'hostingermail-a.dkim.mail.hostinger.com' },
    { name: 'hostingermail-b._domainkey', type: 'CNAME', content: 'hostingermail-b.dkim.mail.hostinger.com' },
    { name: 'hostingermail-c._domainkey', type: 'CNAME', content: 'hostingermail-c.dkim.mail.hostinger.com' },
  ];
  async function mailDns() {
    const zone = await hapi('GET', `/api/dns/v1/zones/${encodeURIComponent(DOM())}`);
    const z = Array.isArray(zone) ? zone : [];
    const txt = (name) => z.filter((r) => r.name === name && r.type === 'TXT').flatMap((r) => (r.records || []).map((x) => String(x.content || '').replace(/^"|"$/g, '')));
    const spf = txt('@').find((t) => /^v=spf1/i.test(t)) || null;
    const dmarc = txt('_dmarc').find((t) => /^v=DMARC1/i.test(t)) || null;
    const dkim = z.filter((r) => /_domainkey$/.test(r.name)).map((r) => r.name);
    const mx = z.filter((r) => r.name === '@' && r.type === 'MX').flatMap((r) => (r.records || []).map((x) => x.content));
    const missing = MAIL_DNS.filter((d) => !dkim.includes(d.name));
    return { spf, spfOk: !!spf && /hostinger/i.test(spf), dmarc, dkim, mx, missing: missing.map((d) => d.name) };
  }
  async function fixMailDns(by) {
    const st = await mailDns(); const added = [];
    for (const d of MAIL_DNS.filter((x) => st.missing.includes(x.name))) {
      await hapi('PUT', `/api/dns/v1/zones/${encodeURIComponent(DOM())}`, { overwrite: false, zone: [{ name: d.name, type: d.type, ttl: 300, records: [{ content: d.content }] }] });
      added.push(d.name);
    }
    if (!st.spf) { await hapi('PUT', `/api/dns/v1/zones/${encodeURIComponent(DOM())}`, { overwrite: false, zone: [{ name: '@', type: 'TXT', ttl: 3600, records: [{ content: 'v=spf1 include:_spf.mail.hostinger.com ~all' }] }] }); added.push('SPF'); }
    if (added.length) console.log(`[eposta] DNS doğrulama kayıtları eklendi (${by}): ${added.join(', ')}`);
    return added;
  }
  app.get('/api/admin/sunucu/eposta', ...gate, async (req, res) => {
    const out = { config: mail.info(), dns: null, dnsError: null, verify: null };
    try { await mail.verify(); out.verify = { ok: true }; } catch (e) { out.verify = { ok: false, error: e.message }; }
    if (process.env.HOSTINGER_API_TOKEN) { try { out.dns = await mailDns(); } catch (e) { out.dnsError = e.message; } }
    res.json(out);
  });
  // E-posta hesabı (yalnız sahip): önce sunucuya gerçekten giriş denenir, başarılıysa kaydedilir; şifre geri gönderilmez
  app.post('/api/admin/sunucu/eposta/hesap', ...gate, async (req, res) => {
    if (ctx.limited?.(`smtp:${req.admin.id}`, 10, 600000)) return res.status(429).json({ error: 'Çok fazla deneme. 10 dakika sonra tekrar dene.' });
    const b = req.body || {};
    const user = String(b.user || '').trim().toLowerCase();
    const pass = String(b.pass || '').replace(/[\r\n]+/g, '').trim();
    const host = String(b.host || 'smtp.hostinger.com').trim().toLowerCase();
    const port = +b.port || 465;
    const from = String(b.from || '').trim().slice(0, 120);
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(user)) return res.status(400).json({ error: 'Kullanıcı adı e-posta adresinin tamamı olmalı (ör. info@swipeup.live).' });
    if (!pass || pass.length > 200) return res.status(400).json({ error: 'Şifreyi yaz.' });
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return res.status(400).json({ error: 'Sunucu adı geçersiz.' });
    if (![465, 587].includes(port)) return res.status(400).json({ error: 'Port 465 ya da 587 olmalı.' });
    try { await mail.testAccount({ host, port, user, pass }); } catch (e) { return res.status(400).json({ error: e.message }); }
    const smtp = { host, port, user, pass, from: from || `SwipeUp <${user}>`, at: Date.now(), by: req.admin.id };
    store.update('meta', 'secrets', { smtp });
    mail.setAccount(smtp);
    audit(req, 'e-posta hesabını güncelledi', `${user} · ${host}:${port}`);
    res.json({ ok: true, config: mail.info() });
  });
  app.delete('/api/admin/sunucu/eposta/hesap', ...gate, (req, res) => {
    store.update('meta', 'secrets', { smtp: null });
    mail.setAccount(null);
    audit(req, 'panelden kaydedilen e-posta hesabını kaldırdı');
    res.json({ ok: true, config: mail.info() });
  });
  app.post('/api/admin/sunucu/eposta/test', ...gate, async (req, res) => {
    const to = String(req.body?.to || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(to)) return res.status(400).json({ error: 'Geçerli bir e-posta adresi yaz.' });
    try {
      const r = await mail.send(to, 'SwipeUp test e-postası', `Merhaba,\n\nBu e-posta SwipeUp yönetim panelinden gönderilen bir denemedir. Geldiyse e-posta gönderimi çalışıyor.\n\nGelen kutusunda yoksa Spam / Gereksiz klasörüne de bak.\n\nSwipeUp`);
      audit(req, 'test e-postası gönderdi', to.replace(/^(.).*(@.*)$/, '$1***$2'));
      res.json({ ok: true, accepted: r?.accepted || [], rejected: r?.rejected || [], response: String(r?.response || '').slice(0, 200), messageId: r?.messageId || null });
    } catch (e) { res.status(400).json({ error: `Gönderilemedi: ${e.message}` }); }
  });
  app.post('/api/admin/sunucu/eposta/dns', ...gate, async (req, res) => {
    try { const added = await fixMailDns('panel'); audit(req, 'e-posta DNS kayıtlarını tamamladı', added.join(', ') || 'eksik yok'); res.json({ added }); } catch (e) { fail(res, e); }
  });
  // Açılışta: Hostinger bağlıysa ve DKIM kayıtları eksikse ekle (yalnız ekler, var olan kayda dokunmaz)
  if (process.env.HOSTINGER_API_TOKEN && isVds()) setTimeout(() => fixMailDns('otomatik').catch((e) => console.error('[eposta] DNS kontrolü:', e.message)), 30000).unref?.();

  // ================= Android imza anahtarı =================
  // Anahtar sunucu ayarlarında (ANDROID_KEYSTORE_B64); kopyası /var/backups/swipeup/android. Kaybolursa uygulama güncellenemez:
  // Sahip buradan indirip sunucu dışında saklar. Her indirme işlem kaydına yazılır.
  const AND_DIR = path.join(BK_DIR, 'android');
  app.get('/api/admin/sunucu/android', ...gate, (req, res) => {
    let files = [];
    try { files = fs.readdirSync(AND_DIR).filter((f) => /^swipeup-android-\d{8}-\d{4}\.(keystore|txt)$/.test(f)).sort().reverse(); } catch { /* yok */ }
    res.json({ has: !!(process.env.ANDROID_KEYSTORE_B64 && process.env.ANDROID_KEYSTORE_PASS), sha256: String(process.env.ANDROID_SHA256 || '').split(',').filter(Boolean), files, release: 'https://github.com/ert545855-cloud/JAHDFJLGBPOCGDRJG45222/releases/tag/android-latest' });
  });
  app.get('/api/admin/sunucu/android/:name', ...gate, (req, res) => {
    const name = String(req.params.name || '');
    if (!/^swipeup-android-\d{8}-\d{4}\.(keystore|txt)$/.test(name)) return res.status(400).json({ error: 'Geçersiz dosya adı.' });
    const f = path.join(AND_DIR, name);
    if (!fs.existsSync(f)) return res.status(404).json({ error: 'Dosya bulunamadı.' });
    audit(req, name.endsWith('.txt') ? 'Android anahtar şifresini indirdi' : 'Android imza anahtarını indirdi', name);
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
