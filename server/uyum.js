// Uyum işleri (yönetim → Hukuk ve uyum):
// - Saklama ve imha: KVKK silme/yok etme yönetmeliği; süresi dolan veriler periyodik olarak silinir, her imha kayda geçer (3 yıl saklanır)
// - 5651 trafik kayıtları: dışa aktarım ve bütünlük doğrulaması
// - Veri ihlali kayıtları: 72 saatlik Kurul bildirimi için sayaç, bildirim taslağı, etkilenen kişilere bildirim
// - Şüpheli yönetici işlemleri: toplu dışa aktarma ve kısa sürede çok sayıda profil incelemesi sahibe bildirilir
// - Muhasebe dökümü: e-Arşiv fatura için onaylanan satışlar ve iadeler
const { nanoid } = require('nanoid');
const mail = require('./mail');
const { REFUND } = require('./legal');

const DAY = 86400000;
const now = () => Date.now();
const str = (v, n = 200) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '').trim().slice(0, n);
const csvCell = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
const esc2 = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const trTime = (t) => (t ? new Date(t + 3 * 3600000).toISOString().replace('T', ' ').slice(0, 19) : '');

// Saklama süreleri (gün). Yasal saklama gerektiren mali kayıtlar 10 yıl (VUK m.253, TTK m.82).
const KEEP = {
  selfie: 30, notifRead: 180, notif: 365, clientErr: 90, reset: 1, pendingPref: 30, deletedAcc: 365, cases: 730,
  kvkk: 3 * 365, consentGone: 3 * 365, loginEv: 365, shares: 7, money: 10 * 365, imhaLog: 3 * 365, alerts: 365,
};
const RULES = [
  ['selfie', 'Doğrulama selfie’leri', 'Karar verildikten 30 gün sonra fotoğraf silinir (sonuç kaydı kalır)'],
  ['notif', 'Bildirimler', 'Okunanlar 180 gün, tümü en geç 1 yıl'],
  ['clientErr', 'Uygulama hata kayıtları', '90 gün'],
  ['reset', 'Şifre sıfırlama kodları', 'Süresi dolunca'],
  ['pendingPref', 'Rızası beklenen kaydırma tercihi', 'Yanıt verilmezse 30 gün sonra'],
  ['deletedAcc', 'Silinen hesap kaydı (kullanıcı adı, silme nedeni)', '1 yıl'],
  ['cases', 'Kapanan şikayet, itiraz, moderasyon ve destek kayıtları', '2 yıl'],
  ['kvkk', 'Sonuçlanan KVKK başvuruları ve hak ihlali bildirimleri', '3 yıl'],
  ['consentGone', 'Silinen hesapların rıza kayıtları', '3 yıl (İYS onay ispatı)'],
  ['loginEv', 'Giriş ve cihaz kayıtları', '1 yıl'],
  ['shares', 'Buluşma paylaşım bağlantıları', 'Buluşmadan 7 gün sonra'],
  ['trafik', '5651 trafik kayıtları', '2 yıl (en az 1 yıl zorunlu)'],
  ['money', 'Sipariş, ödeme, iade ve jeton hareketleri', '10 yıl (vergi ve ticaret mevzuatı)'],
  ['inactive', 'Uzun süre kullanılmayan hesaplar', 'Ayarlanan süre (varsayılan 24 ay); silmeden 30 gün önce uyarılır'],
  ['imhaLog', 'İmha kayıtları', '3 yıl'],
];

