// "Kimi arıyorum" tercihi için ayrı açık rıza (KVKK m.6: cinsel hayata ilişkin veri özel nitelikli sayılabilir)
import { sheet, state, api, toast } from './core.js';

const WHO = { k: 'kadınları', e: 'erkekleri' };

// true: izin verdi · false: vermedi (herkes gösterilir) · null: kapattı, karar vermedi
export function askOrientation(value) {
  return new Promise((done) => {
    let answered = false;
    const close = sheet('Kaydırma tercihin için izin', `<div style="padding:0 18px 20px;display:grid;gap:12px">
      <p style="margin:0">Kaydırmada yalnızca ${WHO[value] || 'seçtiğin cinsiyetten kişileri'} gösterebilmemiz için bu tercihini işlememiz gerekiyor. Bu bilgi cinsel hayata ilişkin <b>özel nitelikli kişisel veri</b> sayılabildiği için ayrıca açık rızanı istiyoruz.</p>
      <p class="muted" style="margin:0;font-size:13.5px">Tercihin kimseye gösterilmez; yalnızca kaydırma ve eşleşme önerileri için kullanılır. İzin vermezsen herkesi görürsün. İznini istediğin zaman Ayarlar › İzinlerim’den geri alabilirsin; geri alınca tercihin silinir.</p>
      <button class="btn primary block yes">İzin veriyorum</button>
      <button class="btn block outline no">İzin vermiyorum, herkesi göster</button></div>`, {
      onMount(sh, c) {
        sh.querySelector('.yes').onclick = () => { answered = true; c(); done(true); };
        sh.querySelector('.no').onclick = () => { answered = true; c(); done(false); };
      },
      onClose() { if (!answered) done(null); },
    });
    void close;
  });
}

// PATCH /me gövdesine rıza ekler; kullanıcı vazgeçerse null döner (kaydetme yapılmaz)
export async function withOrientation(body) {
  if (!body.lookingFor || body.lookingFor === 'all' || state.me?.consents?.orientation?.on) return body;
  const ok = await askOrientation(body.lookingFor);
  if (ok === null) return null;
  return ok ? { ...body, consentOrientation: true } : { ...body, lookingFor: 'all' };
}

// Eski hesaplar: rızasız saklanan tercih askıda; bir kez sorulur
export async function orientationPending() {
  const v = state.me?.lookingForPending; if (!v) return;
  if (document.querySelector('.terms-up')) { setTimeout(orientationPending, 4000); return; }
  const ok = await askOrientation(v);
  if (ok === null) return;
  try {
    const u = await api('/me/consents', { method: 'PUT', body: { orientation: ok } });
    Object.assign(state.me, u);
    toast(ok ? 'Tercihin yeniden açıldı.' : 'Tercihin silindi; kaydırmada herkesi göreceksin.');
  } catch (er) { toast(er.message); }
}
