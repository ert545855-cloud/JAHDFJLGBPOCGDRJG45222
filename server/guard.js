// Güvenlik: sohbette dolandırıcılık uyarısı (IBAN, para isteme, kripto, hediye kartı) ve sahte profil tespiti
// (aynı fotoğrafın başka hesapta kullanılması; GOOGLE_VISION_KEY varsa internette aynısının bulunması).
const { nanoid } = require('nanoid');
const thumbs = require('./thumbs');
const DAY = 86400000;

const RULES = [
  { k: 'iban', high: true, re: /\bTR\s?\d{2}(?:\s?\d{4}){5}\s?\d{2}\b|\biban\b/i, why: 'IBAN paylaşımı' },
  { k: 'kripto', high: true, re: /\b(bitcoin|btc|usdt|tether|ethereum|eth|binance|bybit|okx|kripto|coin\s?adres|cüzdan\s?adres|wallet\s?address)\b|\b0x[a-f0-9]{40}\b|\bbc1[a-z0-9]{20,}\b|\bT[A-Za-z1-9]{33}\b/i, why: 'Kripto para / cüzdan adresi' },
  { k: 'para', high: false, re: /\b(para|tl|lira|₺|euro|dolar|bin)\b[^.!?\n]{0,40}\b(gönder|yolla|at(ar)?\s?m[ıi]s[ıi]n|lazım|borç|havale|eft|yatır)|\b(havale|eft|papara|ininal|western\s?union|moneygram|tosla)\b|\bborç\s?(ver|lazım)/i, why: 'Para isteme' },
  { k: 'kart', high: false, re: /\b(hediye\s?kart[ıi]?|google\s?play\s?kart|itunes|steam\s?kart|paysafe|razer\s?gold)\b/i, why: 'Hediye kartı isteme' },
  { k: 'yatirim', high: false, re: /\b(yatırım\s?fırsatı|garantili\s?kazanç|kazanç\s?garantili|forex|bahis\s?kupon|sinyal\s?grubu)\b/i, why: 'Şüpheli yatırım teklifi' },
];
const WARN = '⚠️ Güvenlik uyarısı: SwipeUp’ta tanıştığın biri senden para, IBAN, kripto ya da hediye kartı istiyorsa dikkatli ol. Tanımadığın kimseye para gönderme; şüphelenirsen mesaja uzun basıp bildir.';

