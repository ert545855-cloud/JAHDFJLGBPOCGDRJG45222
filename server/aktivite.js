// Kullanıcı hareketleri: her üyenin uygulamada yaptığı işlemler (giriş, kaydırma, eşleşme, mesaj, paylaşım, oyun,
// satın alma, güvenlik...) zaman sırasıyla kaydedilir. Yönetim panelinde kullanıcı kartında ve "Hareketler" sayfasında,
// üyenin kendisine Güvenlik merkezinde gösterilir; KVKK veri dökümüne eklenir.
// Mesaj, yorum ya da gönderi METNİ, şifre, dosya içeriği kaydedilmez; yalnızca işlemin türü, zamanı, karşı taraf ve IP.
// Ayrı tabloda tutulur (belleğe yüklenmez); 1 yıl sonra periyodik imhayla silinir.
const fs = require('fs');
const path = require('path');

const KEEP_DAYS = 365;
const DAY = 86400000;
const KAT = { hesap: 'Hesap', giris: 'Giriş', kaydirma: 'Kaydırma', eslesme: 'Eşleşme', mesaj: 'Mesaj', paylasim: 'Paylaşım', hikaye: 'Hikaye', profil: 'Profil', sosyal: 'Sosyal', oyun: 'Oyun', canli: 'Canlı yayın / arama', magaza: 'Mağaza ve ödeme', fal: 'Fal', guvenlik: 'Güvenlik', destek: 'Destek ve şikayet', diger: 'Diğer' };

