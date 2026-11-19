// Hukuki uyum: satıcı (künye) bilgileri, belge sürümleri, kullanım koşulları onayı, mesafeli satış belgeleri (ön bilgilendirme +
// sözleşme anlık görüntüsü), iade talepleri, KVKK başvuruları (30 gün), telif / kişilik hakkı bildirimleri, İYS izin dökümü,
// varsayılan profil çizimlerinin kendi sunucumuzdan verilmesi (kullanıcının IP'si üçüncü tarafa gitmesin).
const crypto = require('crypto');
const { nanoid } = require('nanoid');
const mail = require('./mail');

// Belge sürümleri: metin değişince tarih güncellenir; Kullanım Koşulları değişince üyelerden yeniden onay istenir
const VER = { kosullar: '2026-11-20', gizlilik: '2026-11-20', kvkk: '2026-11-17', riza: '2026-11-18', cerez: '2026-11-17', mesafeli: '2026-11-17', onbilgi: '2026-11-17', iade: '2026-11-17', kunye: '2026-11-17', lisanslar: '2026-11-17', saklama: '2026-11-17', guvenlik: '2026-11-17' };
const THH = { year: 2026, limit: 186000 }; // tüketici hakem heyeti parasal sınırı (her yıl Aralık'ta güncellenir)
const DEF = { deliveryHours: 24, payHours: 72, refund14: true };
const DAY = 86400000;
const KVKK_TYPES = {
  ogrenme: 'Kişisel verilerimin işlenip işlenmediğini öğrenme', bilgi: 'İşlenen verilerim hakkında bilgi talebi', amac: 'İşleme amacı ve amacına uygun kullanılıp kullanılmadığı',
  aktarim: 'Verilerimin aktarıldığı yurt içi / yurt dışı üçüncü kişiler', duzeltme: 'Eksik ya da yanlış verilerin düzeltilmesi', silme: 'Verilerimin silinmesi ya da yok edilmesi',
  bildirim: 'Düzeltme / silmenin aktarılan üçüncü kişilere bildirilmesi', itiraz: 'Otomatik analiz sonucu aleyhime çıkan sonuca itiraz', zarar: 'Hukuka aykırı işleme nedeniyle zararın giderilmesi',
};
const REFUND = { tanimlanmadi: 'Ödedim ama hesabıma tanımlanmadı', hata: 'Hatalı tutar ya da çift ödeme', cayma14: 'Harcanmamış jetonlarımı iade etmek istiyorum (14 gün)' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const str = (v, n = 200) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '').trim().slice(0, n);
const TL = (n) => `${Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
const trDate = (t) => new Date(t).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const plain = (html) => String(html).replace(/<\/(p|h3|h4|li|tr|div)>/g, '\n').replace(/<br\s*\/?>/g, '\n').replace(/<td>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();

// ---------- Varsayılan profil çizimi (DiceBear tasarımları CC0; artık dış servis çağrılmıyor) ----------
let STYLES = null;
function styles() { if (!STYLES) { STYLES = { notionists: require('@dicebear/notionists'), shapes: require('@dicebear/shapes') }; } return STYLES; }
const avCache = new Map();
function avatarSvg(style, seed, bg) {
  const k = `${style}|${seed}|${bg}`; if (avCache.has(k)) return avCache.get(k);
  const { createAvatar } = require('@dicebear/core');
  const svg = createAvatar(styles()[style], { seed, backgroundColor: bg.split(',') }).toString();
  if (avCache.size > 3000) avCache.delete(avCache.keys().next().value); avCache.set(k, svg); return svg;
}
const localAvatar = (style, seed, bg) => `/av/${style}/${encodeURIComponent(seed)}.svg?bg=${bg}`;
const DICE_RE = /^https:\/\/api\.dicebear\.com\/9\.x\/(notionists|shapes)\/svg\?(.+)$/;
function fromDicebear(url) { const m = DICE_RE.exec(String(url || '')); if (!m) return null; const q = new URLSearchParams(m[2]); return localAvatar(m[1], q.get('seed') || 'swipeup', (q.get('backgroundColor') || 'ffe3dc').replace(/[^0-9a-f,]/gi, '')); }

module.exports = function legal(app, ctx) {
  const { store, auth, notify, limited, ipOf, eco, brief, pushAdmins } = ctx;
  const A = ctx.admin || {}; const now = () => Date.now();
  const info = () => { const { id, ...l } = store.get('settings', 'legal') || {}; return { ...DEF, ...l }; };
  const user = (id) => store.get('users', id);

  // Varsayılan profil çizimi: /av/notionists/ayla.svg?bg=ffe3dc
  app.get('/av/:style/:seed.svg', (req, res) => {
    const style = String(req.params.style); if (!['notionists', 'shapes'].includes(style)) return res.status(404).end();
    const seed = String(req.params.seed).slice(0, 80); const bg = String(req.query.bg || 'ffe3dc').replace(/[^0-9a-f,]/gi, '').slice(0, 60) || 'ffe3dc';
    try { res.set('Cache-Control', 'public, max-age=2592000, immutable').type('image/svg+xml').send(avatarSvg(style, seed, bg)); } catch { res.status(500).end(); }
  });
  ctx.localAvatar = localAvatar; ctx.fromDicebear = fromDicebear;
  setTimeout(() => { // eski dış adresli çizimleri yerel adrese çevir (bir kez, sessizce)
    let n = 0;
    for (const u of store.filter('users', (x) => DICE_RE.test(x.avatar || ''))) { store.update('users', u.id, { avatar: fromDicebear(u.avatar) }); n++; }
    for (const c of store.filter('chats', (x) => x.isGroup && DICE_RE.test(x.avatar || ''))) { store.update('chats', c.id, { avatar: fromDicebear(c.avatar) }); n++; }
    if (n) console.log(`[hukuk] ${n} varsayılan çizim yerel adrese taşındı`);
  }, 4000).unref?.();

  // ---------- Kullanım Koşulları onayı (sürümlü, kanıt kaydıyla) ----------
  ctx.acceptTerms = (uid, req, via) => {
    store.put('consent_log', { id: nanoid(12), userId: uid, kind: 'terms', on: true, text: `Kullanım Koşulları (sürüm ${VER.kosullar}) okundu ve kabul edildi; 18 yaşından büyük olduğu beyan edildi.`, v: VER.kosullar, via, ip: req ? ipOf(req) : null, at: now() });
    return store.update('users', uid, { termsV: VER.kosullar, termsAt: now() });
  };
  ctx.legalVer = VER;
  app.post('/api/me/terms', auth, (req, res) => { if (req.body?.accept !== true) return res.status(400).json({ error: 'Devam etmek için güncel Kullanım Koşulları’nı kabul etmelisin.' }); ctx.acceptTerms(req.user.id, req, 'güncelleme'); res.json({ termsV: VER.kosullar }); });
  app.get('/api/legal/info', (req, res) => { const l = info(); res.json({ ver: VER, thh: THH, refund14: !!l.refund14, deliveryHours: l.deliveryHours, payHours: l.payHours }); });

  // ---------- Mesafeli satış: ön bilgilendirme formu ve sözleşme (sunucuda üretilir, siparişte değiştirilemez kopyası saklanır) ----------
  const sellerRows = (L) => [['Satıcı / hizmet sağlayıcı', L.company], ['İşletme adı / marka', L.brand || 'SwipeUp'], ['MERSİS no', L.mersis], ['Vergi dairesi / vergi kimlik no', L.vkn ? `${L.taxOffice ? `${L.taxOffice} / ` : ''}${L.vkn}` : ''], ['Ticaret sicil no', L.sicil], ['Adres', L.address], ['Telefon', L.phone], ['E-posta', L.email], ['KEP adresi', L.kep]].filter(([, v]) => v);
  const tbl = (rows) => `<div class="legal-tbl"><table><tbody>${rows.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('')}</tbody></table></div>`;
  const prodName = (p) => (p ? (p.kind === 'coins' ? `${p.coins} jeton` : `SwipeUp+ ${p.days} günlük üyelik`) : '[ürün]');
  const prodText = (p) => (!p ? 'Satın almak istediğin jeton paketi ya da SwipeUp+ üyeliği.' : p.kind === 'coins'
    ? `${p.coins} jeton: SwipeUp uygulaması içinde hediye gönderme, fal, boost, süper beğeni gibi ücretli özelliklerde kullanılan dijital kullanım hakkı. Jeton elektronik para değildir; nakde çevrilemez, başka bir hesaba devredilemez ve satılamaz. Her özelliğin jeton bedeli, harcamadan önce uygulamada gösterilir.`
    : `SwipeUp+ ${p.days} günlük üyelik: sınırsız beğeni, seni beğenenleri görme, son kaydırmayı geri alma, günlük süper beğeni hakkı, haftalık ücretsiz boost, gizli okuma ve görünmeden gezme gibi ayrıcalıklar ${p.days} gün boyunca. Üyelik süre sonunda kendiliğinden sona erer; otomatik yenilenmez ve senden yeniden ücret alınmaz.`);
  const waiveText = (p) => `Satın aldığım ${prodName(p)} ürününün, ödemem onaylandıktan sonra hesabıma tanımlanarak elektronik ortamda anında ifa edileceğini, ifaya cayma süresi içinde başlanmasını talep ettiğimi ve bu nedenle Mesafeli Sözleşmeler Yönetmeliği’nin 15. maddesinin birinci fıkrasının (ğ) ve (h) bentleri uyarınca cayma hakkımın bulunmadığını kabul ediyorum.`;
  const PRE_TEXT = 'Ön Bilgilendirme Formu’nu ve Mesafeli Satış Sözleşmesi’ni okudum, onaylıyorum.';
  const cayma = (L, p) => `<p>${p ? esc(prodName(p)) : 'Jeton ve SwipeUp+ üyeliği'}, elektronik ortamda anında ifa edilen hizmet ve tüketiciye anında teslim edilen gayrimaddi mal niteliğindedir. Mesafeli Sözleşmeler Yönetmeliği’nin 15. maddesinin birinci fıkrasının (ğ) ve (h) bentleri uyarınca, onayınla ifaya başlandığından <b>cayma hakkın bulunmamaktadır</b>. Bu konudaki onayın, sipariş ekranında ayrı bir kutuyla alınır.</p>
