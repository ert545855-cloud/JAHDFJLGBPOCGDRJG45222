# Parti Kupası: araç modları

İki mod kupanın tur havuzunda ve oyun seçicide yer alır:

- **Araba Yarışı** (`araba`): Car Kit arabalarıyla iki turluk pist yarışı. Gaz kendiliğinden basılı; kumanda direksiyon ve fren, düğme turbo. İlk bitirenler tur atlar (finalde ilk bitiren kazanır). Arkadan kovalayan kamera.
- **Gemi Savaşı** (`gemi`): Pirate Pack gemileriyle yukarıdan bakışlı top atışı. "Ateş" iki bordadan gülle atar; her gemi üç isabette batar; fırtına halkası daralır, dışında kalan hasar alır.

## Dosyalar

- `public/js/k3veh-core.mjs`: Sunucu ve istemcinin ortak hesapları (pistler, izdüşüm, araba ve gemi sürüşü, adalar, fırtına).
- `public/js/k3veh.js`: İstemci: modeller, pist ve deniz sahnesi, kamera, olaylar.
- `server/kupa-veh.js`: Sunucu: diziliş, botlar, ilerleme, gülleler, isabet ve eleme.
- `public/kupa/`: Paketlenmiş varlıklar (`araclar.json`, `arac-doku.png`, `korsan.png`, `korsan.json`, `ada.png`).

## Varlıkları yeniden paketleme

```
python3 -I games/kupa/pack.py /yol/kenney_car-kit /yol/kenney_pirate-pack public/kupa
```

Car Kit modelleri yükleyici gerektirmeyen düz geometriye çevrilir (konum int16, normal int8, doku koordinatı uint16; tekerlekler ayrı ve döner).

Modeller ve çizimler Kenney'in Car Kit ve Pirate Pack paketlerindendir (CC0, www.kenney.nl).
