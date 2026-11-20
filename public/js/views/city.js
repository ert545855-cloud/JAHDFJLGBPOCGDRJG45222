import { icon } from '../icons.js';

export default function city(view) {
  view.innerHTML = `
    <header class="topbar bordered">
      <button class="ib" data-back="#/oyunlar" aria-label="Oyunlara dön">${icon('back')}</button>
      <div class="center">SwipeUp City</div><span class="ib"></span>
    </header>
    <main class="gm-page" style="padding-bottom:48px;display:grid;gap:14px">
      <section style="border-radius:18px;padding:24px 20px;background:linear-gradient(140deg,#172d39,#2b5460);color:#fff">
        <h1 style="font-size:27px;margin:0 0 8px">SwipeUp City</h1>
        <p style="line-height:1.55;margin:0 0 16px">Sahil şehrini dolaş ve dört keşif durağını dilediğin sırayla ziyaret et.</p>
        <a class="btn primary block" href="/city-preview/">3D şehir turunu oyna</a>
      </section>
      <section class="fal-card" style="padding:18px">
        <h2 style="font-size:18px;margin:0 0 10px">Kontroller</h2>
        <p style="margin:0;line-height:1.7">Bilgisayarda WASD ile yürü ve fareyi sürükleyerek kamerayı çevir. Telefonda sol çubuğu kullan ve kamerayı çevirmek için ekranda kaydır.</p>
      </section>
    </main>`;
}
