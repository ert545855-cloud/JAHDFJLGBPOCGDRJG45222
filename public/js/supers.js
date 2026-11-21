// Süper beğeni paketleri (jetonla) ve profil teması (SwipeUp+) seçicileri
import { api, esc, toast, sheet, state, needCoins, plusSheet } from './core.js';
import { icon } from './icons.js';

const SUPER_ART = (n) => `<span class="sp-art"><i>${icon('star')}</i><b>${n}</b></span>`;
export async function superSheet(reason, onBought) {
  const d = await api('/supers').catch(() => null); if (!d) return toast('Paketler yüklenemedi.');
  sheet(null, `<div class="sp-sheet">
    <div class="sp-hero">${icon('star')}</div>
    <h2>Süper beğeni</h2>
    <p class="muted">${esc(reason || 'Süper beğeni, karşındakine onu özellikle beğendiğini gösterir ve kartında öne çıkarır.')}</p>
    <div class="sp-packs">${d.packs.map((p) => `<button class="sp-pack" data-id="${esc(p.id)}">${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ''}${SUPER_ART(p.n)}<span class="sp-n">${p.n} süper beğeni</span><span class="sp-c">${icon('coin')} ${p.coins} jeton</span></button>`).join('')}</div>
    <p class="muted sp-foot">Satın aldıkların günlük hakkın bitince kullanılır, süresi dolmaz. Elinde: <b class="bk">${d.bank}</b> · Bakiye: <b class="bl">${d.coins}</b> jeton</p>
    ${d.plus ? '' : `<button class="btn block plus-cta">${icon('crown')} SwipeUp+ ile her gün 5 süper beğeni</button>`}
  </div>`, {
    onMount(sh, close) {
      sh.querySelector('.plus-cta')?.addEventListener('click', () => { close(); plusSheet(); });
      sh.querySelector('.sp-packs').onclick = async (e) => {
        const b = e.target.closest('[data-id]'); if (!b) return;
        const p = d.packs.find((x) => x.id === b.dataset.id);
        if (p.coins > d.coins) { close(); needCoins(`${p.n} süper beğeni ${p.coins} jeton, bakiyen ${d.coins}.`); return; }
        b.disabled = true;
        try {
          const r = await api('/supers/buy', { body: { id: p.id } });
          state.me.coins = r.coins; close(); toast(`${p.n} süper beğeni eklendi. Elinde ${r.bank} tane var.`); onBought?.(r);
        } catch (er) { b.disabled = false; if (er.status === 402) { close(); needCoins(er.message); } else toast(er.message); }
      };
    },
  });
}
export async function supersStoreSection(box) {
  const d = await api('/supers').catch(() => null); if (!d || !box) return;
  box.innerHTML = `<h3 class="shop-h">${icon('star')} Süper beğeni paketleri</h3>
    <p class="muted" style="margin:-4px 2px 10px;font-size:14px">Günlük hakkın bitince kullanılır, süresi dolmaz. Elinde: ${d.bank}</p>
    <div class="sp-packs">${d.packs.map((p) => `<button class="sp-pack" data-id="${esc(p.id)}">${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ''}${SUPER_ART(p.n)}<span class="sp-n">${p.n} süper beğeni</span><span class="sp-c">${icon('coin')} ${p.coins} jeton</span></button>`).join('')}</div>`;
  box.querySelector('.sp-packs').onclick = (e) => { if (e.target.closest('[data-id]')) superSheet(null, () => supersStoreSection(box)); };
}

