// Veri taleplerim: KVKK m.11 hakları için başvuru (m.13: en geç 30 gün içinde, ücretsiz). Başvuru kimliği hesapla doğrulanır.
import { icon } from '../icons.js';
import { api, esc, toast, state } from '../core.js';

const ST = { open: ['İnceleniyor', 'wait'], answered: ['Yanıtlandı', 'ok'], rejected: ['Reddedildi (gerekçeli)', 'bad'] };
const day = (t) => new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

export default async function veri(view) {
  view.innerHTML = `<header class="topbar bordered"><button class="ib" data-back="#/settings" aria-label="Geri">${icon('back')}</button><div class="center">Veri taleplerim</div><span class="ib"></span></header>
    <div class="kv-page"><div class="spinner"></div></div>`;
  const box = view.querySelector('.kv-page');
  const load = async () => {
    let r; try { r = await api('/kvkk/requests'); } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    box.innerHTML = `<p class="kv-lead">KVKK’nın 11. maddesindeki haklarını buradan kullanabilirsin. Başvurun bir takip numarası alır ve en geç <b>30 gün</b> içinde ücretsiz yanıtlanır; yanıtı burada ve e-posta adresin varsa e-postayla alırsın.</p>
      <div class="kv-quick"><button class="btn sm dl">${icon('download')} Verilerimin kopyasını indir</button><a class="btn sm" href="#/settings">Hesabımı silmek istiyorum</a></div>
      <form class="form kv-f"><div class="kv-types">${Object.entries(r.types).map(([k, t]) => `<label class="consent"><input type="checkbox" name="t" value="${esc(k)}"><span>${esc(t)}</span></label>`).join('')}</div>
        <label><span>Açıklama <span class="opt">· isteğe bağlı</span></span><textarea class="field" name="note" rows="4" maxlength="2000" placeholder="Talebini ayrıntılı yaz: hangi veri, ne yapılmasını istiyorsun?"></textarea></label>
        <button class="btn primary block">Başvuruyu gönder</button>
        <p class="muted" style="font-size:12.5px;margin:0">Başvurunu e-postayla, KEP ile ya da yazılı olarak da yapabilirsin; iletişim bilgileri <a class="link" href="#/legal/kvkk">KVKK Aydınlatma Metni</a>’nde. Yanıtı yeterli bulmazsan Kişisel Verileri Koruma Kurulu’na şikayette bulunabilirsin.</p></form>
      ${r.items.length ? `<h3 class="kv-h">Başvurularım</h3>${r.items.map((k) => `<div class="kv-it"><div class="kv-top"><b>${esc(k.no)}</b><span class="st ${ST[k.status][1]}">${ST[k.status][0]}</span></div>
        <small class="muted">${day(k.at)} · ${k.status === 'open' ? `son yanıt tarihi ${day(k.due)}` : `yanıt ${day(k.answeredAt)}`}</small>
        <ul>${k.typeNames.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>${k.note ? `<p class="kv-note">${esc(k.note)}</p>` : ''}${k.answer ? `<div class="kv-ans"><b>Yanıt</b><p>${esc(k.answer)}</p></div>` : ''}</div>`).join('')}` : ''}`;
    const f = box.querySelector('form');
    f.onsubmit = async (e) => {
      e.preventDefault(); const types = [...f.querySelectorAll('[name=t]:checked')].map((x) => x.value);
      if (!types.length) { toast('En az bir talep seç.'); return; }
      try { const k = await api('/kvkk/requests', { body: { types, note: f.note.value } }); toast(`Başvurun alındı: ${k.no}. En geç 30 gün içinde yanıtlanacak.`, { ms: 5000 }); load(); } catch (er) { toast(er.message); }
    };
    box.querySelector('.dl').onclick = async () => { // KVKK m.11: verilerin kopyası (JSON)
      try {
        const x = await fetch('/api/me/export', { headers: { Authorization: 'Bearer ' + state.token } }); if (!x.ok) throw new Error((await x.json().catch(() => ({}))).error || 'İndirilemedi.');
        const a = document.createElement('a'); a.href = URL.createObjectURL(await x.blob()); a.download = `swipeup-${state.me?.username || 'ben'}-veriler.json`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Verilerin indirildi.');
      } catch (er) { toast(er.message); }
    };
  };
  await load();
  return null;
}
