// Uygulama içi satın alma: Android uygulamasında Google Play (Digital Goods API + Payment Request),
// iOS uygulamasında App Store (uygulama kabuğundaki NativePurchases eklentisi). Tarayıcıda kullanılmaz; orada havale akışı sürer.
// Ödeme mağazada yapılır, sunucu satın almayı Google / Apple'a sorup onaylar ve jetonu ya da üyeliği tanımlar.
import { api, toast } from './core.js';

const PLAY = 'https://play.google.com/billing';
let info = null; // { kind: 'google' | 'apple', items, prices: Map(sku → yerel fiyat yazısı) }
let pending = null;

const nativeIos = () => { const C = window.Capacitor; return !!(C?.isNativePlatform?.() && C.getPlatform?.() === 'ios' && C.Plugins?.NativePurchases); };
async function playService() { if (!('getDigitalGoodsService' in window)) return null; try { return await window.getDigitalGoodsService(PLAY); } catch { return null; } }
const fmt = (value, currency) => { try { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(+value); } catch { return `${value} ${currency}`; } };

// Bu cihazda mağaza satın alması var mı? (varsa ürünler ve yerel fiyatlarla)
export function iapInfo() {
  if (info) return Promise.resolve(info);
  if (pending) return pending;
  pending = (async () => {
    const kind = nativeIos() ? 'apple' : (await playService()) ? 'google' : null;
    if (!kind) return null;
    let cat; try { cat = await api('/iap/catalog'); } catch { return null; }
    const skus = cat.items.map((i) => i.sku); const prices = new Map(); const amounts = new Map(); // amounts: sku → { value, currency } (sepet toplamı için)
    try {
      if (kind === 'google') { const s = await playService(); (await s.getDetails(skus)).forEach((d) => { prices.set(d.itemId, fmt(d.price.value, d.price.currency)); if (+d.price.value >= 0) amounts.set(d.itemId, { value: +d.price.value, currency: d.price.currency }); }); }
      else { const r = await window.Capacitor.Plugins.NativePurchases.getProducts({ productIdentifiers: skus, productType: 'inapp' }); (r?.products || []).forEach((p) => { const id = p.identifier || p.productIdentifier; prices.set(id, p.priceString || fmt(p.price, p.currencyCode)); if (+p.price >= 0 && p.currencyCode) amounts.set(id, { value: +p.price, currency: p.currencyCode }); }); }
    } catch { /* fiyatlar gelmezse düğmeler mağaza fiyatsız gösterilir */ }
    info = { kind, items: cat.items, prices, amounts, fmt, store: kind === 'google' ? 'Google Play' : 'App Store' };
    if (kind === 'google') resumeGoogle(); // yarıda kalan (onaylanmamış) satın almalar
    return info;
  })().finally(() => { pending = null; });
  return pending;
}

// Satın al: mağazanın ödeme penceresi açılır, sonra sunucu doğrular. Dönen: sunucu yanıtı ya da null (vazgeçildi)
// qty: App Store'da aynı üründen birden çok adet tek pencerede alınır. Google Play'de adet, mağaza penceresinde seçilir
// (Play Console'da ürüne "çoklu adet" açıksa); sunucu gerçek adedi mağazadan okur ve yanıtta döner (r.qty).
export async function iapBuy(productId, qty = 1) {
  const I = await iapInfo(); if (!I) return null; const sku = `swipeup.${productId}`;
  if (!I.items.some((i) => i.sku === sku)) { toast('Bu ürün mağazada satılmıyor.'); return null; }
  if (I.kind === 'google') {
    let resp;
    try {
      const req = new PaymentRequest([{ supportedMethods: PLAY, data: { sku } }], { total: { label: 'Toplam', amount: { currency: 'TRY', value: '0' } } });
      resp = await req.show();
    } catch (e) { if (!/abort|cancel/i.test(`${e?.name} ${e?.message}`)) toast('Ödeme penceresi açılamadı. Google Play’in güncel olduğundan emin ol.'); return null; }
    const token = resp.details?.purchaseToken || resp.details?.token;
    try { const r = await api('/iap/google', { body: { sku, token } }); await resp.complete('success'); return r; } catch (e) { await resp.complete('fail').catch(() => {}); toast(e.message); return null; }
  }
  const NP = window.Capacitor.Plugins.NativePurchases; let t;
  try { t = await NP.purchaseProduct({ productIdentifier: sku, productType: 'inapp', quantity: Math.max(1, Math.min(10, qty | 0 || 1)) }); } catch (e) { if (!/cancel/i.test(String(e?.message || e?.code || ''))) toast('Satın alma tamamlanamadı.'); return null; }
  const transactionId = t?.transactionId || t?.transaction?.transactionId || t?.id;
  try { return await api('/iap/apple', { body: { transactionId } }); } catch (e) { toast(e.message); return null; }
}

// Uygulama kapanıp sunucuya ulaşamadan kalan Google satın almaları: sunucu daha önce tanımladıysa yeniden tanımlamaz, yalnızca tüketir
async function resumeGoogle() {
  try { const s = await playService(); const list = await s.listPurchases(); for (const p of list || []) { try { await api('/iap/google', { body: { sku: p.itemId, token: p.purchaseToken } }); } catch { /* sunucu reddettiyse geç */ } } } catch { /* listelenemedi */ }
}