<p>Ödemen hesabımıza ulaştığı hâlde ürün <b>${L.deliveryHours} saat</b> içinde hesabına tanımlanmazsa siparişini iptal ederek ödediğin bedelin tamamının iadesini isteyebilirsin. Hatalı tutar ya da çift ödemelerde fazla ödenen tutar iade edilir.</p>
${L.refund14 ? '<p><b>14 gün iade güvencesi:</b> Yasal bir zorunluluk olmamakla birlikte, satın aldığın jetonları hiç harcamadıysan satın alma tarihinden itibaren 14 gün içinde iade isteyebilirsin. İade onaylanınca bu jetonlar bakiyenden düşülür. Başlamış SwipeUp+ üyelik süreleri bu güvencenin kapsamında değildir.</p>' : ''}
<p>İade talebini <b>Mağaza › Siparişlerim</b> ekranından, siparişini seçip “İade talep et”e dokunarak verebilirsin. Onaylanan iadeler, talebinden itibaren en geç 14 gün içinde bildirdiğin IBAN’a gönderilir.</p>`;
  const complaint = (L) => `<p>Talep ve şikâyetlerini uygulamadaki Yardım ve destek ekranından${L.email ? ` ya da ${esc(L.email)} adresinden` : ''} iletebilirsin. ${THH.year} yılı için ${THH.limit.toLocaleString('tr-TR')} ₺’nin altındaki uyuşmazlıklarda yerleşim yerindeki ya da işlemi yaptığın yerdeki <b>tüketici hakem heyetine</b> (e-Devlet › Tüketici Bilgi Sistemi üzerinden), bu tutar ve üzerindeki uyuşmazlıklarda arabuluculuğa ve <b>tüketici mahkemesine</b> başvurabilirsin.</p>`;
  function docs(u, p, o) { // o: sipariş (kod, tarih); yoksa önizleme
    const L = info(); const at = o?.at || now();
    const buyer = [['Alıcı', u ? (u.name || u.username) : '[alıcı]'], ['Kullanıcı adı', u ? `@${u.username}` : ''], ['E-posta', u?.email || ''], ['Sipariş kodu', o?.code || 'Onayladığında oluşturulur'], ['Tarih', trDate(at)]].filter(([, v]) => v);
    const price = p ? `<p>Tüm vergiler dahil toplam fiyat: <b>${TL(p.price)}</b>${p.kind === 'coins' ? ` (jeton başına ${TL(p.price / p.coins)})` : p.days >= 30 ? ` (aylık ${TL(p.price / (p.days / 30))})` : ''}. ${p.was ? ` Bu fiyat kampanya fiyatıdır: indirimden önceki son 30 günde uygulanan en düşük fiyat ${TL(p.was)} (%${p.off} indirim); kampanya ${esc(p.saleUntil.split('-').reverse().join('.'))} günü sonuna kadar geçerlidir.` : ''} Bu tutar dışında SwipeUp tarafından alınan ek bir ücret yoktur. Bankanın havale/EFT için ayrıca masraf kesmesi hâlinde bu masraf bankanla aranızdadır.</p>` : '<p>Fiyat, sipariş ekranında tüm vergiler dahil Türk lirası olarak gösterilir.</p>';
    const pay = `<p>Ödeme yalnızca <b>havale/EFT</b> ile yapılır; kart bilgisi istenmez. Sipariş onaylandığında ödeme yapacağın IBAN, alıcı adı ve sipariş kodu gösterilir; açıklama kısmına sipariş kodunu yazman gerekir. Sipariş ${L.payHours} saat içinde ödenmezse kendiliğinden iptal edilir.</p>
