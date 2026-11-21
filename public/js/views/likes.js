import { icon } from '../icons.js';
import { api, esc, toast, refreshBadges, on, plusSheet, tick } from '../core.js';
import { showMatch } from '../app.js';

// İki sekme: "Seni beğenenler" (gelen beğeniler) ve "Beğendiklerin" (senin beğenip henüz eşleşmediğin kişiler)
export default async function likes(view) {
  let tab = sessionStorage.getItem('su_likes_tab') === 'out' ? 'out' : 'in';
  view.innerHTML = `<header class="topbar">
      <button class="ib" data-back="#/swipe" aria-label="Geri">${icon('back')}</button>
      <div class="center">Beğeniler</div><span class="ib"></span>
    </header>
    <div class="seg lk-tabs" role="tablist"><button data-t="in" role="tab">Seni beğenenler</button><button data-t="out" role="tab">Beğendiklerin</button></div>
    <div class="lb"><div class="spinner"></div></div>`;
  const box = view.querySelector('.lb');
  const tabs = view.querySelector('.lk-tabs');
  let list = []; let sent = []; let sentLoaded = false;
  const ago = (t) => { const d = Math.floor((Date.now() - t) / 86400000); return d <= 0 ? 'bugün' : d === 1 ? 'dün' : `${d} gün önce`; };

  const paintIn = () => {
    const locked = list.filter((u) => u.locked).length;
    box.innerHTML = list.length
      ? `${locked ? `<button class="plus-banner">${icon('crown')}<span><b>${locked} kişi seni beğendi</b>Kim olduklarını görmek için SwipeUp+’a geç.</span></button>` : '<p class="muted" style="margin:4px 16px 14px">Sağa kaydırırsan anında eşleşirsiniz.</p>'}
      <div class="likes-grid">${list.map((u) => (u.locked ? `<button class="like-card locked"><img src="${esc(u.photo)}" alt=""><div class="g"></div><span class="lk">${icon('lock')}</span></button>` : `<div class="like-card" data-id="${esc(u.id)}">
          <img src="${esc(u.photo)}" alt=""><div class="g"></div>
          ${u.super ? '<span class="sup">SÜPER BEĞENİ</span>' : ''}
          <a class="t ellipsis" href="#/u/${esc(u.username)}">${esc(u.name.split(' ')[0])}${u.age ? `, ${u.age}` : ''}${tick(u)}</a>
          <div class="acts"><button class="no" aria-label="Geç">${icon('x')}</button><button class="yes" aria-label="Beğen">${icon('heart', '', 'fill="currentColor"')}</button></div>
        </div>`)).join('')}</div>`
      : `<div class="empty"><div class="big">${icon('heart')}</div><h2>Henüz beğeni yok</h2>Profiline birkaç fotoğraf ekle ve kaydırmaya devam et; seni beğenenler burada görünür.<p><a class="btn primary" href="#/swipe">Kaydırmaya başla</a></p></div>`;
  };
  const paintOut = () => {
    box.innerHTML = sent.length
      ? `<p class="muted" style="margin:4px 16px 14px">Beğendiğin ama henüz eşleşmediğin kişiler. Onlar da seni beğenirse eşleşirsiniz ve sohbet açılır.</p>
      <div class="likes-grid">${sent.map((u) => `<div class="like-card sent" data-id="${esc(u.id)}">
          <img src="${esc(u.photo)}" alt=""><div class="g"></div>
          ${u.super ? '<span class="sup">SÜPER BEĞENİ</span>' : ''}
          <a class="t ellipsis" href="#/u/${esc(u.username)}">${esc(u.name.split(' ')[0])}${u.age ? `, ${u.age}` : ''}${tick(u)}</a>
          <small class="lk-when">${ago(u.at)} beğendin</small>
          <button class="lk-undo">Beğeniyi geri al</button>
        </div>`).join('')}</div>`
      : `<div class="empty"><div class="big">${icon('heart')}</div><h2>Bekleyen beğenin yok</h2>Kaydırırken sağa kaydırdığın kişiler, eşleşene kadar burada görünür.<p><a class="btn primary" href="#/swipe">Kaydırmaya başla</a></p></div>`;
  };
  const paint = () => {
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    if (tab === 'out' && !sentLoaded) { box.innerHTML = '<div class="spinner"></div>'; loadSent(); return; }
    (tab === 'in' ? paintIn : paintOut)();
  };
  const load = async () => { const r = await api('/likes'); list = r.items; if (tab === 'in') paint(); };
  const loadSent = async () => { try { sent = (await api('/likes/sent')).items; } catch (er) { sent = []; toast(er.message); } sentLoaded = true; if (tab === 'out') paint(); };

  tabs.onclick = (e) => {
    const b = e.target.closest('[data-t]'); if (!b || b.dataset.t === tab) return;
    tab = b.dataset.t; try { sessionStorage.setItem('su_likes_tab', tab); } catch { /* yok */ }
    if (tab === 'out') sentLoaded = false; // her açılışta güncel liste
    paint();
  };
  paint();
  await load();

  box.onclick = async (e) => {
    if (e.target.closest('.locked, .plus-banner')) return plusSheet('Seni beğenenleri tek tek gör, hemen eşleş.');
    const undo = e.target.closest('.lk-undo');
    if (undo) {
      const card = undo.closest('.like-card'); const id = card.dataset.id;
      const u = sent.find((x) => x.id === id);
      if (!confirm(`${u?.name?.split(' ')[0] || 'Bu kişi'} için beğenini geri almak istiyor musun? Kişi seni beğense bile eşleşmezsiniz.`)) return;
      undo.disabled = true;
      try {
        await api(`/likes/sent/${encodeURIComponent(id)}`, { method: 'DELETE' });
        sent = sent.filter((x) => x.id !== id);
        card.style.transition = 'transform .3s, opacity .3s'; card.style.transform = 'scale(.9)'; card.style.opacity = 0;
        setTimeout(paint, 300); toast('Beğeni geri alındı.');
      } catch (er) { undo.disabled = false; toast(er.message); }
      return;
    }
    const b = e.target.closest('.no, .yes'); if (!b) return;
    const card = b.closest('.like-card'); const id = card.dataset.id;
    const u = list.find((x) => x.id === id);
    list = list.filter((x) => x.id !== id);
    card.style.transition = 'transform .3s, opacity .3s';
    card.style.transform = `translateX(${b.classList.contains('yes') ? 60 : -60}px) rotate(${b.classList.contains('yes') ? 8 : -8}deg)`;
    card.style.opacity = 0;
    try {
      const r = await api('/swipe', { body: { to: id, dir: b.classList.contains('yes') ? 'right' : 'left' } });
      if (r.match) showMatch(r.user || u, r.chatId);
    } catch (er) { toast(er.message); }
    setTimeout(paint, 300);
    refreshBadges();
  };
  const off = on('likes:new', load);
  refreshBadges();
  return off;
}
