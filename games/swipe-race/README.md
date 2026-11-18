# Swipe Race

Tek kişilik 3D yarış oyunu: oyuncu + 5 bot rakip, 3 tur. Oyunlar sayfasındaki
Swipe Race kartından `/race/` adresinde açılır.

## Klasörler

- `src/` kaynak kod
  - `track.js` pist yerleşimi (ızgara parçaları) ve orta çizgi
  - `physics.js` araç fiziği, bot sürücü, araç çarpışmaları (three.js'siz, Node'da da çalışır)
  - `main.js` görüntü, arayüz, ses, dokunmatik kontroller
  - `index.html` oyun sayfası
- `tools/pack.py` modelleri tek bir `assets.json` paketine koyar
- `build.sh` derler, çıktıyı `public/race/` içine yazar

## Derleme

```bash
npm ci                      # three.js depo kökündeki node_modules'tan gelir
games/swipe-race/build.sh   # yalnız kod; public/race/assets.json hazır durur
```

Modelleri değiştirmek için iki model kitinin açılmış klasörlerini verin:

```bash
games/swipe-race/build.sh /yol/kenney_racing-kit /yol/kenney_toy-car-kit
```

## Performans

- Bütün modeller ve gölgeler yarıştan önce yüklenir ve derlenir; yarış sırasında yükleme yapılmaz.
- Pist ve çevre nesneleri 56 m'lik bölgelerde birleştirilir; ekranda olmayan bölgeler çizilmez (~70 çizim çağrısı).
- Kare süresi uzarsa çözünürlük kendiliğinden düşer, toparlanınca geri çıkar.
- Fizik sabit 120 Hz adımla çalışır, görüntü adımlar arasında yumuşatılır.
- Oyun döngüsünde yeni bellek ayrılmaz; sekme gizlenince oyun duraklar.

## Lisans notu

Araç, pist ve çevre modelleri Kenney'in Toy Car Kit ve Racing Kit paketlerindendir
(CC0, www.kenney.nl). Kullanıcıya görünen yerlerde marka adı geçmez.
