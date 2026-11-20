// Sepet: mağazadaki jeton paketleri ve SwipeUp+ süreleri. Sepet sunucuda (hesapta) tutulur.
// Ödeme: tarayıcıda havale/EFT (tek sepet kodu, kampanya indirimi fiyata yansır);
// Android / iOS uygulamasında Google Play / App Store (ürünler sırayla alınır, kampanya hediye olarak tanımlanır).
import { api, esc, toast, sheet, state, emit } from './core.js';
import { icon } from './icons.js';
import { iapInfo, iapBuy } from './iap.js';

export const TL = (n) => `${Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
const groupIban = (s) => String(s || '').replace(/(.{4})/g, '$1 ').trim();

// Sepet sayacı (üst çubuktaki mağaza simgesi ve menü)
export function setCartCount(n) { if (!state.badges) return; state.badges.cart = n; emit('badges', state.badges); }

export async function addToCart(id) {
  await giftMode();
  try { const c = await api('/cart/items', { body: { id } }); setCartCount(c.count); toast(c.promo ? `Sepete eklendi · ${promoLine(c.promo, true)}` : c.next && c.count < c.next.minItems ? `Sepete eklendi · ${c.next.minItems - c.count} ürün daha ekle, ${promoLine(c.next, true)}` : 'Sepete eklendi.'); return c; } catch (e) { toast(e.message); return null; }
}

// Kampanya cümlesi: web'de indirim, uygulamada hediye (mağaza fiyatı değiştirilemez)
let gift = null; // uygulamada mağaza ödemesi var mı (iapInfo)
export async function giftMode() { if (gift === null) gift = !!(await iapInfo()); return gift; }
export const promoLine = (p, short) => (gift
  ? `${short ? '' : `${esc(p.title)}: `}sepette ${p.minItems}+ üründe %${p.pct} hediye jeton / gün`
  : `${short ? '' : `${esc(p.title)}: `}sepette ${p.minItems}+ üründe %${p.pct} indirim`);
export function promoBanner(today) {
  if (!today?.length) return '';
  const p = [...today].sort((a, b) => b.pct - a.pct)[0];
  return `<a class="cart-promo" href="#/cart"><span class="cp-ic">${icon('gift')}</span><span class="grow"><b>Bugüne özel: ${promoLine(p, true)}</b><small>${esc(p.title)}${p.dayNames?.length < 7 ? ` · her ${esc(p.dayNames.join(', '))}` : ''}${p.to ? ` · ${new Date(p.to + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} tarihine kadar` : ''}</small></span><span class="go-chip">Sepet</span></a>`;
}

// ---------- Uygulama: mağazadan sırayla satın al, sonra kampanya hediyesini iste ----------
export async function storeCheckout(cart, onDone) {
  const I = await iapInfo(); if (!I) return false;
  const units = cart.items.flatMap((x) => Array.from({ length: x.qty }, () => x));
  const ids = []; let done = 0; let stopped = false;
  for (const it of units) {
    toast(`${I.store}: ${done + 1}/${units.length} · ${it.product.title}`, { ms: 2500 });
    const r = await iapBuy(it.id); // eslint-disable-line no-await-in-loop
    if (!r) { stopped = true; break; }
    if (r.orderId) ids.push(r.orderId);
    done += 1;
    // Alınanı sepetten düş (yarıda kalırsa kalanlar sepette bekler)
    const left = (cart.items.find((x) => x.id === it.id).qty -= 1);
    try { const c = await api(`/cart/items/${encodeURIComponent(it.id)}`, { method: 'PUT', body: { qty: left } }); setCartCount(c.count); } catch { /* sayaç bir sonraki açılışta düzelir */ } // eslint-disable-line no-await-in-loop
  }
  let bonus = null;
  if (ids.length >= 2) { try { bonus = (await api('/cart/bonus', { body: { orderIds: ids } })).bonus; } catch { /* hediye yoksa sessiz geç */ } }
  const parts = bonus ? [bonus.coins ? `${bonus.coins} jeton` : '', bonus.days ? `${bonus.days} gün SwipeUp+` : ''].filter(Boolean).join(' + ') : '';
  if (done) toast(`${done} ürün hesabına eklendi${parts ? ` · 🎁 kampanya hediyesi: ${parts}` : ''}${stopped ? ' · kalanlar sepette' : ''}.`, { ms: 6000 });
  onDone?.();
  return true;
}

// ---------- Web: havale/EFT ile sepet siparişi ----------
// Ön bilgilendirme formu + mesafeli satış sözleşmesi (sepetteki her ürün için ayrı), iki ayrı onay
export async function webCheckout(cart, onDone) {
  const uniq = [...new Set(cart.items.map((x) => x.id))];
  let docs; try { docs = await Promise.all(uniq.map((id) => api(`/orders/preview/${encodeURIComponent(id)}`))); } catch (e) { toast(e.message); return; }
  const tabs = docs.map((d, i) => `<button type="button" class="${i === 0 ? 'on' : ''}" data-i="${i}">${esc(d.product.title)}</button>`).join('');
  const deal = cart.promo ? `<p class="note-box" style="margin:0">${esc(cart.promo.title)}: sepet kampanyası ile her ürüne %${cart.promo.pct} indirim uygulanır; sipariş belgelerinde indirimli fiyat ve sepet dışı fiyat ayrıca yazar.</p>` : '';
  const close = sheet('Sepeti onayla', `<form class="buy">
    <div class="cart-sum">${cart.items.map((x) => `<div><span>${esc(x.product.title)}${x.qty > 1 ? ` × ${x.qty}` : ''}</span><b>${TL(x.line)}</b></div>`).join('')}
    ${cart.discount ? `<div class="disc"><span>Sepet indirimi (%${cart.promo.pct})</span><b>−${TL(cart.discount)}</b></div>` : ''}</div>
    <div class="pay-sum"><span>Toplam</span><b>${TL(cart.total)}</b></div>
    <p class="muted buy-tax">Tüm vergiler dahil · ödeme havale/EFT ile, tek sepet koduyla · jeton nakde çevrilemez · SwipeUp+ otomatik yenilenmez</p>
    ${deal}
    <div class="buy-tabs">${docs.length > 1 ? tabs : ''}</div>
    <div class="buy-tabs dt"><button type="button" class="on" data-t="pre">Ön bilgilendirme formu</button><button type="button" data-t="contract">Mesafeli satış sözleşmesi</button></div>
    <div class="buy-doc legal" tabindex="0">${docs[0].pre}</div>
    <label class="consent"><input type="checkbox" name="pre"><span>${esc(docs[0].preText)}${docs.length > 1 ? ` (sepetteki ${docs.length} ürünün tamamı için)` : ''}</span></label>
    <label class="consent"><input type="checkbox" name="waive"><span>${docs.map((d) => esc(d.waive)).join(' ')}</span></label>
    <button class="btn primary block buy-go" disabled>${esc(docs[0].button)}</button>
    <p class="muted" style="font-size:12.5px;margin:0">Her ürün ayrı sipariş olarak kaydedilir; onayladığın belgelerin kopyaları Siparişlerim’de saklanır${state.me?.email ? ' ve e-posta adresine gönderilir' : ''}.</p></form>`, {
    onMount(sh) {
      const f = sh.querySelector('form'); const doc = sh.querySelector('.buy-doc'); const go = sh.querySelector('.buy-go');
      let pi = 0; let t = 'pre';
      const paint = () => { doc.innerHTML = docs[pi][t]; doc.scrollTop = 0; };
      sh.querySelector('.buy-tabs:not(.dt)').onclick = (e) => { const b = e.target.closest('[data-i]'); if (!b) return; pi = +b.dataset.i; sh.querySelectorAll('.buy-tabs:not(.dt) button').forEach((x) => x.classList.toggle('on', x === b)); paint(); };
      sh.querySelector('.buy-tabs.dt').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; t = b.dataset.t; sh.querySelectorAll('.buy-tabs.dt button').forEach((x) => x.classList.toggle('on', x === b)); paint(); };
      const sync = () => { go.disabled = !(f.pre.checked && f.waive.checked); }; f.pre.onchange = sync; f.waive.onchange = sync;
      f.onsubmit = async (e) => {
        e.preventDefault(); if (go.disabled) return; go.disabled = true;
        try { const g = await api('/cart/checkout', { body: { accept: { pre: true, waive: true }, total: cart.total } }); setCartCount(0); close(); cartPaySheet(g, onDone); onDone?.(); } catch (er) { toast(er.message); sync(); if (er.status === 409) { close(); onDone?.(); } }
      };
    },
  });
}

const GST = { pending: 'Ödeme bekleniyor', paid: 'Onay bekleniyor', approved: 'Tamamlandı', mixed: 'Kısmen sonuçlandı', cancelled: 'İptal edildi', rejected: 'Onaylanmadı' };
export async function cartPaySheet(gOrCode, onDone) {
  let g = gOrCode; if (typeof g === 'string') { try { g = await api(`/cart/orders/${encodeURIComponent(g)}`); } catch (e) { toast(e.message); return; } }
  const b = g.bank || {};
  const close = sheet('Havale / EFT ile öde', `<div class="pay">
    <div class="cart-sum">${g.orders.map((o) => `<div><span>${esc(o.title)}</span><b>${o.listPrice > o.amount ? `<s class="was" style="opacity:.6;font-weight:500">${TL(o.listPrice)}</s> ` : ''}${TL(o.amount)}</b></div>`).join('')}</div>
    <div class="pay-sum"><span>Toplam${g.pct ? ` · %${g.pct} sepet indirimi` : ''}</span><b>${TL(g.total)}</b></div>
    ${g.status === 'pending' ? `<ol class="pay-steps">
      <li>Aşağıdaki hesaba <b>tek seferde ${TL(g.total)}</b> gönder.</li>
      <li>Açıklama kısmına <b>sepet kodunu</b> yaz.</li>
      <li>“Ödemeyi yaptım”a dokun. Ödeme hesabımıza ulaşınca sepetteki tüm ürünler hesabına tanımlanır.</li></ol>` : ''}
    <div class="pay-row"><small>Sepet kodu</small><b class="mono">${esc(g.code)}</b><button class="ib cp" data-v="${esc(g.code)}" aria-label="Kopyala">${icon('copy')}</button></div>
    <div class="pay-row"><small>IBAN</small><b class="mono">${esc(groupIban(b.iban))}</b><button class="ib cp" data-v="${esc(b.iban)}" aria-label="Kopyala">${icon('copy')}</button></div>
    <div class="pay-row"><small>Alıcı</small><b>${esc(b.name || '-')}</b>${b.name ? `<button class="ib cp" data-v="${esc(b.name)}" aria-label="Kopyala">${icon('copy')}</button>` : ''}</div>
    ${b.bankName ? `<div class="pay-row"><small>Banka</small><b>${esc(b.bankName)}</b></div>` : ''}
    <p class="pay-warn">🔒 Ödeme bilgilerimiz yalnızca bu ekranda gösterilir. Mesajla ya da telefonla “IBAN’ımız değişti” diyenlere itibar etme; SwipeUp senden asla şifre ya da kart bilgisi istemez.</p>
    ${g.status === 'pending' ? `<form class="form" style="padding:6px 0 0"><input class="field" name="s" maxlength="60" placeholder="Gönderen ad soyad (hesap sahibi)" autocomplete="name">
      <button class="btn primary block">Ödemeyi yaptım</button>
      <button type="button" class="btn block cancel" style="background:transparent">Sepet siparişini iptal et</button></form>`
    : `<div class="note-box">${g.status === 'paid' ? 'Bildirimin alındı. Ödemen kontrol edilince ürünler hesabına eklenecek ve bildirim alacaksın.' : esc(GST[g.status] || '')}${g.expired ? ' (ödeme süresi doldu)' : ''}</div>`}
    <p class="muted" style="font-size:12.5px;margin:4px 2px 0">Her ürünün sözleşmesi ve iade talebi Mağaza › Siparişlerim’de ayrı ayrı yer alır.</p>
  </div>`, {
    onMount(sh) {
      sh.querySelectorAll('.cp').forEach((bt) => { bt.onclick = async () => { await navigator.clipboard?.writeText(bt.dataset.v); toast('Kopyalandı.'); }; });
      const f = sh.querySelector('form'); if (!f) return;
      f.onsubmit = async (e) => { e.preventDefault(); try { await api(`/cart/orders/${encodeURIComponent(g.code)}/paid`, { body: { sender: f.s.value } }); close(); toast('Teşekkürler! Ödemen kontrol edilince bildirim alacaksın.', { ms: 5000 }); onDone?.(); } catch (er) { toast(er.message); } };
      f.querySelector('.cancel').onclick = async () => { if (!confirm('Sepet siparişi iptal edilsin mi?')) return; try { await api(`/cart/orders/${encodeURIComponent(g.code)}`, { method: 'DELETE' }); close(); toast('İptal edildi.'); onDone?.(); } catch (er) { toast(er.message); } };
    },
  });
}