// Profil teması (SwipeUp+): arka plan ve isim rengi
export async function themeSection(box, onChange) {
  const d = await api('/ptheme').catch(() => null); if (!d || !box) return;
  let cur = { bg: d.cur?.bg || null, name: d.cur?.name || null };
  const draw = () => {
    box.innerHTML = `<h3 class="shop-h">${icon('crown')} Profil teması <span class="plus-chip">${icon('crown')}+</span></h3>
      <p class="muted" style="font-size:13px;margin:-4px 2px 10px">SwipeUp+ üyelerine özel: profilinin arka planı ve her yerde görünen renkli ismin.${d.plus ? '' : ' Önizleyebilirsin, kaydetmek için SwipeUp+ gerekir.'}</p>
      <div class="pt-prev pt ${cur.bg ? `pt-${esc(cur.bg)}` : ''}"><img class="av av-64" src="${esc(state.me.avatar)}" alt=""><b>${cur.name ? `<span class="nc nc-${esc(cur.name)}">${esc(state.me.name)}</span>` : esc(state.me.name)}</b></div>
      <div class="pt-lbl">Arka plan</div>
      <div class="pt-bgs"><button class="pt-sw none ${cur.bg ? '' : 'on'}" data-bg="" aria-label="Yok">${icon('block')}</button>${d.bgs.map((b) => `<button class="pt-sw pt pt-${esc(b.id)} ${cur.bg === b.id ? 'on' : ''}" data-bg="${esc(b.id)}" aria-label="${esc(b.name)}"></button>`).join('')}</div>
      <div class="pt-lbl">İsim rengi</div>
      <div class="pt-names"><button class="pt-nm ${cur.name ? '' : 'on'}" data-nm="">Normal</button>${d.names.map((n) => `<button class="pt-nm ${cur.name === n.id ? 'on' : ''}" data-nm="${esc(n.id)}"><span class="nc nc-${esc(n.id)}">${esc(n.name)}</span></button>`).join('')}</div>
      <button class="btn primary block pt-save" style="margin-top:12px">${d.plus ? 'Kaydet' : `${icon('crown')} SwipeUp+ ile kullan`}</button>`;
  };
  draw();
  box.onclick = async (e) => {
    const bg = e.target.closest('[data-bg]'); if (bg) { cur.bg = bg.dataset.bg || null; return draw(); }
    const nmb = e.target.closest('[data-nm]'); if (nmb) { cur.name = nmb.dataset.nm || null; return draw(); }
    if (e.target.closest('.pt-save')) {
      if (!d.plus) return plusSheet('Profil teması SwipeUp+ ayrıcalığıdır.');
      try { const r = await api('/ptheme', { body: cur }); state.me.pTheme = r.pTheme; toast('Profil teman kaydedildi.'); onChange?.(r.pTheme); } catch (er) { if (er.status === 402) plusSheet(er.message); else toast(er.message); }
    }
  };
}

// Süper beğeniden önce isteğe bağlı kısa not sorulur. Döner: null (vazgeçti), '' (notsuz), ya da not metni.
// Not karşı tarafın bildiriminde ve "Seni beğenenler" kartında görünür; eşleşirseniz sohbetin ilk mesajı olur.
export function askSuperNote(name) {
  return new Promise((resolve) => {
    let done = false; const fin = (v) => { if (done) return; done = true; resolve(v); };
    sheet(null, `<div class="sn-sheet">
      <div class="sp-hero">${icon('star')}</div>
      <h2>Süper beğeni${name ? ` · ${esc(name)}` : ''}</h2>
      <p class="muted">İstersen kısa bir not ekle. Not bildiriminde görünür; eşleşirseniz sohbetinizin ilk mesajı olur.</p>
      <textarea class="field sn-t" maxlength="140" rows="3" placeholder="Ör. Fotoğraftaki yer neresi, çok güzelmiş!"></textarea>
      <div class="sn-c muted">0/140</div>
      <button class="btn primary block sn-go">${icon('star')} Süper beğeni gönder</button>
      <p class="muted sn-rule">Hakaret, taciz ya da iletişim bilgisi içeren notlar gönderilmez.</p>
    </div>`, {
      onClose: () => fin(null),
      onMount: (sh, close) => {
        const t = sh.querySelector('.sn-t'); const c = sh.querySelector('.sn-c');
        t.oninput = () => { c.textContent = `${t.value.length}/140`; };
        sh.querySelector('.sn-go').onclick = () => { fin(t.value.replace(/\s+/g, ' ').trim()); close(); };
        setTimeout(() => t.focus(), 250);
      },
    });
  });
}
