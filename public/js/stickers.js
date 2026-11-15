// Sohbet çıkartmaları: seçici (paket sekmeleri, son kullanılanlar), mesaj görünümü, mağaza kartları
import { api, esc, toast, sheet, state, needCoins } from './core.js';
import { icon } from './icons.js';

export const stkSrc = (pack, id) => `/img/stk/${encodeURIComponent(pack)}/${encodeURIComponent(id)}.svg`;
export const stickerHtml = (s, size = 128) => `<img class="stk-img" src="${stkSrc(s.pack, s.id)}" width="${size}" height="${size}" alt="${esc(s.name || 'Çıkartma')}" title="${esc(s.name || '')}" decoding="async">`;

const RK = 'su_stk_recent';
const recent = () => { try { return JSON.parse(localStorage.getItem(RK) || '[]').slice(0, 16); } catch { return []; } };
const remember = (pack, id) => { try { localStorage.setItem(RK, JSON.stringify([{ pack, id }, ...recent().filter((x) => x.pack !== pack || x.id !== id)].slice(0, 16))); } catch { /* yok */ } };

export async function buyPack(p) {
  if (p.plus) { toast('Bu paket SwipeUp+ üyelerine özel.', { title: 'SwipeUp+', href: '#/store', ms: 4000 }); return null; }
  if (!confirm(`${p.name} paketi ${p.coins} jeton. Satın alınsın mı?`)) return null;
  try {
    const r = await api(`/stickers/${p.id}/buy`, { body: {} });
    state.me.coins = r.coins; toast(`${p.name} paketi artık senin!`);
    return r.pack;
  } catch (er) { if (er.status === 402) needCoins(er.message); else toast(er.message); return null; }
}

// Seçici: seçilen çıkartmayı { pack, id, name } olarak onPick'e verir
export async function stickerSheet(onPick) {
  let d = await api('/stickers').catch(() => null);
  if (!d) return toast('Çıkartmalar yüklenemedi.');
  let tab = recent().some((r) => d.packs.find((p) => p.id === r.pack)?.owned) ? 'recent' : (d.packs.find((p) => p.owned) || d.packs[0]).id;
  sheet(null, `<div class="stk-sheet"><div class="stk-tabs" role="tablist"></div><div class="stk-body"></div></div>`, {
    onMount(sh, close) {
      const tabs = sh.querySelector('.stk-tabs'); const body = sh.querySelector('.stk-body');
      const draw = () => {
        const rec = recent().map((r) => ({ ...r, p: d.packs.find((p) => p.id === r.pack) })).filter((r) => r.p?.owned && r.p.items.some((i) => i.id === r.id));
        tabs.innerHTML = `${rec.length ? `<button class="stk-tab ${tab === 'recent' ? 'on' : ''}" data-t="recent" aria-label="Son kullanılanlar">${icon('timer')}</button>` : ''}${d.packs.map((p) => `<button class="stk-tab ${tab === p.id ? 'on' : ''} ${p.owned ? '' : 'locked'}" data-t="${esc(p.id)}" aria-label="${esc(p.name)}"><img src="${stkSrc(p.id, p.items[0].id)}" alt="" width="34" height="34">${p.owned ? '' : `<i>${icon(p.plus ? 'crown' : 'lock')}</i>`}</button>`).join('')}`;
        if (tab === 'recent') {
          body.innerHTML = `<div class="stk-h"><b>Son kullanılanlar</b></div><div class="stk-grid">${rec.map((r) => `<button data-p="${esc(r.pack)}" data-i="${esc(r.id)}">${stickerHtml({ pack: r.pack, id: r.id, name: r.p.items.find((i) => i.id === r.id).name }, 76)}</button>`).join('')}</div>`;
          return;
        }
        const p = d.packs.find((x) => x.id === tab);
        body.innerHTML = `<div class="stk-h"><b>${esc(p.name)}</b><small>${esc(p.desc)}</small>
          ${p.owned ? '' : p.plus ? `<a class="btn sm gold" href="#/store">${icon('crown')} SwipeUp+ ile aç</a>` : `<button class="btn sm primary stk-buy">${icon('coin')} ${p.coins} jeton</button>`}</div>
          <div class="stk-grid ${p.owned ? '' : 'preview'}">${p.items.map((i) => `<button data-p="${esc(p.id)}" data-i="${esc(i.id)}" ${p.owned ? '' : 'tabindex="-1"'}>${stickerHtml({ pack: p.id, id: i.id, name: i.name }, 76)}<span>${esc(i.name)}</span></button>`).join('')}</div>
          ${p.owned ? '' : `<p class="muted stk-note">${p.plus ? 'SwipeUp+ üyeliğin oldukça bu paket senin.' : 'Bir kez al, sonsuza kadar sınırsız gönder.'} Bakiye: ${d.coins} jeton</p>`}`;
        body.querySelector('.stk-buy')?.addEventListener('click', async () => {
          const np = await buyPack(p); if (!np) return;
          d = { ...d, coins: state.me.coins, packs: d.packs.map((x) => (x.id === np.id ? np : x)) }; draw();
        });
        body.querySelector('a[href="#/store"]')?.addEventListener('click', () => close());
      };
      tabs.onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; tab = b.dataset.t; draw(); };
      body.addEventListener('click', (e) => {
        const b = e.target.closest('.stk-grid:not(.preview) [data-p]'); if (!b) return;
        const p = d.packs.find((x) => x.id === b.dataset.p); const it = p.items.find((i) => i.id === b.dataset.i);
        remember(p.id, it.id); close(); onPick({ pack: p.id, id: it.id, name: it.name });
      });
      draw();
    },
  });
}

// Mağaza bölümü
export async function storeSection(box) {
  const d = await api('/stickers').catch(() => null); if (!d || !box) return;
  const draw = () => {
    box.innerHTML = `<h3 class="shop-h">${icon('sticker')} Çıkartma paketleri</h3>
      <p class="muted" style="margin:-4px 2px 10px;font-size:14px">Sohbetlerde gönder. Bir kez al, sınırsız kullan.</p>
      <div class="stk-shop">${d.packs.map((p) => `<div class="stk-card ${p.owned ? 'own' : ''}">
        <div class="stk-prev">${p.items.slice(0, 4).map((i) => stickerHtml({ pack: p.id, id: i.id, name: i.name }, 56)).join('')}</div>
        <div class="stk-info"><b>${esc(p.name)}</b><small>${p.items.length} çıkartma${p.animated ? ' · hareketli' : ''}</small></div>
        ${p.owned ? `<span class="chip ok">${icon('check')} Sende</span>` : p.plus ? `<span class="chip gold">${icon('crown')} SwipeUp+</span>` : `<button class="btn sm primary" data-buy="${esc(p.id)}">${icon('coin')} ${p.coins}</button>`}
      </div>`).join('')}</div>`;
  };
  draw();
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-buy]'); if (!b) return;
    const np = await buyPack(d.packs.find((p) => p.id === b.dataset.buy)); if (!np) return;
    d.packs = d.packs.map((x) => (x.id === np.id ? np : x)); d.coins = state.me.coins; draw();
  });
}
