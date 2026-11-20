// Sepet ekranı: ürünler, adet, kampanya, toplam ve ödeme (web: havale/EFT · uygulama: App Store / Google Play)
import { api, esc, toast, state, on, iosShell } from '../core.js';
import { icon } from '../icons.js';
import { TL, setCartCount, giftMode, promoLine, storeCheckout, webCheckout } from '../cart.js';
import { iapInfo } from '../iap.js';

export default async function cartView(view) {
  view.innerHTML = `<header class="topbar"><button class="ib" data-back="#/store" aria-label="Geri">${icon('back')}</button><div class="center">Sepetim</div><a class="ib soft" href="#/store" aria-label="Mağaza">${icon('coin')}</a></header>
    <div class="shop cart-page"><div class="spinner"></div></div>`;
  const box = view.querySelector('.cart-page');
  const gift = await giftMode(); // uygulamada ödeme mağazadan: kampanya hediye olarak verilir
  const I = gift ? await iapInfo() : null;
  // Uygulamada fiyatı mağaza (App Store / Google Play) belirler: sepette onun fiyatı gösterilir; mağaza fiyatı gelmediyse bizim fiyatımız
  const unitTxt = (x) => I?.prices.get(`swipeup.${x.id}`) || TL(x.unit);
  const lineTxt = (x) => { const a = I?.amounts.get(`swipeup.${x.id}`); return a ? I.fmt(a.value * x.qty, a.currency) : x.qty === 1 ? unitTxt(x) : TL(x.line); };
  const totalTxt = (c) => { const a = c.items.map((x) => I?.amounts.get(`swipeup.${x.id}`)); if (a.every(Boolean) && new Set(a.map((y) => y.currency)).size === 1) return I.fmt(c.items.reduce((s, x, i) => s + a[i].value * x.qty, 0), a[0].currency); return TL(c.subtotal); };
  let busy = false;
  const paint = (c) => {
    setCartCount(c.count);
    if (!c.count) {
      box.innerHTML = `<div class="empty cart-empty"><div class="big">${icon('cart')}</div><b>Sepetin boş</b><p class="muted">Jeton paketlerini ve SwipeUp+ sürelerini mağazadan sepete ekleyebilirsin.</p>
        ${c.today.length ? `<p class="note-box">Bugüne özel: ${promoLine([...c.today].sort((a, b) => b.pct - a.pct)[0])}</p>` : ''}
        <a class="btn primary" href="#/store">Mağazaya git</a></div>`;
      return;
    }
    const p = c.promo; const n = c.next;
    box.innerHTML = `
      ${p ? `<div class="cart-promo on"><span class="cp-ic">${icon('gift')}</span><span class="grow"><b>${esc(p.title)} uygulandı</b><small>${gift ? `Ödeme sonrası %${p.pct} hediye jeton / SwipeUp+ günü hesabına eklenir` : `Sepetteki her ürüne %${p.pct} indirim`}</small></span></div>`
      : n ? `<div class="cart-promo"><span class="cp-ic">${icon('gift')}</span><span class="grow"><b>${n.minItems - c.count} ürün daha ekle</b><small>${promoLine(n)}</small></span></div>` : ''}
      <ul class="cart-list">${c.items.map((x) => `<li data-id="${esc(x.id)}">
        <span class="ci-ic">${icon(x.product.kind === 'plus' ? 'crown' : 'coin')}</span>
        <span class="grow"><b>${esc(x.product.title)}</b><small>${gift ? unitTxt(x) : TL(x.unit)} / adet</small></span>
        <span class="qty"><button class="ib q" data-d="-1" aria-label="Azalt">${x.qty === 1 ? icon('trash') : '−'}</button><b>${x.qty}</b><button class="ib q" data-d="1" aria-label="Arttır" ${c.count >= c.max ? 'disabled' : ''}>+</button></span>
        <span class="amt">${gift ? lineTxt(x) : TL(x.line)}</span></li>`).join('')}</ul>
      ${gift ? `<div class="cart-sum"><div><span>Ürün</span><b>${c.count} adet</b></div>${p ? `<div class="disc"><span>Kampanya hediyesi</span><b>%${p.pct} ekstra jeton / gün</b></div>` : ''}<div class="tot"><span>Toplam</span><b>${totalTxt(c)}</b></div></div>
        <p class="muted shop-note">Ürünler ${iosShell() ? 'App Store' : 'mağaza'} üzerinden sırayla satın alınır; her biri için mağazanın kendi ödeme penceresi açılır. Fiyatlar ${iosShell() ? 'App Store' : 'Google Play'} fiyatlarıdır, tüm vergiler dahil.${p ? ` Kampanya hediyesi (her jeton paketinin %${p.pct}’i kadar jeton, her SwipeUp+ süresinin %${p.pct}’i kadar gün) en az ${p.minItems} ürün alındığında hesabına eklenir.` : ''}</p>`
      : `<div class="cart-sum"><div><span>Ara toplam</span><b>${TL(c.subtotal)}</b></div>${c.discount ? `<div class="disc"><span>Sepet indirimi (%${p.pct})</span><b>−${TL(c.discount)}</b></div>` : ''}<div class="tot"><span>Toplam</span><b>${TL(c.total)}</b></div></div>
        <p class="muted shop-note">Tüm vergiler dahil. Ödeme havale/EFT ile, tek sepet koduyla yapılır.${p ? ' İndirim, kampanya günü verilen siparişlere uygulanır.' : ''}</p>`}
      <button class="btn primary block go">${gift ? `${iosShell() ? 'App Store' : 'Google Play'} ile öde · ${totalTxt(c)}` : `Sepeti onayla · ${TL(c.total)}`}</button>
      <button class="btn block clr" style="background:transparent">Sepeti boşalt</button>`;
    box.querySelectorAll('.q').forEach((b) => {
      b.onclick = async () => {
        if (busy) return; busy = true; const li = b.closest('[data-id]'); const it = c.items.find((x) => x.id === li.dataset.id);
        try { paint(await api(`/cart/items/${encodeURIComponent(it.id)}`, { method: 'PUT', body: { qty: it.qty + +b.dataset.d } })); } catch (e) { toast(e.message); } busy = false;
      };
    });
    box.querySelector('.clr').onclick = async () => { if (!confirm('Sepet boşaltılsın mı?')) return; try { paint(await api('/cart', { method: 'DELETE' })); } catch (e) { toast(e.message); } };
    box.querySelector('.go').onclick = async () => {
      if (busy) return; busy = true;
      try {
        if (gift) await storeCheckout(c, load);
        else if (iosShell()) toast('App Store’a şu an bağlanılamadı. Biraz sonra tekrar dene.'); // iOS'ta yalnız App Store ödemesi
        else if (!(await api('/store')).payEnabled) toast('Ödeme sistemi çok yakında açılıyor.');
        else await webCheckout(c, load);
      } finally { busy = false; }
    };
  };
  const load = async () => { try { paint(await api('/cart')); } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; } };
  await load();
  return on('wallet', load);
}