<p>Ödemenin hesabımıza ulaşıp doğrulanmasından sonra ürün en geç <b>${L.deliveryHours} saat</b> içinde hesabına tanımlanır ve bildirim alırsın.</p>`;
    const tech = '<p>Jeton ve SwipeUp+ ayrıcalıkları güncel bir web tarayıcısında (Chrome, Safari, Firefox, Edge) ve SwipeUp’ın Android / iPhone uygulamasında çalışır; internet bağlantısı gerektirir. Ürün yalnızca satın alındığı SwipeUp hesabında kullanılabilir.</p>';
    const pre = `<h3>1. Satıcı bilgileri</h3>${tbl(sellerRows(L))}<h3>2. Ürün / hizmetin temel nitelikleri</h3><p>${esc(prodText(p))}</p><h3>3. Fiyat</h3>${price}<h3>4. Ödeme ve teslim (ifa)</h3>${pay}
<h3>5. Cayma hakkı ve iade</h3>${cayma(L, p)}<h3>6. Dijital içeriğin işlevselliği ve uyumluluğu</h3>${tech}<h3>7. Şikâyet ve uyuşmazlık</h3>${complaint(L)}
<h3>8. Kişisel veriler</h3><p>Sipariş için işlenen verilerin (ad, kullanıcı adı, sipariş kodu, tutar, havale gönderen adı) nasıl işlendiği <a class="link" href="#/legal/kvkk">KVKK Aydınlatma Metni</a>’nde anlatılır.</p>`;
    const contract = `<h3>Madde 1 · Taraflar</h3><p><b>Satıcı / hizmet sağlayıcı</b></p>${tbl(sellerRows(L))}<p><b>Alıcı</b></p>${tbl(buyer)}
