# Mercan Limanı web sürümü

Tarayıcı oyunu masaüstünde klavye ve fare, telefonda dokunmatik kontroller kullanır. WebGL 2 gerekir. Kafe, vardiya, kredi ve araç anahtarı ilerlemesi tarayıcının yerel depolamasında saklanır.

Depo kökünden:

```sh
npm ci --ignore-scripts
python3 games/swipeup-city/Web/build_assets.py --output /tmp/mercan-web
cp games/swipeup-city/Web/{index.html,city.css,life.mjs,scene.mjs,game.mjs} /tmp/mercan-web/
python3 -m http.server 8080 --directory /tmp/mercan-web
```

Oyunu `http://localhost:8080` üzerinden aç. Statik sunucuya yayınlamak için çıktı dizininin içeriğini yükle. Web istemcisi Unreal projesinin SCM1 yerel modellerini, harita yerleşimini ve görev verilerini kullanır.
