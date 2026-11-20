// SwipeUp City is a native Unreal project under games/swipeup-city.
// This page is informational until the iOS/Android native runtime POCs are validated.
import { icon } from '../icons.js';

export default function city(view) {
  view.innerHTML = [
    '<header class="topbar bordered"><button class="ib" data-back="#/oyunlar" aria-label="Oyunlara dön">',
    icon('back'),
    '</button><div class="center">SwipeUp City</div><span class="ib"></span></header>',
    '<main class="gm-page" style="padding-bottom:48px;display:grid;gap:14px">',
    '<section style="border-radius:18px;padding:24px 20px;background:linear-gradient(140deg,#172747,#41205c 65%,#ab4b65);color:#fff">',
    '<div style="font-size:40px" aria-hidden="true">🌆</div>',
    '<h1 style="font-size:27px;margin:8px 0">SwipeUp City</h1>',
    '<p style="opacity:.9;line-height:1.55;margin:0">Sosyalleşeceğin, gezebileceğin ve yeni insanlarla tanışabileceğin 3D bir şehir.</p>',
    '<p style="display:inline-block;margin:16px 0 0;padding:6px 12px;border-radius:999px;background:#ffffff22;font-size:12px;font-weight:700">Mobil oyun geliştirme aşamasında</p>',
    '</section>',
    '<section class="fal-card" style="padding:18px">',
    '<h2 style="font-size:18px;margin:0 0 10px">Şehirde neler olacak?</h2>',
    '<p style="margin:0;line-height:1.7">🚶 Karakter oluşturma ve şehirde gezme<br>🚗 Araçlar, yollar ve mahalleler<br>☕ Kafeler, sosyal alanlar ve yeni arkadaşlıklar<br>🏠 Evler, işler ve görevler<br>💬 Arkadaşlarla birlikte oyun deneyimi</p>',
    '</section>',
    '<section class="fal-card" style="padding:18px">',
    '<h2 style="font-size:18px;margin:0 0 10px">Şu anki durum</h2>',
    '<p style="margin:0;line-height:1.6">Unreal Engine mobil prototipinin kaynak dosyaları hazırlanıyor. Bu sayfa şu anda oyunu çalıştırmaz. Gerçek telefon testleri ve mobil uygulama entegrasyonu tamamlandığında oyun girişi etkinleştirilecek.</p>',
    '</section>',
    '<a class="btn primary block" href="#/oyunlar">Oyunlara dön</a>',
    '</main>'
  ].join('');
}
