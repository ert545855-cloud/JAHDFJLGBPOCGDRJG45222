// Tanıtım sayfaları (arama motorları ve paylaşım için, betiksiz): public/tanitim.html (TR) ve public/en.html (EN)
// Çalıştır: node scripts/landing/build.mjs
import fs from 'node:fs';
const SITE = 'https://swipeup.live';
const T = {
  tr: {
    file: 'public/tanitim.html', lang: 'tr', path: '/tanitim', alt: '/en', altLang: 'en', altLabel: 'English',
    title: 'SwipeUp — Kaydır, eşleş, tanış | Ücretsiz arkadaşlık ve sosyal uygulama',
    desc: 'SwipeUp ile yakınındaki yeni insanlarla tanış: kaydır ve eşleş, sohbet et, görüntülü tanış, canlı yayın aç, arkadaşlarınla oyun oyna. Ücretsiz, Türkçe, telefonuna yüklenir.',
    hero: 'Kaydır, eşleş,<br><em>gerçekten tanış.</em>', sub: 'Yakınındaki insanlarla tanışmanın en eğlenceli yolu. Sohbet et, görüntülü tanış, birlikte oyna, buluş.',
    cta: 'Ücretsiz başla', login: 'Giriş yap', free: 'Ücretsiz · 18+ · iPhone ve Android tarayıcıda, uygulama gibi',
    featH: 'SwipeUp’ta neler var?',
    feats: [
      ['uyum', 'Kaydır ve eşleş', 'Profilleri kaydır; ikiniz de beğenince sohbet açılır. Ortak sanatçılar ve ilgi alanları kartta görünür.'],
      ['hizli', 'Görüntülü tanışma', 'Buluşmadan önce uygulama içinde 10 dakikalık görüntülü görüşme. Rahat hissetmezsen tek dokunuşla kapat.'],
      ['genel', 'Sohbet, sesli mesaj, çıkartma', 'Sesli mesaj, GIF, hareketli çıkartmalar, tek seferlik fotoğraf ve kaybolan mesajlar.'],
      ['okey', 'Arkadaşlarınla oyna', 'Parti Kupası, SwipeFarm, Okey, Tavla, Batak, Çiz Bil ve daha fazlası. Tanışmanın en kolay yolu birlikte oynamak.'],
      ['fal-kahve', 'Falcı Teyze', 'Kahve falı, tarot, burç ve aşk uyumu. Eğlence amaçlı, paylaşılabilir kartlarla.'],
      ['etkinlik', 'Kulüpler ve etkinlikler', 'İlgi alanına göre kulüplere katıl, şehrindeki buluşmaları gör ya da kendin düzenle.'],
    ],
    stepsH: 'Üç adımda başla', steps: [['Kayıt ol', 'Kullanıcı adıyla ya da Google ile 30 saniyede.'], ['Profilini kur', 'Birkaç fotoğraf, birkaç cümle, sevdiğin müzik.'], ['Tanış', 'Kaydır, yaz, görüntülü tanış, buluş.']],
    safeH: 'Güvenliğin önce gelir', safe: ['Selfie ile profil doğrulama ve mavi tik', 'Sohbette para, IBAN ve kripto isteyenlere karşı otomatik uyarı', 'Aynı fotoğrafla açılan sahte hesapların tespiti', 'Buluşma planını bir arkadaşınla paylaşma ve “İyiyim” bildirimi', 'Tek dokunuşla engelleme ve şikayet; ekibimiz her bildirimi inceler'],
    faqH: 'Sık sorulanlar', faq: [
      ['SwipeUp ücretsiz mi?', 'Evet. Kaydırma, eşleşme, sohbet ve oyunlar ücretsiz. İsteyenler SwipeUp+ ile sınırsız beğeni, seni beğenenleri görme ve ek ayrıcalıklar alabilir; yeni üyelere 3 gün ücretsiz deneme var.'],
      ['Uygulama mağazasında var mı?', 'SwipeUp telefonun tarayıcısından açılır ve “Ana ekrana ekle” ile uygulama gibi yüklenir. iPhone ve Android’de bildirimler de çalışır.'],
      ['Kimler kullanabilir?', 'SwipeUp 18 yaş ve üzeri içindir. Doğum tarihin profilinde görünmez, sadece yaşın görünür.'],
      ['Yurt dışında kullanabilir miyim?', 'Evet. Uygulama Türkçe, İngilizce ve Almanca kullanılabilir.'],
    ],
    endH: 'Yeni biriyle tanışmaya hazır mısın?', legal: ['Gizlilik', 'Koşullar', 'KVKK'],
  },
  en: {
    file: 'public/en.html', lang: 'en', path: '/en', alt: '/tanitim', altLang: 'tr', altLabel: 'Türkçe',
    title: 'SwipeUp — Swipe, match, meet | Free dating & social app',
    desc: 'Meet new people near you with SwipeUp: swipe and match, chat, video-date, go live and play games with friends. Free, works in your phone’s browser like an app.',
    hero: 'Swipe, match,<br><em>actually meet.</em>', sub: 'The most fun way to meet people near you. Chat, video-date, play together, meet up.',
    cta: 'Start for free', login: 'Log in', free: 'Free · 18+ · works like an app in your iPhone or Android browser',
    featH: 'What’s on SwipeUp?',
    feats: [
      ['uyum', 'Swipe and match', 'Swipe through profiles; when you both like each other, a chat opens. Shared artists and interests show on the card.'],
      ['hizli', 'Video intro', 'A 10-minute video call inside the app before you meet. If you don’t feel comfortable, end it with one tap.'],
      ['genel', 'Chat, voice notes, stickers', 'Voice messages, GIFs, animated stickers, view-once photos and disappearing messages.'],
      ['okey', 'Play with friends', 'Party Cup, SwipeFarm, Okey, Backgammon, Spades, Draw & Guess and more. Playing together is the easiest icebreaker.'],
      ['fal-kahve', 'Auntie Fortune', 'Coffee readings, tarot, horoscopes and love match. Just for fun, with shareable cards.'],
      ['etkinlik', 'Clubs and events', 'Join clubs by interest, see meetups in your city or host your own.'],
    ],
    stepsH: 'Get started in three steps', steps: [['Sign up', 'With a username or Google in 30 seconds.'], ['Set up your profile', 'A few photos, a few lines, the music you love.'], ['Meet', 'Swipe, chat, video-date, meet up.']],
    safeH: 'Your safety comes first', safe: ['Selfie verification and a blue check', 'Automatic warnings when someone asks for money, bank details or crypto', 'Detection of fake accounts using the same photos', 'Share your date plan with a friend and send an “I’m OK” update', 'One-tap block and report; our team reviews every report'],
    faqH: 'FAQ', faq: [
      ['Is SwipeUp free?', 'Yes. Swiping, matching, chatting and games are free. SwipeUp+ adds unlimited likes, seeing who liked you and more; new members get a free 3-day trial.'],
      ['Is it in the app stores?', 'SwipeUp opens in your phone’s browser and installs like an app with “Add to Home Screen”. Notifications work on iPhone and Android.'],
      ['Who can use it?', 'SwipeUp is for ages 18+. Your date of birth isn’t shown, only your age.'],
      ['Which languages?', 'Turkish, English and German.'],
    ],
    endH: 'Ready to meet someone new?', legal: ['Privacy', 'Terms', 'Data protection'],
  },
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
for (const c of Object.values(T)) {
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebApplication', name: 'SwipeUp', url: SITE + '/', applicationCategory: 'SocialNetworkingApplication', operatingSystem: 'iOS, Android, Web', inLanguage: ['tr', 'en', 'de'], offers: { '@type': 'Offer', price: '0', priceCurrency: 'TRY' }, description: c.desc },
    { '@type': 'FAQPage', mainEntity: c.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ] };
  const html = `<!doctype html>
<html lang="${c.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.desc)}">
<link rel="canonical" href="${SITE}${c.path}">
<link rel="alternate" hreflang="${c.lang}" href="${SITE}${c.path}">
<link rel="alternate" hreflang="${c.altLang}" href="${SITE}${c.alt}">
<meta property="og:type" content="website"><meta property="og:site_name" content="SwipeUp">
<meta property="og:title" content="${esc(c.title)}"><meta property="og:description" content="${esc(c.desc)}">
<meta property="og:url" content="${SITE}${c.path}"><meta property="og:image" content="${SITE}/icons/icon-512.png">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#ff4f6d">
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png">
<link rel="apple-touch-icon" href="/icons/apple-touch.png">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
:root{--ink:#17121c;--mut:#6e6478;--line:#ece6f1;--a1:#ff8a3d;--a2:#ff3d6e;--bg:#fffaf7}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg)}
a{color:inherit}.w{max-width:1040px;margin:0 auto;padding:0 20px}
header{display:flex;align-items:center;gap:12px;padding:18px 20px;max-width:1040px;margin:0 auto}
header .lg{display:flex;align-items:center;gap:10px;font-weight:800;font-size:22px;text-decoration:none;letter-spacing:-.02em}header img{width:36px;height:36px;border-radius:10px}
header nav{margin-left:auto;display:flex;gap:14px;align-items:center;font-size:15px}header nav a{text-decoration:none;color:var(--mut)}
.btn{display:inline-flex;align-items:center;justify-content:center;height:50px;padding:0 26px;border-radius:999px;font-weight:700;text-decoration:none;font-size:16px}
.pri{color:#fff;background:linear-gradient(110deg,var(--a1),var(--a2));box-shadow:0 14px 30px -14px rgb(255 61 110 / .7)}.sec{background:#fff;border:1.5px solid var(--line)}
.hero{position:relative;overflow:hidden;padding:56px 0 64px}
.hero:before{content:"";position:absolute;inset:-30% -10% auto auto;width:620px;height:620px;border-radius:50%;background:radial-gradient(closest-side,rgb(255 61 110 / .18),transparent);z-index:-1}
.hero .w{display:grid;grid-template-columns:1.1fr .9fr;gap:30px;align-items:center}
h1{font-size:clamp(40px,7vw,68px);line-height:1.02;letter-spacing:-.035em;margin:0 0 18px}h1 em{font-style:normal;background:linear-gradient(110deg,var(--a1),var(--a2));-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p{font-size:19px;color:var(--mut);max-width:30em;margin:0 0 26px}.ctas{display:flex;gap:12px;flex-wrap:wrap}.free{font-size:13.5px;color:var(--mut);margin-top:14px}
.art{position:relative;height:380px}.art img{position:absolute;filter:drop-shadow(0 18px 24px rgb(0 0 0 / .12))}
.art .a{width:190px;left:8%;top:6%;transform:rotate(-8deg)}.art .b{width:170px;right:4%;top:22%;transform:rotate(7deg)}.art .c{width:150px;left:30%;bottom:0;transform:rotate(-3deg)}
section{padding:56px 0}h2{font-size:clamp(28px,4.4vw,40px);letter-spacing:-.03em;margin:0 0 26px}
.feats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.f{background:#fff;border:1px solid var(--line);border-radius:22px;padding:22px}
.f img{width:52px;height:52px;border-radius:14px}.f h3{margin:12px 0 6px;font-size:18px}.f p{margin:0;color:var(--mut);font-size:15px}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;counter-reset:s}.st{padding:22px;border-radius:22px;background:linear-gradient(160deg,#fff,#fff3ee)}
.st b{display:block;font-size:18px;margin-bottom:4px}.st b:before{counter-increment:s;content:counter(s);display:grid;place-items:center;width:34px;height:34px;border-radius:50%;margin-bottom:10px;color:#fff;background:linear-gradient(110deg,var(--a1),var(--a2));font-size:16px}
.st span{color:var(--mut);font-size:15px}
.safe{display:grid;grid-template-columns:.8fr 1.2fr;gap:28px;align-items:center;background:#17121c;color:#fff;border-radius:30px;padding:36px}
.safe h2{color:#fff}.safe ul{list-style:none;margin:0;padding:0;display:grid;gap:12px}.safe li{display:flex;gap:10px;align-items:flex-start;font-size:16px}
.safe li:before{content:"";flex:0 0 22px;height:22px;border-radius:50%;background:#3fd69a url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5 12.5 4.5 4.5L19 7'/%3E%3C/svg%3E") center/14px no-repeat;margin-top:2px}
details{background:#fff;border:1px solid var(--line);border-radius:18px;padding:16px 20px;margin-bottom:10px}summary{font-weight:700;cursor:pointer}details p{color:var(--mut);margin:10px 0 0}
.end{text-align:center;padding:64px 0}.end h2{margin-bottom:22px}
footer{border-top:1px solid var(--line);padding:24px 0 40px;color:var(--mut);font-size:14px}footer .w{display:flex;gap:16px;flex-wrap:wrap;align-items:center}footer a{text-decoration:none}
@media (max-width:820px){.hero .w,.safe{grid-template-columns:1fr}.art{height:260px}.art .a{width:140px}.art .b{width:125px}.art .c{width:110px}.feats,.steps{grid-template-columns:1fr}header nav .hide{display:none}}
</style>
</head>
<body>
<header><a class="lg" href="/"><img src="/icons/mark.png" alt="">swipeup</a><nav><a class="hide" href="${c.alt}" hreflang="${c.altLang}">${c.altLabel}</a><a href="/#/login">${c.login}</a><a class="btn pri" style="height:42px;padding:0 18px;font-size:15px" href="/#/register">${c.cta}</a></nav></header>
<main>
<div class="hero"><div class="w"><div><h1>${c.hero}</h1><p>${esc(c.sub)}</p><div class="ctas"><a class="btn pri" href="/#/register">${c.cta}</a><a class="btn sec" href="/#/login">${c.login}</a></div><div class="free">${esc(c.free)}</div></div>
<div class="art" aria-hidden="true"><img class="a" src="/img/stk/ask/seviyorum.svg" alt=""><img class="b" src="/img/stk/kedi/selam.svg" alt=""><img class="c" src="/img/stk/parti/yasasin.svg" alt=""></div></div></div>
<section><div class="w"><h2>${esc(c.featH)}</h2><div class="feats">${c.feats.map(([ic, h, p]) => `<div class="f"><img src="/img/eg/${ic}.svg" alt=""><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join('')}</div></div></section>
<section><div class="w"><h2>${esc(c.stepsH)}</h2><div class="steps">${c.steps.map(([b, s]) => `<div class="st"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('')}</div></div></section>
<section><div class="w"><div class="safe"><h2>${esc(c.safeH)}</h2><ul>${c.safe.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div></div></section>
<section><div class="w"><h2>${esc(c.faqH)}</h2>${c.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div></section>
<div class="end w"><h2>${esc(c.endH)}</h2><a class="btn pri" href="/#/register">${c.cta}</a></div>
</main>
<footer><div class="w"><span>© SwipeUp</span><a href="/#/legal/gizlilik">${c.legal[0]}</a><a href="/#/legal/kosullar">${c.legal[1]}</a><a href="/#/legal/kvkk">${c.legal[2]}</a><a href="${c.alt}" hreflang="${c.altLang}">${c.altLabel}</a></div></footer>
</body>
</html>
`;
  fs.writeFileSync(c.file, html);
}
console.log('tanıtım sayfaları yazıldı');
