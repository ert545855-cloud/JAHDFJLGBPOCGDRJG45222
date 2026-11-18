import { icon } from '../icons.js';
import { esc, state, sheet, api, toast } from '../core.js';

// Belgelerin sürüm tarihi sunucudan gelir (/api/config → legalVer); kullanıcıya gün ay yıl olarak gösterilir
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const verOf = (doc) => state.config?.legalVer?.[doc] || '2026-11-17';
const trDay = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return `${d} ${AYLAR[m - 1]} ${y}`; };

// Yönetim panelinden girilen satıcı / veri sorumlusu bilgileri (/api/config → legal)
function seller() { return state.config?.legal || {}; }
function contact() {
  const l = seller();
  const who = l.company ? esc(l.company) : 'SwipeUp';
  const mail = l.email ? `<a class="link" href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : 'uygulama içindeki destek formu';
  const addr = l.address ? `, adres: ${esc(l.address)}` : '';
  return { who, mail, addr };
}
// Künye tablosu: yalnızca girilmiş alanlar gösterilir
export function sellerTable() {
  const l = seller();
  const rows = [['Satıcı / hizmet sağlayıcı', l.company], ['İşletme adı / marka', l.brand || 'SwipeUp'], ['MERSİS no', l.mersis], ['Vergi dairesi / vergi kimlik no', l.vkn ? `${l.taxOffice ? `${l.taxOffice} / ` : ''}${l.vkn}` : ''], ['Ticaret sicil no', l.sicil], ['Adres', l.address], ['Telefon', l.phone], ['E-posta', l.email], ['KEP adresi', l.kep]].filter(([, v]) => v);
  return `<div class="legal-tbl"><table><tbody>${rows.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('')}</tbody></table></div>`;
}

// Hizmet sağlayıcılar: ne için, hangi veri, nerede
const PROV = [
  ['Render (Render Services, Inc.)', 'Uygulama sunucusu', 'Uygulamaya gelen tüm istekler', 'Almanya (Frankfurt)'],
  ['Supabase (AWS)', 'Veritabanı ve dosya saklama', 'Hesap, profil, paylaşım, mesaj ve dosyalar', 'Almanya (Frankfurt)'],
  ['Cloudflare', 'Güvenli bağlantı ve saldırı koruması', 'IP adresi, istek bilgileri', 'Küresel'],
  ['Sightengine', 'Fotoğraf denetimi (çıplaklık, şiddet); yüz tanıma yapılmaz', 'Yüklenen fotoğraflar', 'Fransa (AB)'],
  ['Google (Gemini API)', 'Fal yorum taslağı (yalnızca açık rızayla)', 'Fal notu, fincan fotoğrafları, burç / kart bilgisi', 'ABD ve diğer'],
  ['Google, Apple', 'Google / Apple ile giriş (seçersen)', 'Kimlik numarası, e-posta, ad', 'ABD'],
  ['Google, Apple, Mozilla', 'Anlık bildirim iletimi (şifreli)', 'Bildirim içeriği, cihaz bildirim adresi', 'ABD ve diğer'],
  ['Metered (Open Relay)', 'Sesli / görüntülü arama aktarma', 'Şifreli arama trafiği, IP adresi', 'Küresel'],
  ['Spotify, Apple (iTunes arama)', 'Müzik arama ve önizleme', 'Arama kelimesi', 'İsveç, ABD'],
  ['GIPHY', 'GIF arama', 'Arama kelimesi', 'ABD'],
  ['OpenStreetMap, Overpass', 'Harita ve yakındaki mekanlar', 'Yaklaşık konum (yalnızca bu özellikleri kullanırsan)', 'Almanya ve AB'],
];
const PROVIDERS = `<div class="legal-tbl"><table><thead><tr><th>Sağlayıcı</th><th>Ne için</th><th>Hangi veri</th><th>Nerede</th></tr></thead><tbody>${PROV.map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

// Cihazda saklanan kayıtlar (çerez yerine çoğunlukla tarayıcının yerel deposu)
const STORE_ROWS = [
  ['Kesinlikle gerekli', 'su_token, su_accounts', 'Oturumunu açık tutmak; bu cihazda kayıtlı hesaplar arasında geçiş', 'Çıkış yapınca silinir'],
  ['Kesinlikle gerekli', 'su_dev', 'Rastgele cihaz kimliği: sahte hesap, spam ve dolandırıcılığı önlemek (analiz ya da reklam için kullanılmaz)', 'Sen silene kadar'],
  ['Kesinlikle gerekli', 'su_push_off:…, su_push_dismiss', 'Bildirim izni tercihini hatırlamak', 'Sen silene kadar'],
  ['Kesinlikle gerekli', 'su_ref, su_add, su_gp, su_updated', 'Davet kodunu kayıt bitene kadar taşımak, kısa süreli ekran durumları', 'Oturum boyunca ya da kayıt bitince'],
  ['Kesinlikle gerekli', 'Hizmet çalışanı önbelleği', 'Uygulamanın hızlı ve çevrimdışı açılması (kişisel veri içermez)', 'Yeni sürümle yenilenir'],
  ['İşlev (senin seçimin)', 'su_lang, su_theme, su_skin, su_logo (çerez), su_saved, su_stk_recent', 'Dil, tema, uygulama logosu, son kullandığın çıkartmalar', 'Sen değiştirene kadar'],
  ['İşlev (senin seçimin)', 'k3snd, k3theme, sf_* ', 'Oyun ses ve görüntü ayarları', 'Sen değiştirene kadar'],
  ['İşlev (senin seçimin)', 'su_ann_seen, su_install_seen, su_genel_seen, su_event_card:…, su_maint_hide', 'Bir duyuruyu ya da tanıtımı tekrar göstermemek', 'Sen silene kadar'],
  ['İşlev (senin seçimin)', 'su_mk_addr, su_mk_info', 'SwipeUp Store’da yazdığın teslimat adresini bir sonraki siparişte doldurmak', 'Sen silene kadar'],
];

const T = (doc, title) => ({ title, doc });
export const DOCS = {
  kunye: {
    ...T('kunye', 'Künye ve iletişim'),
    body: () => {
      const l = seller();
      return `
<p>SwipeUp’ı sunan işletmenin bilgileri (6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun m.3 ve 5651 sayılı Kanun m.3 uyarınca):</p>
${sellerTable()}
${l.etbis ? `<p>✅ ${/^https:/.test(l.etbis) ? `<a class="link" href="${esc(l.etbis)}" target="_blank" rel="noopener">Elektronik Ticaret Bilgi Sistemi’ne (ETBİS) kayıtlıdır</a>` : `Elektronik Ticaret Bilgi Sistemi’ne (ETBİS) kayıtlıdır: ${esc(l.etbis)}`}</p>` : ''}
<h3>Yer sağlayıcı ve barındırma</h3>
<p>SwipeUp, üyelerin paylaştığı içerikler bakımından 5651 sayılı Kanun kapsamında yer sağlayıcıdır. Uygulama sunucusu Render (Almanya), veritabanı Supabase / AWS (Almanya) üzerinde barındırılır.</p>
<h3>Hukuka aykırı içerik, telif ve kişilik hakkı bildirimi</h3>
<p>Haklarını ihlal ettiğini düşündüğün bir içerik varsa (izinsiz kullanılan fotoğrafın, telif hakkın olan bir eser, kişilik hakkını zedeleyen bir paylaşım) aşağıdaki formla bildirebilirsin. Bildirimler incelenir; hukuka aykırı bulunan içerik kaldırılır ve sonuç e-postayla bildirilir. Bir üyeyi uygulama içinden <b>Şikayet et</b> ile de bildirebilirsin.</p>
<p><button class="btn td-open">Hak ihlali bildir</button></p>
<h3>Diğer belgeler</h3>
<p>Kişisel veriler için <a class="link" href="#/legal/kvkk">KVKK Aydınlatma Metni</a>, satın almalar için <a class="link" href="#/legal/onbilgi">Ön Bilgilendirme Formu</a>, <a class="link" href="#/legal/mesafeli">Mesafeli Satış Sözleşmesi</a> ve <a class="link" href="#/legal/iade">Cayma ve İade Politikası</a>.</p>`;
    },
  },
  kvkk: {
    ...T('kvkk', 'KVKK aydınlatma metni'),
    body: () => {
      const c = contact(); const l = seller();
      return `
<p>6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) m.10 ve Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ uyarınca, veri sorumlusu sıfatıyla seni bilgilendiriyoruz.</p>
<h3>Veri sorumlusu</h3>
${sellerTable()}
<h3>Hangi verileri, hangi amaçla ve hangi hukuki sebeple işliyoruz</h3>
<div class="legal-tbl"><table><thead><tr><th>Veri</th><th>Amaç</th><th>Hukuki sebep</th></tr></thead><tbody>
<tr><td>Kimlik ve iletişim: ad, kullanıcı adı, doğum tarihi, e-posta, Google / Apple giriş kimliği</td><td>Üyeliğin kurulması ve yürütülmesi, giriş, şifre sıfırlama</td><td>Sözleşmenin kurulması ve ifası (m.5/2-c)</td></tr>
<tr><td>Doğum tarihi</td><td>18 yaş sınırının uygulanması (profilde yalnızca yaşın görünür, istersen gizleyebilirsin)</td><td>Hukuki yükümlülük (m.5/2-ç), meşru menfaat (m.5/2-f)</td></tr>
<tr><td>Profil: fotoğraflar, biyografi, şehir, cinsiyet, ilgi alanları, profil soruları, sevdiğin sanatçılar</td><td>Eşleşme, keşfet ve sosyal özelliklerin sunulması</td><td>Sözleşmenin ifası (m.5/2-c)</td></tr>
<tr><td>Kimi aradığın (eşleşme tercihi; cinsel hayata ilişkin özel nitelikli veri sayılabilir)</td><td>Keşfet destesinin süzülmesi; diğer üyelere gösterilmez</td><td>Açık rıza (m.6/2); rıza verilmezse tercih işlenmez ve herkes gösterilir</td></tr>
<tr><td>Konum (yaklaşık 1 km’ye yuvarlanmış)</td><td>Yakındaki kişileri ve uzaklığı göstermek; diğer üyeler yalnızca kilometre görür</td><td>Açık rıza (m.5/1)</td></tr>
<tr><td>Mesajlar, sesli mesajlar, gönderiler, hikayeler, yorumlar, canlı yayın ve arama</td><td>İletişim ve paylaşım hizmetinin sunulması</td><td>Sözleşmenin ifası (m.5/2-c)</td></tr>
<tr><td>Şikayet edilen ya da otomatik işaretlenen içerikler, moderasyon kayıtları</td><td>Hukuka aykırı içerikle mücadele, topluluk güvenliği, itiraz süreçleri</td><td>Hukuki yükümlülük (m.5/2-ç, 5651 s. Kanun), hakkın tesisi ve korunması (m.5/2-e), meşru menfaat (m.5/2-f)</td></tr>
<tr><td>Doğrulama selfiesi</td><td>Mavi tik: fotoğrafın sana ait olduğunun yönetim ekibince gözle kontrol edilmesi (yüz tanıma ya da biyometrik şablon çıkarılmaz)</td><td>Sözleşmenin ifası (m.5/2-c)</td></tr>
<tr><td>Sipariş ve ödeme: sipariş kodu, tutar, havale/EFT gönderen adı, iade için verdiğin IBAN, jeton hareketleri</td><td>Satın alınan ürünün tanımlanması, iade, muhasebe ve vergi kayıtları</td><td>Sözleşmenin ifası (m.5/2-c), hukuki yükümlülük (m.5/2-ç)</td></tr>
<tr><td>İşlem güvenliği: IP adresi, oturum ve giriş kayıtları, rastgele cihaz kimliği</td><td>Hesap güvenliği, sahte hesap ve dolandırıcılığın önlenmesi, 5651 s. Kanun kayıt yükümlülükleri</td><td>Hukuki yükümlülük (m.5/2-ç), meşru menfaat (m.5/2-f)</td></tr>
<tr><td>Fal isteğindeki fotoğraf ve notlar</td><td>Yapay zekayla yorum taslağı hazırlanması</td><td>Açık rıza (m.5/1)</td></tr>
<tr><td>E-posta ve bildirim aboneliği</td><td>Kampanya ve yenilik iletileri</td><td>Açık rıza (m.5/1) ve ticari ileti onayı (6563 s. Kanun)</td></tr>
<tr><td>Uygulama içi hareketler: işlem türü, zamanı, karşı taraf, IP ve cihaz kimliği (mesaj ve gönderi metinleri hariç)</td><td>Hesap güvenliği, destek ve şikayetlerin incelenmesi, sahte hesap ve dolandırıcılığın önlenmesi</td><td>Meşru menfaat (m.5/2-f), hakkın tesisi ve korunması (m.5/2-e); 1 yıl saklanır</td></tr>
<tr><td>Buluşma paylaşımı: yer, saat, kiminle buluştuğun, durumun</td><td>Senin isteğinle güvendiğin kişiye gösterilmesi (Güvenlik merkezi)</td><td>Sözleşmenin ifası (m.5/2-c); buluşmadan 7 gün sonra silinir</td></tr>
<tr><td>Açık rıza ve onay kayıtları</td><td>Verdiğin izinleri ve kabul ettiğin belge sürümlerini ispat etmek</td><td>Hukuki yükümlülük (m.5/2-ç), hakkın tesisi (m.5/2-e)</td></tr>
</tbody></table></div>
<h3>Özel nitelikli kişisel veriler</h3>
<p>Senden sağlık, din, biyometrik veri gibi özel nitelikli kişisel veri istemiyoruz; profilde bunlar için bir alan yoktur. Tek istisna, kaydırmada hangi cinsiyetten kişileri görmek istediğine dair isteğe bağlı tercihindir: bu bilgi cinsel hayata ilişkin veri sayılabildiğinden yalnızca <b>ayrı açık rızanla</b> (KVKK m.6) ve yalnızca eşleşme önerileri için işlenir, kimseye gösterilmez; rızanı geri alınca silinir. Biyografine, mesajlarına ya da paylaşımlarına bu tür bilgileri yazmamanı öneririz. Kendi isteğinle paylaşırsan, bu bilgiler yalnızca senin seçtiğin kişilere gösterilmek üzere hizmetin bir parçası olarak saklanır; başka bir amaçla işlenmez ve analiz edilmez.</p>
<h3>Toplama yöntemi</h3>
<p>Veriler, uygulamayı kullanırken senin girdiğin bilgiler, cihazından izin verdiğin ölçüde alınan bilgiler (konum, kamera, mikrofon) ve kullanım sırasında otomatik oluşan kayıtlar yoluyla elektronik ortamda toplanır.</p>
<h3>Aktarım</h3>
<p>Verilerin, hizmeti sunmak için yararlandığımız barındırma, veritabanı, güvenlik, fotoğraf denetimi, bildirim, arama aktarma, giriş ve yapay zeka sağlayıcılarına yalnızca ilgili hizmetin gerektirdiği kadar aktarılır. Bu sağlayıcıların sunucuları yurt dışında (Almanya, Fransa, ABD ve diğer ülkeler) olduğundan aktarım KVKK m.9 kapsamında <b>yurt dışına aktarımdır</b> ve Kişisel Verileri Koruma Kurulu’nun ilan ettiği standart sözleşmeler gibi uygun güvencelere dayanılarak yapılır. Sağlayıcıların listesi <a class="link" href="#/legal/gizlilik">Gizlilik Politikası</a>’ndadır. Kanunen yetkili kamu kurum ve kuruluşlarına, yalnızca talep hâlinde ve mevzuatın izin verdiği ölçüde bilgi verilir. Verilerini satmayız, reklam amacıyla üçüncü kişilere vermeyiz.</p>
<h3>Otomatik işlemler</h3>
<p>Yüklenen fotoğraflar çıplaklık ve şiddet açısından otomatik taranır; mesajlardaki ağır hakaret ve tehditler otomatik işaretlenir. Otomatik işaretler yönetim ekibince incelenir; aleyhine bir karar verilirse uygulamadaki itiraz formuyla itiraz edebilirsin.</p>
<h3>Hakların (KVKK m.11)</h3>
<p>Verilerinin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, işleme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, aktarıldığı yurt içi / yurt dışı üçüncü kişileri bilme, eksik ya da yanlış işlenmişse düzeltilmesini, m.7’deki şartlar çerçevesinde silinmesini ya da yok edilmesini isteme, bu işlemlerin aktarıldığı üçüncü kişilere bildirilmesini isteme, münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhine bir sonuç çıkmasına itiraz etme ve kanuna aykırı işleme nedeniyle zarara uğrarsan zararın giderilmesini talep etme haklarına sahipsin.</p>
<h3>Nasıl başvurursun</h3>
<ul>
<li>Uygulamada <b>Ayarlar › Veri taleplerim</b> ekranından (kimliğin hesabınla doğrulanır, başvurun takip numarası alır),</li>
<li>sistemimizde kayıtlı e-posta adresinden ${c.mail} adresine${l.kep ? `, KEP ile ${esc(l.kep)} adresine` : ''}${l.address ? `, ya da yazılı olarak ${esc(l.address)} adresine` : ''}.</li>
</ul>
<p>Verilerinin kopyasını Ayarlar › Verilerimi indir ile hemen alabilir, hesabını Ayarlar › Hesabımı sil ile silebilirsin. Başvurun en geç <b>30 gün</b> içinde ücretsiz sonuçlandırılır; yanıtı yeterli bulmazsan ya da süresinde yanıt alamazsan Kişisel Verileri Koruma Kurulu’na şikayette bulunabilirsin.</p>
<p class="muted">Bu metin bilgilendirme amaçlıdır; okuman için onay vermen gerekmez.</p>`;
    },
  },
  gizlilik: {
    ...T('gizlilik', 'Gizlilik politikası'),
    body: () => {
      const c = contact();
      return `
<p>Bu politika, ${c.who} (“SwipeUp”, “biz”) olarak SwipeUp uygulamasını kullanırken hangi kişisel verilerini neden ve nasıl işlediğimizi, ne kadar sakladığımızı ve nasıl koruduğumuzu anlatır. Hukuki sebepler ve hakların için <a class="link" href="#/legal/kvkk">KVKK Aydınlatma Metni</a>’ne bakabilirsin.</p>
<h3>Topladığımız veriler</h3>
<ul>
<li><b>Hesap bilgileri:</b> kullanıcı adı, ad, doğum tarihi, (isteğe bağlı) e-posta, şifrenin geri döndürülemez özeti; Google / Apple ile girersen bu hesabın kimlik numarası ve e-posta adresi.</li>
<li><b>Profil bilgileri:</b> fotoğraflar, biyografi, yaş, şehir, cinsiyet, ilgi alanları, burç, sevdiğin sanatçılar. Kimi aradığın bilgisi özel nitelikli veri sayılabildiği için yalnızca ayrı açık rızanla, desteni süzmek için kullanılır ve kimseye gösterilmez.</li>
<li><b>Paylaştıkların:</b> gönderiler, vitrin videoları, hikayeler, yorumlar, beğeniler, mesajlar, sesli mesajlar, fal istekleri.</li>
<li><b>Konum:</b> yalnızca açık rıza verirsen, yaklaşık 1 km hassasiyetle yuvarlanmış olarak; konum geçmişi tutulmaz, rızanı geri alınca silinir. Sohbette kendi isteğinle paylaştığın konum o mesajda saklanır.</li>
<li><b>Doğrulama selfiesi:</b> mavi tik için gönderdiğin fotoğraf; yalnızca yönetim ekibi gözle inceler, yüz tanıma yapılmaz.</li>
<li><b>Ödeme kayıtları:</b> sipariş kodu, tutar, havale/EFT gönderen adı, onayladığın sözleşme metni, iade için verdiğin IBAN. Kart bilgisi toplamayız.</li>
<li><b>Teknik veriler:</b> IP adresi ve tarayıcıda oluşturulan rastgele bir cihaz kimliği (spam ve sahte hesapları önlemek için), bildirim aboneliği, son görülme zamanı, uygulamayı hangi gün kullandığın (istatistik için).</li>
<li><b>Giriş ve trafik kayıtları:</b> girişlerin, içerik oluşturan işlemlerin ve canlı bağlantıların IP adresi, zamanı, cihaz ve tarayıcı bilgisi. 5651 sayılı Kanun gereği 2 yıl saklanır; içeriğin kendisi bu kayıtlara girmez. Tanımadığımız bir cihazdan giriş yapılırsa seni uyarmak için de kullanılır.</li>
<li><b>Uygulama içi hareketler:</b> hangi işlemi ne zaman yaptığın (ör. giriş, kaydırma, mesaj gönderme, paylaşım, oyun, satın alma), karşı taraf ve IP adresi. Mesaj, yorum ve gönderi metinleri bu kayda girmez. Hesap güvenliği, destek talepleri ve kötüye kullanımın önlenmesi için 1 yıl saklanır; Güvenlik merkezinde kendi hareketlerini görebilirsin.</li>
<li><b>Buluşma paylaşımı:</b> Güvenlik merkezinden bir buluşmayı paylaşırsan yer, saat, (seçersen) kiminle buluştuğun ve durumun, bağlantıyı verdiğin kişiye gösterilir; buluşmadan 7 gün sonra silinir.</li>
</ul>
<h3>Neden işliyoruz</h3>
<ul>
<li>Hesabını oluşturmak ve uygulamanın temel özelliklerini (eşleşme, mesajlaşma, akış, canlı yayın, arama, oyunlar) sunmak.</li>
<li>18 yaş sınırını uygulamak, sahte hesapları ve dolandırıcılığı önlemek.</li>
<li>Topluluk güvenliği: şikayetleri incelemek, hakaret ve tehdit içeren mesajları otomatik olarak işaretleyip yönetim ekibine iletmek.</li>
<li>Satın aldığın jeton ve üyelikleri tanımlamak, iadeleri yapmak, yasal muhasebe yükümlülüklerini yerine getirmek.</li>
<li>Sana hizmetle ilgili bildirim göndermek (kapatabilirsin); kampanya ve tanıtım iletilerini yalnızca izin verirsen göndeririz.</li>
</ul>
<h3>Kimler görebilir</h3>
<p>Profilin ve herkese açık paylaşımların diğer üyelere görünür. Gizli hesap açarsan gönderi ve hikayelerini sadece onayladığın takipçiler görür. Mesajların yalnızca sohbetteki kişilere iletilir; sohbette gönderdiğin fotoğraf, video ve sesli mesajlar süreli, imzalı bağlantılarla yalnızca sohbetteki kişilere açılır; yönetim ekibi yalnızca bir şikayet ya da otomatik moderasyon kaydı olduğunda ilgili mesajı görebilir. Verilerini satmayız ve reklam amacıyla üçüncü kişilerle paylaşmayız.</p>
<h3>Hizmet sağlayıcılar ve yurt dışına aktarım</h3>
<p>Uygulamayı sunabilmek için aşağıdaki hizmet sağlayıcılardan yararlanıyoruz. Verilerin yalnızca ilgili hizmetin gerektirdiği kadarıyla bu sağlayıcılara iletilir. Sunucuları Türkiye dışında olduğundan bu iletim <b>yurt dışına aktarım</b> sayılır ve KVKK m.9’a uygun güvencelerle (Kurul’un standart sözleşmeleri) yapılır.</p>
${PROVIDERS}
<p>Yazı tipleri ve varsayılan profil çizimleri kendi sunucumuzdan yüklenir. Telefonundaki tarayıcı yalnızca harita karolarını, GIF’leri ve müzik önizlemelerini doğrudan ilgili sağlayıcıdan yükler; bu sırada IP adresin o sağlayıcıya ulaşır.</p>
<h3>Saklama süreleri</h3>
<ul>
<li><b>Hesap ve profil bilgileri, paylaşımlar, mesajlar:</b> hesabın açık olduğu sürece. Hesabını sildiğinde profilin, paylaşımların, eşleşmelerin, mesajların ve yüklediğin dosyalar silinir; yedeklerden en geç 30 gün içinde düşer.</li>
<li><b>Hikayeler:</b> 24 saat (arşive aldıkların 30 gün). <b>Kaybolan mesajlar:</b> seçtiğin süre.</li>
<li><b>Ödeme, sözleşme ve jeton kayıtları:</b> vergi ve ticaret mevzuatı gereği 10 yıl (hesabın silinse de bu kayıtlar erişimi kısıtlı arşivde tutulur).</li>
<li><b>Şikayet, moderasyon ve destek kayıtları:</b> kapanıştan sonra 2 yıl. <b>KVKK başvuruları ve hak ihlali bildirimleri:</b> 3 yıl. <b>İade kayıtları:</b> mali kayıt olarak 10 yıl.</li>
<li><b>Doğrulama selfiesi:</b> karardan 30 gün sonra silinir; yalnızca sonucu (doğrulandı / doğrulanmadı) kalır.</li>
<li><b>5651 trafik kayıtları (IP, giriş ve işlem zamanları):</b> 2 yıl. <b>Giriş ve cihaz geçmişi:</b> 1 yıl.</li>
<li><b>Uzun süre kullanılmayan hesaplar:</b> 24 ay hiç giriş yapılmazsa, 30 gün önceden haber verilerek silinir.</li>
<li><b>Açık rıza ve belge onay kayıtları:</b> hesabın açıkken; hesap silinince 3 yıl (İYS onay ispatı).</li>
</ul>
<p>Süresi dolan veriler kendiliğinden, günde iki kez çalışan periyodik imhayla silinir ya da anonim hâle getirilir; ayrıntılar <a class="link" href="#/legal/saklama">Saklama ve İmha Politikası</a>’nda.</p>
<h3>Verilerini nasıl koruyoruz</h3>
<ul>
<li>Tüm bağlantılar HTTPS (TLS) ile şifrelenir; tarayıcıya yalnızca güvenli bağlantı kullanması söylenir (HSTS).</li>
<li>Şifreler geri döndürülemez biçimde saklanır; sohbet dosyaları süreli, imzalı bağlantılarla açılır.</li>
<li>Sayfaya dışarıdan betik yüklenmesini engelleyen sıkı içerik güvenlik politikası, hız sınırlama ve kötüye kullanım koruması uygulanır.</li>
<li>Yönetim paneline erişim yetkiyle sınırlıdır, iki adımlı doğrulama kullanılabilir ve yapılan işlemler kayıt altına alınır.</li>
<li>Bir veri ihlali olursa Kişisel Verileri Koruma Kurulu’na ve etkilenen kişilere mevzuatın öngördüğü sürede (Kurul’a 72 saat içinde) bildirim yapılır.</li>
<li>Toplu veri dışa aktarma gibi hassas yönetim işlemleri kayda geçer ve sahip yöneticiye ayrıca bildirilir. Hesabına tanımadığımız bir cihazdan girilirse sana haber verilir; “Bu ben değilim” ile tüm oturumları kapatabilirsin.</li>
</ul>
<h3>Çerezler ve yerel depolama</h3>
<p>Reklam ya da analiz çerezi kullanmıyoruz. Cihazında yalnızca uygulamanın çalışması ve senin tercihlerin için gereken kayıtları tutuyoruz; listesi <a class="link" href="#/legal/cerez">Çerez ve Yerel Depolama Politikası</a>’nda.</p>
<h3>Hakların</h3>
<p>Ayarlar bölümünden verilerinin bir kopyasını indirebilir, profilini düzenleyebilir, izinlerini geri alabilir ve hesabını silebilirsin. Diğer talepler için Ayarlar › Veri taleplerim ya da ${c.mail}${c.addr}.</p>`;
    },
  },
  kosullar: {
    ...T('kosullar', 'Kullanım koşulları'),
    body: () => {
      const c = contact();
      return `
<p>Bu koşullar, ${c.who} (“SwipeUp”) ile SwipeUp’ı kullanan sen arasındaki üyelik sözleşmesidir. Kayıt olurken kabul ettiğin sürüm kayıt altına alınır; önemli değişikliklerde yeniden onayın istenir.</p>
<h3>1. Yaş sınırı</h3>
<p>SwipeUp yalnızca <b>18 yaş ve üzeri</b> kişiler içindir. Kayıt olurken doğru doğum tarihi vermeyi ve 18 yaşından büyük olduğunu beyan edersin. 18 yaşından küçük olduğu anlaşılan hesaplar kapatılır. Yaş doğrulamasıyla ilgili yasal düzenlemeler uygulandığında ek doğrulama istenebilir.</p>
<h3>2. Hesabın</h3>
<p>Hesabının güvenliğinden sen sorumlusun. Başkasının kimliğine bürünmek, sahte profil açmak, başkasının fotoğrafını kullanmak ve hesabını başkasına devretmek ya da satmak yasaktır.</p>
<h3>3. Paylaştığın içerik</h3>
<p>Paylaştığın içeriğin sorumluluğu sana aittir ve hakkı sende kalır. İçeriğin uygulamada gösterilebilmesi için SwipeUp’a yalnızca hizmeti sunmakla sınırlı, münhasır olmayan, ücretsiz bir kullanım izni verirsin; bu izin içeriği ya da hesabını sildiğinde sona erer. Fotoğraflarını reklam ya da tanıtımda kullanmak istersek ayrıca yazılı iznini alırız. Telif hakkı sana ait olmayan müzik, fotoğraf ve videoları izinsiz paylaşma.</p>
<h3>4. Yasaklı içerik ve davranışlar</h3>
<ul>
<li>Taciz, tehdit, şantaj, nefret söylemi, ayrımcılık ve zorbalık;</li>
<li>çıplaklık, cinsel içerik, ücret karşılığı cinsel hizmet ya da eskortluk ilanı;</li>
<li>reşit olmayanlarla ilgili her türlü uygunsuz içerik ve iletişim (yetkili makamlara bildirilir);</li>
<li>dolandırıcılık, para, hediye kartı, kripto ya da yatırım istemek; jeton ya da hesap alım satımı;</li>
<li>spam, reklam yağmuru, otomatik hesaplar, sistemin açıklarını kullanmak;</li>
<li>başkalarının kişisel verilerini (telefon, adres, fotoğraf) izinsiz paylaşmak;</li>
<li>yasa dışı mal ve hizmetlerin tanıtımı.</li>
</ul>
<p>Ayrıntılar <a class="link" href="#/legal/kurallar">topluluk kuralları</a>ndadır.</p>
<h3>5. Moderasyon</h3>
<p>Yüklenen fotoğraflar otomatik olarak denetlenir, ağır hakaret ve tehdit içeren mesajlar otomatik işaretlenir; son kararı yönetim ekibi verir. Kurallara ya da hukuka aykırı içerikleri kaldırabilir, hesapları uyarabilir, geçici olarak askıya alabilir ya da kapatabiliriz. Bir karara uygulamadaki itiraz formuyla itiraz edebilirsin. Hak ihlali bildirimleri için <a class="link" href="#/legal/kunye">Künye</a> sayfasındaki formu kullanabilirsin.</p>
<h3>6. Jeton ve SwipeUp+</h3>
<ul>
<li>Jeton, yalnızca SwipeUp içinde belirli ücretli özelliklerde (hediye, fal, boost, süper beğeni vb.) kullanılan bir kullanım hakkıdır; <b>elektronik para değildir</b>, nakde çevrilemez, başka bir hesaba devredilemez ve satılamaz. Her özelliğin jeton bedeli harcamadan önce gösterilir.</li>
<li>Satın almalar havale/EFT ile yapılır ve <a class="link" href="#/legal/onbilgi">Ön Bilgilendirme Formu</a> ile <a class="link" href="#/legal/mesafeli">Mesafeli Satış Sözleşmesi</a>’ne tabidir. Fiyatlar Türk lirası ve tüm vergiler dahil gösterilir; gizli ya da ek ücret yoktur.</li>
<li>Jeton ve SwipeUp+ elektronik ortamda anında ifa edildiğinden, sipariş ekranındaki ayrı onayınla cayma hakkı bulunmaz; tanımlanmayan siparişler, hatalı ödemeler ve harcanmamış jetonlar için iade koşulları <a class="link" href="#/legal/iade">Cayma ve İade Politikası</a>’ndadır.</li>
<li>SwipeUp+ seçtiğin süre boyunca geçerlidir; <b>otomatik yenilenmez</b>, süre bitince kendiliğinden sona erer ve senden yeniden ücret alınmaz.</li>
<li>Ücretsiz deneme sona erdiğinde ücretli üyeliğe kendiliğinden geçilmez.</li>
</ul>
<h3>7. Reklam, öne çıkarma ve dürüstlük</h3>
<p>Üyelerin ödeme yaparak öne çıkardığı paylaşımlar “Sponsorlu” etiketiyle gösterilir. SwipeUp sahte profil, sahte eşleşme ya da yapay etkileşim kullanmaz; kullanıcı yorumu ya da puanı satın almaz veya üretmez. Resmî hesaplar (ör. Falcı Teyze) açıkça belirtilir.</p>
<h3>8. Yayıncılar ve falcılar</h3>
<p>Canlı yayın hediyelerinden ve fallardan kazanç elde eden üyelerin kazançları, uygulamada belirtilen alt sınırı geçtiğinde ödeme talebiyle IBAN’a gönderilir. Kazanç, jetonun paraya çevrilmesi değil, SwipeUp’ın kendi gelirinden ödediği bir hizmet bedelidir; vergisel yükümlülükler kazanç sahibine aittir ve ödeme öncesinde ek bilgi ya da belge istenebilir.</p>
<h3>9. Fal</h3>
<p>Fal, burç ve benzeri içerikler <b>eğlence amaçlıdır</b>; gelecek hakkında bilgi verdiği ya da karar vermene dayanak olacağı iddia edilmez.</p>
<h3>10. Buluşmalar ve güvenlik</h3>
<p>Üyelerin kimliğini resmî olarak doğrulamayız (mavi tik yalnızca fotoğrafın sahibine ait olduğunu gösterir). İlk buluşmaları kalabalık yerlerde yap, kişisel bilgilerini ve paranı paylaşma; şüpheli davranışları bildir.</p>
<h3>11. Sorumluluk</h3>
<p>Hizmeti özenle sunmaya çalışırız; ancak kesintisiz ya da hatasız çalışacağını garanti edemeyiz. Üyeler arasındaki iletişim ve buluşmalardan doğan zararlardan, kanunun izin verdiği ölçüde sorumlu değiliz. Kasıt ve ağır ihmalden doğan sorumluluğumuz ile tüketici olarak kanundan doğan hakların saklıdır.</p>
<h3>12. Hesabın sona ermesi</h3>
<p>Hesabını istediğin zaman Ayarlar › Hesabımı sil ile kapatabilirsin. Koşulların ağır ihlali hâlinde hesabını kapatabiliriz; bu durumda kullanılmamış jetonlarla ilgili yasal hakların saklıdır.</p>
<h3>13. Değişiklikler</h3>
<p>Bu koşulları güncelleyebiliriz. Önemli değişiklikleri uygulama içinde duyurur ve yeniden onayını isteriz; onaylamazsan hesabını silebilirsin.</p>
<h3>14. Uygulanacak hukuk ve uyuşmazlıklar</h3>
<p>Bu sözleşmeye Türk hukuku uygulanır. Tüketici olarak, yasal parasal sınırlar içinde yerleşim yerindeki tüketici hakem heyetine, sınırın üzerindeki uyuşmazlıklarda tüketici mahkemesine başvurabilirsin.</p>
<h3>15. İletişim</h3>
<p>${c.mail}${c.addr}. Diğer bilgiler <a class="link" href="#/legal/kunye">Künye</a> sayfasında.</p>`;
    },
  },
  riza: {
    ...T('riza', 'Açık rıza metni'),
    body: () => {
      const c = contact();
      return `
<p>Aşağıdaki işlemeler SwipeUp’ı kullanmak için <b>zorunlu değildir</b>. Her biri için ayrı ayrı, kendi isteğinle izin verirsin; kutular önceden işaretli gelmez ve vermezsen uygulamanın geri kalanını aynen kullanırsın. İzinler hesap başına bir kez, kayıtta ya da ilk girişte tek ekranda sorulur; sonradan yeni izin eklenmez. Verdiğin izinleri istediğin an Ayarlar › İzinlerim’den tek dokunuşla geri alabilirsin; geri alma, o ana kadar yapılmış işlemleri etkilemez.</p>
<h3>1. Kampanya ve yenilik bildirimleri (uygulama içi ve anlık bildirim)</h3>
<p>Kampanya, indirim, etkinlik ve yeni özelliklerle ilgili uygulama içi ve anlık bildirim gönderebilmemiz için adın, kullanıcı adın ve bildirim aboneliğin işlenir. İzin vermezsen yalnızca hesabın, siparişlerin ve güvenliğinle ilgili bilgilendirme bildirimleri gelir. Telefonunun bildirim izni tek başına kampanya izni sayılmaz.</p>
<h3>2. Kampanya ve yenilik e-postaları (ticari elektronik ileti)</h3>
<p>Kampanya ve yeniliklerle ilgili e-posta gönderebilmemiz için e-posta adresin işlenir. Bu onay 6563 sayılı Kanun uyarınca İleti Yönetim Sistemi’ne (İYS) kaydedilir; her e-postada ücretsiz ret bağlantısı bulunur ve reddin İYS’ye de iletilir.</p>
<h3>3. Konum</h3>
<p>Yakınındaki kişileri ve uzaklığı gösterebilmek için cihazından alınan konumun yaklaşık 1 km hassasiyetle yuvarlanarak saklanır. Tam konumun ve konum geçmişin saklanmaz; diğer kullanıcılara yalnızca kilometre cinsinden uzaklık gösterilir. İzni geri alınca kayıtlı konumun silinir.</p>
<h3>4. Fal fotoğraflarının yapay zekayla yorumlanması</h3>
<p>Fal isteğinde gönderdiğin fincan fotoğrafları, notun ve burç / kart bilgin, yorum taslağı hazırlanması için Google’ın yapay zeka hizmetine (Gemini API, sunucuları ABD ve diğer ülkelerde) iletilir. Adın, kullanıcı adın ve iletişim bilgilerin gönderilmez. Aktarım KVKK m.9’daki güvencelere dayanır; yine de bu ülkelerde Türkiye’deki ile aynı düzeyde koruma bulunmayabileceğini ve Google’ın verileri kendi koşullarına göre işleyebileceği gibi riskleri bilerek izin verirsin. İzin vermezsen falına Falcı Teyze kendisi bakar.</p>
<h3>5. Kaydırma tercihi (özel nitelikli veri)</h3>
<p>Kaydırmada yalnızca kadınları ya da yalnızca erkekleri görmek istersen bu tercihin işlenir. Tercih cinsel hayata ilişkin özel nitelikli kişisel veri sayılabildiği için KVKK m.6 uyarınca ayrıca açık rızana dayanır. Tercihin profilinde ya da başka hiçbir yerde gösterilmez, yalnızca sana ve seninle eşleşebilecek kişilere öneri hazırlanırken kullanılır, reklam ya da analiz için işlenmez. İzin vermezsen herkesi görürsün; izni geri alınca tercihin silinir.</p>
<h3>Kayıt ve başvuru</h3>
<p>Verdiğin ya da geri aldığın her iznin tarihi ve metin sürümü kayıt altına alınır. Sorular ve başvurular için: Ayarlar › Veri taleplerim ya da ${c.mail}${c.addr}.</p>`;
    },
  },
  cerez: {
    ...T('cerez', 'Çerez ve yerel depolama politikası'),
    body: () => `
<p>SwipeUp, cihazında çerez yerine ağırlıklı olarak tarayıcının yerel deposunu (localStorage / sessionStorage) ve uygulamanın hızlı açılması için hizmet çalışanı önbelleğini kullanır. KVKK Çerez Uygulamaları Rehberi bu benzer teknolojileri de kapsar.</p>
<h3>Reklam ya da analiz çerezi yok</h3>
<p>Reklam, hedefleme, sosyal medya izleme ya da analiz amaçlı çerez veya benzeri bir teknoloji kullanmıyoruz; üçüncü taraf izleme betiği yüklemiyoruz. Bu nedenle bir onay bandı göstermiyoruz. İleride böyle bir araç eklenirse, araç çalışmadan önce “Kabul et”, “Reddet” ve “Tercihler” seçeneklerinin eşit olduğu bir onay ekranı gösterilecek ve bu politika güncellenecektir.</p>
<h3>Cihazında tutulan kayıtlar</h3>
<div class="legal-tbl"><table><thead><tr><th>Tür</th><th>Kayıt</th><th>Amaç</th><th>Süre</th></tr></thead><tbody>${STORE_ROWS.map((r) => `<tr>${r.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
<p>Kesinlikle gerekli kayıtlar, istediğin hizmetin sunulması ve güvenliği için KVKK m.5/2-c ve m.5/2-f kapsamında tutulur; işlev kayıtları ise yalnızca senin yaptığın seçimleri hatırlar. Bu kayıtları tarayıcı ayarlarından ya da çıkış yaparak silebilirsin; kesinlikle gerekli olanları silersen oturumun kapanır.</p>`,
  },
  onbilgi: { ...T('onbilgi', 'Ön bilgilendirme formu'), remote: 'onbilgi', intro: '<p>Jeton ve SwipeUp+ satın alımlarında, siparişi onaylamadan önce gösterilen formun genel hâli. Sipariş ekranında ürün, fiyat ve senin bilgilerinle doldurulmuş hâli gösterilir; onayladığın metnin bir kopyası Mağaza › Siparişlerim’de saklanır.</p>' },
  mesafeli: { ...T('mesafeli', 'Mesafeli satış sözleşmesi'), remote: 'mesafeli', intro: '<p>Jeton ve SwipeUp+ satın alımlarında kurulan sözleşmenin genel hâli. Her siparişte, onayladığın anki metin siparişe bağlı olarak saklanır ve e-posta adresin varsa sana gönderilir.</p>' },
  iade: { ...T('iade', 'Cayma ve iade politikası'), remote: 'iade' },
  lisanslar: {
    ...T('lisanslar', 'Lisanslar ve atıflar'),
    body: () => `
<p>SwipeUp’ta kullanılan yazı tipleri, kütüphaneler ve görsellerin kaynakları ve lisansları:</p>
<div class="legal-tbl"><table><thead><tr><th>Öğe</th><th>Kaynak</th><th>Lisans</th></tr></thead><tbody>
<tr><td>Bricolage Grotesque yazı tipi</td><td>The Bricolage Grotesque Project Authors</td><td><a class="link" href="/fonts/OFL-Bricolage-Grotesque.txt" target="_blank">SIL Open Font License 1.1</a></td></tr>
<tr><td>Varsayılan profil çizimleri (Notionists)</td><td>Zoish, DiceBear</td><td>CC0 1.0</td></tr>
<tr><td>Grup sohbeti çizimleri (Shapes)</td><td>DiceBear</td><td>CC0 1.0</td></tr>
<tr><td>3D oyun motoru</td><td>three.js</td><td>MIT</td></tr>
<tr><td>Fizik motoru</td><td>cannon-es</td><td>MIT</td></tr>
<tr><td>Harita verisi</td><td>© OpenStreetMap katkıcıları</td><td>ODbL</td></tr>
<tr><td>GIF’ler</td><td>GIPHY</td><td>GIPHY kullanım koşulları</td></tr>
<tr><td>Müzik önizlemeleri</td><td>Spotify, Apple</td><td>İlgili hizmetin koşulları; yalnızca önizleme</td></tr>
<tr><td>Emojiler</td><td>Cihazının sistem yazı tipi</td><td>Cihaz üreticisinin lisansı</td></tr>
</tbody></table></div>
<p>Uygulamadaki çizimler, simgeler, oyun karakterleri, sahneler ve ses efektleri SwipeUp için özgün olarak üretilmiştir; ses efektleri cihazında anlık olarak sentezlenir. Üyelerin yüklediği fotoğraf, video ve müziklerin hakları sahiplerine aittir.</p>
<p>Bir içeriğin hakkını ihlal ettiğimizi düşünüyorsan <a class="link" href="#/legal/kunye">Künye</a> sayfasındaki formla bildirebilirsin.</p>`,
  },
  saklama: {
    ...T('saklama', 'Saklama ve imha politikası'),
    body: () => {
      const c = contact();
      const rows = [
        ['Hesap, profil, paylaşım ve mesajlar', 'Hesap açık olduğu sürece', 'Hesap silinince hemen; yedeklerden 30 gün içinde'],
        ['Kaydırma tercihi (özel nitelikli)', 'Açık rızan sürdükçe', 'Rıza geri alınınca hemen; yanıtlanmayan eski tercih 30 gün sonra'],
        ['Konum', 'Açık rızan sürdükçe', 'Rıza geri alınınca hemen'],
        ['Doğrulama selfiesi', 'Karardan sonra 30 gün', 'Fotoğraf silinir, yalnız sonuç kalır'],
        ['Bildirimler', 'Okunanlar 180 gün, tümü en çok 1 yıl', 'Periyodik imha'],
        ['Giriş ve cihaz geçmişi', '1 yıl', 'Periyodik imha'],
        ['Uygulama içi hareketler (işlem türü, zaman, IP; metinler hariç)', '1 yıl', 'Periyodik imha'],
        ['5651 trafik kayıtları', '2 yıl (kanunen en az 1 yıl)', 'Süre dolunca kendiliğinden'],
        ['Şikayet, moderasyon, itiraz ve destek kayıtları', 'Kapanıştan sonra 2 yıl', 'Periyodik imha'],
        ['KVKK başvuruları, hak ihlali bildirimleri', 'Sonuçlandıktan sonra 3 yıl', 'Periyodik imha'],
        ['Silinen hesabın kullanıcı adı ve silme nedeni', '1 yıl', 'Periyodik imha'],
        ['Rıza ve belge onay kayıtları (silinen hesaplar)', '3 yıl', 'Periyodik imha'],
        ['Sipariş, ödeme, iade, jeton ve kazanç kayıtları', '10 yıl (Vergi Usul Kanunu m.253, TTK m.82)', 'Süre dolunca'],
        ['Buluşma paylaşımları', 'Buluşmadan sonra 7 gün', 'Periyodik imha'],
        ['Uygulama hata kayıtları', '90 gün', 'Periyodik imha'],
        ['Uzun süre kullanılmayan hesaplar', '24 ay hiç giriş yapılmazsa', '30 gün önce bildirim ve e-postayla uyarılır; giriş yaparsan silinmez'],
      ];
      return `
<p>Bu politika, ${c.who} olarak işlediğimiz kişisel verileri ne kadar süre sakladığımızı ve süresi dolunca nasıl yok ettiğimizi açıklar (6698 sayılı KVKK m.7 ve Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik).</p>
<h3>Saklama süreleri</h3>
<div class="legal-tbl"><table><thead><tr><th>Veri</th><th>Saklama süresi</th><th>İmha</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table></div>
<h3>Nasıl imha ediyoruz</h3>
<ul>
<li><b>Silme:</b> kayıtlar veritabanından, dosyalar depolama alanından kalıcı olarak silinir; erişim kopyaları (önbellek) de temizlenir.</li>
<li><b>Periyodik imha:</b> süresi dolan veriler otomatik olarak günde iki kez kontrol edilir ve silinir. Bu, yönetmeliğin öngördüğü en geç 6 aylık periyottan daha sıktır.</li>
<li><b>Kayıt:</b> her imha işleminde neyin, ne kadarının, ne zaman silindiği kaydedilir; bu kayıtlar 3 yıl saklanır.</li>
<li><b>Talep üzerine:</b> silme talebini Ayarlar › Veri taleplerim’den iletirsen en geç 30 gün içinde sonuçlandırırız; yasal saklama gerektiren kayıtlar bu süre dolana kadar erişimi kısıtlı tutulur.</li>
</ul>
<h3>Teknik ve idari tedbirler</h3>
<p>Kayıtlara yalnızca görevi gereği yetkilendirilmiş yöneticiler erişebilir; toplu dışa aktarma işlemleri kayda geçer ve sahip yöneticiye bildirilir. 5651 trafik kayıtları değiştirilemezliği gösteren zincirleme özetlerle korunur.</p>
<p>Sorular için ${c.mail}${c.addr}.</p>`;
    },
  },
  kurallar: {
    ...T('kurallar', 'Topluluk kuralları'),
    body: () => `
<p>SwipeUp herkesin kendini güvende hissettiği bir yer olsun diye bu kurallar var.</p>
<ul>
<li><b>Kendin ol.</b> Gerçek fotoğraflarını kullan, başkası gibi davranma.</li>
<li><b>Saygılı ol.</b> Hakaret, aşağılama, taciz ve tehdit yok. Mesajlardaki ağır küfür ve tehditler otomatik olarak işaretlenip ekibimize iletilir.</li>
<li><b>Hayır, hayırdır.</b> İlgilenmeyen birine ısrarla yazma.</li>
<li><b>Çıplaklık ve cinsel içerik yok.</b> Rahatsız edici, şiddet içeren veya yasa dışı içerik paylaşma.</li>
<li><b>Reşit olmayanlar yok.</b> 18 yaşından küçük biri olabileceğini düşündüğün hesapları bildir.</li>
<li><b>Para isteme, dolandırma.</b> Kimseden para, hediye kartı ya da yatırım isteme; isteyenleri bildir.</li>
<li><b>Spam yok.</b> Reklam, link yağmuru ve otomatik hesaplar yasaktır.</li>
<li><b>Başkasının bilgisi onundur.</b> Kimsenin telefonunu, adresini ya da fotoğrafını izinsiz paylaşma.</li>
<li><b>Telif haklarına saygı.</b> Hakkı sana ait olmayan içerikleri paylaşma.</li>
</ul>
<p>Kuralları çiğneyen içerikler kaldırılır; hesaplar uyarılır, askıya alınır ya da kapatılır. Bir profili veya içeriği <b>Şikayet et</b> ile bildirebilirsin; kimin bildirdiği gizli tutulur.</p>`,
  },
};
const ORDER = ['kunye', 'kvkk', 'gizlilik', 'saklama', 'kosullar', 'riza', 'cerez', 'onbilgi', 'mesafeli', 'iade', 'kurallar', 'lisanslar'];

export function legalHtml(doc) {
  const d = DOCS[doc] || DOCS.gizlilik; const key = DOCS[doc] ? doc : 'gizlilik';
  return `<article class="legal"><p class="muted" style="font-size:13px">Sürüm ${esc(verOf(key))} · yürürlük ${esc(trDay(verOf(key)))}</p>${d.remote ? `${d.intro || ''}<div class="legal-remote" data-doc="${d.remote}"><div class="spinner"></div></div>` : d.body()}</article>`;
}
// Ürüne bağlı olmayan satış belgeleri sunucuda üretilir (sipariş ekranındakiyle aynı kaynak)
export async function mountLegal(root) {
  root.querySelectorAll('.legal-remote').forEach(async (el) => { try { const r = await api(`/legal/doc/${el.dataset.doc}`); el.innerHTML = r.html; } catch (e) { el.innerHTML = `<p class="muted">${esc(e.message)}</p>`; } });
  root.querySelectorAll('.td-open').forEach((b) => { b.onclick = () => takedownSheet(); });
}

export function legalSheet(doc) {
  sheet(DOCS[doc]?.title || 'Belge', `<div style="padding:0 18px 20px">${legalHtml(doc)}</div>`, { onMount: (sh) => mountLegal(sh) });
}

// Hak ihlali bildirimi (telif / kişilik hakkı): oturum açmadan da gönderilebilir
export function takedownSheet() {
  const me = state.me;
  const close = sheet('Hak ihlali bildir', `<form class="form td-f">
    <label>Bildirim türü<select class="field" name="kind"><option value="telif">Telif hakkı (eserim izinsiz kullanılıyor)</option><option value="kisilik">Kişilik hakkı (fotoğrafım ya da bilgilerim izinsiz paylaşılıyor, hakarete uğruyorum)</option><option value="diger">Diğer hukuka aykırı içerik</option></select></label>
    <label>İçerik adresi ya da kullanıcı adı<input class="field" name="target" maxlength="300" placeholder="ör. @kullanici ya da paylaşımın bağlantısı" required></label>
    <label>Açıklama<textarea class="field" name="desc" maxlength="3000" rows="4" placeholder="Hangi hakkının nasıl ihlal edildiğini anlat; hak sahibi olduğunu gösteren bilgiyi ekle." required></textarea></label>
    <label>Adın soyadın<input class="field" name="name" maxlength="80" value="${esc(me?.name || '')}" required></label>
    <label>E-posta<input class="field" name="email" type="email" maxlength="120" value="${esc(me?.email || '')}" required></label>
    <label class="consent"><input type="checkbox" name="sworn"><span>Bildirimdeki bilgilerin doğru olduğunu ve hak sahibi ya da onun adına yetkili olduğumu beyan ederim.</span></label>
    <button class="btn primary block">Bildirimi gönder</button>
    <p class="muted" style="font-size:12.5px;margin:0">Bildirimin incelenir; sonucu e-postayla bildirilir. Gerçeğe aykırı bildirim hukuki sorumluluk doğurabilir.</p></form>`, {
    onMount(sh) {
      const f = sh.querySelector('form');
      f.onsubmit = async (e) => { e.preventDefault(); try { await api('/legal/takedown', { body: { kind: f.kind.value, target: f.target.value, desc: f.desc.value, name: f.name.value, email: f.email.value, sworn: f.sworn.checked } }); close(); toast('Bildirimin alındı. İnceleyip e-postayla döneceğiz.', { ms: 5000 }); } catch (er) { toast(er.message); } };
    },
  });
}

export default function legal(view, doc) {
  const key = DOCS[doc] ? doc : 'gizlilik'; const d = DOCS[key];
  view.innerHTML = `<header class="topbar bordered"><button class="ib" data-back="#/" aria-label="Geri">${icon('back')}</button><div class="center">${esc(d.title)}</div><span class="ib"></span></header>
    <div style="padding:6px 18px 40px">${legalHtml(key)}
    <div class="legal-nav">${ORDER.filter((k) => k !== key).map((k) => `<a class="chip" href="#/legal/${k}">${esc(DOCS[k].title)}</a>`).join('')}</div></div>`;
  mountLegal(view);
  return null;
}
