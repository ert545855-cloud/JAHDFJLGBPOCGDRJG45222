import { accounts, accountSheet } from '../accounts.js';
import { googleButton, appleCredential, oauthCfg, oauthExtra } from '../oauth.js';
import { icon } from '../icons.js';
import {
  state, api, esc, toast, sheet, logout, avatar, refreshBadges, logoMenu, adoptToken, plusSheet,
} from '../core.js';

const PRIV = [
  ['private', 'lock', 'Gizli hesap', 'Gönderilerini ve hikayelerini sadece onayladığın takipçiler görür'],
  ['hideLastSeen', 'eye', 'Son görülmeyi gizle', 'Çevrimiçi durumun ve son görülmen kimseye görünmez'],
  ['hideRead', 'dcheck', 'Okundu bilgisini kapat', 'Mavi tik gönderilmez; sen de başkalarınınkini göremezsin'],
  ['hideFromDeck', 'flame', 'Kaydırmada beni gösterme', 'Keşfet destesinde yeni kişilere çıkmazsın'],
  ['hideAge', 'person', 'Yaşımı gizle', 'Yaşın profilinde ve kaydırma kartında görünmez; yaş filtreleri yine çalışır'],
  ['hideVisits', 'eye', 'Görünmeden gez (SwipeUp+)', 'Baktığın profillerin ziyaretçi listesinde görünmezsin', true],
  ['ghostRead', 'dcheck', 'Gizli okuma (SwipeUp+)', 'Mesajları okursun ama karşı tarafa mavi tik gitmez; sen onlarınkini görmeye devam edersin', true],
  ['hideCheckin', 'mapPin', 'Mekanımı arkadaşlarıma gösterme', 'Etiketlediğin mekan, karşılıklı takipleştiğin kişilere ve eşleşmelerine de görünmez'],
];
import { notifSettings, themeMenu } from './profile.js';
import { openFilters } from './swipe.js';
import { eventInfo, eventLive, eventEnabled, setEventEnabled, eventIcon, eventEmoji } from '../event.js';
import { LANGS, getLang, setLang } from '../i18n.js';

