import { supersStoreSection } from '../supers.js';
import { storeSection } from '../stickers.js';
import { icon } from '../icons.js';
import { iapInfo, iapBuy } from '../iap.js';
import {
  api, esc, toast, sheet, state, on, refreshBadges, iosShell } from '../core.js';

const TL = (n) => `${Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
const date = (t) => new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
const STATUS = {
  pending: ['Ödeme bekleniyor', 'wait'], paid: ['Onay bekleniyor', 'wait'], approved: ['Tamamlandı', 'ok'], rejected: ['Onaylanmadı', 'bad'], cancelled: ['İptal edildi', 'bad'], refunded: ['İade edildi', 'bad'],
};
const REFUND = { tanimlanmadi: 'Ödedim ama hesabıma tanımlanmadı', hata: 'Hatalı tutar ya da çift ödeme', cayma14: 'Harcanmamış jetonlarımı iade etmek istiyorum (14 gün)' };
const RSTAT = { open: 'İade talebi inceleniyor', approved: 'İade onaylandı', rejected: 'İade talebi onaylanmadı' };
// Kampanya: eski fiyat = indirimden önceki 30 günün en düşük fiyatı (sunucu hesaplar)
const priceHtml = (p) => (p.was ? `<span class="price"><s class="was" aria-label="Önceki fiyat">${TL(p.was)}</s> ${TL(p.now)}</span>` : `<span class="price">${TL(p.now ?? p.price)}</span>`);
const saleNote = (list) => { const x = list.filter((p) => p.was); if (!x.length) return ''; const end = x.map((p) => p.saleUntil).sort()[0]; return `<p class="muted shop-note sale-note">Üstü çizili fiyat, indirimden önceki son 30 günde uygulanan en düşük fiyattır. Kampanya ${new Date(end + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} günü sonuna kadar geçerlidir.</p>`; };

// Satın alma: ön bilgilendirme formu + mesafeli satış sözleşmesi (sunucuda bu ürün ve senin bilgilerinle üretilir),
// iki ayrı ve önceden işaretlenmemiş onay, "ödeme yükümlülüğü doğuracaktır" düğmesi (Mesafeli Sözleşmeler Yönetmeliği md. 5–8, 15)
export async function buySheet(productId, onDone) {
  if (iosShell() && !(await iapInfo())) { toast('App Store’a şu an bağlanılamadı. Biraz sonra tekrar dene.'); return; } // iOS'ta yalnız App Store ödemesi
  if (await iapInfo()) { const r = await iapBuy(productId); if (r) { toast(r.dup ? 'Bu satın alma zaten hesabına tanımlı.' : `${r.title} hesabına eklendi 🎉`); onDone?.(); } return; } // uygulamada ödeme mağaza üzerinden
  let d; try { d = await api(`/orders/preview/${encodeURIComponent(productId)}`); } catch (e) { toast(e.message); return; }
  const p = d.product;
  const close = sheet('Siparişi onayla', `<form class="buy">
    <div class="pay-sum"><span>${esc(p.title)}</span><b>${p.was ? `<s class="was">${TL(p.was)}</s> ` : ''}${TL(p.price)}</b></div>
    <p class="muted buy-tax">${p.was ? `%${p.off} indirim · ` : ''}Tüm vergiler dahil${p.kind === 'coins' ? ` · jeton başına ${TL(p.price / p.coins)}` : p.days >= 30 ? ` · aylık ${TL(p.price / (p.days / 30))}` : ''} · ödeme havale/EFT ile · ${p.kind === 'plus' ? 'otomatik yenilenmez' : 'nakde çevrilemez'}</p>
    <div class="buy-tabs"><button type="button" class="on" data-t="pre">Ön bilgilendirme formu</button><button type="button" data-t="contract">Mesafeli satış sözleşmesi</button></div>
    <div class="buy-doc legal" tabindex="0">${d.pre}</div>
    <label class="consent"><input type="checkbox" name="pre"><span>${esc(d.preText)}</span></label>
    <label class="consent"><input type="checkbox" name="waive"><span>${esc(d.waive)}</span></label>
    <button class="btn primary block buy-go" disabled>${esc(d.button)}</button>
    <p class="muted" style="font-size:12.5px;margin:0">Onayladığın belgelerin bir kopyası Siparişlerim’de saklanır${state.me?.email ? ' ve e-posta adresine gönderilir' : ''}.</p></form>`, {
    onMount(sh) {
      const f = sh.querySelector('form'); const doc = sh.querySelector('.buy-doc'); const go = sh.querySelector('.buy-go');
      sh.querySelector('.buy-tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; sh.querySelectorAll('.buy-tabs button').forEach((x) => x.classList.toggle('on', x === b)); doc.innerHTML = d[b.dataset.t]; doc.scrollTop = 0; };
      const sync = () => { go.disabled = !(f.pre.checked && f.waive.checked); }; f.pre.onchange = sync; f.waive.onchange = sync;
      f.onsubmit = async (e) => {
        e.preventDefault(); if (go.disabled) return; go.disabled = true;
        try { const o = await api('/orders', { body: { productId: p.id, accept: { pre: true, waive: true } } }); close(); paySheet(o, onDone); onDone?.(); } catch (er) { toast(er.message); sync(); }
      };
    },
  });
}
// Onaylanan belgeler (kalıcı veri saklayıcısı): görüntüle, indir
export async function orderDocsSheet(order) {
  let d; try { d = await api(`/orders/${order.id}/docs`); } catch (e) { toast(e.message); return; }
  const html = `<h2>Ön bilgilendirme formu</h2>${d.pre}<h2>Mesafeli satış sözleşmesi</h2>${d.contract}<h3>Cayma hakkı onayı</h3><p>${esc(d.waive || '')}</p>`;
  sheet(`Belgeler · ${order.code}`, `<div class="legal" style="padding:0 18px 20px">${d.old ? '<p class="note-box">Bu sipariş, sözleşme kopyalarının saklanmaya başlanmasından önce verildi; aşağıda bugünkü metin gösteriliyor.</p>' : `<p class="muted" style="font-size:13px">Onay tarihi: ${d.acceptedAt ? new Date(d.acceptedAt).toLocaleString('tr-TR') : '-'} · belge özeti ${esc(String(d.hash || '').slice(0, 12))}</p>`}${html}
    <button class="btn block dl">Belgeleri indir</button></div>`, {
    onMount(sh) {
      sh.querySelector('.dl').onclick = () => {
        const page = `<!doctype html><html lang="tr"><meta charset="utf-8"><title>SwipeUp ${esc(order.code)} belgeleri</title><style>body{font:15px/1.55 system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}</style><body><h1>SwipeUp · ${esc(order.code)}</h1>${html}</body></html>`;
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([page], { type: 'text/html' })); a.download = `swipeup-${order.code}-sozlesme.html`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      };
    },
  });
}
// İade talebi: tanımlanmayan sipariş, hatalı / çift ödeme, harcanmamış jeton (14 gün)
export function refundSheet(order, onDone) {
  const can = order.canRefund || [];
  const close = sheet('İade talep et', `<form class="form">
    <p style="margin:0">${esc(order.title)} · ${esc(order.code)} · ${TL(order.amount)}</p>
    <label>Neden<select class="field" name="reason">${can.map((k) => `<option value="${k}">${esc(REFUND[k])}</option>`).join('')}</select></label>
    <label>İadenin gönderileceği IBAN<input class="field" name="iban" maxlength="40" placeholder="TR00 0000 0000 0000 0000 0000 00" autocomplete="off"></label>
    <label>Hesap sahibinin adı soyadı<input class="field" name="name" maxlength="60" autocomplete="name"></label>
    <label><span>Açıklama <span class="opt">· isteğe bağlı</span></span><textarea class="field" name="note" rows="3" maxlength="500" placeholder="Ödeme tarihi, gönderdiğin tutar gibi bilgiler incelemeyi hızlandırır."></textarea></label>
    <p class="muted" style="font-size:12.5px;margin:0">Talebin incelenir; onaylanan iade en geç 14 gün içinde bu IBAN’a gönderilir. Harcanmamış jeton iadesinde jetonlar bakiyenden düşülür. <a class="link" href="#/legal/iade">Cayma ve iade politikası</a></p>
    <button class="btn primary block">Talebi gönder</button></form>`, {
    onMount(sh) {
      const f = sh.querySelector('form');
      f.onsubmit = async (e) => { e.preventDefault(); try { await api(`/orders/${order.id}/refund`, { body: { reason: f.reason.value, iban: f.iban.value, name: f.name.value, note: f.note.value } }); close(); toast('İade talebin alındı. Sonucu bildirimle haber vereceğiz.', { ms: 5000 }); onDone?.(); } catch (er) { toast(er.message); } };
    },
  });
}
const groupIban = (s) => String(s || '').replace(/(.{4})/g, '$1 ').trim();

export function paySheet(order, onDone) {
  const b = order.bank || {};
  const close = sheet('Havale / EFT ile öde', `<div class="pay">
    <div class="pay-sum"><span>${esc(order.title)}</span><b>${TL(order.amount)}</b></div>
    <ol class="pay-steps">
      <li>Aşağıdaki hesaba <b>${TL(order.amount)}</b> gönder.</li>
      <li>Açıklama kısmına <b>sipariş kodunu</b> yaz.</li>
      <li>“Ödemeyi yaptım”a dokun. Ödeme hesabımıza ulaşınca onaylanır ve hesabına tanımlanır.</li>
    </ol>
    <div class="pay-row"><small>Sipariş kodu</small><b class="mono">${esc(order.code)}</b><button class="ib cp" data-v="${esc(order.code)}" aria-label="Kopyala">${icon('copy')}</button></div>
    <div class="pay-row"><small>IBAN</small><b class="mono">${esc(groupIban(b.iban))}</b><button class="ib cp" data-v="${esc(b.iban)}" aria-label="Kopyala">${icon('copy')}</button></div>
    <div class="pay-row"><small>Alıcı</small><b>${esc(b.name || '-')}</b>${b.name ? `<button class="ib cp" data-v="${esc(b.name)}" aria-label="Kopyala">${icon('copy')}</button>` : ''}</div>
    ${b.bankName ? `<div class="pay-row"><small>Banka</small><b>${esc(b.bankName)}</b></div>` : ''}
    ${b.note ? `<p class="muted" style="font-size:13px;margin:4px 2px">${esc(b.note)}</p>` : ''}
    <p class="pay-warn">🔒 Ödeme bilgilerimiz yalnızca bu ekranda gösterilir. Mesajla ya da telefonla “IBAN’ımız değişti” diyenlere itibar etme; SwipeUp senden asla şifre ya da kart bilgisi istemez.</p>
    ${order.status === 'pending' ? `<form class="form" style="padding:6px 0 0"><input class="field" name="s" maxlength="60" placeholder="Gönderen ad soyad (hesap sahibi)" autocomplete="name">
      <button class="btn primary block">Ödemeyi yaptım</button>
      <button type="button" class="btn block cancel" style="background:transparent">Siparişi iptal et</button></form>`
    : `<div class="note-box">${order.status === 'paid' ? 'Bildirimin alındı. Ödemen kontrol edilince jetonların/üyeliğin hesabına eklenecek ve bildirim alacaksın.' : esc(STATUS[order.status]?.[0] || '')}${order.expired ? ' (ödeme süresi doldu)' : ''}</div>`}
    ${order.refund ? `<div class="note-box">${esc(RSTAT[order.refund.status] || '')}</div>` : ''}
    <div class="pay-legal"><button type="button" class="btn sm docs">Sözleşme ve ön bilgilendirme</button>${(order.canRefund || []).length && order.refund?.status !== 'open' ? '<button type="button" class="btn sm rf">İade talep et</button>' : ''}</div>
  </div>`, {
    onMount(sh) {
      sh.querySelectorAll('.cp').forEach((bt) => { bt.onclick = async () => { await navigator.clipboard?.writeText(bt.dataset.v); toast('Kopyalandı.'); }; });
      sh.querySelector('.docs').onclick = () => orderDocsSheet(order);
      const rf = sh.querySelector('.rf'); if (rf) rf.onclick = () => { close(); refundSheet(order, onDone); };
      const f = sh.querySelector('form');
      if (!f) return;
      f.onsubmit = async (e) => {
        e.preventDefault();
        try { await api(`/orders/${order.id}/paid`, { body: { sender: f.s.value } }); close(); toast('Teşekkürler! Ödemen kontrol edilince bildirim alacaksın.', { ms: 5000 }); onDone?.(); } catch (er) { toast(er.message); }
      };
      f.querySelector('.cancel').onclick = async () => {
        if (!confirm('Sipariş iptal edilsin mi?')) return;
        try { await api(`/orders/${order.id}`, { method: 'DELETE' }); close(); toast('Sipariş iptal edildi.'); onDone?.(); } catch (er) { toast(er.message); }
      };
    },
  });
}

export default async function store(view) {
  view.innerHTML = `<header class="topbar"><button class="ib" data-back="#/me" aria-label="Geri">${icon('back')}</button><div class="center">Mağaza</div><a class="ib soft" href="#/wallet" aria-label="Kazançlarım">${icon('gift')}</a></header>
    <div class="shop"><div class="spinner"></div></div>`;
  const box = view.querySelector('.shop');
  const load = async () => {
    const s = await api('/store');
    state.me.coins = s.coins; state.me.plus = s.plus;
    box.innerHTML = `
      <section class="wallet-card">
        <div><small>Jeton bakiyen</small><b>${icon('coin')} ${s.coins.toLocaleString('tr-TR')}</b></div>
        <div class="${s.plus ? 'on' : ''}"><small>Üyelik</small><b>${s.plus ? `${icon('crown')} SwipeUp+` : 'Ücretsiz'}</b>${s.plus ? `<span>${state.me.plusTrial && state.me.plusTrial.until >= s.plusUntil - 60000 ? `Ücretsiz deneme · ${Math.max(1, Math.ceil((s.plusUntil - Date.now()) / 86400000))} gün kaldı` : `${date(s.plusUntil)} tarihine kadar`}</span>` : `<span>Bugün ${s.quota.likesLeft ?? '∞'} beğeni · ${s.quota.supersLeft} süper hakkın kaldı</span>`}</div>
      </section>
      ${s.payEnabled ? '' : '<div class="note-box pay-soon">Ödeme sistemi çok yakında açılıyor. O zamana kadar ücretsiz özellikleri kullanmaya devam edebilirsin.</div>'}
      <h3 class="shop-h">${icon('crown')} SwipeUp+</h3>
      <ul class="perks compact">
        <li>${icon('heart')}<span>Sınırsız beğeni <small>(ücretsiz: günde ${s.freeLikes})</small></span></li>
        <li>${icon('eye')}<span>Seni beğenenleri gör</span></li>
        <li>${icon('undo')}<span>Son kaydırmanı geri al</span></li>
        <li>${icon('star')}<span>Günde ${s.plusSupers} süper beğeni <small>(ücretsiz: ${s.freeSupers})</small></span></li>
        <li>${icon('bolt')}<span>Haftada 1 ücretsiz boost</span></li>
        <li>${icon('dcheck')}<span>Gizli okuma <small>(mavi tik göndermeden oku)</small></span></li>
        <li>${icon('eye')}<span>Profillere görünmeden bak</span></li>
        <li>${icon('crown')}<span>Profil teması ve renkli isim</span></li>
      </ul>
      <div class="plans">${s.plusPlans.map((p) => `<button class="plan" data-p="${esc(p.id)}" ${s.payEnabled ? '' : 'disabled'}>
        ${p.off ? `<span class="tag">%${p.off} indirim</span>` : p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ''}<b>${p.days >= 30 && p.days % 30 === 0 ? `${p.days / 30} ay` : `${p.days} gün`}</b>${priceHtml(p)}<small>${TL((p.now ?? p.price) / Math.max(1, p.days / 30))} / ay</small></button>`).join('')}</div>${saleNote(s.plusPlans)}
      <p class="muted shop-note">Fiyatlar Türk lirası ve tüm vergiler dahildir. SwipeUp+ otomatik yenilenmez; süre bitince kendiliğinden sona erer.</p>
      <h3 class="shop-h">${icon('coin')} Jeton</h3>
      <p class="muted" style="margin:-4px 2px 10px;font-size:14px">Canlı yayınlarda hediye gönder, Falcı Teyze’ye fal baktır, boost ile öne çık.</p>
      <div class="packs" style="--cols:${s.coinPacks.length === 4 || s.coinPacks.length < 3 ? 2 : 3}">${s.coinPacks.map((p) => `<button class="pack" data-p="${esc(p.id)}" ${s.payEnabled ? '' : 'disabled'}>${p.off ? `<span class="tag">%${p.off} indirim</span>` : p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ''}
        <span class="coins">${icon('coin')}${p.coins.toLocaleString('tr-TR')}</span>${priceHtml(p)}<small class="unit">jeton başı ${TL((p.now ?? p.price) / p.coins)}</small></button>`).join('')}</div>${saleNote(s.coinPacks)}
      <p class="muted shop-note">Tüm vergiler dahil. Jeton nakde çevrilemez ve devredilemez; her özelliğin jeton bedeli harcamadan önce gösterilir.</p>
      <div class="uses">
        <div>${icon('gift')}<span><b>Hediyeler</b>${s.gifts.slice(0, 4).map((g) => `${g.em} ${g.coins}`).join(' · ')}…</span></div>
        <div>${icon('star')}<span><b>Fal</b>Kahve ${s.falPrices.kahve} · Tarot ${s.falPrices.tarot} · Burç ${s.falPrices.burc} · Uyum ${s.falPrices.uyum} jeton</span></div>
        <div>${icon('bolt')}<span><b>Boost</b>${s.boostCoins} jeton · ${s.boostMinutes} dakika en üstte</span></div>
      </div>
      <section class="sp-sec"></section>
      <section class="stk-sec"></section>
      ${s.orders.length ? `<h3 class="shop-h">Siparişlerim</h3><div class="orders">${s.orders.map((o) => `<button class="order" data-o="${esc(o.id)}">
        <span class="grow"><b>${esc(o.title)}</b><small>${esc(o.code)} · ${date(o.at)}${o.refund ? ` · ${esc(RSTAT[o.refund.status] || '')}` : ''}</small></span><span class="amt">${TL(o.amount)}</span><span class="st ${STATUS[o.status]?.[1] || ''}">${STATUS[o.status]?.[0] || ''}</span></button>`).join('')}</div>` : ''}
      <p class="muted pay-foot" style="font-size:12.5px;margin:18px 2px 30px">${iosShell() ? 'Ödemeler App Store hesabın üzerinden alınır; iade talepleri App Store üzerinden yapılır. <a class="link" href="#/legal/kosullar">Kullanım koşulları</a> · <a class="link" href="#/legal/gizlilik">Gizlilik</a>' : `Ödemeler havale/EFT ile alınır. Satın almadan önce <a class="link" href="#/legal/onbilgi">ön bilgilendirme formu</a> ve <a class="link" href="#/legal/mesafeli">mesafeli satış sözleşmesi</a> gösterilir. <a class="link" href="#/legal/iade">Cayma ve iade politikası</a> · <a class="link" href="#/legal/kunye">Satıcı bilgileri</a>`}</p>`;
    storeSection(box.querySelector('.stk-sec'));
    supersStoreSection(box.querySelector('.sp-sec'));
    box.querySelectorAll('[data-p]').forEach((b) => {
      b.onclick = async () => {
        buySheet(b.dataset.p, load);
      };
    });
    box.querySelectorAll('[data-o]').forEach((b) => {
      b.onclick = async () => { try { const o = await api(`/orders/${b.dataset.o}`); if (o.channel) { toast(`${o.title} · ${o.channel === 'google' ? 'Google Play' : 'App Store'} ile satın alındı. İade için o mağazayı kullan.`); return; } if (iosShell()) { toast(`${o.title} · ${o.code}. Bu siparişin ayrıntıları swipeup.live sitesinde.`); return; } paySheet(o, load); } catch (er) { toast(er.message); } };
    });
    // Android / iOS uygulamasında: fiyatlar ve ödeme mağazadan (Google Play / App Store)
    iapInfo().then((I) => {
      if (!I || !box.isConnected) return;
      box.querySelector('.pay-soon')?.remove();
      box.querySelectorAll('.plans [data-p], .packs [data-p]').forEach((b) => { const pr = I.prices.get(`swipeup.${b.dataset.p}`); b.disabled = false; if (pr) { const el = b.querySelector('.price'); if (el) el.textContent = pr; b.querySelectorAll('small').forEach((x) => { x.hidden = true; }); } });
      box.querySelectorAll('.sale-note').forEach((x) => x.remove());
      const f = box.querySelector('.pay-foot'); if (f) f.textContent = `Ödemeler ${I.store} hesabın üzerinden alınır; fiyatlar ${I.store} tarafından gösterilir. İade talepleri ${I.store} üzerinden yapılır. Jeton nakde çevrilemez, SwipeUp+ otomatik yenilenmez.`;
    });
  };
  await load();
  const off = on('wallet', () => { load(); refreshBadges(); });
  return off;
}