module.exports = function guard(app, ctx) {
  const { store } = ctx;
  const now = () => Date.now();
  const flag = (key, doc) => {
    if (store.find('flags', (f) => f.key === key && f.status === 'open')) return false;
    store.put('flags', { id: nanoid(12), key, status: 'open', at: now(), ...doc });
    return true;
  };

  // ---------- 1) Dolandırıcılık uyarısı ----------
  const scan = (text) => RULES.filter((r) => r.re.test(String(text || '')));
  ctx.scamScan = scan;
  const prev = ctx.onMessage;
  ctx.onMessage = (msg, chat, sender) => {
    try { prev?.(msg, chat, sender); } catch (e) { console.error('[onMessage]', e.message); }
    try {
      if (!msg?.text || msg.system || !sender || ['falci', 'official'].includes(sender.role)) return;
      const hits = scan(msg.text); if (!hits.length) return;
      const c = store.get('chats', chat.id);
      if (!c?.scamWarnAt || now() - c.scamWarnAt > DAY) { store.update('chats', chat.id, { scamWarnAt: now() }); setTimeout(() => ctx.systemMsg?.(c, WARN), 400); }
      const high = hits.some((h) => h.high);
      flag(`scam:${sender.id}:${chat.id}:${new Date().toISOString().slice(0, 10)}`, { kind: 'scam', userId: sender.id, chatId: chat.id, ref: msg.id, text: msg.text.slice(0, 400), level: high ? 'high' : 'normal', reason: `Dolandırıcılık şüphesi: ${hits.map((h) => h.why).join(', ')}` });
    } catch (e) { console.error('[guard]', e.message); }
  };

  // ---------- 2) Sahte profil: aynı fotoğraf başka hesapta ----------
  const mediaId = (u) => (/^\/media\/([\w-]{6,40})/.exec(String(u || '')) || [])[1] || null;
  const photoIds = (u) => [...new Set([u.avatar, ...(u.photos || [])].map(mediaId).filter(Boolean))];
  async function hashOf(id) {
    const meta = store.get('media_meta', id); if (!meta) return null;
    if (meta.phash !== undefined) return meta.phash;
    const item = await ctx.getMedia?.(id).catch(() => null);
    const h = item ? await thumbs.hash(item) : null;
    store.update('media_meta', id, { phash: h || '' });
    return h || null;
  }
  async function check(u) {
    if (!u || u.isBot || ['falci', 'official'].includes(u.role)) return;
    const mine = photoIds(u); if (!mine.length) return;
    const myHashes = (await Promise.all(mine.map(hashOf))).filter(Boolean);
    if (!myHashes.length) return;
    for (const o of store.filter('users', (x) => x.id !== u.id && !x.isBot && (x.photos?.length || x.avatar))) {
      for (const id of photoIds(o)) {
        const h = store.get('media_meta', id)?.phash; if (!h) continue;
        if (myHashes.some((m) => thumbs.hamming(m, h) <= 6)) {
          const [a, b] = [u.id, o.id].sort();
          flag(`fake:${a}:${b}`, { kind: 'fake', userId: u.id, chatId: null, ref: id, text: `@${u.username} hesabının profil fotoğrafı @${o.username} hesabındakiyle aynı ya da çok benzer.`, level: 'high', reason: 'Sahte profil şüphesi: aynı fotoğraf başka hesapta' });
          break;
        }
      }
    }
    await webCheck(u, mine);
  }
  // İnternette aynısı var mı (isteğe bağlı: Google Cloud Vision, GOOGLE_VISION_KEY)
  async function webCheck(u, ids) {
    const key = process.env.GOOGLE_VISION_KEY; if (!key) return;
    for (const id of ids.slice(0, 3)) {
      const meta = store.get('media_meta', id); if (!meta || meta.webChecked) continue;
      store.update('media_meta', id, { webChecked: now() });
      const item = await ctx.getMedia?.(id).catch(() => null); if (!item || item.data.length > 4e6) continue;
      try {
        const r = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000), body: JSON.stringify({ requests: [{ image: { content: Buffer.from(item.data).toString('base64') }, features: [{ type: 'WEB_DETECTION', maxResults: 5 }] }] }) });
        const w = (await r.json())?.responses?.[0]?.webDetection || {};
        const full = (w.fullMatchingImages || []).length; const pages = w.pagesWithMatchingImages || [];
        if (full || pages.length >= 2) flag(`web:${u.id}:${id}`, { kind: 'fake', userId: u.id, chatId: null, ref: id, text: `@${u.username} profil fotoğrafı internette bulundu: ${pages.slice(0, 3).map((p) => p.url).join(' · ') || 'birebir eşleşme'}`, level: full ? 'high' : 'normal', reason: 'Sahte profil şüphesi: fotoğraf internetten alınmış olabilir' });
      } catch (e) { console.warn('[vision]', e.message); }
    }
  }
  ctx.onPhotos = (u) => { setTimeout(() => check(store.get('users', u.id)).catch((e) => console.warn('[sahte profil]', e.message)), 1500); };

  // Mevcut profil fotoğraflarının özetini arkada yavaşça çıkar (her 4 sn'de bir)
  setTimeout(function warm() {
    const id = store.all('users').filter((x) => !x.isBot).flatMap(photoIds).find((m) => { const meta = store.get('media_meta', m); return meta && meta.phash === undefined; });
    if (!id) return;
    hashOf(id).catch(() => {}).finally(() => setTimeout(warm, 4000).unref?.());
  }, 60000).unref?.();
};
module.exports.RULES = RULES;