export default function settings(view) {
  const me = state.me;
  view.innerHTML = `<header class="topbar"><button class="ib" data-back="#/me" aria-label="Geri">${icon('back')}</button><div class="center">Ayarlar</div><span class="ib"></span></header>
    <div class="group-t">Profil</div>
    <div class="group">
      ${state.config?.features?.market ? `<a class="it" href="#/market">${icon('bag')}<span class="grow">SwipeUp Store<div class="sub">İkinci el al-sat, siparişlerin ve satış bakiyen</div></span></a>` : ''}
      <a class="it" href="#/fal">${icon('star')}<span class="grow">${me.role === 'falci' ? 'Fal kuyruğu' : 'Fal'}<div class="sub">${me.role === 'falci' ? 'Gelen fal isteklerini cevapla' : 'Falcı Teyze’ye kahve falı, tarot, burç, aşk uyumu'}</div></span></a>
      <a class="it" href="#/edit">${icon('edit')}<span class="grow">Profili düzenle<div class="sub">Fotoğraflar, sesli tanıtım, profil soruları</div></span></a>
      <a class="it" href="#/gorunum">${icon('crown')}<span class="grow">Çerçeve ve rozetler<div class="sub">Profil fotoğrafına çerçeve, sınırlı etkinlik rozetleri</div></span></a>
      <a class="it" href="#/seviye">${icon('star')}<span class="grow">Seviyen<div class="sub">${me.level ? `${me.level.em} Seviye ${me.level.n} · ${esc(me.level.title)}` : 'Paylaştıkça, sohbet ettikçe seviye atla'}</div></span></a>
      <a class="it" href="#/oyunlar">${icon('play')}<span class="grow">Oyunlar<div class="sub">Okey ve Çiz Bil; arkadaşlarınla ya da yeni kişilerle oyna</div></span></a>
      <a class="it" href="#/etkinlikler">${icon('users')}<span class="grow">Etkinlikler<div class="sub">Gerçek hayatta buluşmalar oluştur ya da katıl</div></span></a>
      <a class="it" href="#/haftanin-enleri">${icon('trophy')}<span class="grow">Haftanın en beğenilenleri<div class="sub">İlk 3 gönderi her pazartesi jeton kazanır</div></span></a>
      <a class="it" href="#/yakin">${icon('star')}<span class="grow">Yakın arkadaşlar<div class="sub">Hikayeni ve notunu sadece onlarla paylaş</div></span></a>
      <a class="it" href="#/arsiv">${icon('timer')}<span class="grow">Hikaye arşivi ve öne çıkanlar<div class="sub">Son 30 günün hikayeleri, profilinde öne çıkar</div></span></a>
      <a class="it" href="#/planli">${icon('send')}<span class="grow">Planlı gönderiler<div class="sub">İleri bir saate planladığın gönderiler</div></span></a>
      <a class="it" href="#/ziyaretciler">${icon('eye')}<span class="grow">Profilini kimler gördü<div class="sub">Son 7 günün ziyaretçileri</div></span></a>
      <a class="it" href="#/odalar">${icon('users')}<span class="grow">Etkinlik odaları ve hızlı tanışma<div class="sub">Konu odaları, 3 dakikalık görüntülü turlar</div></span></a>
      <a class="it" href="#/reklam">${icon('rocket')}<span class="grow">Öne çıkarmalarım<div class="sub">Gönderilerini jetonla daha çok kişiye göster</div></span></a>
      <a class="it" href="#/cark">${icon('wheel')}<span class="grow">Hediye çarkı<div class="sub">Her hafta bir çevirme hakkı, cuma yenilenir</div></span></a>
      <a class="it" href="#/yarismalar">${icon('trophy')}<span class="grow">Yarışmalar<div class="sub">En çok paylaşan, beğeni ya da yorum alan kazanır</div></span></a>
      <a class="it" href="#/mekan">${icon('mapPin')}<span class="grow">Mekandayım<div class="sub">Bulunduğun mekanı etiketle, aynı yerdekilerle eşleş</div></span></a>
      <a class="it" href="#/sarki">${icon('music')}<span class="grow">Şarkı yarışması<div class="sub">3 ayda bir; kazanan şarkı Spotify’da yayınlanır</div></span></a>
      <a class="it" href="#/gorevler">${icon('check')}<span class="grow">Günlük görevler<div class="sub">Görevleri tamamla, jeton kazan</div></span></a>
      <a class="it" href="#/davet">${icon('gift')}<span class="grow">Davet et, kazan<div class="sub">Arkadaşın katılınca ikiniz de jeton kazanın</div></span></a>
      <button class="it pref">${icon('sliders')}<span class="grow">Kaydırma tercihleri<div class="sub">Yaş aralığı, uzaklık, kimleri görmek istediğin</div></span></button>
    </div>
    <div class="group-t">Üyelik</div>
    <div class="group">
      <a class="it" href="#/store">${icon('crown')}<span class="grow">SwipeUp+ ve jeton<div class="sub">${me.plus ? 'SwipeUp+ üyesisin' : 'Sınırsız beğeni, seni beğenenler, geri al'} · ${me.coins || 0} jeton</div></span></a>
      <a class="it" href="#/wallet">${icon('gift')}<span class="grow">Kazançlarım<div class="sub">Canlı yayın hediyeleri ve ödeme talebi</div></span></a>
      <a class="it" href="#/verify">${icon('shield')}<span class="grow">Profil doğrulama<div class="sub">${me.verified ? 'Profilin doğrulandı ✓' : 'Selfie ile mavi tik al'}</div></span></a>
    </div>
    <div class="group-t">Gizlilik</div>
    <div class="group">
      ${PRIV.map(([k, ic, t, sub, plus]) => `<label class="it">${icon(ic)}<span class="grow">${t}${plus && !me.plus ? ` <span class="plus-chip">${icon('crown')}+</span>` : ''}<div class="sub">${sub}</div></span><input type="checkbox" class="sw" data-k="${k}" ${me.privacy?.[k] && (!plus || me.plus) ? 'checked' : ''}></label>`).join('')}
      <button class="it bl">${icon('block')}<span class="grow">Engellenenler</span></button>
    </div>
    <div class="group-t">Hesap</div>
    <div class="group">
      <button class="it acs">${icon('users')}<span class="grow">Hesaplar<div class="sub">${accounts().length > 1 ? `Bu cihazda ${accounts().length} hesap kayıtlı · geçiş yap ya da ekle` : 'Başka hesap ekle, şifresiz geçiş yap'}</div></span></button>
      <button class="it em">${icon('mail')}<span class="grow">E-posta<div class="sub">${esc(me.email || 'Eklenmedi — şifre sıfırlama için ekle')}</div></span></button>
      <button class="it pw">${icon('lock')}<span class="grow">${me.noPass ? 'Şifre belirle<div class="sub">Google / Apple yanında şifreyle de girebilmek için</div>' : 'Şifreyi değiştir'}</span></button>
      ${oauthCfg().google || oauthCfg().apple ? `<button class="it lgm">${icon('key')}<span class="grow">Giriş yöntemleri<div class="sub">${[!me.noPass && 'Şifre', me.logins?.google && 'Google', me.logins?.apple && 'Apple'].filter(Boolean).join(' · ') || '—'}</div></span></button>` : ''}
      <button class="it cns">${icon('check')}<span class="grow">İzinlerim (açık rıza)<div class="sub">Kampanya bildirimi ve e-postası, konum, fal yorum desteği</div></span></button>
      <button class="it rc">${icon('key')}<span class="grow">Yeni kurtarma kodu oluştur<div class="sub">Eski kod geçersiz olur</div></span></button>
      <button class="it lox">${icon('logout')}<span class="grow">Diğer cihazlardan çık<div class="sub">Bu telefon dışındaki bütün oturumların kapanır</div></span></button>
    </div>
    <div class="group-t">Uygulama</div>
    <div class="group">
      <a class="it" href="#/destek">${icon('question')}<span class="grow">Yardım ve destek<div class="sub">Sorun bildir, destek ekibine yaz</div></span></a>
      <a class="it" href="#/install">${icon('download')}<span class="grow">Telefona yükle<div class="sub">iPhone’da Ana Ekrana Ekle, Android’de Uygulamayı yükle</div></span></a>
      <button class="it nt">${icon('bell')}<span class="grow">Bildirimler</span></button>
      <button class="it th">${icon('sun')}<span class="grow">Tema<div class="sub">Gün batımı, Pembe rüya, Gece moru, Altın</div></span></button>
      <button class="it lng">${icon('globe')}<span class="grow">Dil / Language<div class="sub">${LANGS.find((l) => l[0] === getLang())?.[1] || 'Türkçe'}</div></span></button>
      <button class="it lgo">${icon('crown')}<span class="grow">Uygulama logosu<div class="sub">${me.plus ? 'Altın, neon, gökkuşağı ve daha fazlası' : 'SwipeUp+ üyelerine özel'}</div></span></button>
      ${eventLive() ? `<label class="it ev-it"><span class="ev-ic">${eventIcon()}</span><span class="grow">${esc(eventInfo().name)} teması<div class="sub">${esc(new Date(eventInfo().end - 1).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }))} gününe kadar. Sonra seçtiğin tema kendiliğinden geri gelir.</div></span><input type="checkbox" class="sw sw-ev" ${eventEnabled() ? 'checked' : ''}></label>` : ''}
    </div>
    <div class="group-t">Yasal ve verilerim</div>
    <div class="group">
      <a class="it" href="#/guvenlik">${icon('shield')}<span class="grow">Güvenlik merkezi<div class="sub">Buluşmayı paylaş, giriş geçmişi, güvenli tanışma ipuçları, acil numaralar</div></span></a>
      <a class="it" href="#/veri-taleplerim">${icon('shield')}<span class="grow">Veri taleplerim (KVKK başvurusu)<div class="sub">Bilgi, düzeltme, silme ve diğer haklar · en geç 30 gün içinde yanıt</div></span></a>
      <button class="it dl">${icon('download')}<span class="grow">Verilerimi indir<div class="sub">Profil, gönderi, mesaj ve diğer verilerin (JSON)</div></span></button>
      <a class="it" href="#/legal/kvkk">${icon('doc')}<span class="grow">KVKK aydınlatma metni</span></a>
      <a class="it" href="#/legal/gizlilik">${icon('doc')}<span class="grow">Gizlilik politikası</span></a>
      <a class="it" href="#/legal/kosullar">${icon('doc')}<span class="grow">Kullanım koşulları</span></a>
      <a class="it" href="#/legal/riza">${icon('doc')}<span class="grow">Açık rıza metni</span></a>
      <a class="it" href="#/legal/cerez">${icon('doc')}<span class="grow">Çerez ve yerel depolama</span></a>
      <a class="it" href="#/legal/saklama">${icon('doc')}<span class="grow">Saklama ve imha politikası<div class="sub">Hangi veriyi ne kadar saklıyoruz</div></span></a>
      <a class="it" href="#/legal/iade">${icon('doc')}<span class="grow">Satış belgeleri<div class="sub">Ön bilgilendirme, mesafeli satış sözleşmesi, cayma ve iade</div></span></a>
      <a class="it" href="#/legal/kurallar">${icon('users')}<span class="grow">Topluluk kuralları</span></a>
      <a class="it" href="#/legal/kunye">${icon('flag')}<span class="grow">Künye ve hak ihlali bildirimi<div class="sub">Satıcı bilgileri, ETBİS, telif ve kişilik hakkı bildirimi</div></span></a>
      <a class="it" href="#/legal/lisanslar">${icon('doc')}<span class="grow">Lisanslar ve atıflar</span></a>
    </div>
    <div class="group"><button class="it danger lo">${icon('logout')}${accounts().length > 1 ? `@${esc(me.username)} hesabından çık` : 'Çıkış yap'}</button>${accounts().length > 1 ? `<button class="it danger loa">${icon('logout')}Tüm hesaplardan çık</button>` : ''}${me.role === 'falci' ? '' : `<button class="it danger del">${icon('trash')}Hesabımı sil</button>`}</div>
    <p class="muted" style="text-align:center;font-size:12px;padding-bottom:20px">SwipeUp · @${esc(me.username)}</p>`;

  view.querySelector('.sw-ev')?.addEventListener('change', (e) => {
    setEventEnabled(e.target.checked);
    toast(e.target.checked ? `${eventInfo().name} teması açıldı ${eventEmoji()}` : 'Etkinlik teması kapatıldı. Seçtiğin tema geri geldi.');
  });
  view.querySelectorAll('.sw[data-k]').forEach((c) => {
    c.onchange = async () => {
      try {
        const u = await api('/me', { method: 'PATCH', body: { privacy: { [c.dataset.k]: c.checked } } });
        state.me.privacy = u.privacy;
        toast(c.checked ? 'Açıldı.' : 'Kapatıldı.');
      } catch (e) { c.checked = !c.checked; if (e.status === 402) plusSheet(e.message); else toast(e.message); }
    };
  });
  view.querySelector('.dl').onclick = async () => {
    try {
      const r = await fetch('/api/me/export', { headers: { Authorization: 'Bearer ' + state.token } });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'İndirilemedi.');
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `swipeup-${me.username}-veriler.json`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Verilerin indirildi.');
    } catch (e) { toast(e.message); }
  };
  view.querySelector('.del')?.addEventListener('click', () => sheet('Hesabını sil', `<form class="form"><p style="margin:0">Hesabın, gönderilerin, hikayelerin, eşleşmelerin ve mesajların <b>kalıcı olarak</b> silinir. Bu işlem geri alınamaz.</p>
      <p class="muted" style="margin:0;font-size:13px">İstersen önce “Verilerimi indir” ile bir kopyasını al. Kalan jetonların ve SwipeUp+ üyeliğin de silinir.</p>
      <textarea class="field" name="r" rows="2" maxlength="300" placeholder="Neden ayrılıyorsun? (isteğe bağlı)"></textarea>
      ${me.noPass ? `<input class="field" name="p" placeholder="Onaylamak için kullanıcı adını yaz: ${esc(me.username)}" autocapitalize="none">` : '<input class="field" name="p" type="password" placeholder="Onaylamak için şifren" autocomplete="current-password">'}
      <button class="btn hot block">Hesabımı kalıcı olarak sil</button></form>`, {
    onMount(sh, close) {
      const f = sh.querySelector('form');
      f.onsubmit = async (e) => {
        e.preventDefault();
        if (!confirm('Son kez soruyoruz: hesabın kalıcı olarak silinsin mi?')) return;
        try { await api('/me', { method: 'DELETE', body: { password: f.p.value, confirm: f.p.value, reason: f.r.value } }); close(); toast('Hesabın silindi. Hoşça kal 👋'); setTimeout(logout, 1200); } catch (er) { toast(er.message); }
      };
    },
  }));
  refreshBadges();
  view.querySelector('.pref').onclick = () => openFilters(() => toast('Tercihler kaydedildi.'));
  view.querySelector('.nt').onclick = notifSettings;
  view.querySelector('.th').onclick = themeMenu;
  view.querySelector('.lgo').onclick = logoMenu;
  view.querySelector('.lng').onclick = () => sheet('Dil / Language', `<div class="menu">${LANGS.map(([k, n, f]) => `<button data-l="${k}"><span style="font-size:22px">${f}</span><span class="grow">${n}</span>${getLang() === k ? icon('check') : ''}</button>`).join('')}</div>
    <p class="muted" style="margin:6px 16px 16px;font-size:12.5px" data-noi18n>Gönderiler, mesajlar ve kullanıcıların yazdıkları çevrilmez. · Posts, messages and user content are not translated.</p>`, {
    onMount(sh) { sh.querySelector('.menu').onclick = (e) => { const b = e.target.closest('[data-l]'); if (b && b.dataset.l !== getLang()) setLang(b.dataset.l); }; },
  });
  view.querySelector('.lo').onclick = () => {
    const other = accounts().find((a) => a.id !== me.id);
    if (confirm(other ? `@${me.username} hesabından çıkılsın mı? @${other.username} hesabına geçilecek.` : 'Çıkış yapılsın mı?')) logout();
  };
  view.querySelector('.loa')?.addEventListener('click', () => { if (confirm('Bu cihazdaki tüm hesaplardan çıkılsın mı?')) logout(true); });
  view.querySelector('.acs').onclick = accountSheet;
  view.querySelector('.em').onclick = () => sheet('E-posta', `<form class="form"><p class="muted" style="margin:0">Şifreni unutursan sıfırlama kodu bu adrese gönderilir. Başkalarına gösterilmez.</p>
      <input class="field" name="e" type="email" value="${esc(me.email || '')}" placeholder="ornek@mail.com"><button class="btn primary block">Kaydet</button></form>`, {
    onMount(sh, close) {
      const f = sh.querySelector('form');
      f.onsubmit = async (e) => { e.preventDefault(); try { Object.assign(state.me, await api('/me', { method: 'PATCH', body: { email: f.e.value } })); close(); toast('E-posta kaydedildi.'); settings(view); } catch (er) { toast(er.message); } };
    },
  });
  view.querySelector('.pw').onclick = () => sheet(me.noPass ? 'Şifre belirle' : 'Şifreyi değiştir', `<form class="form">${me.noPass ? '<input type="hidden" name="c" value="">' : '<input class="field" name="c" type="password" placeholder="Mevcut şifre" autocomplete="current-password">'}
      <input class="field" name="n" type="password" placeholder="Yeni şifre (en az 6 karakter)" autocomplete="new-password"><button class="btn primary block">Değiştir</button></form>`, {
    onMount(sh, close) {
      const f = sh.querySelector('form');
      f.onsubmit = async (e) => { e.preventDefault(); try { const r = await api('/me/password', { body: { current: f.c.value, password: f.n.value } }); adoptToken(r.token); state.me.noPass = false; close(); toast('Şifren değişti. Diğer cihazlardaki oturumların kapandı.'); } catch (er) { toast(er.message); } };
    },
  });
  // İzinlerim: izinler hesap başına bir kez (kayıtta / ilk açılışta) verilir; burada yalnız verilmiş izin geri alınır (KVKK gereği)
  view.querySelector('.cns').onclick = async () => {
    const r = await api('/me/consents').catch((er) => { toast(er.message); return null; }); if (!r) return;
    const row = (c) => `<div class="it" data-k="${esc(c.kind)}"><span class="grow">${esc(c.text)}<div class="sub">${c.on ? `Açık rıza verildi · ${new Date(c.at).toLocaleDateString('tr-TR')}` : 'Verilmedi'}</div></span>${c.on ? '<button type="button" class="btn sm outline wd">Geri al</button>' : ''}</div>`;
    sheet('İzinlerim', `<div class="cns-list">${r.items.map(row).join('')}</div>
      <p class="muted" style="margin:10px 16px 16px;font-size:13px">İzinler hesap başına bir kez, ilk girişte belirlenir; sonradan yeni izin verilmez. Verdiğin bir izni istediğin an geri alabilirsin (geri alınca o izin bir daha verilemez). Konum iznini geri alırsan kayıtlı konumun silinir. Ayrıntılar <a class="link" href="#/legal/riza">açık rıza metni</a>nde.</p>`, {
      onMount(sh) {
        sh.querySelectorAll('.wd').forEach((b) => { b.onclick = async () => {
          const it = b.closest('.it'); const k = it.dataset.k;
          if (!confirm('Bu izni geri almak istiyor musun? Geri alınan izin sonradan yeniden verilemez.')) return;
          try { const u = await api('/me/consents', { method: 'PUT', body: { [k]: false } }); Object.assign(state.me, u); it.querySelector('.sub').textContent = 'Geri alındı'; b.remove(); toast('İzin geri alındı.'); } catch (er) { toast(er.message); }
        }; });
      },
    });
  };
  // Giriş yöntemleri: Google / Apple bağla, kaldır
  view.querySelector('.lgm')?.addEventListener('click', async () => {
    const r = await api('/me/logins').catch((er) => { toast(er.message); return null; }); if (!r) return;
    sheet('Giriş yöntemleri', `<div class="form" style="gap:12px">
      <div class="lg-row"><b>Şifre</b><span>${r.password ? 'Açık' : 'Yok · Ayarlar → Şifre belirle'}</span></div>
      ${r.oauth?.google ? `<div class="lg-row"><b>Google</b>${r.google ? '<button type="button" class="btn sm ug">Bağlantıyı kaldır</button>' : '<div class="g-link"></div>'}</div>` : ''}
      ${r.oauth?.apple ? `<div class="lg-row"><b>Apple</b>${r.apple ? '<button type="button" class="btn sm ua">Bağlantıyı kaldır</button>' : '<button type="button" class="btn sm la">Apple hesabını bağla</button>'}</div>` : ''}
      <p class="muted" style="margin:0;font-size:13px">Bağladığın Google / Apple hesabıyla şifresiz girersin. Hesabına girebileceğin en az bir yol açık kalmalı.</p></div>`, {
      onMount(sh, close) {
        const done = async (msg) => { Object.assign(state.me, await api('/me')); close(); toast(msg); settings(view); };
        const link = async (provider, credential) => { try { await api('/me/logins', { body: { provider, credential, ...oauthExtra(provider, credential) } }); done(`${provider === 'google' ? 'Google' : 'Apple'} hesabın bağlandı.`); } catch (er) { toast(er.message); } };
        const gl = sh.querySelector('.g-link'); if (gl) googleButton(gl, (c) => link('google', c), 'continue_with', 'link').catch((er) => toast(er.message));
        sh.querySelector('.la')?.addEventListener('click', async () => { try { const c = await appleCredential(); if (c) link('apple', c); } catch (er) { toast(er.message || 'Apple bağlanamadı.'); } });
        const unlink = async (p) => { if (!confirm('Bağlantı kaldırılsın mı?')) return; try { await api(`/me/logins/${p}`, { method: 'DELETE' }); done('Bağlantı kaldırıldı.'); } catch (er) { toast(er.message); } };
        sh.querySelector('.ug')?.addEventListener('click', () => unlink('google'));
        sh.querySelector('.ua')?.addEventListener('click', () => unlink('apple'));
      },
    });
  });
  view.querySelector('.lox').onclick = async () => {
    if (!confirm('Bu cihaz dışındaki bütün oturumların kapatılsın mı? Diğer telefon ve tarayıcılarda yeniden giriş yapman gerekir.')) return;
    try { const r = await api('/me/logout-others', { body: {} }); adoptToken(r.token); toast('Diğer cihazlardaki oturumların kapatıldı.'); } catch (er) { toast(er.message); }
  };
  view.querySelector('.rc').onclick = async () => {
    if (!confirm('Yeni kurtarma kodu oluşturulsun mu? Eski kod çalışmayacak.')) return;
    const r = await api('/me/recovery', { body: {} });
    sheet('Kurtarma kodun', `<div style="padding:0 16px 16px;display:grid;gap:12px"><p class="muted" style="margin:0">Şifreni unutursan bu kodla girebilirsin. Güvenli bir yere not et.</p><div class="code-box">${esc(r.recoveryCode)}</div><button class="btn outline block cp">${icon('copy')} Kopyala</button></div>`, {
      onMount(sh) { sh.querySelector('.cp').onclick = async () => { await navigator.clipboard?.writeText(r.recoveryCode); toast('Kopyalandı.'); }; },
    });
  };
  view.querySelector('.bl').onclick = () => sheet('Engellenenler', '<div class="bll"><div class="spinner"></div></div>', {
    async onMount(sh) {
      const box = sh.querySelector('.bll');
      const paint = async () => {
        const us = await api('/blocks');
        box.innerHTML = us.length ? us.map((u) => `<div class="list-item">${avatar(u, 44, { dot: false })}<div class="grow"><div class="b">${esc(u.name)}</div><div class="sub">@${esc(u.username)}</div></div><button class="btn sm outline ub" data-id="${esc(u.id)}">Engeli kaldır</button></div>`).join('') : '<div class="empty">Engellediğin kimse yok.</div>';
      };
      await paint();
      box.onclick = async (e) => { const b = e.target.closest('.ub'); if (!b) return; await api(`/users/${b.dataset.id}/block`, { method: 'DELETE' }); toast('Engel kaldırıldı.'); paint(); };
    },
  });
  return null;
}