// Bilinen işlemler: "YÖNTEM /yol" → [kategori, açıklama]. {t} karşı taraf (@kullanıcı), {x} ayrıntı ile doldurulur.
const L = {
  'POST /api/auth/register': ['hesap', 'Hesap oluşturdu'],
  'POST /api/auth/login': ['giris', 'Şifreyle giriş yaptı'],
  'POST /api/auth/oauth': ['giris', 'Google / Apple ile giriş yaptı'],
  'POST /api/auth/google/code': ['giris', 'Google ile giriş yaptı'],
  'POST /api/auth/forgot': ['guvenlik', 'Şifre sıfırlama kodu istedi'],
  'POST /api/auth/reset': ['guvenlik', 'Şifresini sıfırladı'],
  'PATCH /api/me': ['profil', 'Profilini düzenledi'],
  'PUT /api/me/consents': ['hesap', 'İzinlerini (açık rıza) değiştirdi'],
  'POST /api/me/password': ['guvenlik', 'Şifresini değiştirdi'],
  'POST /api/me/logout-others': ['guvenlik', 'Diğer cihazlardaki oturumları kapattı'],
  'POST /api/me/terms': ['hesap', 'Güncel kullanım koşullarını onayladı'],
  'POST /api/me/notify-prefs': ['hesap', 'Bildirim tercihlerini değiştirdi'],
  'POST /api/me/recovery': ['guvenlik', 'Kurtarma kodunu yeniledi'],
  'POST /api/security/not-me': ['guvenlik', '“Bu ben değilim” dedi, oturumları kapattı'],
  'POST /api/security/its-me': ['guvenlik', 'Yeni cihaz girişini onayladı'],
  'POST /api/upload': ['paylasim', 'Dosya yükledi'],
  'POST /api/verify': ['profil', 'Selfie doğrulaması gönderdi'],
  'GET /api/swipe/deck': ['kaydirma', 'Keşfet destesini açtı'],
  'POST /api/swipe': ['kaydirma', 'Kaydırdı {x} → {t}'],
  'POST /api/swipe/undo': ['kaydirma', 'Son kaydırmayı geri aldı'],
  'POST /api/swipe/reset': ['kaydirma', 'Kaydırma geçmişini sıfırladı'],
  'POST /api/second-chance/:userId': ['kaydirma', 'İkinci şans verdi → {t}'],
  'POST /api/boost': ['magaza', 'Boost kullandı'],
  'POST /api/supers/buy': ['magaza', 'Süper beğeni paketi aldı'],
  'GET /api/users/:username': ['profil', 'Profil görüntüledi → {t}'],
  'POST /api/users/:id/view': ['profil', 'Profil görüntüledi → {t}'],
  'POST /api/users/:id/follow': ['sosyal', 'Takip etti / bıraktı → {t}'],
  'POST /api/follow-requests/:uid': ['sosyal', 'Takip isteğini yanıtladı → {t}'],
  'POST /api/users/:id/block': ['guvenlik', 'Engelledi / engeli kaldırdı → {t}'],
  'POST /api/users/:id/report': ['destek', 'Şikayet etti → {t}'],
  'POST /api/users/:id/unmatch': ['eslesme', 'Eşleşmeyi kaldırdı → {t}'],
  'POST /api/users/:id/super-message': ['eslesme', 'Süper mesaj gönderdi → {t}'],
  'POST /api/users/:id/prompt-reply': ['eslesme', 'Profil sorusunu yanıtladı → {t}'],
  'POST /api/close-friends/:id': ['sosyal', 'Yakın arkadaşlarını düzenledi → {t}'],
  'GET /api/chats/:id': ['mesaj', 'Sohbeti açtı {t}'],
  'POST /api/chats': ['mesaj', 'Sohbet başlattı {t}'],
  'DELETE /api/chats/:id': ['mesaj', 'Sohbeti sildi {t}'],
  'POST /api/chats/:id/messages': ['mesaj', 'Mesaj gönderdi {t}'],
  'POST /api/chats/:id/gift': ['magaza', 'Sohbette hediye gönderdi {t}'],
  'POST /api/chats/:id/sticker': ['mesaj', 'Çıkartma gönderdi {t}'],
  'POST /api/chats/:id/plan': ['eslesme', 'Buluşma planı önerdi {t}'],
  'POST /api/chats/:id/game': ['oyun', 'Sohbette oyun başlattı {t}'],
  'POST /api/chats/:id/mini': ['oyun', 'Sohbette mini oyun başlattı {t}'],
  'POST /api/chats/:id/compat': ['eslesme', 'Uyum testi başlattı {t}'],
  'PATCH /api/chats/:id/ttl': ['mesaj', 'Kaybolan mesaj süresini değiştirdi {t}'],
  'POST /api/report/message': ['destek', 'Bir mesajı şikayet etti'],
  'POST /api/posts': ['paylasim', 'Gönderi paylaştı'],
  'DELETE /api/posts/:id': ['paylasim', 'Gönderisini sildi'],
  'POST /api/posts/:id/like': ['sosyal', 'Gönderi beğendi {t}'],
  'POST /api/posts/:id/comments': ['sosyal', 'Gönderiye yorum yaptı {t}'],
  'DELETE /api/posts/:id/comments/:cid': ['sosyal', 'Yorum sildi'],
  'POST /api/posts/:id/repost': ['paylasim', 'Gönderiyi yeniden paylaştı {t}'],
  'POST /api/posts/:id/save': ['sosyal', 'Gönderiyi kaydetti {t}'],
  'POST /api/posts/:id/vote': ['sosyal', 'Ankete oy verdi {t}'],
  'POST /api/stories': ['hikaye', 'Hikaye paylaştı'],
  'DELETE /api/stories/:id': ['hikaye', 'Hikayesini sildi'],
  'POST /api/stories/:id/view': ['hikaye', 'Hikaye izledi {t}'],
  'POST /api/stories/:id/react': ['hikaye', 'Hikayeye tepki verdi {t}'],
  'POST /api/stories/:id/reply': ['hikaye', 'Hikayeye yanıt yazdı {t}'],
  'POST /api/stories/:id/vote': ['hikaye', 'Hikaye anketine oy verdi {t}'],
  'POST /api/stories/:id/answer': ['hikaye', 'Hikaye sorusunu yanıtladı {t}'],
  'POST /api/notes': ['paylasim', 'Not paylaştı'],
  'POST /api/notes/:userId/like': ['sosyal', 'Notu beğendi → {t}'],
  'POST /api/notes/:userId/reply': ['sosyal', 'Nota yanıt yazdı → {t}'],
  'POST /api/orders': ['magaza', 'Sipariş oluşturdu {x}'],
  'POST /api/orders/:id/paid': ['magaza', 'Ödemeyi yaptığını bildirdi'],
  'DELETE /api/orders/:id': ['magaza', 'Siparişi iptal etti'],
  'POST /api/orders/:id/refund': ['magaza', 'İade talep etti'],
  'POST /api/payouts': ['magaza', 'Kazanç ödemesi talep etti'],
  'POST /api/stickers/:id/buy': ['magaza', 'Çıkartma paketi aldı'],
  'POST /api/wheel/spin': ['oyun', 'Hediye çarkını çevirdi'],
  'POST /api/quests/:id/claim': ['oyun', 'Görev ödülü aldı'],
  'POST /api/streaks/freeze': ['magaza', 'Seri dondurma kullandı'],
  'POST /api/fal': ['fal', 'Fal baktırdı {x}'],
  'POST /api/fal/sub': ['fal', 'Fal aboneliği aldı'],
  'POST /api/fal/packs/:id/buy': ['fal', 'Fal paketi aldı'],
  'POST /api/support': ['destek', 'Destek talebi açtı'],
  'POST /api/support/:id/reply': ['destek', 'Destek talebine yazdı'],
  'POST /api/support/:id/close': ['destek', 'Destek talebini kapattı'],
  'POST /api/appeals': ['destek', 'İtiraz gönderdi'],
  'POST /api/kvkk/requests': ['hesap', 'KVKK başvurusu yaptı'],
  'POST /api/safety': ['guvenlik', 'Buluşmasını paylaştı'],
  'POST /api/safety/:token/ok': ['guvenlik', 'Buluşmadan sonra “iyiyim” dedi'],
  'POST /api/safety/:token/help': ['guvenlik', 'Buluşmada YARDIM İSTEDİ'],
  'POST /api/safety/:token/cancel': ['guvenlik', 'Buluşma paylaşımını iptal etti'],
  'POST /api/messages/:id/safety': ['guvenlik', 'Buluşma planını paylaştı'],
  'POST /api/invite/redeem': ['hesap', 'Davet kodu kullandı'],
  'POST /api/promos': ['magaza', 'Reklam oluşturdu'],
  'POST /api/market/items': ['magaza', 'Store’a ürün ekledi'],
  'POST /api/market/items/:id/buy': ['magaza', 'Store’dan ürün satın aldı'],
  'POST /api/events/:id/rsvp': ['sosyal', 'Etkinliğe katılım bildirdi'],
  'POST /api/clubs/:id/join': ['sosyal', 'Kulübe katıldı / ayrıldı'],
  'POST /api/clubs/:id/posts': ['paylasim', 'Kulüpte paylaşım yaptı'],
  'POST /api/groups': ['mesaj', 'Grup sohbeti oluşturdu'],
  'POST /api/checkins': ['paylasim', 'Check-in yaptı'],
  'POST /api/songs': ['paylasim', 'Şarkı yarışmasına şarkı ekledi'],
  'POST /api/songs/:id/vote': ['sosyal', 'Şarkı yarışmasında oy verdi'],
  'POST /api/dq/:id/reply': ['paylasim', 'Günün sorusunu yanıtladı'],
  'POST /api/karaoke/queue': ['oyun', 'Karaoke sırasına girdi'],
  'POST /api/kupa': ['oyun', 'Parti Kupası odası açtı'],
  'POST /api/kupa/:id/join': ['oyun', 'Parti Kupası’na katıldı'],
  'POST /api/kupa/:id/start': ['oyun', 'Parti Kupası’nı başlattı'],
};
const AREA = { play: 'Oyun', games: 'Oyun', mini: 'Mini oyun', kupa: 'Parti Kupası', farm: 'Çiftlik', market: 'Store', clubs: 'Kulüp', 'club-posts': 'Kulüp', dq: 'Günün sorusu', karaoke: 'Karaoke', songs: 'Şarkı yarışması', events: 'Etkinlik', checkins: 'Check-in', cifte: 'Çifte randevu', notes: 'Not', highlights: 'Öne çıkanlar', cosmetics: 'Görünüm', quests: 'Görev', promos: 'Reklam', fal: 'Fal', groups: 'Grup', music: 'Müzik', share: 'Paylaşım', ptheme: 'Profil teması', messages: 'Mesaj', me: 'Hesap', cizbil: 'Çiz Bil', okey: 'Okey' };
const AREA_KAT = { play: 'oyun', games: 'oyun', mini: 'oyun', kupa: 'oyun', farm: 'oyun', karaoke: 'oyun', market: 'magaza', promos: 'magaza', fal: 'fal', me: 'hesap', groups: 'mesaj', messages: 'mesaj' };
const VERB = { join: 'katıldı', leave: 'ayrıldı', start: 'başlattı', move: 'hamle yaptı', invite: 'davet etti', again: 'yeniden oynadı', buy: 'satın aldı', like: 'beğendi', vote: 'oy verdi', reply: 'yanıtladı', react: 'tepki verdi', claim: 'ödül aldı', spin: 'çevirdi', report: 'şikayet etti', accept: 'kabul etti', guess: 'tahmin yaptı', pick: 'seçim yaptı', act: 'işlem yaptı', gift: 'hediye gönderdi', fav: 'favoriye ekledi', cancel: 'iptal etti', paid: 'ödeme bildirdi', ship: 'kargoladı', received: 'teslim aldı', rate: 'puan verdi', chat: 'oyun sohbetine yazdı', opts: 'ayarları değiştirdi', enter: 'katıldı', swipe: 'kaydırdı', toggle: 'değiştirdi' };
// Kaydedilmeyecek gürültü: anlık durum, okundu bilgisi, istemci hataları, bildirim aboneliği
const SKIP = /^\/api\/(client-errors|push\/|quests\/ping|notifications\/read|insights\/seen|me\/now-playing|mod\/check|internal\/)/;
const SAFE_BODY = ['dir', 'productId', 'giftId', 'gift', 'kind', 'type', 'game', 'action', 'op', 'emoji', 'coins', 'amount', 'reason', 'visibility', 'tarot', 'mode'];
const SOCK = {
  'message:send': ['mesaj', 'Mesaj gönderdi'], 'message:delete': ['mesaj', 'Mesaj sildi'], 'message:react': ['mesaj', 'Mesaja tepki verdi'],
  'call:start': ['canli', 'Arama başlattı'], 'call:accept': ['canli', 'Aramayı kabul etti'], 'call:reject': ['canli', 'Aramayı reddetti'], 'call:end': ['canli', 'Aramayı bitirdi'],
  'live:start': ['canli', 'Canlı yayın başlattı'], 'live:stop': ['canli', 'Canlı yayını bitirdi'], 'live:join': ['canli', 'Canlı yayına katıldı'], 'live:leave': ['canli', 'Canlı yayından ayrıldı'],
  'live:gift': ['magaza', 'Canlı yayında hediye gönderdi'], 'live:comment': ['canli', 'Canlı yayına yorum yazdı'],
  'speed:join': ['eslesme', 'Hızlı tanışmaya katıldı'], 'speed:leave': ['eslesme', 'Hızlı tanışmadan ayrıldı'], 'speed:vote': ['eslesme', 'Hızlı tanışmada oy verdi'],
  'genel:join': ['sosyal', 'Genel sohbete girdi'], 'genel:send': ['sosyal', 'Genel sohbete yazdı'], 'genel:leave': ['sosyal', 'Genel sohbetten çıktı'],
  'farm:join': ['oyun', 'Çiftliğe girdi'], 'cb:join': ['oyun', 'Çiz Bil’e katıldı'],
};

