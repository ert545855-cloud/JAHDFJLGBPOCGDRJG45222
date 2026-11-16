// Güvenlik merkezi: buluşmayı paylaş, giriş geçmişi ve "Bu ben değilim", güvenli tanışma ipuçları, acil numaralar
import { icon } from '../icons.js';
import { api, esc, toast, state, sheet, adoptToken } from '../core.js';

const when = (t) => new Date(t).toLocaleString('tr-TR', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const ST = { planned: ['Planlandı', 'wait'], ok: ['İyi olduğunu bildirdin', 'ok'], help: ['Yardım istedin', 'bad'] };
const localInput = (t) => { const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

function shareLink(s) {
  const url = location.origin + s.url;
  const text = `Buluşmaya gidiyorum: ${s.place}, ${when(s.when)}. Durumumu buradan görebilirsin:`;
  sheet('Bağlantıyı güvendiğin kişiye gönder', `<div class="gv-sh">
    <p class="muted" style="margin:0">Bu bağlantıyı açan kişi buluşma yerini, saatini${s.with ? ', kiminle buluştuğunu' : ''} ve “İyiyim” ya da “Yardım lazım” durumunu görür. Bağlantıyı yalnızca güvendiğin birine gönder.</p>
    <div class="code-box gv-url">${esc(url)}</div>
    <button class="btn primary block sh">${icon('share')} Paylaş</button><button class="btn block cp">Bağlantıyı kopyala</button></div>`, {
    onMount(sh) {
      sh.querySelector('.cp').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Bağlantı kopyalandı.'); } catch { toast('Kopyalanamadı; bağlantıyı elle seç.'); } };
      sh.querySelector('.sh').onclick = async () => { if (navigator.share) { try { await navigator.share({ title: 'SwipeUp buluşma güvenliği', text, url }); } catch { /* vazgeçti */ } } else { try { await navigator.clipboard.writeText(`${text} ${url}`); toast('Mesaj ve bağlantı kopyalandı.'); } catch { toast('Kopyalanamadı.'); } } };
    },
  });
}

function newShare(onDone) {
  const t = new Date(Date.now() + 2 * 3600000); t.setMinutes(0, 0, 0);
  sheet('Buluşmayı paylaş', `<form class="form" style="padding-top:4px">
    <label>Nerede<input class="field" name="place" maxlength="120" placeholder="ör. Moda Sahili, Kadıköy" required></label>
    <label>Ne zaman<input class="field" type="datetime-local" name="when" value="${localInput(t)}" required></label>
    <label><span>Kiminle <span class="opt">· isteğe bağlı</span></span><input class="field" name="with" maxlength="60" placeholder="@kullaniciadi ya da ad"></label>
    <p class="muted" style="margin:0;font-size:13px">Buluşmadan 2 saat sonra “Buluşman nasıl geçti?” diye soracağız. Paylaşım buluşmadan 2 gün sonra kapanır, 7 gün sonra tamamen silinir.</p>
    <button class="btn primary block">Paylaşım bağlantısı oluştur</button></form>`, {
    onMount(sh, close) {
      const f = sh.querySelector('form');
      f.onsubmit = async (e) => {
        e.preventDefault(); const w = f.with.value.trim();
        try {
          const s = await api('/safety', { body: { place: f.place.value, when: new Date(f.when.value).toISOString(), ...(w.startsWith('@') || /^[a-z0-9._]{3,24}$/.test(w) ? { withUsername: w } : { withName: w }) } });
          close(); onDone?.(); shareLink(s);
        } catch (er) { toast(er.message); }
      };
    },
  });
}

function passwordSheet() {
  sheet('Yeni şifre belirle', `<form class="form" style="padding-top:4px">
    <p class="muted" style="margin:0">Hesabına başkası girmiş olabilir. Mevcut şifreni ve yeni bir şifre yaz; başka sitelerde kullanmadığın bir şifre seç.</p>
    <label>Mevcut şifre<input class="field" type="password" name="c" autocomplete="current-password"></label>
    <label>Yeni şifre<input class="field" type="password" name="n" minlength="6" autocomplete="new-password" required></label>
    <button class="btn primary block">Şifreyi değiştir</button>
    <p class="muted" style="margin:0;font-size:12.5px">Mevcut şifreni bilmiyorsan çıkış yapıp girişteki “Şifreni mi unuttun?” adımını kullan.</p></form>`, {
    onMount(sh, close) {
      const f = sh.querySelector('form');
      f.onsubmit = async (e) => { e.preventDefault(); try { const r = await api('/me/password', { body: { current: f.c.value, password: f.n.value } }); adoptToken(r.token); close(); toast('Şifren değişti.'); } catch (er) { toast(er.message); } };
    },
  });
}

export default async function guvenlik(view, kind, id) {
  view.innerHTML = `<header class="topbar bordered"><button class="ib" data-back="#/settings" aria-label="Geri">${icon('back')}</button><div class="center">Güvenlik merkezi</div><span class="ib"></span></header>
    <div class="gv"><div class="spinner"></div></div>`;
  const box = view.querySelector('.gv');
  const load = async () => {
    const [sf, lg] = await Promise.all([api('/safety/mine').catch(() => ({ items: [] })), api('/security/logins').catch(() => null)]);
    const focusEv = kind === 'giris' && lg?.events.find((e) => e.id === id);
    box.innerHTML = `
      ${focusEv && !focusEv.notMe ? `<section class="gv-alert"><b>Bu giriş sen miydin?</b><p>${esc(focusEv.label)} · ${when(focusEv.at)} · IP ${esc(focusEv.ip)}</p>
        <div class="gv-row"><button class="btn sm ok-me" data-ev="${esc(focusEv.id)}">Evet, bendim</button><button class="btn sm danger not-me" data-ev="${esc(focusEv.id)}">Bu ben değilim</button></div></section>` : ''}
      ${lg?.resetRequired ? '<section class="gv-alert"><b>Şifreni yenilemen gerekiyor.</b><p>“Bu ben değilim” dediğin için şifreyle giriş durduruldu. Yeni bir şifre belirleyince yeniden açılır.</p><button class="btn sm primary pw">Yeni şifre belirle</button></section>' : ''}

      <h3 class="gv-h">${icon('pin')} Buluşmayı paylaş</h3>
      <p class="gv-p">İlk kez yüz yüze buluşacaksan yerini ve saatini güvendiğin biriyle paylaş. Bağlantıyı açan kişi, buluşmadan sonra iyi olduğunu bildirip bildirmediğini görür.</p>
      <div class="gv-list">${sf.items.map((s) => `<div class="gv-card ${kind === 'paylas' && id === s.id ? 'on' : ''}" data-id="${esc(s.id)}">
        <div class="gv-top"><b>${esc(s.place)}</b><span class="st ${ST[s.status]?.[1] || 'wait'}">${ST[s.status]?.[0] || ''}</span></div>
        <small class="muted">${when(s.when)}${s.with ? ` · ${esc(s.with.name)}${s.with.username ? ` (@${esc(s.with.username)})` : ''}` : ''}${s.fromChat ? ' · sohbetteki plandan' : ''}</small>
        <div class="gv-row"><button class="btn sm lnk">${icon('share')} Bağlantı</button>${s.status !== 'ok' ? '<button class="btn sm ok-s">İyiyim</button>' : ''}${s.status !== 'help' ? '<button class="btn sm danger help">Yardım lazım</button>' : ''}<button class="btn sm cn">İptal</button></div></div>`).join('')}</div>
      <button class="btn primary block new">${icon('plus')} Yeni buluşma paylaşımı</button>

      <h3 class="gv-h">${icon('shield')} Hesap güvenliği</h3>
      <p class="gv-p">Tanımadığımız bir cihazdan giriş yapılırsa sana bildirim ve e-postayla haber veririz.</p>
      <div class="gv-list">${(lg?.events || []).slice(0, 8).map((e) => `<div class="gv-card"><div class="gv-top"><b>${esc(e.label)}</b>${e.mine ? '<span class="st ok">Bu cihaz</span>' : e.notMe ? '<span class="st bad">Ben değilim dedin</span>' : e.newDevice ? '<span class="st wait">Yeni cihaz</span>' : ''}</div>
        <small class="muted">${when(e.at)} · ${esc(e.via || '')} · IP ${esc(e.ip || '')}</small>${e.newDevice && !e.notMe && !e.mine ? `<div class="gv-row"><button class="btn sm danger not-me" data-ev="${esc(e.id)}">Bu ben değilim</button></div>` : ''}</div>`).join('') || '<p class="muted">Henüz giriş kaydı yok.</p>'}</div>
      <div class="gv-row"><button class="btn sm lox">Diğer tüm cihazlardan çık</button><button class="btn sm not-me" data-ev="">Hesabıma başkası girdi</button></div>

      <h3 class="gv-h">${icon('heart')} Güvenli tanışma</h3>
      <ul class="gv-ul">
        <li>İlk buluşmayı kalabalık, herkese açık bir yerde yap; ulaşımını kendin ayarla.</li>
        <li>Buluşma bilgilerini güvendiğin biriyle paylaş (yukarıdaki “Buluşmayı paylaş”).</li>
        <li>Selfie ile doğrulanmış profilleri tercih et; buluşmadan önce görüntülü tanış.</li>
        <li>Ev adresini, iş yerini ve günlük rutinini ilk görüşmelerde paylaşma.</li>
        <li>İçkini gözünün önünden ayırma; kendini rahatsız hissedersen buluşmayı bitirmekten çekinme.</li>
      </ul>
      <h3 class="gv-h">${icon('coin')} Dolandırıcılığa karşı</h3>
      <ul class="gv-ul">
        <li>Tanıştığın biri para, IBAN, kripto, hediye kartı ya da “yatırım fırsatı” istiyorsa bu bir dolandırıcılık işaretidir; şikayet et.</li>
        <li>SwipeUp seni asla arayıp şifre, doğrulama kodu ya da kart bilgisi istemez. Jeton ödemesi yalnızca Mağaza ekranındaki bilgilere yapılır.</li>
        <li>Seni uygulama dışına (başka mesajlaşma uygulamalarına, bağlantılara) çekmeye çalışanlara dikkat et.</li>
        <li>Mahrem fotoğraf ya da video gönderme; tehdit edilirsen ödeme yapma, delilleri sakla ve şikayet et.</li>
      </ul>
      <h3 class="gv-h">${icon('flag')} Şikayet ve engelleme</h3>
      <p class="gv-p">Profilde ya da sohbette sağ üstteki menüden <b>Engelle</b> ya da <b>Şikayet et</b>’e dokun. Engellediğin kişi seni göremez ve sana yazamaz; şikayetler yönetim ekibince incelenir ve kimin şikayet ettiği karşı tarafa söylenmez. Sorun yaşarsan <a class="link" href="#/destek">Destek</a>’e yaz.</p>
      <h3 class="gv-h">${icon('phone')} Acil durumda</h3>
      <div class="gv-sos">
        <a class="gv-tel big" href="tel:112"><b>112</b><span>Acil Çağrı Merkezi · polis, jandarma, ambulans, itfaiye</span></a>
        <a class="gv-tel" href="tel:183"><b>ALO 183</b><span>Aile, kadın, çocuk ve engelli sosyal destek hattı</span></a>
        <div class="gv-tel"><b>KADES</b><span>Emniyet’in kadın acil destek uygulaması (uygulama mağazalarından)</span></div>
        <a class="gv-tel" href="https://www.ihbarweb.org.tr" target="_blank" rel="noopener"><b>İhbar Web</b><span>Çocuk istismarı, müstehcenlik gibi yasa dışı internet içeriklerini bildir</span></a>
      </div>
      <p class="muted gv-foot">Kişisel verilerinle ilgili haklar için <a class="link" href="#/veri-taleplerim">Veri taleplerim</a> · <a class="link" href="#/legal/saklama">Saklama ve imha politikası</a></p>`;
    box.querySelector('.new').onclick = () => newShare(load);
    box.querySelector('.pw')?.addEventListener('click', passwordSheet);
    box.querySelector('.lox').onclick = async () => {
      if (!confirm('Bu cihaz dışındaki bütün oturumların kapatılsın mı?')) return;
      try { const r = await api('/me/logout-others', { body: {} }); adoptToken(r.token); toast('Diğer cihazlardaki oturumların kapatıldı.'); } catch (er) { toast(er.message); }
    };
    box.querySelectorAll('.not-me').forEach((b) => { b.onclick = async () => {
      if (!confirm('Tüm oturumların kapatılsın mı? Bu cihaz açık kalır; şifreyle giriş, yeni şifre belirleyene kadar durdurulur.')) return;
      try { const r = await api('/security/not-me', { body: { eventId: b.dataset.ev || null } }); adoptToken(r.token); toast('Diğer tüm oturumların kapatıldı.'); if (r.needPassword) passwordSheet(); load(); } catch (er) { toast(er.message); }
    }; });
    box.querySelector('.ok-me')?.addEventListener('click', async (e) => { try { await api('/security/its-me', { body: { eventId: e.target.dataset.ev } }); toast('Teşekkürler.'); location.hash = '#/guvenlik'; } catch (er) { toast(er.message); } });
    box.querySelectorAll('.gv-card[data-id]').forEach((c) => {
      const s = sf.items.find((x) => x.id === c.dataset.id);
      c.querySelector('.lnk').onclick = () => shareLink(s);
      c.querySelector('.ok-s')?.addEventListener('click', async () => { try { await api(`/safety/${s.id}/ok`, { body: {} }); toast('Paylaştığın kişiye iyi olduğunu bildirdik 💛'); load(); } catch (er) { toast(er.message); } });
      c.querySelector('.help')?.addEventListener('click', async () => {
        if (!confirm('Paylaştığın kişinin sayfasında “Yardım istedi” yazacak. Acil bir tehlike varsa hemen 112’yi ara. Devam edilsin mi?')) return;
        try { await api(`/safety/${s.id}/help`, { body: {} }); toast('Paylaştığın kişinin sayfasında yardım istediğin görünüyor. Acil durumda 112’yi ara.', { ms: 6000 }); load(); } catch (er) { toast(er.message); }
      });
      c.querySelector('.cn').onclick = async () => { if (!confirm('Paylaşım iptal edilsin mi? Bağlantı kapanır.')) return; try { await api(`/safety/${s.id}/cancel`, { body: {} }); load(); } catch (er) { toast(er.message); } };
    });
    if (kind === 'paylas') box.querySelector('.gv-card.on')?.scrollIntoView({ block: 'center' });
  };
  await load();
  void state;
  return null;
}
