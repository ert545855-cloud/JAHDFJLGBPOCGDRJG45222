// Çifte buluşma (2'ye 2): arkadaşınla ikili kur, başka ikilileri kaydır. İki ikili birbirini beğenince dört kişilik sohbet açılır.
import { icon } from '../icons.js';
import { api, esc, toast, state, sheet, on } from '../core.js';

export default async function cifte(view) {
  view.innerHTML = `<header class="topbar"><button class="ib" data-back="#/swipe" aria-label="Geri">${icon('back')}</button><div class="center">Çifte buluşma</div><span class="ib"></span></header><div class="cf"><div class="spinner"></div></div>`;
  const box = view.querySelector('.cf'); let d = null; let i = 0; let busy = false;
  const face = (p, sz = 44) => `<img class="cf-av" src="${esc(p.avatar)}" alt="" width="${sz}" height="${sz}">`;
  const person = (p) => `<div class="cf-p"><img src="${esc(p.photo)}" alt="" loading="lazy"><div class="cf-pi"><b>${esc((p.name || '').split(' ')[0])}${p.age ? ` <small>${p.age}</small>` : ''}</b>${p.bio ? `<span>${esc(p.bio).slice(0, 90)}</span>` : ''}</div></div>`;
  async function load() { try { d = await api('/cifte'); i = 0; paint(); } catch (e) { box.innerHTML = `<p class="empty">${esc(e.message)}</p>`; } }
  function paint() {
    if (!d.duo) {
      box.innerHTML = `<section class="cf-intro"><span class="cf-ic">${icon('users')}</span><h2>Arkadaşınla ikili ol</h2><p class="muted">Bir arkadaşınla ikili kur, başka ikilileri kaydırın. İki ikili birbirini beğenince dördünüz için bir sohbet açılır. İlk buluşma kalabalıkta daha rahat geçer.</p>
        ${d.invites.map((x) => `<div class="cf-inv">${face(x.user)}<span class="grow"><b>${esc(x.user.name)}</b><small>seni ikilisi olmaya çağırıyor</small></span><button class="btn primary sm" data-acc="${esc(x.id)}">Kabul et</button><button class="ib" data-no="${esc(x.id)}" aria-label="Reddet">${icon('close')}</button></div>`).join('')}
        ${d.sent ? `<div class="cf-inv">${face(d.sent.user)}<span class="grow"><b>${esc(d.sent.user.name || '')}</b><small>yanıt bekleniyor</small></span></div>` : ''}
        <button class="btn primary block cf-pick">${icon('userPlus')} Arkadaşını seç</button>
        <p class="muted cf-note">İkili, karşılıklı takipleştiğin ya da eşleştiğin biriyle kurulur.</p></section>`;
      return;
    }
    const me = d.duo.people.find((p) => p.id === state.me?.id) || d.duo.people[0]; const mate = d.duo.people.find((p) => p !== me);
    const top = `<div class="cf-me"><span class="cf-pair">${face(me, 34)}${face(mate, 34)}</span><span class="grow"><b>Sen ve ${esc((mate.name || '').split(' ')[0])}</b><small>ikilisiniz</small></span><button class="btn sm cf-leave">Ayrıl</button></div>
      ${d.matches.length ? `<div class="cf-ms">${d.matches.map((m) => `<a class="cf-m" href="#/chat/${esc(m.chatId)}">${icon('comment')}<span>${esc(m.name)}</span></a>`).join('')}</div>` : ''}`;
    const x = d.deck[i];
    box.innerHTML = top + (x ? `<article class="cf-card"><div class="cf-two">${x.people.map(person).join('')}</div>${x.city ? `<div class="cf-city">${icon('pin')}${esc(x.city)}</div>` : ''}
      <div class="cf-act"><button class="cf-no" aria-label="Geç">${icon('close')}</button><button class="cf-yes" aria-label="Beğen">${icon('heart')}</button></div></article>
      <p class="muted cf-note">İkiliden birinizin beğenisi yeterli. Karşı ikili de sizi beğenirse dörtlü sohbet açılır.</p>`
      : `<div class="empty cf-empty"><h2>Şimdilik bu kadar</h2><p class="muted">Yeni ikililer geldikçe burada görünecek. Arkadaşlarını da çifte buluşmaya çağır!</p></div>`);
  }
  async function swipe(dir) { const x = d.deck[i]; if (!x || busy) return; busy = true; const card = box.querySelector('.cf-card'); card?.classList.add(dir === 'right' ? 'go-r' : 'go-l');
    try { const r = await api('/cifte/swipe', { body: { duoId: x.id, dir } }); await new Promise((ok) => setTimeout(ok, 220)); i++; paint();
      if (r.match) sheet('Çifte buluşma eşleşmesi!', `<div class="cf-match"><span class="cf-ic">${icon('users')}</span><p>İki ikili birbirini beğendi. Dördünüz için bir sohbet açıldı.</p><a class="btn primary block" href="#/chat/${esc(r.chatId)}">Sohbete git</a></div>`); }
    catch (e) { toast(e.message); card?.classList.remove('go-r', 'go-l'); } busy = false; }
  async function pickFriend() {
    let list; try { list = await api('/cifte/friends'); } catch (e) { return toast(e.message); }
    sheet('İkilini seç', list.length ? `<div class="cf-fl">${list.map((u) => `<button class="cf-f" data-u="${esc(u.id)}" ${u.busy ? 'disabled' : ''}>${face(u)}<span class="grow"><b>${esc(u.name)}</b><small>${u.busy ? 'Başka bir ikilisi var' : `@${esc(u.username)}`}</small></span></button>`).join('')}</div>`
      : '<p class="muted" style="padding:0 16px 18px">Henüz karşılıklı takipleştiğin ya da eşleştiğin biri yok.</p>', { onMount(sh, close) { sh.addEventListener('click', async (e) => { const b = e.target.closest('[data-u]'); if (!b) return;
      try { const r = await api('/cifte/invite', { body: { userId: b.dataset.u } }); close(); toast(r.on ? 'İkili oldunuz!' : 'Davet gönderildi. Kabul edince ikili olacaksınız.'); load(); } catch (er) { toast(er.message); } }); } });
  }
  box.addEventListener('click', async (e) => {
    if (e.target.closest('.cf-pick')) return pickFriend();
    if (e.target.closest('.cf-yes')) return swipe('right');
    if (e.target.closest('.cf-no')) return swipe('left');
    const acc = e.target.closest('[data-acc]'); const no = e.target.closest('[data-no]');
    try {
      if (acc) { await api(`/cifte/accept/${acc.dataset.acc}`, { body: {} }); toast('İkili oldunuz!'); return load(); }
      if (no) { await api(`/cifte/accept/${no.dataset.no}`, { body: { no: 1 } }); return load(); }
      if (e.target.closest('.cf-leave')) { if (!window.confirm('İkiliden ayrılmak istiyor musun? Beğenileriniz silinir.')) return; await api('/cifte', { method: 'DELETE' }); return load(); }
    } catch (er) { toast(er.message); }
  });
  const offs = [on('cifte:match', () => load()), on('cifte:like', (x) => toast(`${x.by?.name?.split(' ')[0] || 'İkilin'} bir ikiliyi beğendi.`))];
  await load();
  return () => offs.forEach((f) => f?.());
}