module.exports = function uyum(app, ctx) {
  const { store, notify, purgeUser, pushAdmins, trafik, brief } = ctx;
  const A = ctx.admin || {};
  if (!A.adminAuth) return;
  const user = (id) => store.get('users', id);
  const owners = () => store.filter('adm_admins', (a) => a.role === 'owner' && !a.disabled).map((a) => a.id);
  const legal = () => store.get('settings', 'legal') || {};

  // ================= Şüpheli yönetici işlemleri =================
  const alert = (admin, kind, text) => {
    const a = store.put('adm_alerts', { id: nanoid(10), at: now(), adminId: admin?.id || null, admin: admin?.username || '', kind, text });
    A.audit?.(admin, `güvenlik uyarısı: ${text}`);
    pushAdmins?.({ title: '⚠️ Yönetim güvenlik uyarısı', text: `@${admin?.username || '?'} · ${text}`, url: '#/hukuk', only: owners() });
    return a;
  };
  A.sensitive = (req, what) => alert(req.admin, 'disari-aktarim', what);
  const seen = new Map(); // yönetici → { ids: Map(userId → zaman), warnedAt }
  const EXPORTS = [[/^\/api\/admin\/database\/backup/, 'veritabanı yedeğini indirdi'], [/^\/api\/admin\/backups\/[^/]+$/, 'bir yedeği indirdi'], [/^\/api\/admin\/hukuk\/(iys|consents)\.csv/, 'izin kayıtlarını dışa aktardı'], [/^\/api\/admin\/hukuk\/trafik\.csv/, '5651 trafik kayıtlarını dışa aktardı'], [/^\/api\/admin\/muhasebe\.csv/, 'muhasebe dökümünü (alıcı bilgileriyle) indirdi']];
  A.onAccess = (req) => {
    if (req.method !== 'GET') return;
    const p = req.originalUrl.split('?')[0];
    const ex = EXPORTS.find(([re]) => re.test(p)); if (ex) { alert(req.admin, 'disari-aktarim', ex[1]); return; }
    const m = /^\/api\/admin\/users\/([\w-]{6,})$/.exec(p); if (!m) return;
    const s = seen.get(req.admin.id) || { ids: new Map(), warnedAt: 0 }; seen.set(req.admin.id, s);
    const t = now(); s.ids.set(m[1], t); for (const [k, v] of s.ids) if (t - v > 10 * 60000) s.ids.delete(k);
    if (s.ids.size >= 40 && t - s.warnedAt > 3600000) { s.warnedAt = t; alert(req.admin, 'toplu-inceleme', `10 dakikada ${s.ids.size} farklı kullanıcının profilini açtı`); }
  };

  // ================= Saklama ve imha =================
  const RSET = () => ({ inactiveOn: true, inactiveMonths: 24, warnDays: 30, ...(store.get('settings', 'retention') || {}) });
  const older = (t, days) => !!t && t < now() - days * DAY;
  async function runImha(trigger = 'otomatik', by = null) {
    const c = {}; const add = (k, n = 1) => { c[k] = (c[k] || 0) + n; };
    const del = (col, d, k) => { store.del(col, d.id); add(k); };
    // 1. doğrulama selfie'leri
    for (const v of store.filter('verifications', (x) => x.status !== 'pending' && x.selfie && older(x.closedAt || x.at, KEEP.selfie))) {
      const id = /\/media\/([\w-]+)/.exec(String(v.selfie))?.[1];
      try { if (id) { await store.deleteMedia(id); ctx.dropMediaCache?.(id); store.del('media_meta', id); } } catch { /* dosya zaten yoksa */ }
      store.update('verifications', v.id, { selfie: null, selfieDeletedAt: now() }); add('selfie');
    }
    // 2–5. bildirim, hata, sıfırlama kodu, rızası beklenen tercih
    store.filter('notifications', (n) => (n.read && older(n.at, KEEP.notifRead)) || older(n.at, KEEP.notif)).forEach((n) => del('notifications', n, 'notif'));
    store.filter('client_errors', (x) => older(x.at || x.lastAt, KEEP.clientErr)).forEach((x) => del('client_errors', x, 'clientErr'));
    store.filter('resets', (x) => x.exp && x.exp < now() - KEEP.reset * DAY).forEach((x) => del('resets', x, 'reset'));
    store.filter('users', (u) => u.lookingForPending && older(u.lookingForPendingAt, KEEP.pendingPref)).forEach((u) => { store.update('users', u.id, { lookingForPending: null, lookingForPendingAt: null }); add('pendingPref'); });
    // 6–9. kapanmış kayıtlar
    store.filter('deleted_accounts', (x) => older(x.at, KEEP.deletedAcc)).forEach((x) => del('deleted_accounts', x, 'deletedAcc'));
    for (const col of ['reports', 'appeals', 'flags', 'photo_flags', 'support']) {
      store.filter(col, (x) => !['open', 'pending'].includes(x.status) && older(x.closedAt || x.decidedAt || x.lastAt || x.at, KEEP.cases)).forEach((x) => del(col, x, 'cases'));
    }
    for (const col of ['kvkk_requests', 'takedowns']) store.filter(col, (x) => x.status !== 'open' && older(x.answeredAt || x.closedAt || x.at, KEEP.kvkk)).forEach((x) => del(col, x, 'kvkk'));
    store.filter('consent_log', (x) => !user(x.userId) && older(x.at, KEEP.consentGone)).forEach((x) => del('consent_log', x, 'consentGone'));
    store.filter('login_events', (x) => older(x.at, KEEP.loginEv)).forEach((x) => del('login_events', x, 'loginEv'));
    store.filter('safety', (x) => older(x.when || x.at, KEEP.shares)).forEach((x) => del('safety', x, 'shares'));
    for (const col of ['orders', 'refunds', 'coin_tx', 'earn_tx', 'payouts', 'mk_orders']) store.filter(col, (x) => older(x.closedAt || x.at, KEEP.money)).forEach((x) => del(col, x, 'money'));
    store.filter('adm_alerts', (x) => older(x.at, KEEP.alerts)).forEach((x) => store.del('adm_alerts', x.id));
    // 10. uzun süre kullanılmayan hesaplar: önce uyarı, süre dolunca silme (bakiye / kazanç / açık sipariş varsa silinmez)
    const R = RSET();
    if (R.inactiveOn) {
      const cut = now() - R.inactiveMonths * 30 * DAY;
      for (const u of store.filter('users', (x) => !x.isBot && !['falci', 'official'].includes(x.role))) {
        const last = Math.max(u.lastSeen || 0, u.createdAt || 0);
        if (u.inactiveWarnAt && last > u.inactiveWarnAt) { store.update('users', u.id, { inactiveWarnAt: null }); continue; } // geri döndü
        if (last >= cut) continue;
        if (!u.inactiveWarnAt) {
          store.update('users', u.id, { inactiveWarnAt: now() });
          notify(u.id, { type: 'system', text: `Hesabını uzun süredir kullanmıyorsun. Saklama politikamız gereği ${R.warnDays} gün içinde giriş yapmazsan hesabın ve verilerin silinecek.`, url: '/#/legal/saklama', tag: 'pasif-hesap' });
          if (u.email && mail.enabled()) mail.send(u.email, 'SwipeUp hesabın silinecek', `Merhaba ${u.name || u.username},\n\nSwipeUp hesabını ${R.inactiveMonths} aydır kullanmıyorsun. Kişisel verileri gereğinden uzun saklamamak için ${R.warnDays} gün içinde giriş yapmazsan hesabın ve verilerin silinecek. Hesabını korumak için uygulamaya bir kez girmen yeterli.\n\nSwipeUp`).catch(() => {});
          add('inactiveWarn'); continue;
        }
        if (now() - u.inactiveWarnAt < R.warnDays * DAY) continue;
        const busy = (u.coins || 0) > 0 || (u.earnings || 0) > 0 || store.filter('orders', (o) => o.userId === u.id && ['pending', 'paid'].includes(o.status)).length || store.filter('payouts', (p) => p.userId === u.id && p.status === 'open').length;
        if (busy) continue; // bakiye ya da açık işlem varsa yönetim elle karar verir
        store.put('deleted_accounts', { id: u.id, username: u.username, reason: `Pasif hesap: ${R.inactiveMonths} ay kullanılmadı (otomatik imha)`, at: now() });
        purgeUser(u.id); add('inactive');
      }
    }
    const total = Object.entries(c).reduce((a, [k, n]) => a + (k === 'inactiveWarn' ? 0 : n), 0);
    if (total || c.inactiveWarn) store.put('imha_log', { id: nanoid(10), at: now(), trigger, by, counts: c });
    store.filter('imha_log', (x) => older(x.at, KEEP.imhaLog)).forEach((x) => store.del('imha_log', x.id));
    store.put('settings', { ...(store.get('settings', 'retention') || {}), id: 'retention', lastRun: now(), lastCounts: c });
    return c;
  }
  setTimeout(() => runImha().catch((e) => console.error('[imha]', e.message)), 3 * 60000).unref?.();
  setInterval(() => runImha().catch((e) => console.error('[imha]', e.message)), 12 * 3600000).unref?.();
  ctx.retentionRules = RULES; ctx.retentionKeep = KEEP;

  app.get('/api/admin/hukuk/imha', A.adminAuth, (req, res) => res.json({ rules: RULES.map(([key, label, keep]) => ({ key, label, keep })), settings: RSET(), log: store.all('imha_log').sort((a, b) => b.at - a.at).slice(0, 30) }));
  app.put('/api/admin/hukuk/imha', A.adminAuth, A.owner, (req, res) => {
    const m = parseInt(req.body?.inactiveMonths, 10);
    const doc = store.put('settings', { ...(store.get('settings', 'retention') || {}), id: 'retention', inactiveOn: req.body?.inactiveOn !== false, inactiveMonths: Number.isFinite(m) ? Math.max(12, Math.min(60, m)) : 24 });
    A.audit?.(req.admin, 'saklama ayarlarını güncelledi', null, `pasif hesap: ${doc.inactiveOn ? `${doc.inactiveMonths} ay` : 'kapalı'}`);
    res.json(doc);
  });
  app.post('/api/admin/hukuk/imha/run', A.adminAuth, A.owner, async (req, res) => {
    try { const c = await runImha('elle', req.admin.username); A.audit?.(req.admin, 'periyodik imhayı elle çalıştırdı', null, JSON.stringify(c)); res.json({ ok: true, counts: c }); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ================= 5651 trafik kayıtları =================
  const range = (q) => {
    const from = q.from ? new Date(String(q.from) + 'T00:00:00+03:00').getTime() : now() - 7 * DAY;
    const to = q.to ? new Date(String(q.to) + 'T23:59:59.999+03:00').getTime() : now();
    return Number.isFinite(from) && Number.isFinite(to) && from <= to ? { from, to } : null;
  };
  app.get('/api/admin/hukuk/trafik/stats', A.adminAuth, async (req, res) => { try { res.json({ ...(await trafik.stats()), seals: store.all('trafik_seal').length }); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.get('/api/admin/hukuk/trafik/verify', A.adminAuth, async (req, res) => {
    const r = range(req.query); if (!r) return res.status(400).json({ error: 'Tarih aralığı geçersiz.' });
    try { const v = await trafik.verify(r); A.audit?.(req.admin, 'trafik kayıtlarının bütünlüğünü doğruladı', null, `${v.count} kayıt · ${v.ok ? 'sağlam' : 'BOZUK'}`); res.json(v); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/admin/hukuk/trafik.csv', A.adminAuth, async (req, res) => {
    const r = range(req.query); if (!r) return res.status(400).json({ error: 'Tarih aralığı geçersiz.' });
    let uid = null;
    const un = str(req.query.username, 40).replace(/^@/, '').toLowerCase();
    if (un) { const u = store.find('users', (x) => x.username === un) || store.find('deleted_accounts', (x) => x.username === un); if (!u) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' }); uid = u.id; }
    try {
      const rows = await trafik.query({ ...r, uid });
      const name = (id) => (id ? user(id)?.username || store.get('deleted_accounts', id)?.username || id : '');
      const body = rows.map((x) => [x.id, trTime(Date.parse(x.at)), x.at, name(x.uid), x.uid || '', x.ip || '', x.ev, x.method || '', x.path || '', x.status ?? '', x.dev || '', x.ua || '', x.hash].map(csvCell).join(',')).join('\n');
      res.set('Content-Disposition', `attachment; filename="trafik-${new Date(r.from).toISOString().slice(0, 10)}_${new Date(r.to).toISOString().slice(0, 10)}${un ? '-' + un : ''}.csv"`).type('text/csv; charset=utf-8')
        .send(`﻿kayit_no,tarih_saat_TSI,tarih_saat_UTC,kullanici,kullanici_id,ip,olay,yontem,islem,sonuc,cihaz,tarayici,ozet\n${body}\n`);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ================= Veri ihlali kayıtları =================
  const ihlalNo = () => { const y = new Date().getFullYear(); const n = store.filter('ihlaller', (x) => String(x.no).startsWith(`IHL-${y}`)).length + 1; return `IHL-${y}-${String(n).padStart(3, '0')}`; };
  const CATS = ['Kimlik (ad, kullanıcı adı, doğum tarihi)', 'İletişim (e-posta)', 'Profil fotoğrafları ve paylaşımlar', 'Mesajlar', 'Konum', 'Kaydırma tercihi (özel nitelikli)', 'Doğrulama selfie’si', 'Sipariş ve ödeme bilgileri (IBAN dahil)', 'Giriş ve trafik bilgileri', 'Şifre özetleri'];
  const ihlalOut = (x) => ({ ...x, deadline: x.detectedAt + 72 * 3600000 });
  const FIELDS = { title: 120, desc: 4000, cause: 2000, consequences: 2000, measures: 3000, subjects: 300, contact: 300, note: 2000 };
  const readIhlal = (b, base = {}) => {
    const o = { ...base };
    for (const [k, n] of Object.entries(FIELDS)) if (b[k] !== undefined) o[k] = str(b[k], n);
    if (b.categories !== undefined) o.categories = (Array.isArray(b.categories) ? b.categories : []).map((x) => str(x, 80)).filter((x) => CATS.includes(x));
    if (b.people !== undefined) o.people = Math.max(0, parseInt(b.people, 10) || 0);
    for (const k of ['startedAt', 'endedAt', 'detectedAt', 'kurulAt', 'usersAt']) if (b[k] !== undefined) { const t = b[k] ? new Date(b[k]).getTime() : null; o[k] = Number.isFinite(t) ? t : null; }
    if (b.status !== undefined) o.status = b.status === 'closed' ? 'closed' : 'open';
    return o;
  };
  app.get('/api/admin/hukuk/ihlal', A.adminAuth, (req, res) => res.json({ cats: CATS, items: store.all('ihlaller').sort((a, b) => b.detectedAt - a.detectedAt).map(ihlalOut), alerts: store.all('adm_alerts').sort((a, b) => b.at - a.at).slice(0, 30) }));
  app.post('/api/admin/hukuk/ihlal', A.adminAuth, (req, res) => {
    const o = readIhlal(req.body || {}, { status: 'open' });
    if (!o.title || o.title.length < 3) return res.status(400).json({ error: 'İhlale kısa bir başlık yaz.' });
    if (!o.detectedAt) o.detectedAt = now();
    const x = store.put('ihlaller', { id: nanoid(10), no: ihlalNo(), at: now(), by: req.admin.username, ...o });
    A.audit?.(req.admin, 'veri ihlali kaydı açtı', null, `${x.no} · ${x.title}`);
    pushAdmins?.({ title: '🚨 Veri ihlali kaydı açıldı', text: `${x.no} · ${x.title} · Kurul bildirimi için 72 saat`, url: '#/hukuk', only: owners() });
    res.json(ihlalOut(x));
  });
  app.put('/api/admin/hukuk/ihlal/:id', A.adminAuth, (req, res) => {
    const x = store.get('ihlaller', req.params.id); if (!x) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    const o = readIhlal(req.body || {}); const y = store.update('ihlaller', x.id, { ...o, updatedAt: now(), updatedBy: req.admin.username });
    A.audit?.(req.admin, 'veri ihlali kaydını güncelledi', null, x.no); res.json(ihlalOut(y));
  });
  // Kurul bildirimi için taslak metin (Kurul'un veri ihlali bildirim formundaki başlıklar)
  app.get('/api/admin/hukuk/ihlal/:id/taslak', A.adminAuth, (req, res) => {
    const x = store.get('ihlaller', req.params.id); if (!x) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    const L = legal(); const d = (t) => (t ? trTime(t) : '—');
    const late = x.kurulAt ? x.kurulAt - x.detectedAt > 72 * 3600000 : now() - x.detectedAt > 72 * 3600000;
    const text = `VERİ İHLALİ BİLDİRİMİ (taslak · ${x.no})

1. Veri sorumlusu: ${L.company || '[unvan / ad soyad]'}${L.vkn ? ` · VKN/TCKN ${L.vkn}` : ''}${L.mersis ? ` · MERSİS ${L.mersis}` : ''}
   Adres: ${L.address || '[adres]'} · E-posta: ${L.email || '[e-posta]'}${L.kep ? ` · KEP: ${L.kep}` : ''}${L.phone ? ` · Tel: ${L.phone}` : ''}
   İrtibat kişisi: ${x.contact || '[ad soyad, iletişim]'}
2. Ürün / hizmet: SwipeUp (tanışma ve sosyal uygulama)
3. İhlalin başlangıç tarihi: ${d(x.startedAt)} · bitiş tarihi: ${d(x.endedAt)} · tespit tarihi: ${d(x.detectedAt)}
4. İhlalin nasıl gerçekleştiği / kaynağı: ${x.cause || x.desc || '[açıklama]'}
5. Etkilenen kişisel veri kategorileri: ${(x.categories || []).join('; ') || '[kategoriler]'}
6. Etkilenen kişi grupları ve yaklaşık sayısı: ${x.subjects || 'Uygulama üyeleri'} · ${x.people || '[sayı]'} kişi
7. İhlalin olası sonuçları: ${x.consequences || '[olası sonuçlar]'}
8. Alınan ve alınması planlanan tedbirler: ${x.measures || '[tedbirler]'}
9. İlgili kişilere bildirim: ${x.usersAt ? `${d(x.usersAt)} tarihinde uygulama içi bildirim ve e-postayla yapıldı` : 'henüz yapılmadı'}
${late ? `10. Gecikme gerekçesi (72 saat aşıldıysa): [gerekçe]\n` : ''}
Bildirim, Kişisel Verileri Koruma Kurumu'nun internet sitesindeki "Veri İhlali Bildirimi" formu üzerinden yapılır.`;
    res.json({ text, late });
  });
  // Etkilenen kişilere bildirim (makul en kısa sürede; uygulama içi + e-posta)
  app.post('/api/admin/hukuk/ihlal/:id/notify', A.adminAuth, A.owner, (req, res) => {
    const x = store.get('ihlaller', req.params.id); if (!x) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    const text = str(req.body?.text, 3000); if (text.length < 40) return res.status(400).json({ error: 'Bildirim metnini yaz: ne oldu, hangi verilerin etkilendi, ne yaptık, kişinin ne yapması gerekir, kime başvurabilir.' });
    const all = req.body?.audience === 'all';
    const names = all ? [] : String(req.body?.usernames || '').split(/[\s,]+/).map((s) => s.replace(/^@/, '').toLowerCase()).filter(Boolean);
    const targets = all ? store.filter('users', (u) => !u.isBot) : names.map((n) => store.find('users', (u) => u.username === n)).filter(Boolean);
    if (!targets.length) return res.status(400).json({ error: 'Bildirilecek kullanıcı bulunamadı.' });
    let mails = 0;
    for (const u of targets) {
      notify(u.id, { type: 'system', text: `Güvenlik bildirimi (${x.no}): ${text.slice(0, 180)}${text.length > 180 ? '…' : ''}`, url: '/#/guvenlik', tag: `ihlal-${x.id}` });
      if (u.email && mail.enabled()) { mails++; mail.send(u.email, 'SwipeUp güvenlik bildirimi: kişisel verilerinle ilgili bir olay', `Merhaba ${u.name || u.username},\n\n${text}\n\nSorularını uygulamadaki Destek bölümünden ya da ${legal().email || 'iletişim adresimizden'} iletebilirsin. KVKK kapsamındaki haklarını Ayarlar › Veri taleplerim ekranından kullanabilirsin.\n\nSwipeUp`).catch(() => {}); }
    }
    const y = store.update('ihlaller', x.id, { usersAt: now(), usersCount: targets.length, usersText: text });
    A.audit?.(req.admin, 'veri ihlalini ilgili kişilere bildirdi', null, `${x.no} · ${targets.length} kişi · ${mails} e-posta`);
    res.json({ ok: true, count: targets.length, mails, item: ihlalOut(y) });
  });

  // ================= Muhasebe dökümü (e-Arşiv fatura için) =================
  app.get('/api/admin/muhasebe.csv', A.adminAuth, (req, res) => {
    const r = range({ from: req.query.from || new Date(now() - 30 * DAY).toISOString().slice(0, 10), to: req.query.to }); if (!r) return res.status(400).json({ error: 'Tarih aralığı geçersiz.' });
    const kdv = Math.max(0, Math.min(30, parseFloat(req.query.kdv) || 20));
    const n2 = (x) => x.toFixed(2).replace('.', ',');
    const row = (type, o, amount, at, extra = '') => {
      const u = user(o.userId); const total = Math.round(amount * 100) / 100; const net = Math.round((total / (1 + kdv / 100)) * 100) / 100;
      return [type, o.code, trTime(o.at), trTime(at), o.sender || u?.name || store.get('deleted_accounts', o.userId)?.username || '', u?.email || '', '11111111111', o.title, 1, `%${kdv}`, n2(type === 'İade' ? -net : net), n2(type === 'İade' ? -(total - net) : total - net), n2(type === 'İade' ? -total : total), 'TRY', 'Havale / EFT', u ? '@' + u.username : '(silinmiş hesap)', extra].map(csvCell).join(';');
    };
    const sales = store.filter('orders', (o) => ['approved', 'refunded'].includes(o.status) && (o.approvedAt || o.closedAt) >= r.from && (o.approvedAt || o.closedAt) <= r.to).sort((a, b) => (a.approvedAt || a.closedAt) - (b.approvedAt || b.closedAt));
    const refunds = store.filter('refunds', (x) => x.status === 'approved' && x.closedAt >= r.from && x.closedAt <= r.to).map((x) => ({ x, o: store.get('orders', x.orderId) })).filter((y) => y.o);
    const lines = [...sales.map((o) => row('Satış', o, o.amount, o.approvedAt || o.closedAt, o.status === 'refunded' ? 'Sonradan iade edildi' : '')), ...refunds.map(({ x, o }) => row('İade', o, x.amount, x.closedAt, REFUND[x.reason] || x.reason))];
    const head = ['Tür', 'Sipariş kodu', 'Sipariş tarihi', 'Onay / fatura tarihi', 'Alıcı adı soyadı', 'Alıcı e-posta', 'Alıcı TCKN (bilinmiyorsa 11111111111)', 'Ürün / hizmet', 'Miktar', 'KDV oranı', 'KDV hariç tutar', 'KDV tutarı', 'Toplam (KDV dahil)', 'Para birimi', 'Ödeme yöntemi', 'Kullanıcı', 'Not'].map(csvCell).join(';');
    res.set('Content-Disposition', `attachment; filename="muhasebe-${new Date(r.from).toISOString().slice(0, 10)}_${new Date(r.to).toISOString().slice(0, 10)}.csv"`).type('text/csv; charset=utf-8').send(`﻿${head}\n${lines.join('\n')}\n`);
  });

  // ================= Kampanya e-postası (6563 / Ticari İletişim Yönetmeliği) =================
  // Yalnızca e-posta izni (İYS) olanlara; gönderen kimliği ve tek tıkla ücretsiz ret bağlantısı her iletide bulunur.
  const crypto = require('crypto');
  const express = require('express');
  const retKey = () => crypto.createHash('sha256').update('eposta-ret:' + (store.get('meta', 'secrets')?.jwt || process.env.JWT_SECRET || '')).digest();
  const retTok = (uid) => crypto.createHmac('sha256', retKey()).update(String(uid)).digest('base64url').slice(0, 32);
  const baseUrl = (req) => (process.env.CANONICAL_URL || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const footer = (link) => {
    const L = legal();
    const who = [L.company || 'SwipeUp', L.brand && L.brand !== L.company ? `(${L.brand})` : '', L.mersis ? `MERSİS ${L.mersis}` : L.vkn ? `VKN ${L.vkn}` : ''].filter(Boolean).join(' · ');
    return `\n\n—\nBu ticari elektronik iletiyi, kampanya e-postası almaya onay verdiğin için aldın.\nGönderen: ${who}${L.address ? `\nAdres: ${L.address}` : ''}${L.email ? `\nİletişim: ${L.email}` : ''}${L.kep ? ` · KEP: ${L.kep}` : ''}\nArtık almak istemiyorsan ücretsiz ve tek tıkla ayrıl: ${link}`;
  };
  A.marketingMail = (list, { title, text }, req) => {
    if (!mail.enabled()) return 0;
    const b = baseUrl(req); const targets = list.filter((u) => u.email && u.consents?.marketingEmail?.on);
    (async () => {
      for (const u of targets) {
        const fresh = user(u.id); if (!fresh?.consents?.marketingEmail?.on) continue; // gönderim sırasında ret ettiyse atla
        const link = `${b}/eposta-ret?u=${u.id}&t=${retTok(u.id)}`;
        try { await mail.send(u.email, title, `${text}${footer(link)}`, { headers: { 'List-Unsubscribe': `<${link}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }); } catch (e) { console.error('[kampanya e-postası]', e.message); }
        await new Promise((r) => setTimeout(r, 400));
      }
    })();
    return targets.length;
  };
  const retUser = (q) => { const u = user(str(q.u, 20)); return u && str(q.t, 64) === retTok(u.id) ? u : null; };
  const retPage = (title, body) => `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} · SwipeUp</title><link rel="stylesheet" href="/fonts/fonts.css"><style>body{margin:0;font:16px/1.55 "Bricolage Grotesque",system-ui,sans-serif;color:#1d1320;background:#fff7f5}main{max-width:480px;margin:0 auto;padding:40px 20px}h1{font-size:24px;line-height:1.25}button{width:100%;height:50px;border:0;border-radius:14px;background:#ff4f6d;color:#fff;font:700 16px inherit;font-family:inherit;cursor:pointer}p{color:#4b3f50}</style></head><body><main>${body}</main></body></html>`;
  const unsub = (u, req) => { ctx.setConsents?.(u.id, { marketingEmail: false }, req, 'e-posta ret bağlantısı'); trafik?.log('ret', { req, uid: u.id, path: 'kampanya e-postası ret' }); };
  app.get('/eposta-ret', (req, res) => {
    res.set('X-Robots-Tag', 'noindex').set('Referrer-Policy', 'no-referrer');
    const u = retUser(req.query);
    if (!u) return res.status(400).send(retPage('Bağlantı geçersiz', '<h1>Bu bağlantı geçersiz</h1><p>Kampanya e-postası iznini uygulamada Ayarlar › İzinlerim’den de kapatabilirsin.</p>'));
    if (!u.consents?.marketingEmail?.on) return res.send(retPage('Zaten ayrıldın', '<h1>Kampanya e-postalarından zaten ayrıldın</h1><p>Bize kampanya e-postası gönderme iznin kapalı. Hesabın, siparişlerin ve güvenliğinle ilgili bilgilendirme e-postaları gelmeye devam eder.</p>'));
    res.send(retPage('Kampanya e-postalarından ayrıl', `<h1>Kampanya e-postalarından ayrılmak istiyor musun?</h1><p>@${esc2(u.username)} hesabına kampanya ve yenilik e-postası gönderilmez; ret kaydın İleti Yönetim Sistemi’ne de iletilir.</p><form method="post" action="/eposta-ret?u=${esc2(u.id)}&t=${esc2(str(req.query.t, 64))}"><button>Ayrıl</button></form>`));
  });
  // Tek tıkla ret (RFC 8058): e-posta istemcileri doğrudan POST gönderir
  app.post('/eposta-ret', express.urlencoded({ extended: false, limit: '2kb' }), (req, res) => {
    const u = retUser(req.query);
    if (!u) return res.status(400).send(retPage('Bağlantı geçersiz', '<h1>Bu bağlantı geçersiz</h1>'));
    if (u.consents?.marketingEmail?.on) unsub(u, req);
    res.send(retPage('Ayrıldın', '<h1>Kampanya e-postalarından ayrıldın</h1><p>Bundan sonra sana kampanya e-postası gönderilmeyecek. Fikrini değiştirirsen uygulamada Ayarlar › İzinlerim’den yeniden açabilirsin.</p>'));
  });

  // Hukuk bölümündeki sayaçlara açık ihlal kayıtları da eklenir
  const prevCount = A.legalOpenCount;
  A.legalOpenCount = () => (prevCount?.() || 0) + store.filter('ihlaller', (x) => x.status === 'open').length;
  void brief;
};
module.exports.KEEP = KEEP;
module.exports.RULES = RULES;