<h3>Madde 2 · Konu</h3><p>Bu sözleşme, Alıcı’nın SwipeUp uygulaması üzerinden elektronik ortamda sipariş verdiği <b>${esc(prodName(p))}</b> ürününün satışına ve teslimine ilişkin olarak 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği uyarınca tarafların hak ve yükümlülüklerini düzenler.</p>
<h3>Madde 3 · Ürün / hizmet</h3><p>${esc(prodText(p))}</p><h3>Madde 4 · Fiyat ve ödeme</h3>${price}${pay}
<h3>Madde 5 · Cayma hakkı ve iade</h3>${cayma(L, p)}
<h3>Madde 6 · Süre ve sona erme</h3><p>${p?.kind === 'plus' ? `SwipeUp+ üyeliği tanımlandığı andan itibaren ${p.days} gün sürer ve süre sonunda kendiliğinden sona erer; otomatik yenilenmez. Yeniden satın alınmadıkça sana herhangi bir ücret yansıtılmaz.` : 'Jetonların kullanım süresi yoktur. Hesabını silersen kullanılmamış jetonların da silinir; silmeden önce iade koşulları uygunsa iade isteyebilirsin.'}</p>
<h3>Madde 7 · Ayıplı ifa</h3><p>Ürün hesabına eksik ya da hatalı tanımlanırsa ya da ayrıcalıklar çalışmazsa destek ekibine bildirmen yeterlidir. Elektronik ortamda teslim edilen dijital içeriğin ayıpsız olduğunu ispat yükü Satıcı’dadır; ayıp hâlinde eksik tanımlama tamamlanır ya da bedel iade edilir.</p>
<h3>Madde 8 · Uyuşmazlık</h3>${complaint(L)}<h3>Madde 9 · Kişisel veriler</h3><p>Alıcı’nın kişisel verileri KVKK Aydınlatma Metni’ne uygun işlenir.</p>
<h3>Madde 10 · Yürürlük</h3><p>Bu sözleşme, Alıcı’nın sipariş ekranında Ön Bilgilendirme Formu’nu ve bu sözleşmeyi onaylayıp “Siparişi onayla” düğmesine dokunmasıyla kurulur. Sözleşmenin ve ön bilgilendirme formunun bir kopyası Alıcı’ya <b>Mağaza › Siparişlerim</b> ekranında${u?.email ? ' ve e-posta adresine' : ''} kalıcı veri saklayıcısıyla sunulur.</p>`;
    return { pre, contract, waive: waiveText(p), preText: PRE_TEXT, button: 'Siparişi onayla – ödeme yükümlülüğü doğuracaktır', v: { onbilgi: VER.onbilgi, mesafeli: VER.mesafeli } };
  }
  ctx.orderDocs = (u, p, o) => { const d = docs(u, p, o); return { pre: d.pre, contract: d.contract, waive: d.waive, v: d.v, hash: crypto.createHash('sha256').update(d.pre + d.contract + d.waive).digest('hex') }; };
  ctx.orderMail = (u, o) => { // sözleşme kopyası e-postayla (kalıcı veri saklayıcısı)
    if (!u?.email || !mail.enabled() || !o?.docs) return;
    const body = `Merhaba ${u.name || u.username},\n\n${o.title} siparişin oluşturuldu (sipariş kodu: ${o.code}, tutar: ${TL(o.amount)}). Aşağıda onayladığın Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi yer alıyor. Bu belgelere uygulamada Mağaza › Siparişlerim ekranından da ulaşabilirsin.\n\n=== ÖN BİLGİLENDİRME FORMU ===\n${plain(o.docs.pre)}\n\n=== MESAFELİ SATIŞ SÖZLEŞMESİ ===\n${plain(o.docs.contract)}\n\n=== CAYMA HAKKI ONAYIN ===\n${o.docs.waive}\n\nSwipeUp`;
    mail.send(u.email, `SwipeUp siparişin ${o.code}: ön bilgilendirme formu ve sözleşme`, body).catch(() => {});
  };
  app.get('/api/orders/preview/:productId', auth, (req, res) => {
    const p = eco.product(String(req.params.productId)); if (!p) return res.status(404).json({ error: 'Ürün bulunamadı.' });
    res.json({ product: p, ...docs(req.user, p, null) });
  });
  app.get('/api/legal/doc/:name', (req, res) => { // genel (ürüne bağlı olmayan) mesafeli satış belgeleri
    const d = docs(null, null, null); const L = info();
    const out = { onbilgi: d.pre, mesafeli: d.contract, iade: `<h3>Cayma hakkı</h3>${cayma(L, null)}<h3>Hangi durumlarda iade alırsın</h3><ul><li><b>${REFUND.tanimlanmadi}:</b> ödemen ulaştıktan sonra ${L.deliveryHours} saat içinde tanımlanmayan siparişin bedeli tamamen iade edilir.</li><li><b>${REFUND.hata}:</b> fazla ödenen tutar iade edilir.</li>${L.refund14 ? `<li><b>${REFUND.cayma14}:</b> hiç harcamadığın jetonlar, satın alma tarihinden itibaren 14 gün içinde iade edilebilir.</li>` : ''}<li><b>Ayıplı ifa:</b> ayrıcalıklar çalışmazsa ya da eksik tanımlanırsa eksik tamamlanır ya da bedel iade edilir.</li></ul><h3>İade nasıl yapılır</h3><p>İade, talepte bildirdiğin ve adına kayıtlı IBAN’a havale/EFT ile, talebin onaylandıktan sonra en geç 14 gün içinde gönderilir. İade için senden ek ücret alınmaz.</p>${complaint(L)}` }[String(req.params.name)];
    if (!out) return res.status(404).json({ error: 'Belge bulunamadı.' });
    res.json({ html: out, ver: VER, seller: sellerRows(L) });
  });
  app.get('/api/orders/:id/docs', auth, (req, res) => {
    const o = store.get('orders', req.params.id); if (!o || o.userId !== req.user.id) return res.status(404).json({ error: 'Sipariş bulunamadı.' });
    if (!o.docs) return res.json({ old: true, ...docs(req.user, eco.product(o.productId), o) }); // bu düzenlemeden önceki siparişler
    res.json({ ...o.docs, acceptedAt: o.legal?.at, hash: o.legal?.hash, code: o.code });
  });
  // Ödenmeyen sipariş süresi dolunca kendiliğinden iptal
  setInterval(() => { const L = info(); store.filter('orders', (o) => o.status === 'pending' && now() - o.at > L.payHours * 3600000).forEach((o) => store.update('orders', o.id, { status: 'cancelled', closedAt: now(), expired: true })); }, 30 * 60000).unref?.();

  // ---------- İade talepleri ----------
  function refundable(o, u) { // dönen: { [neden]: true/false } ve açıklama
    const L = info(); const t = now();
    if (o.channel) return { tanimlanmadi: false, hata: false, cayma14: false }; // Google Play / App Store satın almalarının iadesi mağaza üzerinden yapılır
    return {
      tanimlanmadi: o.status === 'paid' && t - (o.paidAt || o.at) > L.deliveryHours * 3600000,
      hata: ['paid', 'approved'].includes(o.status) && t - o.at < 90 * DAY,
      cayma14: !!L.refund14 && o.status === 'approved' && o.kind === 'coins' && t - (o.closedAt || o.at) <= 14 * DAY && (u.coins || 0) >= (o.coins || 0),
    };
  }
  ctx.refundable = refundable;
  app.post('/api/orders/:id/refund', auth, (req, res) => {
    const o = store.get('orders', req.params.id); const u = req.user;
    if (!o || o.userId !== u.id) return res.status(404).json({ error: 'Sipariş bulunamadı.' });
    if (o.refund?.status === 'open') return res.status(409).json({ error: 'Bu sipariş için açık bir iade talebin var.' });
    const why = str(req.body?.reason, 20); const ok = refundable(o, u);
    if (!REFUND[why]) return res.status(400).json({ error: 'İade nedenini seç.' });
    if (!ok[why]) return res.status(400).json({ error: why === 'tanimlanmadi' ? `Tanımlanmayan sipariş için iade, ödeme bildiriminden ${info().deliveryHours} saat sonra istenebilir.` : why === 'cayma14' ? 'Bu sipariş 14 gün iade koşullarını taşımıyor (yalnızca hiç harcanmamış jetonlar, 14 gün içinde).' : 'Bu sipariş için bu nedenle iade istenemez.' });
    const iban = str(req.body?.iban, 40).replace(/\s+/g, '').toUpperCase(); const name = str(req.body?.name, 60);
    if (!/^TR\d{24}$/.test(iban)) return res.status(400).json({ error: 'IBAN geçersiz (TR ile başlayan 26 karakter).' });
    if (name.length < 3) return res.status(400).json({ error: 'Hesap sahibinin adını yaz.' });
    if (limited('refund:' + u.id, 5, DAY)) return res.status(429).json({ error: 'Bugün çok fazla iade talebi gönderdin.' });
    const r = store.put('refunds', { id: nanoid(10), orderId: o.id, userId: u.id, reason: why, iban, name, note: str(req.body?.note, 500), amount: o.amount, status: 'open', at: now(), due: now() + 14 * DAY });
    store.update('orders', o.id, { refund: { id: r.id, status: 'open', at: r.at } });
    pushAdmins?.({ title: 'İade talebi', text: `${o.code} · ${REFUND[why]}`, url: '#/hukuk' });
    res.json({ ok: true, refund: r });
  });

  // ---------- KVKK başvuruları (m.11 ve m.13: en geç 30 gün, ücretsiz) ----------
  const kvkkOut = (k) => ({ id: k.id, no: k.no, types: k.types, typeNames: k.types.map((t) => KVKK_TYPES[t]), note: k.note, status: k.status, at: k.at, due: k.due, answer: k.answer || null, answeredAt: k.answeredAt || null });
  app.get('/api/kvkk/requests', auth, (req, res) => res.json({ types: KVKK_TYPES, items: store.filter('kvkk_requests', (k) => k.userId === req.user.id).sort((a, b) => b.at - a.at).map(kvkkOut) }));
  app.post('/api/kvkk/requests', auth, (req, res) => {
    const types = (Array.isArray(req.body?.types) ? req.body.types : []).map((t) => str(t, 20)).filter((t) => KVKK_TYPES[t]);
    if (!types.length) return res.status(400).json({ error: 'En az bir talep seç.' });
    if (limited('kvkk:' + req.user.id, 5, DAY)) return res.status(429).json({ error: 'Bugün çok fazla başvuru gönderdin.' });
    const y = new Date(now() + 3 * 3600000).getUTCFullYear(); const n = store.filter('kvkk_requests', (k) => String(k.no || '').startsWith(`KVKK-${y}-`)).length + 1;
    const k = store.put('kvkk_requests', { id: nanoid(10), no: `KVKK-${y}-${String(n).padStart(5, '0')}`, userId: req.user.id, types: [...new Set(types)], note: str(req.body?.note, 2000), status: 'open', at: now(), due: now() + 30 * DAY, ip: ipOf(req) });
    pushAdmins?.({ title: 'KVKK başvurusu', text: `${k.no} · 30 gün içinde yanıtlanmalı`, url: '#/hukuk' });
    res.json(kvkkOut(k));
  });

  // ---------- Telif / kişilik hakkı bildirimi (uyar-kaldır) ----------
  app.post('/api/legal/takedown', (req, res) => {
    let uid = null; try { uid = ctx.userFromReq?.(req)?.id || null; } catch { /* oturumsuz da gönderilebilir */ }
    if (limited('td:' + ipOf(req), 6, DAY)) return res.status(429).json({ error: 'Bugün çok fazla bildirim gönderildi.' });
    const kind = ['telif', 'kisilik', 'diger'].includes(req.body?.kind) ? req.body.kind : 'diger';
    const target = str(req.body?.target, 300); const desc = str(req.body?.desc, 3000); const name = str(req.body?.name, 80); const email = str(req.body?.email, 120);
    if (target.length < 3 || desc.length < 10) return res.status(400).json({ error: 'İçeriğin adresini (ya da kullanıcı adını) ve açıklamayı yaz.' });
    if (name.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Adını ve sana ulaşabileceğimiz e-posta adresini yaz.' });
    if (req.body?.sworn !== true) return res.status(400).json({ error: 'Bildirimdeki bilgilerin doğru olduğunu onaylamalısın.' });
    const t = store.put('takedowns', { id: nanoid(10), kind, target, desc, name, email, userId: uid, status: 'open', at: now(), ip: ipOf(req) });
    pushAdmins?.({ title: kind === 'telif' ? 'Telif hakkı bildirimi' : 'Kişilik hakkı bildirimi', text: target.slice(0, 80), url: '#/hukuk' });
    res.json({ ok: true, id: t.id });
  });

  // ---------- Yönetim: hukuk ve uyum ----------
  if (!A.adminAuth) return;
  const missing = () => { const L = info(); return [['company', 'Satıcı adı / unvanı'], ['address', 'Açık adres'], ['email', 'E-posta'], ['phone', 'Telefon'], [L.mersis ? 'mersis' : 'vkn', 'MERSİS no (şirket) ya da vergi kimlik no (şahıs)'], ['kep', 'KEP adresi'], ['etbis', 'ETBİS kayıt bilgisi']].filter(([k]) => !L[k]).map(([, l]) => l); };
  A.legalOpenCount = () => store.filter('kvkk_requests', (k) => k.status === 'open').length + store.filter('refunds', (r) => r.status === 'open').length + store.filter('takedowns', (t) => t.status === 'open').length;
  app.get('/api/admin/hukuk', A.adminAuth, (req, res) => {
    const who = (id) => (id ? brief(user(id)) || { username: '(silinmiş)' } : null);
    const consents = {}; store.all('users').forEach((u) => Object.entries(u.consents || {}).forEach(([k, c]) => { if (c?.on) consents[k] = (consents[k] || 0) + 1; }));
    res.json({
      missing: missing(), ver: VER, thh: THH, consents, users: store.all('users').length, termsOld: store.filter('users', (u) => u.termsV !== VER.kosullar).length,
      kvkk: store.all('kvkk_requests').sort((a, b) => (b.status === 'open') - (a.status === 'open') || (a.status === 'open' ? a.due - b.due : b.at - a.at)).slice(0, 100).map((k) => ({ ...kvkkOut(k), user: who(k.userId) })),
      refunds: store.all('refunds').sort((a, b) => b.at - a.at).slice(0, 100).map((r) => { const o = store.get('orders', r.orderId); return { ...r, reasonText: REFUND[r.reason], order: o ? { code: o.code, title: o.title, amount: o.amount, status: o.status, coins: o.coins || 0 } : null, user: who(r.userId), coinsNow: user(r.userId)?.coins || 0 }; }),
      takedowns: store.all('takedowns').sort((a, b) => b.at - a.at).slice(0, 100).map((t) => ({ ...t, user: who(t.userId) })),
    });
  });
  app.post('/api/admin/hukuk/kvkk/:id', A.adminAuth, (req, res) => {
    const k = store.get('kvkk_requests', req.params.id); if (!k) return res.status(404).json({ error: 'Başvuru bulunamadı.' });
    const text = str(req.body?.text, 4000); if (text.length < 10) return res.status(400).json({ error: 'Yanıtı yaz (gerekçesiyle).' });
    const status = req.body?.action === 'reject' ? 'rejected' : 'answered';
    store.update('kvkk_requests', k.id, { status, answer: text, answeredAt: now(), by: req.admin.username });
    notify(k.userId, { type: 'system', text: `KVKK başvurun (${k.no}) yanıtlandı. Ayarlar › Veri taleplerim ekranından okuyabilirsin.`, url: '/#/veri-taleplerim', tag: `kvkk-${k.id}` });
    const u = user(k.userId); if (u?.email && mail.enabled()) mail.send(u.email, `KVKK başvurun ${k.no} yanıtlandı`, `Merhaba ${u.name || u.username},\n\n${k.no} numaralı başvurunun yanıtı:\n\n${text}\n\nSwipeUp`).catch(() => {});
    A.audit?.(req.admin, 'KVKK başvurusunu yanıtladı', k.userId, `${k.no} · ${status}`); res.json({ ok: true });
  });
  app.post('/api/admin/hukuk/refunds/:id', A.adminAuth, (req, res) => {
    const r = store.get('refunds', req.params.id); if (!r || r.status !== 'open') return res.status(404).json({ error: 'Açık iade talebi bulunamadı.' });
    const o = store.get('orders', r.orderId); const note = str(req.body?.note, 500); const okIt = req.body?.action === 'approve';
    if (okIt && r.reason === 'cayma14' && o?.kind === 'coins') { // harcanmamış jetonlar bakiyeden düşülür
      if ((user(r.userId)?.coins || 0) < (o.coins || 0)) return res.status(409).json({ error: 'Kullanıcı jetonların bir kısmını harcamış; iade koşulu artık sağlanmıyor.' });
      eco.addCoins(r.userId, -(o.coins || 0), 'refund', { note: `${o.code} iadesi`, by: req.admin.username });
    }
    store.update('refunds', r.id, { status: okIt ? 'approved' : 'rejected', note2: note, closedAt: now(), by: req.admin.username });
    if (o) store.update('orders', o.id, { refund: { ...(o.refund || {}), status: okIt ? 'approved' : 'rejected' }, ...(okIt && r.reason !== 'hata' ? { status: 'refunded', refundedAt: now(), approvedAt: o.approvedAt || o.closedAt } : {}) });
    notify(r.userId, { type: 'order', text: okIt ? `${o?.code || ''} iade talebin onaylandı. ${TL(r.amount)} en geç 14 gün içinde bildirdiğin IBAN’a gönderilecek.` : `${o?.code || ''} iade talebin onaylanmadı.${note ? ` Gerekçe: ${note}` : ''}`, url: '/#/store', tag: `refund-${r.id}` });
    A.audit?.(req.admin, okIt ? 'iade talebini onayladı' : 'iade talebini reddetti', r.userId, `${o?.code || ''} · ${REFUND[r.reason]}`); res.json({ ok: true });
  });
  app.post('/api/admin/hukuk/takedowns/:id', A.adminAuth, (req, res) => {
    const t = store.get('takedowns', req.params.id); if (!t) return res.status(404).json({ error: 'Bildirim bulunamadı.' });
    const status = req.body?.action === 'removed' ? 'removed' : 'rejected'; const note = str(req.body?.note, 1000);
    store.update('takedowns', t.id, { status, note, closedAt: now(), by: req.admin.username });
    if (mail.enabled()) mail.send(t.email, 'SwipeUp hak ihlali bildirimin sonuçlandı', `Merhaba ${t.name},\n\n“${t.target}” ile ilgili bildirimin incelendi: ${status === 'removed' ? 'içerik kaldırıldı.' : 'içerik kaldırılmadı.'}${note ? `\n\nAçıklama: ${note}` : ''}\n\nSwipeUp`).catch(() => {});
    A.audit?.(req.admin, 'hak ihlali bildirimini sonuçlandırdı', null, `${t.target} · ${status}`); res.json({ ok: true });
  });
  // İYS'ye yüklemek için e-posta izinleri (onay ve ret, kaynağı ve tarihiyle)
  app.get('/api/admin/hukuk/iys.csv', A.adminAuth, (req, res) => {
    const d = (t) => new Date(t + 3 * 3600000).toISOString().replace('T', ' ').slice(0, 19);
    const rows = store.filter('users', (u) => u.email && u.consents?.marketingEmail).map((u) => [u.email, 'EPOSTA', u.consents.marketingEmail.on ? 'ONAY' : 'RET', 'HS_WEB', d(u.consents.marketingEmail.at), 'BIREYSEL']);
    res.set('Content-Disposition', 'attachment; filename="iys-eposta-izinleri.csv"').type('text/csv; charset=utf-8').send(`﻿recipient,type,status,source,consentDate,recipientType\n${rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')}\n`);
  });
  // Rıza kayıtları (ispat için): tarih, metin sürümü, kanal, IP
  app.get('/api/admin/hukuk/consents.csv', A.adminAuth, (req, res) => {
    const rows = store.all('consent_log').sort((a, b) => a.at - b.at).map((c) => [new Date(c.at).toISOString(), user(c.userId)?.username || c.userId, c.kind, c.on ? 'verildi' : 'geri alındı', c.v || '', c.via || '', c.ip || '', c.text || '']);
    res.set('Content-Disposition', 'attachment; filename="riza-kayitlari.csv"').type('text/csv; charset=utf-8').send(`﻿tarih,kullanici,tur,durum,surum,kanal,ip,metin\n${rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')}\n`);
  });
};
module.exports.VER = VER;
module.exports.KVKK_TYPES = KVKK_TYPES;
module.exports.REFUND = REFUND;
module.exports.fromDicebear = fromDicebear;
module.exports.localAvatar = localAvatar;