module.exports = function aktivite(store, { ipOf }) {
  const buf = []; let ready = null; let started = false;
  const dir = () => path.join(store.dir || 'data', 'aktivite');
  const T = () => store.T('aktivite');
  async function init() {
    if (store.pg) {
      await store.pg.query(`CREATE TABLE IF NOT EXISTS ${T()} (id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(), uid TEXT NOT NULL, kat TEXT NOT NULL, text TEXT NOT NULL, target TEXT, ok BOOLEAN NOT NULL DEFAULT true, ip TEXT, dev TEXT, meta JSONB)`);
      await store.pg.query(`CREATE INDEX IF NOT EXISTS aktivite_uid ON ${T()} (uid, id DESC)`);
      await store.pg.query(`CREATE INDEX IF NOT EXISTS aktivite_at ON ${T()} (at)`);
    } else fs.mkdirSync(dir(), { recursive: true });
  }
  const user = (id) => (id ? store.get('users', id) : null);
  const tag = (u) => (u ? `@${u.username}` : '');

  function log(uid, kat, text, { target = null, ok = true, req = null, ip = null, dev = null, meta = null } = {}) {
    if (!uid) return;
    buf.push({ at: new Date().toISOString(), uid, kat, text: String(text).slice(0, 200), target, ok, ip: ip || (req ? ipOf(req) : null), dev: String(dev || req?.headers?.['x-device'] || '').slice(0, 40) || null, meta: meta && Object.keys(meta).length ? meta : null });
    if (buf.length > 5000) buf.splice(0, buf.length - 5000);
  }
  let flushing = false;
  async function flush() {
    if (flushing || !buf.length || !started) return; flushing = true;
    try {
      try { ready ||= init(); await ready; } catch (er) { ready = null; throw er; }
      const rows = buf.splice(0, 500);
      if (store.pg) {
        const cols = ['at', 'uid', 'kat', 'text', 'target', 'ok', 'ip', 'dev', 'meta'];
        await store.pg.query(`INSERT INTO ${T()} (${cols.join(',')}) SELECT * FROM unnest($1::timestamptz[], $2::text[], $3::text[], $4::text[], $5::text[], $6::bool[], $7::text[], $8::text[], $9::jsonb[])`,
          cols.map((c) => rows.map((r) => (c === 'meta' ? (r.meta ? JSON.stringify(r.meta) : null) : r[c]))));
      } else for (const r of rows) fs.appendFileSync(path.join(dir(), `${r.at.slice(0, 7)}.jsonl`), JSON.stringify({ id: `${Date.parse(r.at)}${String(Math.random()).slice(2, 6)}`, ...r }) + '\n');
    } catch (er) { console.error('[hareketler] yazılamadı:', er.message); } finally { flushing = false; }
  }
  setInterval(flush, 3000).unref();
  const start = () => { started = true; };

  // Sorgu: kullanıcıya göre ya da hepsi; en yeniden eskiye; before = sayfalama
  async function query({ uid = null, kat = null, before = null, limit = 50, from = null, to = null } = {}) {
    await flush(); try { ready ||= init(); await ready; } catch { ready = null; return []; }
    limit = Math.max(1, Math.min(500, limit | 0 || 50));
    if (store.pg) {
      const w = []; const v = [];
      if (uid) { v.push(uid); w.push(`uid = $${v.length}`); }
      if (kat) { v.push(kat); w.push(`kat = $${v.length}`); }
      if (before) { v.push(before); w.push(`id < $${v.length}`); }
      if (from) { v.push(new Date(from).toISOString()); w.push(`at >= $${v.length}`); }
      if (to) { v.push(new Date(to).toISOString()); w.push(`at <= $${v.length}`); }
      v.push(limit);
      const { rows } = await store.pg.query(`SELECT id, at, uid, kat, text, target, ok, ip, dev, meta FROM ${T()} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id DESC LIMIT $${v.length}`, v);
      return rows.map((r) => ({ ...r, id: String(r.id), at: new Date(r.at).getTime() }));
    }
    const out = [];
    if (!fs.existsSync(dir())) return out;
    for (const f of fs.readdirSync(dir()).filter((x) => x.endsWith('.jsonl')).sort().reverse()) {
      const lines = fs.readFileSync(path.join(dir(), f), 'utf8').trim().split('\n').reverse();
      for (const line of lines) {
        if (!line) continue; let r; try { r = JSON.parse(line); } catch { continue; }
        const t = Date.parse(r.at);
        if ((uid && r.uid !== uid) || (kat && r.kat !== kat) || (before && !(r.id < before)) || (from && t < from) || (to && t > to)) continue;
        out.push({ ...r, at: t }); if (out.length >= limit) return out;
      }
    }
    return out;
  }
  async function purge() {
    if (!started) return 0;
    const cut = Date.now() - KEEP_DAYS * DAY;
    try {
      ready ||= init(); await ready;
      if (store.pg) { const r = await store.pg.query(`DELETE FROM ${T()} WHERE at < $1`, [new Date(cut).toISOString()]); return r.rowCount || 0; }
      let n = 0; if (fs.existsSync(dir())) for (const f of fs.readdirSync(dir())) { const m = /^(\d{4}-\d{2})\.jsonl$/.exec(f); if (m && new Date(m[1] + '-01').getTime() + 31 * DAY < cut) { fs.unlinkSync(path.join(dir(), f)); n++; } }
      return n;
    } catch (er) { console.error('[hareketler] eski kayıtlar silinemedi:', er.message); return 0; }
  }

  // --- HTTP işlemlerini sınıflandır ---
  function describe(req, status) {
    const route = (req.baseUrl || '') + (req.route?.path || '');
    if (!route.startsWith('/api/') || route.startsWith('/api/admin') || SKIP.test(route)) return null;
    const key = `${req.method} ${route}`;
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const p = req.params || {};
    // karşı taraf
    let target = null;
    const tu = b.to || p.userId || p.uid || (/^\/api\/(users|notes|second-chance|close-friends|follow-requests)\//.test(route) ? p.id || p.username : null);
    if (tu) target = user(tu) || store.find('users', (x) => x.username === String(tu).toLowerCase());
    if (!target && /^\/api\/chats\/:id/.test(route)) { const c = store.get('chats', p.id); const o = c?.members?.find((m) => m !== req.user?.id); if (c && !c.group && o) target = user(o); }
    if (!target && /^\/api\/(posts|stories)\/:id/.test(route)) { const x = store.get(route.startsWith('/api/posts') ? 'posts' : 'stories', p.id); if (x?.userId && x.userId !== req.user?.id) target = user(x.userId); }
    const meta = {};
    for (const k of SAFE_BODY) { const v = b[k]; if (v !== undefined && v !== null && ['string', 'number', 'boolean'].includes(typeof v)) meta[k] = String(v).slice(0, 40); }
    for (const [k, v] of Object.entries(p)) if (!['id', 'cid', 'token'].includes(k)) meta[k] = String(v).slice(0, 40);
    let kat; let text;
    if (L[key]) [kat, text] = L[key];
    else if (req.method === 'GET') return null; // yalnız bilinen görüntülemeler kaydedilir
    else {
      const seg = route.split('/').slice(2).filter((s) => !s.startsWith(':'));
      const area = AREA[seg[1] === 'cizbil' || seg[1] === 'okey' ? seg[1] : seg[0]] || seg[0];
      const last = seg[seg.length - 1];
      const verb = VERB[last] || (req.method === 'DELETE' ? 'sildi' : req.method === 'POST' ? (seg.length === 1 ? 'oluşturdu' : 'işlem yaptı') : 'güncelledi');
      kat = AREA_KAT[seg[0]] || 'diger'; text = `${area}: ${verb}${p.game ? ` (${p.game})` : ''}`;
    }
    const DIR = { right: 'sağa (beğendi)', left: 'sola (geçti)', super: 'süper beğeni' };
    const x = key === 'POST /api/swipe' ? DIR[b.dir] || b.dir || '' : key === 'POST /api/orders' ? b.productId || '' : key === 'POST /api/fal' ? b.kind || b.type || '' : '';
    text = text.replace('{x}', x).replace(' → {t}', target ? ` → ${tag(target)}` : '').replace('{t}', target ? `(${tag(target)})` : '').replace(/\s+/g, ' ').trim();
    return { kat, text, target: target?.id || null, ok: status < 400, meta: { ...meta, status } };
  }
  const middleware = (req, res, next) => {
    if (!req.path.startsWith('/api/') || req.method === 'OPTIONS' || req.method === 'HEAD') return next();
    res.on('finish', () => {
      try {
        let uid = req.user?.id || req.actorId || null;
        // başarısız giriş denemesi hesabın kendi geçmişine yazılır
        if (!uid && req.route && req.originalUrl.split('?')[0] === '/api/auth/login' && res.statusCode >= 400) {
          const login = String(req.body?.username || '').toLowerCase().trim();
          const u = login && store.find('users', (x) => x.username === login || (x.email && x.email === login));
          if (u) log(u.id, 'giris', res.statusCode === 403 ? 'Giriş engellendi (şifre sıfırlanmalı)' : 'Başarısız giriş denemesi (yanlış şifre ya da çok fazla deneme)', { req, ok: false, meta: { status: res.statusCode } });
          return;
        }
        if (!uid || !req.route) return;
        const d = describe(req, res.statusCode); if (!d) return;
        log(uid, d.kat, d.text, { req, target: d.target, ok: d.ok, meta: d.meta });
      } catch (er) { console.error('[hareketler]', er.message); }
    });
    next();
  };
  // --- canlı bağlantı olayları (mesaj, arama, yayın...) ---
  function socketHook(socket, uid, ip) {
    socket.onAny((ev, data) => {
      const m = SOCK[ev]; if (!m) return;
      let target = null;
      const chatId = data?.chatId || data?.chat;
      if (chatId) { const c = store.get('chats', chatId); const o = c?.members?.find((x) => x !== uid); if (c && !c.group && o) target = o; }
      else if (data?.to && typeof data.to === 'string') target = data.to;
      const t = user(target);
      log(uid, m[0], `${m[1]}${t ? ` (${tag(t)})` : ''}`, { target: t?.id || null, ip, dev: socket.handshake.headers['x-device'] || socket.handshake.auth?.device, meta: { kanal: 'canlı' } });
    });
  }
  return { log, middleware, socketHook, query, purge, start, flush, KAT, KEEP_DAYS };
};

// Uç noktalar: üyenin kendi geçmişi, yönetimde kullanıcı kartı ve genel akış
module.exports.routes = function routes(app, ctx) {
  const { store, auth, aktivite: akt, brief } = ctx;
  const A = ctx.admin || {};
  const num = (v) => (/^\d+$/.test(String(v || '')) ? String(v) : null);
  const kat = (v) => (KAT[v] ? v : null);
  app.get('/api/me/aktivite', auth, async (req, res) => {
    const items = await akt.query({ uid: req.user.id, before: req.query.before ? String(req.query.before).slice(0, 24) : null, kat: kat(req.query.kat), limit: 40 });
    res.json({ kat: KAT, items: items.map((x) => ({ id: x.id, at: x.at, kat: x.kat, text: x.text, ok: x.ok, ip: x.ip })) });
  });
  if (!A.adminAuth) return;
  const seenAudit = new Map();
  const row = (x, withUser) => ({ id: x.id, at: x.at, kat: x.kat, text: x.text, ok: x.ok, ip: x.ip, dev: x.dev, meta: x.meta, target: x.target ? brief(store.get('users', x.target)) || { id: x.target } : null, ...(withUser ? { user: brief(store.get('users', x.uid)) || { id: x.uid, name: store.get('deleted_accounts', x.uid)?.username || 'silinmiş hesap' } } : {}) });
  app.get('/api/admin/users/:id/aktivite', A.adminAuth, async (req, res) => {
    const u = store.get('users', req.params.id) || store.get('deleted_accounts', req.params.id);
    if (!u) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    const k = `${req.admin.id}:${req.params.id}`;
    if (!req.query.before && Date.now() - (seenAudit.get(k) || 0) > 10 * 60000) { seenAudit.set(k, Date.now()); A.audit?.(req.admin, 'kullanıcı hareketlerini görüntüledi', req.params.id, `@${u.username || ''}`); }
    const items = await akt.query({ uid: req.params.id, before: req.query.before ? String(req.query.before).slice(0, 24) : null, kat: kat(req.query.kat), limit: 60 });
    res.json({ kat: KAT, items: items.map((x) => row(x, false)), keepDays: akt.KEEP_DAYS });
  });
  app.get('/api/admin/aktivite', A.adminAuth, async (req, res) => {
    let uid = null;
    const un = String(req.query.username || '').replace(/^@/, '').toLowerCase().trim().slice(0, 40);
    if (un) { const u = store.find('users', (x) => x.username === un) || store.find('deleted_accounts', (x) => x.username === un); if (!u) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' }); uid = u.id; }
    const items = await akt.query({ uid, before: num(req.query.before) || (req.query.before ? String(req.query.before).slice(0, 24) : null), kat: kat(req.query.kat), limit: 80 });
    res.json({ kat: KAT, items: items.map((x) => row(x, true)), keepDays: akt.KEEP_DAYS });
  });
};
module.exports.KAT = KAT;
